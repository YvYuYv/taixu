/**
 * 主缝测试：createCordis() 框架入口 + 探针应用（probe plugin）。
 *
 * 测试策略（spec Testing Decisions）：
 * - 只测外部行为：fiber 状态、事件可见性、错误归因——不断言内部结构
 * - 事件断言经宿主层 global 监听收集（`{ global: true }` 在根注册）
 * - 探针应用是观察手段：在 apply(ctx) 内消费 ctx 契约并回报观察
 */
import { describe, it, expect } from 'vitest'
import { FiberState } from 'cordis'
import { fiberStateName } from '../src'
import { createCordis, createProbeApp, type ProbeReport } from '../src'

/** 等到所有已注册 fiber 到达稳态（v4 无全局 flush API，用微任务+宏任务梯子） */
async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

describe('主缝：createCordis() 基础层（01 号票）', () => {
  it('一次 createCordis() 拉起 monitor 与 security（零业务依赖，最先可用）', async () => {
    const host = createCordis()
    await settle()

    expect(host.monitor).toBeDefined()
    expect(host.security).toBeDefined()
    expect(typeof host.monitor.capture).toBe('function')
    expect(typeof host.security.check).toBe('function')
  })

  it('探针应用回报 fiber 状态变迁与可注入服务清单（apply 内契约可见）', async () => {
    const reports: ProbeReport[] = []
    const host = createCordis()
    const probe = createProbeApp('probe-app', (r) => reports.push(r))

    const fiber = host.plugin(probe)
    await fiber.await()
    await settle()

    // 探针回报了服务清单（monitor/security 注入成功）
    const services = reports.find((r) => r.type === 'services')
    expect(services).toBeDefined()
    if (services?.type !== 'services') throw new Error('unreachable')
    expect(services.available).toContain('monitor')
    expect(services.available).toContain('security')

    // 探针回报状态变迁：至少观察到 LOADING -> ACTIVE（PENDING 在插件运行前，由宿主旁听验证）
    const transitions = reports
      .filter((r): r is Extract<ProbeReport, { type: 'fiber-state' }> => r.type === 'fiber-state')
      .map((r) => r.state)
    expect(transitions).toContain('LOADING')
    expect(transitions).toContain('ACTIVE')
    expect(fiberStateName(fiber.state)).toBe('ACTIVE')
  })

  it('fiber 未就绪前停留 PENDING：宿主旁听状态变迁可见 PENDING->LOADING->ACTIVE 全序', async () => {
    const host = createCordis()
    const seen: string[] = []
    // cordis-internal 旁听缝（非基线 §2.4 契约事件）：lifecycle 服务（03 号票）落地后
    // app/* 契约族由框架派发，本断言届时改走契约事件
    host.on(
      'internal/status',
      (fiber, old) => {
        if (fiber.name === 'pending-probe') {
          seen.push(`${fiberStateName(old)}->${fiberStateName(fiber.state)}`)
        }
      },
      { global: true },
    )

    const probe = createProbeApp('pending-probe', () => {})
    host.plugin(probe)
    await settle()

    expect(seen).toEqual(['PENDING->LOADING', 'LOADING->ACTIVE'])
  })

  it('monitor.capture 是唯一错误入口，appId 归因，宿主经 global 旁听 monitor 事件', async () => {
    const host = createCordis()
    const heard: Array<{ appId?: string }> = []
    host.on(
      'monitor/report',
      (payload) => {
        heard.push({ appId: payload.metric.appId })
      },
      { global: true },
    )
    await settle()

    host.monitor.capture(new Error('boom'), { appId: 'probe-app', phase: 'runtime' })

    expect(heard).toEqual([{ appId: 'probe-app' }])
  })

  it('security 违规经 security/violation 事件上报，宿主旁听（security 不 inject monitor，ADR-0054）', async () => {
    const host = createCordis()
    const violations: Array<{ appId: string; rule: string }> = []
    host.on(
      'security/violation',
      (v) => {
        violations.push({ appId: v.appId, rule: v.rule })
      },
      { global: true },
    )
    await settle()

    host.security.reportViolation('probe-app', 'test.rule', { detail: 1 })

    expect(violations).toEqual([{ appId: 'probe-app', rule: 'test.rule' }])
  })

  it('宿主与探针都能 global 旁听 app/* 通知族事件', async () => {
    const hostSeen: string[] = []
    const probeSeen: string[] = []
    const host = createCordis()
    host.on(
      'app/ready',
      (e) => hostSeen.push(e.appId),
      { global: true },
    )

    const probe = createProbeApp('listener-probe', (r) => {
      if (r.type === 'app-event') probeSeen.push(r.appId)
    })
    await host.plugin(probe).await()

    host.emit('app/ready', { appId: 'demo', instanceId: 'demo#1' })
    await settle()

    expect(hostSeen).toEqual(['demo'])
    expect(probeSeen).toEqual(['demo'])
  })

  it('探针 dispose 时 effect 清理自动回滚（副作用可逆性基线 §1.2）', async () => {
    const reports: ProbeReport[] = []
    const host = createCordis()
    const probe = createProbeApp('cleanup-probe', (r) => reports.push(r))
    const fiber = host.plugin(probe)
    await fiber.await()

    await fiber.dispose()
    await settle()

    expect(fiberStateName(fiber.state)).toBe('DISPOSED')
    const cleaned = reports.some((r) => r.type === 'cleaned')
    expect(cleaned).toBe(true)
  })

  it('权限裁决 deny-by-default：无规则即拒绝（ADR-0051 本地可判定）', async () => {
    const host = createCordis()
    await settle()

    const denied = await host.security.check('probe-app', 'net:fetch')
    expect(denied.allowed).toBe(false)

    const host2 = createCordis({
      permissions: [{ appId: 'probe-app', allow: ['net:fetch'] }],
    })
    await settle()
    const allowed = await host2.security.check('probe-app', 'net:fetch')
    expect(allowed.allowed).toBe(true)
  })
})
