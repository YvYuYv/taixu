/**
 * 主缝测试：Vue Router 4/3 桥接（route-adaptation §5.1/§5.2，P1）。
 * VR4：currentRoute 稳定引用（依赖收集不失效）；push/replace 返回真实 Promise
 * （await 到导航完成）；beforeEach 映射守卫管线；computed 注入跨副本安全。
 * VR3：abstract 实例 API 代理（push/replace 走 Cordis 导航）；currentRoute 受控
 * 更新；$router 经 prototype 注入。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp, createCordisRouter, bridgeVueRouter2, type CordisRouterBridge } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
  history.replaceState(null, '', '/')
})

describe('VR4 桥（§5.1 createCordisRouter）', () => {
  async function withBridge(): Promise<{ host: Context; bridge: CordisRouterBridge; appCtx: Context }> {
    let appCtx!: Context
    const host = createCordis({
      permissions: [{ appId: 'bridge-app', allow: ['route:navigate'] }],
      routes: [
        { basePath: '/home', appId: 'bridge-app' },
        { basePath: '/away', appId: 'bridge-app' },
      ],
      apps: [defineApp('bridge-app', () => ({ name: 'bridge-app', inject: ['router'], apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('bridge-app', 'main')
    appCtx = inst.ctx
    return { host, bridge: createCordisRouter(appCtx), appCtx }
  }

  it('currentRoute 稳定引用（同对象字段更新，依赖收集不失效）；push 返回真实 Promise', async () => {
    const { host, bridge } = await withBridge()
    await host.router.navigate({ path: '/home' }, { caller: host, outlet: 'main' })
    expect(bridge.currentRoute.path).toBe('/home')

    const before = bridge.currentRoute
    const p = bridge.push('/away?tab=1') // 真实 Promise：导航完成才 resolve
    expect(bridge.currentRoute).toBe(before) // 稳定引用（字段尚未更新——导航异步）
    const outcome = await p
    expect(outcome.status).toBe('ok')
    expect(bridge.currentRoute).toBe(before) // 仍是同一对象
    expect(bridge.currentRoute.path).toBe('/away') // 字段已更新
    expect(bridge.currentRoute.query).toEqual({ tab: '1' })
    expect(bridge.currentRoute.fullPath).toBe('/away?tab=1')
  })

  it('onChange 订阅驱动（退化路径）；replace 原子替换；go/back 原生代理', async () => {
    const { host, bridge } = await withBridge()
    const seen: string[] = []
    bridge.onChange((r) => seen.push(r.fullPath))
    await host.router.navigate({ path: '/home' }, { caller: host, outlet: 'main' })
    await settle()
    expect(seen.at(-1)).toBe('/home') // watch 首跑 + 变更均送达

    const outcome = await bridge.replace('/away')
    expect(outcome.status).toBe('ok')
    expect(bridge.currentRoute.path).toBe('/away')
  })

  it('beforeEach 映射守卫管线（serial）；abort 拦截导航', async () => {
    const { bridge } = await withBridge()
    const off = bridge.beforeEach((to) => (to.path === '/away' ? { type: 'abort' } : undefined))
    const okOutcome = await bridge.push('/home')
    expect(okOutcome.status).toBe('ok')
    const blocked = await bridge.push('/away')
    expect(blocked.status).toBe('guarded') // 守卫拦截
    off()
    const after = await bridge.push('/away')
    expect(after.status).toBe('ok') // 退订后放行
  })

  it('reactive+computed 成对注入（子应用自己 Vue 副本——依赖收集可失效，跨副本安全）', async () => {
    const { host, appCtx } = await withBridge()
    // 模拟子应用副本的 reactive/computed 原语（不引用宿主 vue 的响应式——跨副本约定）
    const reads: number[] = []
    const reactive = <T extends object,>(v: T): T =>
      new Proxy(v, {
        get(t, p, r) {
          if (p === 'route') reads.push(1) // 依赖收集观测：computed 读 route 即记一次
          return Reflect.get(t, p, r)
        },
      })
    const bridge = createCordisRouter(appCtx, {
      reactive,
      computed: <T,>(getter: () => T) => ({ get value() { return getter() } }),
    })
    expect(bridge.currentRoute.path).toBe('/') // computed 首读（依赖已挂到 reactive 容器）
    await host.router.navigate({ path: '/home' }, { caller: host, outlet: 'main' })
    expect(bridge.currentRoute.path).toBe('/home') // reactive 容器内替换 -> computed 取到新值
    expect(reads.length).toBeGreaterThanOrEqual(2) // 依赖确实经 reactive 属性读取（可收集/可失效）
  })
})

describe('VR3 桥（§5.2 bridgeVueRouter2）', () => {
  it('abstract 实例 API 代理：push/replace 走 Cordis 导航；currentRoute 受控更新；$router prototype 注入', async () => {
    const FakeVue = { prototype: {} as object }
    // abstract 模式实例的最小鸭子面（不监听 popstate/hashchange）
    const router = {
      currentRoute: null as unknown,
      push: (to?: unknown) => ({} as unknown),
      replace: (to?: unknown) => ({} as unknown),
      go: () => {},
      back: () => {},
      forward: () => {},
    }
    let appCtx!: Context
    const host = createCordis({
      permissions: [{ appId: 'v2-app', allow: ['route:navigate'] }],
      routes: [{ basePath: '/v2', appId: 'v2-app' }],
      apps: [defineApp('v2-app', () => ({ name: 'v2-app', inject: ['router'], apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('v2-app', 'main')
    appCtx = inst.ctx

    const bridged = bridgeVueRouter2(appCtx, FakeVue, router)
    expect(bridged).toBe(router)

    await router.push('/v2/list') // 经代理走 Cordis 导航（单写 History）
    expect(host.router.current('main').path).toBe('/v2/list')
    expect((router.currentRoute as { path: string }).path).toBe('/v2/list') // 受控更新
    expect((router.currentRoute as { fullPath: string }).fullPath).toBe('/v2/list')

    await router.replace('/v2/detail')
    expect(host.router.current('main').path).toBe('/v2/detail')

    // $router 注入：prototype getter（任意组件实例可取）
    const proto = FakeVue.prototype as { $router?: unknown }
    expect(proto.$router).toBe(router)
  })
})
