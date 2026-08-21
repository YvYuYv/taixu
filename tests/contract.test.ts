/**
 * 事件契约机器验证 + 静态扫描 lint + 核心层守卫（12 号票，P0 收口）。
 *
 * 契约源：cordis-alignment.md §2.4（统一事件契约——全框架唯一版本）与 §2.4.1
 * （调度结果契约 ADR-0002/0012/0014）。冲突时以 cordis-alignment.md 为准（AGENTS.md）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  document.body.textContent = ''
  sessionStorage.clear()
})

// ---------------------------------------------------------------- 静态扫描 lint

/** 递归收集 src 下全部 .ts 源码 */
function collectSrc(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...collectSrc(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('静态扫描 lint（ADR-0016/0035 + 已删除事件名）', () => {
  const sources = collectSrc(join(__dirname, '../src'))
    .map((p) => ({ path: p, code: readFileSync(p, 'utf8') }))

  it('零 ctx.bail 调用（bail 全局禁用，ADR-0016）', () => {
    const hits = sources.filter(({ path, code }) => /\.bail\(/.test(code))
    expect(hits.map((h) => h.path)).toEqual([])
  })

  it('app/intent:* 事件不存在（挂起走服务方法，ADR-0035）', () => {
    const hits = sources.filter(({ code }) => /['\"]app\/intent/.test(code))  // 引号内出现 = 真实使用（注释/文档说明不算）
    expect(hits.map((h) => h.path)).toEqual([])
  })

  it('已删除的旧契约事件名零引用（基线 §2.4"全部作废"清单）', () => {
    const deleted = ['lifecycle:beforeLoad', 'lifecycle:beforeMount', 'lifecycle:mounted', 'state:change']
    for (const name of deleted) {
      const hits = sources.filter(({ code }) => code.includes(name))
      expect(hits.map((h) => h.path)).toEqual([])
    }
  })

  it('零自造服务访问方式（禁 ctx.service.x，基线 §2.2 统一写法）', () => {
    const hits = sources.filter(({ code }) => /ctx\.service\./.test(code))
    expect(hits.map((h) => h.path)).toEqual([])
  })
})

// ---------------------------------------------------------------- 事件契约

type FieldSpec = 'string' | 'number' | 'boolean' | 'object' | 'nonnull-object' | 'any' | 'array' | 'enum:keepalive|navigation|system' | 'enum:guard|superseded|unmount' | 'enum:lru|pressure' | 'enum:load|activate|runtime' | 'AbortSignal'

/** 基线 §2.4 事件 -> 必填字段类型（机器可读契约表） */
const CONTRACT: Record<string, Record<string, FieldSpec>> = {
  'app/loading': { appId: 'string', instanceId: 'string', signal: 'AbortSignal' },
  'app/loaded': { appId: 'string', instanceId: 'string' },
  'app/ready': { appId: 'string', instanceId: 'string' },
  'app/error': { appId: 'string', instanceId: 'string', phase: 'enum:load|activate|runtime', error: 'nonnull-object', recoverable: 'boolean' },
  'app/suspend': { instanceId: 'string', reason: 'enum:keepalive|navigation|system' },
  'app/resume': { instanceId: 'string' },
  'app/evicted': { appId: 'string', instanceId: 'string', cause: 'enum:lru|pressure' },
  'app/disposed': { appId: 'string', instanceId: 'string' },
  'router/navigate': { from: 'nonnull-object', to: 'nonnull-object', outlet: 'string', signal: 'AbortSignal' },
  'router/aborted': { outlet: 'string', reason: 'enum:guard|superseded|unmount' },
  'router/changed': { location: 'nonnull-object', outlets: 'nonnull-object' },
  'router/replay': { instanceId: 'string', outlet: 'string' },
  'bus/replay': { instanceId: 'string' },
  'outlet/changed:main': { outlet: 'string', matched: 'any' },
  'outlet/changed:side': { outlet: 'string', matched: 'any' }, // 模板字面量族第二个槽位（ADR-0047）
  'message/send': { message: 'nonnull-object' },
  'message/receive': { message: 'nonnull-object', targetCtx: 'nonnull-object' },
  'message/response': { message: 'nonnull-object' },
  'bus/overflow': { instanceId: 'string', coalescedKeys: 'array', droppedCount: 'number' },
  'state/changed': { key: 'string', path: 'string', source: 'string', version: 'number' }, // value/old 可空（无旧值时 undefined）,
  'state/sync': { instanceId: 'string', keys: 'nonnull-object' },
  'monitor/report': { metric: 'nonnull-object' },
  'monitor/alert': { alert: 'nonnull-object' },
  'security/violation': { appId: 'string', rule: 'string', detail: 'any' }, // detail: unknown（基线）
}

function checkField(value: unknown, spec: FieldSpec): boolean {
  switch (spec) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number'
    case 'boolean': return typeof value === 'boolean'
    case 'object': return typeof value === 'object' // 可空对象字段（value/old 等合法 null）
    case 'nonnull-object': return typeof value === 'object' && value !== null
    case 'any': return true // 契约显式 unknown/可空（matched: MatchedApp | null、detail: unknown）
    case 'array': return Array.isArray(value)
    case 'AbortSignal': return value instanceof AbortSignal
    default: {
      if (spec.startsWith('enum:')) return (spec.slice(5).split('|') as unknown[]).includes(value)
      return false
    }
  }
}

describe('事件契约：集成场景形状断言（基线 §2.4）', () => {
  it('全部契约事件在集成场景中触发且载荷单对象、必填字段类型正确', async () => {
    const seen = new Map<string, unknown[]>()
    const host = createCordis({
      permissions: [
        { appId: 'demo-a', allow: ['state:read:shared:cfg', 'message:evt:x', 'net:fetch'] },
      ],
      routes: [{ basePath: '/home', appId: 'demo-a' }, { basePath: '/loop', appId: 'demo-a' }],
      bus: { queueLimit: 2 },
      keepAlive: { maxCount: 1 },
      recovery: { maxRetries: 0, backoffMs: 0 },
      apps: [
        defineApp('demo-a', () => ({
          name: 'demo-a',
          inject: ['state', 'bus'],
          apply(ctx: Context) {
            ctx.state.watch(ctx, 'shared:cfg', () => {})
            ctx.bus.respond(ctx, 'evt:req', async () => ({ ok: true as const, value: 'v' }))
            ctx.on('message/receive', () => {})
          },
        })),
        defineApp('demo-b', () => ({ name: 'demo-b', apply() {} })),
        defineApp('demo-bad', () => { throw new Error('boom') }),
      ],
    })
    await settle()
    for (const name of Object.keys(CONTRACT)) {
      host.on(name as 'app/ready', ((payload: unknown) => {
        const list = seen.get(name) ?? []
        list.push(payload)
        seen.set(name, list)
      }) as never, { global: true })
    }

    // -- 挂载（loading/loaded/ready）+ state + bus 请求应答
    const ia = await host.lifecycle.mount('demo-a', 'main')
    await settle()
    host.state.set('shared:cfg', { theme: 'dark' }) // state/changed
    await host.bus.request(host, 'evt:req', 1, { target: 'demo-a' }) // message/response
    // -- 路由（navigate/changed/outlet 族 + 守卫 abort + redirect loop -> monitor/alert）
    await host.router.navigate({ path: '/home' }, { caller: host, outlet: 'main' })
    await host.router.navigate({ path: '/s' }, { caller: host, outlet: 'side' }) // outlet 族第二槽位（matched: null）
    const offRedirect = host.on('router/navigate', () => ({ type: 'redirect', to: '/loop' }), { global: true })
    await host.router.navigate({ path: '/loop' }, { caller: host, outlet: 'main' }) // 8 次重定向 -> monitor/alert
    offRedirect()
    host.on('router/navigate', () => ({ type: 'abort' }), { global: true })
    await host.router.navigate({ path: '/x' }, { caller: host, outlet: 'side' }) // router/aborted
    // -- 违规（security/violation）+ monitor.capture
    host.security.reportViolation('demo-a', 'state-read', { key: 'shared:x' })
    host.monitor.capture(new Error('demo'), { appId: 'demo-a', phase: 'runtime' })
    // -- 挂起/恢复（suspend/resume + state/sync + 溢出）
    const ib = await host.lifecycle.mount('demo-b', 'o1')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route')
    host.bus.send(host, { type: 'evt:x', payload: 1, target: 'demo-a' })
    host.bus.send(host, { type: 'evt:x', payload: 2, target: 'demo-a' })
    host.bus.send(host, { type: 'evt:x', payload: 3, target: 'demo-a' }) // 上限 2 -> bus/overflow
    await host.lifecycle.requestResume(host, ia.instanceId, 'route')
    await settle()
    // -- 驱逐（evicted/disposed）：池上限 1——再挂起 a + 挂起 b（池 2 > 1，LRU 驱逐 a）
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route')
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route')
    await settle()
    await new Promise((r) => setTimeout(r, 20))
    // -- 失败应用（app/error）
    await host.lifecycle.mount('demo-bad', 'o2').catch(() => {})
    await settle()

    // 断言：契约表全部事件都被触发（覆盖完整性）
    const missing = Object.keys(CONTRACT).filter((n) => !seen.has(n))
    expect(missing).toEqual([])
    // 断言：每次触发载荷为单对象且字段类型符合契约
    const violations: string[] = []
    for (const [name, payloads] of seen) {
      const spec = CONTRACT[name]!
      for (const p of payloads) {
        if (typeof p !== 'object' || p === null) violations.push(`${name}: 载荷非单对象`)
        for (const [field, fieldSpec] of Object.entries(spec)) {
          if (!checkField((p as Record<string, unknown>)[field], fieldSpec)) {
            violations.push(`${name}.${field}: 期望 ${fieldSpec}，实得 ${JSON.stringify((p as Record<string, unknown>)[field])}`)
          }
        }
      }
    }
    expect(violations).toEqual([])
  }, 15000)
})

// ---------------------------------------------------------------- 结果契约

describe('结果契约校验（§2.4.1，ADR-0002/0012/0014）', () => {
  it('守卫返回枚举外形状：按中止处理 + monitor 上报（不落 commit）', async () => {
    const reports: string[] = []
    const host = createCordis({
      apps: [defineApp('g-app', () => ({ name: 'g-app', apply() {} }))],
    })
    await settle()
    host.on('monitor/report', (e) => reports.push(e.metric.message), { global: true })
    await host.router.navigate({ path: '/ok' }, { caller: host, outlet: 'main' })
    const off = host.on('router/navigate', () => 'proceed' as unknown as never, { global: true }) // 非法形状（字符串）
    const result = await host.router.navigate({ path: '/no' }, { caller: host, outlet: 'main' })
    off()
    expect(result.status).toBe('guarded') // 违规形状按中止
    expect(reports.some((m) => m.includes('guard-contract-violation'))).toBe(true)
    expect(host.router.current('main').path).toBe('/ok') // 未 commit
  })

  it('请求-应答族：respond 返回 false 被拒（无包络送达，ADR-0014/0016）+ monitor 告警', async () => {
    const reports: string[] = []
    const host = createCordis({
      apps: [defineApp('r-app', () => ({
        name: 'r-app',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.bus.respond(ctx, 'evt:r', () => false as unknown as never) // 非法应答（false 无语义）
        },
      }))],
    })
    await settle()
    host.on('monitor/report', (e) => reports.push(e.metric.message), { global: true })
    const ia = await host.lifecycle.mount('r-app', 'main')
    await settle()
    const reply = await host.bus.request(host, 'evt:r', 1, { target: 'r-app', timeout: 50 })
    expect(reply).toBeUndefined() // false 不产生包络（按不应答处理）
    expect(reports.some((m) => m.includes('bus-reply-false'))).toBe(true)
    void ia
  })

  it('通知族忽略返回值：监听器返回任意值不影响 fire-and-forget 派发', async () => {
    let fired = 0
    const host = createCordis({ apps: [defineApp('n-app', () => ({ name: 'n-app', apply() {} }))] })
    await settle()
    // 监听器返回垃圾值（通知族无返回值契约——派发方不读、不炸）
    host.on('app/ready', () => { fired++; return { bogus: true } as never }, { global: true })
    host.on('state/changed', () => 'garbage' as never, { global: true })
    await host.lifecycle.mount('n-app', 'main')
    host.state.set('shared:x', 1)
    await settle()
    expect(fired).toBe(1) // 派发照常完成
  })
})

// ---------------------------------------------------------------- 核心层守卫

describe('核心层守卫（ADR-0011）', () => {
  it('散落 ctx.set 替换八核心服务被拒 + violation；第三方键放行', async () => {
    const violations: string[] = []
    const host = createCordis({ apps: [defineApp('c-app', () => ({ name: 'c-app', apply() {} }))] })
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    for (const key of ['lifecycle', 'router', 'bus', 'state', 'sandbox', 'monitor', 'security', 'deps']) {
      expect(() => (host as unknown as { set: (k: string, v: unknown) => unknown }).set(key, {})).toThrow(/not replaceable/)
    }
    expect(violations.filter((r) => r === 'core-service-replacement')).toHaveLength(8)
    // 第三方插件键不在保护列（ADR-0007 语义）：通过核心守卫后由 cordis 自身校验接管
    expect(() => (host as unknown as { set: (k: string, v: unknown) => unknown }).set('myPlugin', { x: 1 })).toThrow(/without provide/)
  })
})
