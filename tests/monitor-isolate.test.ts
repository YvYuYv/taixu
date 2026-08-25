/**
 * 主缝测试：按应用隔离的 monitor 主动上报入口（monitoring §2.1，ADR-0010/0025/0022）。
 * 应用经挂载事务自动获得 isolate('monitor', appId) 隔离实例：capture/count 自动归因 appId、
 * startSpan 续接子 span（同 traceId）；root 单例与被动事件入口不受影响。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'
import type { AppMonitor } from '../src/services/monitor'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

describe('按应用隔离 monitor 实例（§2.1）', () => {
  it('应用 ctx.monitor 是隔离实例：capture 自动归因 appId（无需手动传）', async () => {
    const reports: { appId?: string; message: string }[] = []
    let appMonitor: AppMonitor | null = null
    const host = createCordis({
      apps: [
        defineApp('iso-app', () => ({
          name: 'iso-app',
          inject: ['monitor'],
          apply(ctx: Context) {
            appMonitor = ctx.monitor as unknown as AppMonitor
          },
        })),
      ],
    })
    await settle()
    host.on('monitor/report', (e) => reports.push({ appId: e.metric.appId, message: (e.metric as { message: string }).message }), { global: true })

    const inst = await host.lifecycle.mount('iso-app', 'main')
    await settle()

    expect(appMonitor).toBeTruthy()
    expect(appMonitor).not.toBe(host.monitor) // 隔离实例 ≠ root 单例
    appMonitor!.capture(new Error('app-side error')) // 不带 appId
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ appId: 'iso-app', message: 'app-side error' }) // 自动归因

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('startSpan 续接为子 span（同 traceId 贯通，ADR-0022）；tracing 未配置时诚实降级', async () => {
    const monitors: AppMonitor[] = []
    const host = createCordis({
      apps: [
        defineApp('trace-app', () => ({
          name: 'trace-app',
          inject: ['monitor'],
          apply(ctx: Context) {
            monitors.push(ctx.monitor as unknown as AppMonitor)
          },
        })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('trace-app', 'main')
    await settle()

    const parent = host.tracing.startSpan('parent')
    const child = monitors[0]!.startSpan('app-work', parent.traceparent)
    expect(child).toBeTruthy()
    child!.end()
    parent.end()
    const spans = host.tracing.spans()
    const childSpan = spans.find((s) => s.name === 'app-work')!
    expect(childSpan.traceId).toBe(spans.find((s) => s.name === 'parent')!.traceId) // 同 traceId
    expect(childSpan.parentId).toBeTruthy()

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('count 经隔离实例打点（带 appId 标签），root 单例指标面可见', async () => {
    const monitors: AppMonitor[] = []
    const host = createCordis({
      apps: [
        defineApp('metric-app', () => ({
          name: 'metric-app',
          inject: ['monitor'],
          apply(ctx: Context) {
            monitors.push(ctx.monitor as unknown as AppMonitor)
          },
        })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('metric-app', 'main')
    await settle()

    monitors[0]!.count('custom_op', 12)
    expect(host.monitor.metricsSnapshot()['custom_op']).toMatchObject({ count: 1, max: 12 }) // 聚合汇于 root sink

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('销毁释放隔离 impl：重挂载得到新实例，root monitor 不受影响', async () => {
    const monitors: AppMonitor[] = []
    const host = createCordis({
      monitor: { alertRules: { ROOT_ONLY: {} } },
      apps: [
        defineApp('recycle-app', () => ({
          name: 'recycle-app',
          inject: ['monitor'],
          apply(ctx: Context) {
            monitors.push(ctx.monitor as unknown as AppMonitor)
          },
        })),
      ],
    })
    await settle()

    const a = await host.lifecycle.mount('recycle-app', 'main')
    await settle()
    await host.lifecycle.destroy(a.instanceId, 't')
    await settle()

    const b = await host.lifecycle.mount('recycle-app', 'main') // 重挂载 = 新隔离实例
    await settle()
    expect(monitors).toHaveLength(2)
    expect(monitors[0]).not.toBe(monitors[1])

    monitors[1]!.capture(new Error('after remount'))
    expect(host.monitor.trigger({ type: 'ROOT_ONLY', appId: 'host' })).toBe(true) // root 单例能力不受影响

    await host.lifecycle.destroy(b.instanceId, 't')
  })

  it('应用 ctx 上非白名单 isolate 仍被拦截（守卫经原型链覆盖应用 ctx）', async () => {
    let appCtx: Context | null = null
    const violations: string[] = []
    const host = createCordis({
      apps: [
        defineApp('guard-app', () => ({
          name: 'guard-app',
          apply(ctx: Context) {
            appCtx = ctx
          },
        })),
      ],
    })
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    const inst = await host.lifecycle.mount('guard-app', 'main')
    await settle()

    expect(() => (appCtx as unknown as Context).isolate('state' as never)).toThrow(/not whitelisted/)
    expect(violations).toContain('isolate-non-whitelisted')
    // 白名单标签（monitor）在应用 ctx 上可用
    expect((appCtx as unknown as Context).isolate('monitor')).toBeTruthy()

    await host.lifecycle.destroy(inst.instanceId, 't')
  })
})
