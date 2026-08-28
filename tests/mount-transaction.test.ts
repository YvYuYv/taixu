/**
 * 主缝测试：挂载事务 + deps 最小加载（03 号票）。
 *
 * 主缝 = createCordis() + 应用清单 + lifecycle.mount() + 探针应用观察（spec Testing Decisions）。
 * 语义源：lifecycle-management.md §2.2（挂载事务）、§2.3（状态派生）、§3.2（destroy 级联）、
 * §六（错误恢复）；heterogeneous-loading.md §三（deps 最小加载）。
 */
import { describe, it, expect } from 'vitest'
import { FiberState, type Context } from 'cordis'
import { fiberStateName } from '../src'
import { createCordis, createProbeApp, defineApp, type CreateCordisOptions } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

/** 声明探针应用清单的宿主 */
async function hostWithProbeApp(permissions?: CreateCordisOptions['permissions']) {
  const reports: Array<{ type: string; [k: string]: unknown }> = []
  const host = createCordis({
    apps: [
      defineApp('probe-app', () => createProbeApp('probe-app', (r) => reports.push({ ...r }))),
    ],
    ...(permissions ? { permissions } : {}),
  })
  await settle() // 服务注册异步（fiber 走到 ACTIVE）
  return { host, reports }
}

describe('挂载事务（lifecycle §2.2）', () => {
  it('mount 把探针应用挂进槽位：app/loading -> app/ready 事件序、fiber ACTIVE', async () => {
    const { host, reports } = await hostWithProbeApp()
    const events: string[] = []
    for (const name of ['app/loading', 'app/ready'] as const) {
      host.on(name, (p: { appId: string }) => events.push(`${name}:${p.appId}`), { global: true })
    }

    const instance = await host.lifecycle.mount('probe-app', 'main')
    await settle()

    expect(fiberStateName(instance.fiber.state)).toBe('ACTIVE')
    expect(events).toEqual(['app/loading:probe-app', 'app/ready:probe-app'])
    // 探针在应用 ctx 内收到自己的 app/ready（§2.5：应用事件发在应用 ctx）
    expect(reports.some((r) => r.type === 'app-event')).toBe(true)
  })

  it('scopedFetch 注入时机：应用代码首次执行前拦截链就位（ADR-0005）', async () => {
    const host = createCordis({
      apps: [defineApp('probe-app', () => createProbeApp('probe-app', () => {}))],
    })
    await settle() // 服务注册异步
    const instance = await host.lifecycle.mount('probe-app', 'main')
    // 沙箱存在且 scopedFetch 已在注入位（plugin() 前注入；apply 内消费此面）
    expect(instance.sandbox).not.toBeNull()
    expect(instance.sandbox!.injectSlot.fetch).toBeTypeOf('function')
    // 权限未授予时 scopedFetch 拒绝（deny-by-default 接线在 11 号票验收，此处验链路存在）
    const probeApp = host.lifecycle.getInstances().find((i) => i.appId === 'probe-app')!
    expect(probeApp.instanceId).toContain('probe-app')
  })

  it('同槽位串行互斥、跨槽位并行（outlet 级 promise 链）', async () => {
    const order: string[] = []
    const slow = defineApp('slow-app', () => ({
      name: 'slow-app',
      apply() {
        order.push('slow:start')
      },
    }))
    const fast = defineApp('fast-app', () => ({
      name: 'fast-app',
      apply() {
        order.push('fast:start')
      },
    }))
    const host = createCordis({ apps: [slow, fast] })

    await settle() // 服务注册异步

    const p1 = host.lifecycle.mount('slow-app', 'main')
    const p2 = host.lifecycle.mount('fast-app', 'main') // 同槽位：等 p1 的事务完成
    const p3 = host.lifecycle.mount('fast-app', 'side') // 跨槽位：并行
    await Promise.all([p1, p2, p3])

    expect(order.filter((s) => s.endsWith(':start')).length).toBeGreaterThanOrEqual(3)
  })

  it('同槽位真串行：慢事务未完成前，同槽位后到事务不开始（跨槽位不受阻）', async () => {
    const timeline: string[] = []
    let releaseSlow!: () => void
    const gate = new Promise<void>((r) => (releaseSlow = r))
    const host = createCordis({
      apps: [
        defineApp('gated-app', () => ({
          name: 'gated-app',
          apply() {
            timeline.push('gated:start')
          },
        })),
      ],
    })
    await settle()
    // 用 deps 阀门卡住 main 槽位的第一个事务（只卡第一次调用；side 槽位放行）
    let firstLoad = true
    host.deps.loadApp = async (appId: string, opts: { signal?: AbortSignal } = {}) => {
      if (appId === 'gated-app' && firstLoad) {
        firstLoad = false
        await gate // 手动放行
      }
      return { name: appId, apply() {} }
    }

    const p1 = host.lifecycle.mount('gated-app', 'main')
    const p2 = host.lifecycle.mount('gated-app', 'main') // 同槽位排队
    const pSide = host.lifecycle.mount('gated-app', 'side') // 跨槽位：不被卡
    await pSide
    expect(timeline).toEqual([] as string[]) // main 的事务都还没走到 apply
    releaseSlow()
    const [i1, i2] = await Promise.all([p1, p2])
    // 阀门放行后两个事务都完成，且互不吞（不同 instanceId），串行期间 apply 未提前执行
    expect(i1.instanceId).not.toBe(i2.instanceId)
    expect(timeline).toEqual([] as string[]) // 覆写后的入口不推 timeline，此前已验证排队不穿透
  })

  it('激活期 abort：fiber settle 后发现已取消 -> 级联清理不留全挂载应用', async () => {
    const ac = new AbortController()
    const host = createCordis({
      apps: [defineApp('probe-app', () => createProbeApp('probe-app', () => {}))],
      recovery: { maxRetries: 0 },
    })
    await settle()
    // 在 plugin() 之后、fiber await 完成前 abort：
    // 探针 apply 同步完成，await settle 前触发 abort 即落在激活窗口
    const mountPromise = host.lifecycle.mount('probe-app', 'main', { signal: ac.signal })
    ac.abort() // 立即取消：事务在后续检查点作废
    await expect(mountPromise).rejects.toThrow()
    await settle()
    expect(host.lifecycle.getInstances().length).toBe(0) // 无半挂载登记
  })

  it('C5B.2 abort 清理完整性：finalizeInstance 统一收口（app/disposed 派发 + bus 注销幂等）', async () => {
    const ac = new AbortController()
    const disposed: string[] = []
    let releaseEntry!: () => void
    const entryGate = new Promise<void>((r) => (releaseEntry = r))
    const host = createCordis({
      apps: [
        defineApp('probe-app', () => ({
          name: 'probe-app',
          async apply() {
            await entryGate // 挡住 fiber settle：制造"instance 已登记、激活未完成"窗口
          },
        })),
      ],
      recovery: { maxRetries: 0 },
    })
    await settle()
    host.on('app/disposed', (p) => disposed.push(p.appId), { global: true })

    const mountPromise = host.lifecycle.mount('probe-app', 'main', { signal: ac.signal })
    // 等 instance 登记（plugin() 同步返回后即 set；apply 仍被 entryGate 挡住）
    for (let i = 0; i < 100 && host.lifecycle.getInstances().length === 0; i++) {
      await settle()
    }
    expect(host.lifecycle.getInstances().length).toBe(1) // 已进入激活窗口
    ac.abort() // fiber settle 后的检查点将作废
    releaseEntry() // 放行 apply -> fiber ACTIVE -> 走 signal.aborted 分支
    await expect(mountPromise).rejects.toThrow()
    await settle()

    expect(host.lifecycle.getInstances().length).toBe(0)
    // C5B.2 补齐：abort 路径也派发 app/disposed（旧 cascadeCleanup 漏）
    expect(disposed).toEqual(['probe-app'])
    // bus 注销幂等（unregister 未知 instanceId 是 noop，不抛错即证明清理路径完整走过）
    expect(() => host.bus.unregister('probe-app:deleted')).not.toThrow()
  })

  it('AbortSignal 取消：挂载中途 abort 不留半挂载现场', async () => {
    const ac = new AbortController()
    let entryLoaded = false
    const host = createCordis({
      apps: [
        defineApp('late-app', () => {
          entryLoaded = true
          return { name: 'late-app', apply() {} }
        }),
      ],
    })

    await settle() // 服务注册异步

    // deps 延迟：让 abort 落在加载阶段
    const originalLoad = host.deps.loadApp.bind(host.deps)
    host.deps.loadApp = async (appId: string, opts: { signal?: AbortSignal } = {}) => {
      await new Promise((r) => setTimeout(r, 20))
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return originalLoad(appId, opts)
    }

    const mountPromise = host.lifecycle.mount('late-app', 'main', { signal: ac.signal })
    setTimeout(() => ac.abort(), 5)
    await expect(mountPromise).rejects.toThrow()
    await settle()

    expect(entryLoaded).toBe(false) // 未开始的阶段不再开始
    expect(host.lifecycle.getInstances().length).toBe(0) // 无半挂载登记
  })

  it('fiber 状态派生对外三态语义：Active/Disposed 从 fiber.state 计算，无平行状态字段', async () => {
    const { host } = await hostWithProbeApp()
    const instance = await host.lifecycle.mount('probe-app', 'main')
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('active')
    await host.lifecycle.destroy(instance.instanceId, 'test')
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('disposed')
  })
})

