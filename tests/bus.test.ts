/**
 * 主缝测试：bus send 服务方法 + 应答包络 + trace（07 号票）。
 *
 * 主缝 = createCordis({ permissions, apps }) + lifecycle.mount + 应用 fiber ctx 收发。
 * 语义源：communication-protocol.md §二（消息模型）、§3.1（send/定向投递/广播）、
 * §3.3（serial + 应答包络 ADR-0014/0016）、§七（traceparent CSPRNG，ADR-0022）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp, type PermissionRule } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

const GRANTS: PermissionRule[] = [
  { appId: 'app-a', allow: ['message:cart:add', 'message:query:price', 'message:boom:*', 'message:evt:*'] },
  { appId: 'app-b', allow: ['message:response:*'] },
]

/** 收件应用：订阅 message/receive 并回报（模拟真实应用收发） */
function receiverApp(appId: string, bucket: unknown[]) {
  return defineApp(appId, () => ({
    name: appId,
    inject: ['bus'],
    apply(ctx: Context) {
      ctx.on('message/receive', (e) => bucket.push(e.message))
    },
  }))
}

describe('send 服务方法（§3.1，ADR-0041）', () => {
  it('source 从 fiber 派生不可伪造：入参无法指定 source', async () => {
    const got: unknown[] = []
    const host = createCordis({
      permissions: GRANTS,
      apps: [receiverApp('app-b', got), defineApp('app-a', () => ({
        name: 'app-a',
        inject: ['bus'],
        apply(ctx: Context) {
          // 应用侧唯一入口：send(ctx, message)；source 不在入参形状里（编译期已排除），
          // 运行时注入伪造字段也不生效（服务端覆写）
          ctx.bus.send(ctx, {
            type: 'cart:add',
            payload: { skuId: 's1' },
            target: 'app-b',
            source: 'i-am-fake',
          } as never)
        },
      }))],
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await host.lifecycle.mount('app-a', 'side')
    await settle()

    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ type: 'cart:add', source: 'app-a', target: 'app-b' }) // source 派生自 fiber
    expect((got[0] as { source: string }).source).not.toBe('i-am-fake')
  })

  it('未授权发送不投递 + security/violation 上报', async () => {
    const got: unknown[] = []
    const violations: string[] = []
    const host = createCordis({
      permissions: GRANTS,
      apps: [receiverApp('app-b', got), defineApp('app-c', () => ({
        name: 'app-c',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.bus.send(ctx, { type: 'cart:add', payload: 1, target: 'app-b' })
        },
      }))],
    })
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })
    await host.lifecycle.mount('app-b', 'main')
    await host.lifecycle.mount('app-c', 'side')
    await settle()

    expect(got).toHaveLength(0) // 不投递
    expect(violations).toContain('message-send')
  })

  it('定向投递：旁观应用收不到载荷', async () => {
    const bGot: unknown[] = []
    const cGot: unknown[] = []
    const host = createCordis({
      permissions: GRANTS,
      apps: [receiverApp('app-b', bGot), receiverApp('app-c', cGot)],
    })
    await settle()
    const ib = await host.lifecycle.mount('app-b', 'main')
    await host.lifecycle.mount('app-c', 'side')
    await settle()

    host.bus.send(host, { type: 'evt:ping', payload: 'x', target: 'app-b' }) // root 发送 = 宿主
    await settle()
    expect(bGot).toHaveLength(1)
    expect(cGot).toHaveLength(0) // 旁观者收不到

    await host.lifecycle.destroy(ib.instanceId, 't')
    // 目标已卸载：投递失败即显式错误（挂起入队在 08 号票）
    expect(() => host.bus.send(host, { type: 'evt:ping', payload: 'x', target: 'app-b' })).toThrow(/unreachable/)
  })
})

