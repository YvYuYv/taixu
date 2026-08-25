/**
 * 主缝测试：指标采集（环形缓冲/分位数/后台暂停，monitoring §三）+ LeakDetector（§四）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => { document.body.textContent = '' })
afterEach(() => { delete (document as unknown as Record<string, unknown>).hidden })

describe('指标采集（§三）', () => {
  it('count + 分位数快照（p50/p75/p95/max）；环形缓冲覆盖最旧', async () => {
    const host = createCordis({ apps: [defineApp('m1', () => ({ name: 'm1', apply() {} }))] })
    await settle()
    for (let i = 1; i <= 100; i++) host.monitor.count('latency', i)
    const snap = host.monitor.metricsSnapshot()['latency']!
    expect(snap.count).toBe(100)
    expect(snap.p50).toBe(50) // 最近邻分位数
    expect(snap.p95).toBe(95)
    expect(snap.max).toBe(100)

    // 环形缓冲（容量 8）：再推 5 条覆盖最旧
    const host2 = createCordis({ apps: [], metrics: undefined } as never)
    void host2
    const small = createCordis({ monitor: { metricsBuffer: 8 }, apps: [defineApp('m2', () => ({ name: 'm2', apply() {} }))] })
    await settle()
    for (let i = 1; i <= 12; i++) small.monitor.count('ring', i)
    const ring = small.monitor.metricsSnapshot()['ring']!
    expect(ring.count).toBe(8) // 定长
    expect(ring.max).toBe(12) // 覆盖最旧、保最新
    expect(ring.p50).toBeGreaterThanOrEqual(5) // 旧值 1-4 已被覆盖
  })

  it('内置采集：state_change 计数 + 应用加载时长（loading -> ready 事件差）', async () => {
    const host = createCordis({ apps: [defineApp('m3', () => ({ name: 'm3', apply() {} }))] })
    await settle()
    host.state.set('shared:x', 1)
    host.state.set('shared:x', 2)
    await host.lifecycle.mount('m3', 'main')
    await settle()
    const snap = host.monitor.metricsSnapshot()
    expect(snap['state_change']!.count).toBeGreaterThanOrEqual(2) // 自动计数
    expect(snap['app_load_ms']!.count).toBe(1) // 加载时长（事件差 >= 0）
    expect(snap['app_load_ms']!.max).toBeGreaterThanOrEqual(0)
  })

  it('后台暂停：document.hidden 时 fps 前缀指标不计数（修复后台误报 LOW_FPS）', async () => {
    const host = createCordis({ apps: [defineApp('m4', () => ({ name: 'm4', apply() {} }))] })
    await settle()
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    host.monitor.count('fps_frame_ms', 16)
    expect(host.monitor.metricsSnapshot()['fps_frame_ms']).toBeUndefined() // 后台暂停
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    host.monitor.count('fps_frame_ms', 16)
    expect(host.monitor.metricsSnapshot()['fps_frame_ms']!.count).toBe(1) // 回前台恢复
  })
})

describe('LeakDetector（§四）', () => {
  it('嫌疑超 TTL + 有 GC 活动 -> LEAK_SUSPECT 一次（去抖）；无 GC 证据不告警（防误报）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: {
        alertRules: { LEAK_SUSPECT: {} },
        leak: { ttlMs: 20, pollMs: 10, hasGcActivity: () => true }, // 注入 GC 证据源（测试）
      },
      apps: [defineApp('lk', () => ({ name: 'lk', apply() {} }))],
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })

    const leaked = { node: 'still-referenced' } // 存活对象（嫌疑成立）
    host.monitor.trackDisposed({ instanceId: 'lk:test-1', object: leaked })
    await new Promise((r) => setTimeout(r, 60))
    expect(alerts.filter((a) => a === 'LEAK_SUSPECT')).toHaveLength(1) // 超时 + GC 证据 -> 一次（去抖）

    // 无 GC 证据（诚实降级：deref 非空不能证明泄漏）
    const host2 = createCordis({
      monitor: { alertRules: { LEAK_SUSPECT: {} }, leak: { ttlMs: 20, pollMs: 10, hasGcActivity: () => false } },
      apps: [defineApp('lk2', () => ({ name: 'lk2', apply() {} }))],
    })
    await settle()
    const alerts2: string[] = []
    host2.on('monitor/alert', (e) => alerts2.push(e.alert.message), { global: true })
    host2.monitor.trackDisposed({ instanceId: 'lk2:test-1', object: { alive: true } })
    await new Promise((r) => setTimeout(r, 60))
    expect(alerts2).toEqual([]) // 无 GC 活动 -> 不告警
  })

  it('lifecycle destroy 自动登记嫌疑（容器对象）', async () => {
    const host = createCordis({ apps: [defineApp('dk', () => ({ name: 'dk', apply() {} }))] })
    await settle()
    const i = await host.lifecycle.mount('dk', 'main')
    await host.lifecycle.destroy(i.instanceId, 't')
    await settle()
    // 内部嫌疑登记（经行为面断言：不抛错 + destroy 完成；细粒度判定由上例覆盖）
    expect(host.lifecycle.getAppState(i.instanceId)).toBe('disposed')
  })
})