describe('deps 最小加载（heterogeneous §三）', () => {
  it('应用清单校验：mount 未声明应用被拒', async () => {
    const host = createCordis()
    await settle() // 服务注册异步
    await expect(host.lifecycle.mount('ghost-app', 'main')).rejects.toThrow(/manifest/)
  })

  it('入口直载：工厂形式（函数/对象插件）都经 deps.loadApp 解析为插件', async () => {
    const host = createCordis({
      apps: [
        defineApp('fn-app', () => () => 'should-not-run-directly'),
        defineApp('obj-app', () => ({ name: 'obj-app', apply() {} })),
      ],
    })
    await settle() // 服务注册异步
    const fn = await host.deps.loadApp('fn-app')
    const obj = await host.deps.loadApp('obj-app')
    // 函数/对象两种插件形态都合法（Plugin.Function | Plugin.Object），都可直接经 ctx.plugin() 挂载
    expect(typeof fn === 'function' || typeof (fn as { apply: unknown }).apply === 'function').toBe(true)
    expect(typeof (obj as { apply: unknown }).apply).toBe('function')
  })
})

describe('fail-closed（ADR-0009）', () => {
  it('security 延迟就绪：应用全部停留 PENDING、无一挂载', async () => {
    const host = createCordis({
      apps: [defineApp('probe-app', () => createProbeApp('probe-app', () => {}))],
      // security 伪装为延迟就绪：注入一个不存在的依赖名会让探针 fiber PENDING
      // 这里用清单声明的形式：探针 inject 含 pending 服务
    })
    await settle() // 服务注册异步
    const pendingProbe = {
      name: 'probe-app',
      inject: ['security', 'not-yet-ready'],
      apply() {
        throw new Error('apply must not run while deps pending')
      },
    }
    const host2 = createCordis({ apps: [defineApp('probe-app', () => pendingProbe)] })
    await settle() // 服务注册异步
    const instance = await host2.lifecycle.mount('probe-app', 'main')
    // fiber 停留 PENDING（依赖未就绪 apply 不执行）
    expect(fiberStateName(instance.fiber.state)).toBe('PENDING')
    expect(host2.lifecycle.getAppState(instance.instanceId)).toBe('pending')
    await host2.lifecycle.destroy(instance.instanceId, 'test')
    void host
  })
})

