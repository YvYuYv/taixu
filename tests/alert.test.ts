/**
 * 主缝测试：AlertEngine 告警引擎（monitoring §七，B-监控）。
 * 规则查表 deny-by-default + condition 真实执行 + (appId, type) 维度冷却 + 内置 APP_LOAD_FAILED/JS_ERROR_RATE。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

describe('AlertEngine（§七）', () => {
  it('未注册类型丢弃（deny-by-default）；注册 + condition 通过才派发', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: {
        alertRules: {
          CUSTOM_A: {}, // 无 condition = 恒真
          GATED: { condition: (_appId, detail) => (detail as { open?: boolean }).open === true },
        },
      },
      apps: [defineApp('a-app', () => ({ name: 'a-app', apply() {} }))],
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(`${e.alert.appId ?? 'host'}:${e.alert.message}:${e.alert.level}`), { global: true })

    expect(host.monitor.trigger({ type: 'UNREGISTERED', appId: 'a-app' })).toBe(false) // 未注册丢弃
    expect(host.monitor.trigger({ type: 'CUSTOM_A', appId: 'a-app' })).toBe(true)
    expect(host.monitor.trigger({ type: 'GATED', appId: 'a-app', detail: { open: false } })).toBe(false) // condition 拒绝
    expect(host.monitor.trigger({ type: 'GATED', appId: 'a-app', detail: { open: true } })).toBe(true)
    expect(alerts).toEqual(['a-app:CUSTOM_A:warning', 'a-app:GATED:warning']) // 缺省 warning 级
  })

  it('冷却按 (appId, type) 维度：同键静默、他应用不连带静默；小冷却过期恢复', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: { alertRules: { RATE: { cooldownMs: 40 } } },
      apps: [defineApp('a1', () => ({ name: 'a1', apply() {} })), defineApp('b1', () => ({ name: 'b1', apply() {} }))],
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.appId!), { global: true })

    expect(host.monitor.trigger({ type: 'RATE', appId: 'a1' })).toBe(true)
    expect(host.monitor.trigger({ type: 'RATE', appId: 'a1' })).toBe(false) // 同 (appId, type) 冷却静默
    expect(host.monitor.trigger({ type: 'RATE', appId: 'b1' })).toBe(true) // 他应用不连带静默（维度修复）
    expect(alerts).toEqual(['a1', 'b1'])

    await new Promise((r) => setTimeout(r, 50)) // 冷却过期
    expect(host.monitor.trigger({ type: 'RATE', appId: 'a1' })).toBe(true)
    expect(alerts).toEqual(['a1', 'b1', 'a1'])
  })

  it('内置 APP_LOAD_FAILED：load 阶段错误触发告警（含重试耗尽路径）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: { alertRules: { APP_LOAD_FAILED: {} } },
      recovery: { maxRetries: 0, backoffMs: 0 },
      apps: [defineApp('bad', () => { throw new Error('entry boom') })],
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })
    await host.lifecycle.mount('bad', 'main').catch(() => {})
    await settle()
    expect(alerts).toContain('APP_LOAD_FAILED') // load 阶段错误（manifest 缺失/入口抛错）
  })

  it('内置 JS_ERROR_RATE：appId 错误率窗口超阈值触发一次（阈值可配）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: { alertRules: { JS_ERROR_RATE: {} }, errorRate: { windowMs: 60_000, max: 3 } },
      apps: [defineApp('e-app', () => ({ name: 'e-app', apply() {} }))],
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(`${e.alert.appId}:${e.alert.message}`), { global: true })

    host.monitor.capture(new Error('e1'), { appId: 'e-app', phase: 'runtime' })
    host.monitor.capture(new Error('e2'), { appId: 'e-app', phase: 'runtime' })
    host.monitor.capture(new Error('e3'), { appId: 'e-app', phase: 'runtime' })
    expect(alerts).toEqual([]) // 未超阈值
    host.monitor.capture(new Error('e4'), { appId: 'e-app', phase: 'runtime' }) // 第 4 次 > max 3
    expect(alerts).toEqual(['e-app:JS_ERROR_RATE'])
    host.monitor.capture(new Error('e5'), { appId: 'e-app', phase: 'runtime' }) // 窗口内继续超——冷却静默（默认 30s）
    expect(alerts).toEqual(['e-app:JS_ERROR_RATE'])
  })
})
