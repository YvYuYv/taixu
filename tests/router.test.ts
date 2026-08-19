/**
 * 主缝测试：路由矩阵 + 守卫枚举 + 槽位事件族（05 号票）。
 *
 * 主缝 = createCordis({ routes }) + host.router.navigate() + lifecycle.mount 集成。
 * 语义源：route-adaptation.md §三（URL 矩阵）、§4.1（导航序号）、§4.3（守卫枚举 ADR-0002）、
 * §4.2（popstate 全链路）、§4.4（router 不 inject lifecycle）；基线 §2.3 依赖方向。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, createProbeApp, type RouteRule } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  document.body.textContent = ''
})

describe('URL 矩阵（§3.1）', () => {
  it('非主槽位写 query 通道：__tx_ 前缀、主区域不动', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    await host.router.navigate({ path: '/list' }, { outlet: 'sidebar' })

    const url = new URL(window.location.href)
    expect(url.pathname).toBe('/a') // 主区域 = pathname
    expect(url.searchParams.get('__tx_sidebar')).toBe('/list') // 非浮窗槽位 = query 通道、保留字前缀
    expect(host.router.current('main').path).toBe('/a')
    expect(host.router.current('sidebar').path).toBe('/list')
  })

  it('参数合并不互抹：sidebar 导航不清 main', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    await host.router.navigate({ path: '/a', query: { tab: 'x' } }, { outlet: 'main' })
    await host.router.navigate({ path: '/list' }, { outlet: 'sidebar' })
    await host.router.navigate({ path: '/detail' }, { outlet: 'sidebar' })

    const url = new URL(window.location.href)
    expect(url.pathname).toBe('/a')
    expect(url.searchParams.get('tab')).toBe('x') // main 的业务参数保留
    expect(url.searchParams.get('__tx_sidebar')).toBe('/detail') // sidebar 更新
    expect(host.router.current('main').query.tab).toBe('x')
  })

  it('槽位读取全量矩阵：URL 直读解析回槽位状态', async () => {
    const host = createCordis({
      apps: [defineApp('a', () => createProbeApp('a', () => {}))],
      routes: [
        { basePath: '/a', appId: 'a' },
        { basePath: '/w1', appId: 'a' },
      ],
    })
    await settle()
    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    await host.router.navigate({ path: '/w1' }, { outlet: 'widget' })

    const snapshot = host.router.snapshot()
    expect(snapshot.main?.appId).toBe('a')
    expect(snapshot.widget?.appId).toBe('a') // widget 槽位路径命中自己的 basePath 规则
  })

  it('通道仲裁（§3.1-2/3）：浮窗 widget 走 hash 通道（URL-encoded 槽位=路径映射），query 槽位不混入', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))] })
    await settle()
    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    await host.router.navigate({ path: '/sidebar' }, { outlet: 'sidebar' })
    await host.router.navigate({ path: '/home' }, { outlet: 'widget' })

    const url = new URL(window.location.href)
    expect(url.searchParams.get('__tx_sidebar')).toBe('/sidebar') // query 通道槽位照旧
    expect(url.searchParams.has('__tx_widget')).toBe(false) // widget 不进 query
    // hash 通道：w = URL-encoded 的 `__tx_widget=/home` 映射（§3.1-3）
    expect(url.hash).toBe(`#w=${encodeURIComponent('__tx_widget=/home')}`)
    expect(host.router.current('widget').path).toBe('/home') // 读侧从 hash 通道恢复
  })

  it('registerOutlet（§3.3）：owner 归因匹配 + basePath 冲突显式报错', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))] })
    await settle()
    host.router.registerOutlet(host, 'panel', { owner: 'a', basePath: '/panel' })

    await host.router.navigate({ path: '/panel/x' }, { outlet: 'panel' })
    expect(host.router.snapshot().panel?.appId).toBe('a') // 注册的 basePath 命中，归因 owner

    // 同槽位不同 basePath 重复注册显式报错，不静默覆盖
    expect(() => host.router.registerOutlet(host, 'panel', { owner: 'b', basePath: '/other' })).toThrow()
  })
})

describe('守卫枚举（§4.3 ADR-0002）', () => {
  it('abort 拒绝导航：URL 不变、router/aborted 事件', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    const aborted: string[] = []
    host.on('router/aborted', (e) => aborted.push(e.reason), { global: true })
    host.on(
      'router/navigate',
      () => ({ type: 'abort' }) as const,
      { global: true },
    )

    const result = await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    expect(result.status).toBe('guarded')
    expect(window.location.pathname).toBe('/')
    expect(aborted).toContain('guard')
  })

  it('redirect 改道：最终落到目标路径', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    let redirected = false
    host.on(
      'router/navigate',
      (e) => {
        if (redirected) return undefined // 第二次不表态
        redirected = true
        return { type: 'redirect', to: '/login' } as const
      },
      { global: true },
    )

    const result = await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    expect(result.status).toBe('ok') // redirect 后的新导航成功
    expect(host.router.current('main').path).toBe('/login')
  })

  it('redirect 死循环：8 次上限、monitor 告警', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    const alerts: string[] = []
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })
    host.on(
      'router/navigate',
      () => ({ type: 'redirect', to: '/loop' }) as const,
      { global: true },
    )

    const result = await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    expect(result.status).toBe('error')
    expect(alerts.some((m) => m.includes('ROUTER_REDIRECT_LOOP'))).toBe(true)
  })

  it('proceed 截断后续守卫；undefined 不表态放行', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    const order: string[] = []
    host.on('router/navigate', () => {
      order.push('g1')
      return undefined
    }, { global: true, prepend: true })
    host.on('router/navigate', () => {
      order.push('g2')
      return { type: 'proceed' } as const
    }, { global: true })
    host.on('router/navigate', () => {
      order.push('g3')
      return { type: 'abort' } as const
    }, { global: true })

    const result = await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    expect(result.status).toBe('ok')
    expect(order).toEqual(['g1', 'g2']) // proceed 截断 g3
  })
})

describe('导航序号防竞态（§4.1）', () => {
  it('在途导航被新导航 superseded：无交错写 URL', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    let releaseFirst!: () => void
    const gate = new Promise<void>((r) => (releaseFirst = r))
    host.on('router/navigate', async (e) => {
      if (e.to.path === '/slow') {
        await gate // 在途：守卫挂起
      }
      return undefined
    }, { global: true })

    const slow = host.router.navigate({ path: '/slow' }, { outlet: 'main' })
    await settle()
    const fast = host.router.navigate({ path: '/fast' }, { outlet: 'main' })
    await settle()
    releaseFirst()
    const [slowResult, fastResult] = await Promise.all([slow, fast])

    expect(slowResult.status).toBe('superseded')
    expect(fastResult.status).toBe('ok')
    expect(host.router.current('main').path).toBe('/fast') // 只有新导航写 URL
  })
})

describe('popstate 全链路（§4.2）', () => {
  it('后退走完整守卫管线：守卫拒绝时 replace 恢复原 URL', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    await host.router.navigate({ path: '/a/x' }, { outlet: 'main' })
    const before = window.location.pathname
    expect(before).toBe('/a/x')

    // 挂守卫（后装仍拦历史导航 = 全链路）
    let denyPop = false
    host.on('router/navigate', () => (denyPop ? { type: 'abort' } as const : undefined), { global: true })

    denyPop = true
    window.history.back()
    await settle()
    await settle()
    expect(window.location.pathname).toBe('/a/x') // 恢复原 URL，不产生新历史
    expect(host.router.current('main').path).toBe('/a/x') // 状态未被拒绝的导航改写
  })

  it('前进/后退放行时正常切换', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    await host.router.navigate({ path: '/a/y' }, { outlet: 'main' })
    window.history.back()
    await settle()
    await settle()
    expect(host.router.current('main').path).toBe('/a')
  })
})

describe('双层事件（§3.3 ADR-0036/0047）', () => {
  it('outlet/changed:{outlet} 槽位事件族 + router/changed root-only', async () => {
    const host = createCordis({
      apps: [defineApp('a', () => createProbeApp('a', () => {}))],
      routes: [
        { basePath: '/a', appId: 'a' },
        { basePath: '/list', appId: 'a' },
      ],
    })
    await settle()
    const mainEvents: string[] = []
    const sidebarEvents: string[] = []
    const globalChanges: Array<Record<string, unknown>> = []
    host.on('outlet/changed:main', (e) => mainEvents.push(e.matched?.appId ?? 'null'))
    // 模板字面量键族：interface 只能声明代表性键，非代表键经窄化注册（ADR-0047）
    host.on('outlet/changed:sidebar' as 'outlet/changed:main', (e: { outlet: string; matched: { appId: string; outlet: string } | null }) => sidebarEvents.push(e.matched?.appId ?? 'null'))
    host.on('router/changed', (e) => globalChanges.push(e.outlets as Record<string, unknown>), { global: true })

    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    await host.router.navigate({ path: '/list' }, { outlet: 'sidebar' })

    expect(mainEvents).toEqual(['a']) // 视图隔离：sidebar 导航不打扰 main 订阅者
    expect(sidebarEvents).toEqual(['a'])
    expect(globalChanges.length).toBe(2) // 全槽位矩阵，每次导航一条
  })

  it('watch：首跑同步取值 + 后续变更通知（reactive coeffect）', async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    const seen: string[] = []
    const off = host.router.watch(host, 'main', (loc) => seen.push(loc.path))
    expect(seen).toEqual(['/']) // 首跑同步

    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    expect(seen).toEqual(['/', '/a'])
    off()
    await host.router.navigate({ path: '/a/z' }, { outlet: 'main' })
    expect(seen).toEqual(['/', '/a']) // 退订后不再收
  })
})

describe('视图隔离与写侧合并（ADR-0006/0010）', () => {
  it("isolate('router-view', outlet) 只读视图：读本槽位、写经全局合并", async () => {
    const host = createCordis({ apps: [defineApp('a', () => createProbeApp('a', () => {}))], routes: [{ basePath: '/a', appId: 'a' }] })
    await settle()
    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    await host.router.navigate({ path: '/list' }, { outlet: 'sidebar' })

    const view = host.isolate('router-view')
    // 读侧：隔离视图读本槽位（不是 main 的 /a）；写侧经全局合并（ADR-0006 写侧不隔离，
    // RouterService 是 root 单例 -- isolate 的意义在事件过滤：本视图只订本槽位族）
    expect(view.router.current('sidebar').path).toBe('/list')
    // 写侧：隔离视图内 navigate 也走全局合并，不抹其他槽位
    await view.router.navigate({ path: '/list/2' }, { outlet: 'sidebar' })
    expect(host.router.current('main').path).toBe('/a')
    expect(host.router.current('sidebar').path).toBe('/list/2')
  })
})

describe('与 lifecycle 解耦（基线 §2.3）', () => {
  it('router 不 inject lifecycle：挂载经 onResolve 回调接线', async () => {
    const mounted: Array<{ appId: string; outlet: string }> = []
    const routes: RouteRule[] = [{ basePath: '/a', appId: 'a' }]
    const host = createCordis({
      apps: [defineApp('a', () => createProbeApp('a', () => {}))],
      routes,
      onResolve: (intent) => mounted.push({ appId: intent.appId, outlet: intent.outlet }),
    })
    await settle()

    await host.router.navigate({ path: '/a' }, { outlet: 'main' })
    expect(mounted).toEqual([{ appId: 'a', outlet: 'main' }]) // lifecycle 侧回调收到挂载意图
  })
})