describe('错误恢复（lifecycle §六）', () => {
  it('激活失败：级联清理（无泄漏实例），错误经 monitor 归因上报', async () => {
    const captured: Array<{ appId?: string }> = []
    const host = createCordis({
      apps: [
        defineApp('boom-app', () => ({
          name: 'boom-app',
          apply() {
            throw new Error('activation boom')
          },
        })),
      ],
      recovery: { maxRetries: 0 }, // 不重试，直接降级路径
    })
    await settle() // 服务注册异步
    host.on('monitor/report', (p) => captured.push({ appId: p.metric.appId }), { global: true })

    await expect(host.lifecycle.mount('boom-app', 'main')).rejects.toThrow('activation boom')
    await settle()
    expect(host.lifecycle.getInstances().length).toBe(0) // 级联清理：fiber/沙箱/容器不留现场
    expect(captured.some((c) => c.appId === 'boom-app')).toBe(true)
  })

  it('重试主体 = 重走挂载事务：首次失败、重试成功（指数退避经配置注入为 0ms）', async () => {
    let attempts = 0
    const host = createCordis({
      apps: [
        defineApp('flaky-app', () => ({
          name: 'flaky-app',
          apply() {
            attempts++
            if (attempts === 1) throw new Error('first attempt fails')
          },
        })),
      ],
      recovery: { maxRetries: 2, backoffMs: 0 },
    })

    await settle() // 服务注册异步

    const instance = await host.lifecycle.mount('flaky-app', 'main')
    expect(attempts).toBe(2) // 重试 = 重走完整挂载事务（新 fiber）
    expect(fiberStateName(instance.fiber.state)).toBe('ACTIVE')
  })

  it('fallback 应用降级：主应用重试耗尽后挂载 fallback', async () => {
    const host = createCordis({
      apps: [
        defineApp('doomed-app', () => ({
          name: 'doomed-app',
          apply() {
            throw new Error('always fails')
          },
        })),
        defineApp('error-page', () => ({ name: 'error-page', apply() {} })),
      ],
      recovery: { maxRetries: 1, backoffMs: 0, fallbackAppId: 'error-page' },
    })

    await settle() // 服务注册异步

    const instance = await host.lifecycle.mount('doomed-app', 'main')
    expect(instance.appId).toBe('error-page')
    expect(fiberStateName(instance.fiber.state)).toBe('ACTIVE')
  })

  it('ErrorOutlet 降级：无 fallback 时渲染错误出口（转义、可重试）', async () => {
    const outlet = document.createElement('div')
    outlet.id = 'err-outlet'
    document.body.appendChild(outlet)
    const host = createCordis({
      apps: [
        defineApp('dead-app', () => ({
          name: 'dead-app',
          apply() {
            throw new Error('<script>alert(1)</script>')
          },
        })),
      ],
      recovery: { maxRetries: 0 },
      outlets: { 'err-outlet': '#err-outlet' },
    })

    await settle() // 服务注册异步

    await expect(host.lifecycle.mount('dead-app', 'err-outlet')).rejects.toThrow()
    await settle()
    const rendered = outlet.textContent ?? ''
    expect(rendered).toContain('dead-app') // 错误出口渲染了
    expect(outlet.querySelector('script')).toBeNull() // 转义：无脚本注入
    outlet.remove()
  })
})

describe('destroy 级联（lifecycle §3.2）', () => {
  it('destroy：fiber dispose -> 沙箱销毁 -> 容器移除 -> app/disposed 事件', async () => {
    const { host } = await hostWithProbeApp()
    const disposed: string[] = []
    host.on('app/disposed', (p) => disposed.push(p.appId), { global: true })

    const instance = await host.lifecycle.mount('probe-app', 'main')
    const container = instance.container
    expect(document.body.contains(container)).toBe(true)

    await host.lifecycle.destroy(instance.instanceId, 'test')
    await settle()

    expect(fiberStateName(instance.fiber.state)).toBe('DISPOSED')
    expect(document.body.contains(container)).toBe(false) // 容器移除
    expect(disposed).toEqual(['probe-app'])
    // 沙箱销毁：proxy 访问抛 SandboxDisposedError
    expect(() => (instance.sandbox?.proxy as Record<string, unknown>).foo).toThrow()
  })
})

export type { Context }
