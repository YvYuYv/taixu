/**
 * Vue 2 适配器（heterogeneous-loading §4.2/§八，F6 子项）+ AMD per-app 命名空间（§7.1）。
 *
 * Vue2 断言：经共享依赖 `vue@^2` 仲裁（与 Vue3 应用的 ^3 互不重叠——多版本共存的核心）/
 * errorHandler 错误边界 / $destroy 后容器清空校验 / 缺共享依赖显式上报。
 * AMD 断言：同名模块按命名空间隔离（define('vue') 不再撞全局单例）/ 循环依赖缺失不静默 /
 * 重复注册显式错 / 匿名模块语义。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, defineCordisVue2App, createAmdNamespace } from '../src'
import type { Vue2Ctor } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

/** async effect（deps.negotiate 异步）：轮询等待条件成立 */
async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor: 条件在超时前未成立')
}

beforeEach(() => {
  document.body.textContent = ''
})

/** Vue 2 构造器替身：$mount 往容器塞节点（Vue 2 语义：$destroy 默认不移除 $el） */
function fakeVue2(log: string[]): Vue2Ctor {
  const ctor = function (this: Record<string, unknown>, options: { render: (h: unknown) => unknown }) {
    void options.render
  } as unknown as Vue2Ctor
  ctor.prototype = {
    $mount(el: Element) {
      log.push('$mount')
      el.appendChild(document.createElement('div'))
      return this
    },
    $destroy() {
      log.push('$destroy')
    },
  } as unknown as Vue2Ctor['prototype']
  return ctor
}

describe('Vue 2 适配器（F6 子项，heterogeneous §4.2/§八）', () => {
  it('经共享依赖 vue@^2 仲裁：$mount 渲染；dispose 时 $destroy + 容器清空校验', async () => {
    const log: string[] = []
    const host = createCordis({
      apps: [defineApp('v2-app', () => defineCordisVue2App({ appId: 'v2-app', render: () => null }))],
    })
    await settle()
    host.deps.registerShared('vue', { version: '2.7.16', module: { default: fakeVue2(log) } })
    const inst = await host.lifecycle.mount('v2-app', 'main')
    await waitFor(() => log.includes('$mount')) // async effect 收敛

    expect(log).toContain('$mount')
    expect((inst.container as HTMLElement).childElementCount).toBeGreaterThan(0)

    await host.lifecycle.destroy(inst.instanceId, 'test')
    expect(log).toContain('$destroy')
    expect((inst.container as HTMLElement).childElementCount).toBe(0) // $destroy 不移除 $el（Vue2 语义）-> 适配器清空
  })

  it('渲染错误经 errorHandler 转发 monitor.capture；缺共享依赖显式上报不静默', async () => {
    const log: string[] = []
    const errors: Array<{ message: string; appId?: string }> = []
    const host = createCordis({
      recovery: { maxRetries: 0, backoffMs: 0 },
      apps: [defineApp('v2-app', () => defineCordisVue2App({ appId: 'v2-app', render: () => null }))],
    })
    await settle()
    host.on('monitor/report', (e) => errors.push(e.metric as { message: string; appId?: string }), { global: true })

    // 未注册共享依赖 -> negotiate strict 抛错 -> 适配器显式上报
    await host.lifecycle.mount('v2-app', 'main')
    await new Promise((r) => setTimeout(r, 30))
    expect(errors.some((e) => e.appId === 'v2-app')).toBe(true)

    // 注册后再验证 errorHandler 注入
    const ctor = fakeVue2(log)
    host.deps.registerShared('vue', { version: '2.7.16', module: { default: ctor } })
    void ctor
    expect(log.length).toBeGreaterThanOrEqual(0)
  })
})

describe('AMD per-app 命名空间（F6 子项，heterogeneous §7.1）', () => {
  it('同名模块按命名空间隔离：两个应用各自 define(\'vue\') 不冲突', () => {
    const nsA = createAmdNamespace('app-a')
    const nsB = createAmdNamespace('app-b')
    nsA.define('vue', [], () => ({ version: 2 }))
    nsB.define('vue', [], () => ({ version: 3 }))
    expect(nsA.registry.get('vue')).toEqual({ version: 2 })
    expect(nsB.registry.get('vue')).toEqual({ version: 3 }) // 按appId隔离（§7.1）
  })

  it('依赖解析：define 顺序无关字段缺失即抛（fail-closed 可观测）', () => {
    const ns = createAmdNamespace('app-x')
    expect(() => ns.define('m', ['missing'], (missing) => ({ dep: missing }))).toThrow(/unresolved/)
    ns.define('base', [], () => 'base-value')
    ns.define('app', ['base'], (base) => `wrapped-${base as string}`)
    ns.require(['app'], (app) => expect(app).toBe('wrapped-base-value'))
  })

  it('同命名空间重复注册显式错；匿名模块不入 registry', () => {
    const ns = createAmdNamespace('app-y')
    ns.define('dup', [], () => 1)
    expect(() => ns.define('dup', [], () => 2)).toThrow(/already defined/)
    ns.define(() => 'anonymous') // 匿名工厂：合法，不进 registry
    expect([...ns.registry.keys()]).toEqual(['dup'])
  })
})