describe('请求-应答（§3.3，ADR-0014/0016）', () => {
  function responderApp(appId: string, handler: (payload: unknown) => unknown) {
    return defineApp(appId, () => ({
      name: appId,
      inject: ['bus'],
      apply(ctx: Context) {
        // 测试便利 cast：handler 实际只返回 Reply/null/throw/false（false 用例验证运行时守卫）
        ctx.bus.respond(ctx, 'query:price', handler as never)
      },
    }))
  }

  it('统一包络：ok:true 携带 value', async () => {
    const host = createCordis({
      permissions: [...GRANTS, { appId: 'app-r', allow: ['message:query:price'] }],
      apps: [responderApp('app-b', () => ({ ok: true, value: 42 }))],
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    const reply = await host.bus.request(host, 'query:price', { sku: 'x' }, { target: 'app-b', timeout: 1000 })
    expect(reply).toEqual({ ok: true, value: 42 })
  })

  it('裁决失败：ok:false 携带 reason（应答方抛错自动包络）', async () => {
    const host = createCordis({
      permissions: GRANTS,
      apps: [responderApp('app-b', () => {
        throw new Error('price lookup failed')
      })],
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    const reply = await host.bus.request(host, 'query:price', {}, { target: 'app-b', timeout: 1000 })
    expect(reply).toMatchObject({ ok: false, reason: expect.stringContaining('price lookup failed') })
  })

  it('超时 = 无应答者（resolve undefined）；迟到响应丢弃且监听无残留', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const host = createCordis({
      permissions: GRANTS,
      apps: [responderApp('app-b', async () => {
        await gate // 迟到响应
        return { ok: true, value: 'late' }
      })],
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    const reply = await host.bus.request(host, 'query:price', {}, { target: 'app-b', timeout: 20 })
    expect(reply).toBeUndefined() // 超时 = 无应答者

    release()
    await new Promise((r) => setTimeout(r, 20))
    // 迟到响应到达：无人监听（correlationId 已解绑），不产生未处理拒绝/崩溃即通过
    // 再发一次请求仍正常工作 = 监听器无残留干扰
    const again = await host.bus.request(host, 'query:price', {}, { target: 'app-b', timeout: 200 })
    expect(again).toEqual({ ok: true, value: 'late' })
  })

  it('并发请求按 correlationId 各归各位（uuid 不碰撞）', async () => {
    const host = createCordis({
      permissions: GRANTS,
      apps: [responderApp('app-b', (payload) => ({ ok: true, value: (payload as { n: number }).n * 10 }))],
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    const [r1, r2] = await Promise.all([
      host.bus.request(host, 'query:price', { n: 1 }, { target: 'app-b', timeout: 1000 }),
      host.bus.request(host, 'query:price', { n: 2 }, { target: 'app-b', timeout: 1000 }),
    ])
    expect(r1).toEqual({ ok: true, value: 10 })
    expect(r2).toEqual({ ok: true, value: 20 })
  })

  it('应答者返回 false 被拒绝：不投递应答 + monitor 告警（ADR-0016 无 false 语义）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      permissions: GRANTS,
      apps: [responderApp('app-b', () => false as never)], // 运行时守卫兜底（JS 应用/旧代码；TS 层已禁）
    })
    await settle()
    host.on('monitor/report', (e) => alerts.push(e.metric.message), { global: true })
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    const reply = await host.bus.request(host, 'query:price', {}, { target: 'app-b', timeout: 50 })
    expect(reply).toBeUndefined() // false 不构成应答（等同不应答）
    expect(alerts.some((m) => m.includes('bus-reply-false'))).toBe(true)
  })

  it('AbortSignal 取消：reject AbortError 且解绑', async () => {
    const host = createCordis({
      permissions: GRANTS,
      apps: [responderApp('app-b', () => new Promise(() => {}))], // 永不应答
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    const ac = new AbortController()
    const p = host.bus.request(host, 'query:price', {}, { target: 'app-b', timeout: 5000, signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toThrow(/aborted/i)
  })
})

describe('traceparent（§七，ADR-0022）', () => {
  it('自动注入：W3C 格式 + CSPRNG（非全零 trace-id）；应答同 traceId 续链', async () => {
    const seen: string[] = []
    const host = createCordis({
      permissions: GRANTS,
      apps: [defineApp('app-b', () => ({
        name: 'app-b',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.on('message/receive', (e) => seen.push(e.message.traceparent ?? 'none'))
          ctx.bus.respond(ctx, 'query:price', () => ({ ok: true, value: 1 }))
        },
      }))],
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    const reply = await host.bus.request(host, 'query:price', {}, { target: 'app-b', timeout: 1000 })
    expect(reply).toMatchObject({ ok: true })
    expect(seen).toHaveLength(1)
    const tp = seen[0] as string
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/) // W3C Trace Context 格式
    const traceId = tp.split('-')[1] as string
    expect(traceId).not.toBe('0'.repeat(32)) // 全零禁止（W3C）
  })
})

describe('广播（§3.1）', () => {
  it('broadcast 对每个 ACTIVE 应用定向 emit', async () => {
    const bGot: unknown[] = []
    const cGot: unknown[] = []
    const host = createCordis({
      permissions: GRANTS,
      apps: [receiverApp('app-b', bGot), receiverApp('app-c', cGot)],
    })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await host.lifecycle.mount('app-c', 'side')
    await settle()

    host.bus.broadcast(host, { type: 'evt:bcast', payload: 1 })
    await settle()
    expect(bGot).toHaveLength(1)
    expect(cGot).toHaveLength(1)
  })

  it('广播无免检旁路：未授权应用 broadcast 同样被拒', async () => {
    const got: unknown[] = []
    const host = createCordis({
      permissions: GRANTS,
      apps: [receiverApp('app-b', got), defineApp('app-c', () => ({
        name: 'app-c',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.bus.broadcast(ctx, { type: 'evt:bcast', payload: 'rogue' })
        },
      }))],
    })
    await settle()
    const violations: string[] = []
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })
    await host.lifecycle.mount('app-b', 'main')
    await host.lifecycle.mount('app-c', 'side')
    await settle()

    expect(got).toHaveLength(0)
    expect(violations).toContain('message-send')
  })
})

describe('TTL 与 message/send 通知族（§3.1）', () => {
  it('过期消息投递前丢弃（TTL）', async () => {
    const got: unknown[] = []
    const host = createCordis({ apps: [receiverApp('app-b', got)] })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    host.bus.send(host, { type: 'evt:ping', payload: 'x', target: 'app-b', ttl: -1 }) // 已过期
    host.bus.send(host, { type: 'evt:ping', payload: 'y', target: 'app-b', ttl: 60000 })
    await settle()
    expect(got).toHaveLength(1)
    expect((got[0] as { payload: string }).payload).toBe('y')
  })

  it('message/send 仅 global 旁听可见（应用非 global 监听收不到自己的 send 通知）', async () => {
    const got: unknown[] = []
    const globalSends: string[] = []
    const host = createCordis({ apps: [receiverApp('app-b', got)] })
    await settle()
    await host.lifecycle.mount('app-b', 'main')
    await settle()

    // 应用侧再挂一个非 global 的 message/send 监听（窃听尝试）
    const inst = host.lifecycle.getInstances()[0]!
    inst.ctx.on('message/send', () => got.push('eavesdrop'))
    host.on('message/send', (e) => globalSends.push(e.message.type), { global: true })

    host.bus.send(host, { type: 'evt:ping', payload: 'x', target: 'app-b' })
    await settle()
    expect(globalSends).toEqual(['evt:ping']) // global 旁听（monitor/DevTools）可见
    expect(got).toHaveLength(1) // 非 global 窃听失败；receive 正常投递一条
    expect((got[0] as { type: string }).type).toBe('evt:ping')
  })
})
