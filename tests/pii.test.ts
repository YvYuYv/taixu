/**
 * PII 脱敏管道（monitoring §六，F9）+ 开销自测（§九，F9）。
 *
 * 规范锚点：
 * - §六：不采集 textContent / URL query 脱敏（与 security.sanitizeQuery 同规则）/
 *   用户标识 = 会话随机 ID（不指纹）/ 敏感键（state sensitiveKeys）联动掩码
 * - §九：预算 CPU < 1%、单事件处理 < 0.1ms——**抽样 profiler 自测并周期上报
 *   `MONITOR_OVERHEAD`**（观测者效应自测）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  redactText,
  redactUrl,
  newSessionId,
  dntEnabled,
  DEFAULT_SENSITIVE_KEYS,
  type PrivacyConfig,
} from '../src/services/monitor/pii'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

describe('PII 脱敏管道（F9，monitoring §六）', () => {
  it('URL query 脱敏：敏感键掩码，非敏感键保留（与 security.sanitizeQuery 同规则）', () => {
    const url = 'https://a.com/p?token=abc123&page=2&password=s3cret'
    const out = redactUrl(url)
    expect(out).toContain('page=2') // 非敏感键保留（排障价值）
    expect(out).not.toContain('abc123')
    expect(out).not.toContain('s3cret')
    expect(out).toContain('REDACTED')
  })

  it('非法 URL / 无 query：原样返回；相对路径同样脱敏（错误日志常见形态）', () => {
    expect(redactUrl('https://a.com/p')).toBe('https://a.com/p')
    // 相对路径（错误消息里的常见形态）也走脱敏——前缀保持原样，仅 query 掩码
    expect(redactUrl('not-a-url?token=x')).toBe('not-a-url?token=REDACTED')
  })

  it('文本脱敏：key=value / JSON "k":"v" / k: v 三种形态', () => {
    expect(redactText('fetch failed token=abc123 next')).toContain('token=REDACTED')
    expect(redactText('{"password":"s3cret","id":7}')).toBe('{"password":"REDACTED","id":7}')
    expect(redactText('Authorization: Bearer eyJhbGciOi end')).toContain('REDACTED')
  })

  it('只掩码敏感键，不抹掉整段（过度脱敏会毁掉排障价值）', () => {
    const text = 'GET /api/orders?limit=20 failed with 500'
    expect(redactText(text)).toBe(text) // 无敏感键 -> 原样
  })

  it('关闭开关（enabled: false）：不脱敏（宿主显式承担风险）', () => {
    const cfg: PrivacyConfig = { enabled: false }
    expect(redactText('token=abc', cfg)).toBe('token=abc')
    expect(redactUrl('https://a.com?token=abc', cfg)).toBe('https://a.com?token=abc')
  })

  it('自定义敏感键与掩码文本', () => {
    const cfg: PrivacyConfig = { sensitiveKeys: ['orderNo'], mask: '<hidden>' }
    expect(redactText('orderNo=SO-123', cfg)).toBe('orderNo=<hidden>')
    expect(redactText('token=abc', cfg)).toBe('token=abc') // 默认族被自定义清单覆盖
  })

  it('默认敏感键族与 state sensitiveKeys 同族（token/password/secret/pii...）', () => {
    expect(DEFAULT_SENSITIVE_KEYS).toContain('token')
    expect(DEFAULT_SENSITIVE_KEYS).toContain('password')
    expect(DEFAULT_SENSITIVE_KEYS).toContain('pii')
  })

  it('会话随机 ID 不指纹：每次不同、长度稳定；DNT 可探测', () => {
    const a = newSessionId()
    const b = newSessionId()
    expect(a).not.toBe(b) // 会话随机（非设备指纹）
    expect(a.length).toBeGreaterThanOrEqual(32)
    // DNT 未开启（jsdom 默认无 doNotTrack）-> false；探测失败不停采集
    expect(dntEnabled()).toBe(false)
  })
})

describe('capture 走脱敏管道（F9）', () => {
  it('配置 privacy 后错误 message/stack 入库前脱敏；未配置时原样（既有行为）', async () => {
    const host = createCordis({ monitor: { privacy: {} }, apps: [] })
    await settle()
    host.monitor.capture(new Error('login failed token=abc123'), { phase: 'runtime' })
    const [masked] = host.monitor.errors()
    expect(masked?.message).toContain('REDACTED')
    expect(masked?.message).not.toContain('abc123')

    const plain = createCordis({ apps: [] })
    await settle()
    plain.monitor.capture(new Error('login failed token=abc123'), { phase: 'runtime' })
    expect(plain.monitor.errors()[0]?.message).toContain('abc123') // 未配置 = 不脱敏
  })
})

describe('开销自测（F9，monitoring §九）', () => {
  it('超预算样本累计并周期上报 MONITOR_OVERHEAD（deny-by-default：需注册规则）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: {
        // 每次都采样、预算 0ms（任何耗时都算超预算）用于确定性验证
        overhead: { sampleEvery: 1, budgetMs: 0, reportEveryMs: 0 },
        alertRules: { MONITOR_OVERHEAD: {} },
      },
      apps: [defineApp('o-app', () => ({ name: 'o-app', apply() {} }))],
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })

    host.monitor.capture(new Error('boom-1'), { phase: 'runtime' })
    expect(alerts).toContain('MONITOR_OVERHEAD') // 超预算即上报（宿主已注册该类型）
  })

  it('未注册 MONITOR_OVERHEAD 规则：静默丢弃（deny-by-default，不制造噪音）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: { overhead: { sampleEvery: 1, budgetMs: 0, reportEveryMs: 0 } },
      apps: [],
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })
    host.monitor.capture(new Error('boom'), { phase: 'runtime' })
    expect(alerts).not.toContain('MONITOR_OVERHEAD')
  })

  it('未配置 overhead：零自测开销（不采样、不上报）', async () => {
    const alerts: string[] = []
    const host = createCordis({ monitor: { alertRules: { MONITOR_OVERHEAD: {} } }, apps: [] })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })
    for (let i = 0; i < 5; i++) host.monitor.capture(new Error(`boom-${i}`), { phase: 'runtime' })
    expect(alerts).not.toContain('MONITOR_OVERHEAD')
    vi.restoreAllMocks()
  })
})
