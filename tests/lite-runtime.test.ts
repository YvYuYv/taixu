/**
 * 主缝测试：iframe 精简运行时 Lite Runtime + heartbeat 崩溃清理（heterogeneous §十一，P1）。
 * LiteRuntime：ready 握手信封、代理 ctx 能力调用（全异步经 transport 往返）、
 * heartbeat 应答、effect 记账逆序全回收；IframeBridge.startHeartbeat：连续 2 次
 * 失联 -> 桥解绑 + frame 回收 + violation + monitor 上报。
 * 注：transport 为抽象（真实环境 frame 内 postMessage）；本测试以内存管道对接
 * IframeBridge 的真实信封协议（source 判等经合成事件满足）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, IframeBridge, createLiteRuntime, type Envelope } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

/** 内存管道：bridge（主侧，真实信封经 contentWindow postMessage）<-> lite（frame 侧） */
function attachLite(frame: HTMLIFrameElement, appId: string, nonce: string) {
  const lite = createLiteRuntime({
    appId,
    nonce,
    transport: {
      // frame -> 主框架：合成 message 事件（source 判等 + origin 白名单满足）
      post: (env) => {
        window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: frame.contentWindow, data: env }))
      },
      // 主框架 -> frame：桥经 contentWindow postMessage 发出——以监听 contentWindow 收
      onMessage: (handler) => {
        const h = (e: MessageEvent) => handler(e.data as Envelope)
        frame.contentWindow?.addEventListener('message', h)
        return () => frame.contentWindow?.removeEventListener('message', h)
      },
    },
  })
  return lite
}

describe('LiteRuntime（§十一）', () => {
  it('ready 信封 + 代理 ctx 能力调用往返（全异步）+ heartbeat 应答', async () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const bridge = new IframeBridge(frame, 'lite-app')

    // 主侧执行者：lite 出站信封经 window 合成事件送达——在 window 监听执行并回信
    //（模拟主框架服务层；heartbeat 由 lite 自应答，不在此处理）
    const executed: string[] = []
    window.addEventListener('message', (e) => {
      const env = (e as MessageEvent).data as Envelope
      if (env?.kind !== 'call' || env.appId !== 'lite-app') return
      if (env.call!.service === 'heartbeat') return // lite 在 frame 侧自应答
      executed.push(`${env.call!.service}.${env.call!.method}`)
      // 主框架执行后回信发往 frame 侧（lite 监听在 contentWindow——主->frame 方向）
      frame.contentWindow?.postMessage(
        { v: 1, appId: 'lite-app', nonce: env.nonce, id: env.id, kind: 'result', result: { ok: true, args: env.call!.args } },
        '*',
      )
    })

    const lite = attachLite(frame, 'lite-app', bridge.sessionNonce)
    const hs = bridge.handshake(50) // 先挂监听（同步）
    lite.ready() // 握手信封
    await expect(hs).resolves.toBeUndefined()

    // 代理 ctx：能力调用序列化转发 + 结果回传（全异步）
    const res = await lite.ctx.state.set('local:lite-app:x', 42)
    expect(res).toEqual({ ok: true, args: ['local:lite-app:x', 42] })
    expect(executed).toEqual(['state.set'])

    // heartbeat ping/pong（主侧经桥发）
    const pong = await bridge.call('heartbeat', 'ping', [])
    expect(pong).toBe('pong')

    lite.dispose()
    bridge.dispose()
    frame.remove()
  })

  it('effect 记账：dispose 逆序全回收（fiber 子集语义）', () => {
    const order: string[] = []
    const lite = createLiteRuntime({
      appId: 'eff-app',
      nonce: 'n',
      transport: { post: () => {}, onMessage: () => () => {} },
    })
    const off1 = lite.effect(() => () => order.push('d1'))
    lite.effect(() => () => order.push('d2'))
    lite.effect(() => {}) // 无清理器
    off1() // 单独退订
    expect(order).toEqual(['d1'])
    lite.dispose() // 剩余逆序回收
    expect(order).toEqual(['d1', 'd2'])
  })
})

describe('heartbeat 崩溃清理（§十一）', () => {
  it('连续 2 次失联：violation + monitor 上报 + frame 回收 + onDestroy', async () => {
    const violations: string[] = []
    const host = createCordis({})
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    let destroyed = false
    const p = (await import('../src')).createIframeSandbox(host, 'crash-app', {
      handshakeTimeoutMs: 2000,
      heartbeatMs: 15, // 心跳周期极短（call 超时默认 10s——需注小：经 callTimeoutMs）
      callTimeoutMs: 5,
      onDestroy: () => {
        destroyed = true
      },
      onBridge: (b) => {
        // 模拟对端只完成握手、不应答心跳（崩溃语义）
        queueMicrotask(() => {
          const f = document.querySelector('iframe')
          window.dispatchEvent(
            new MessageEvent('message', { origin: 'null', source: f!.contentWindow, data: { v: 1, appId: 'crash-app', nonce: b.sessionNonce, kind: 'ready' } }),
          )
        })
      },
    })
    await p
    await new Promise((r) => setTimeout(r, 80)) // 跨过 2 个心跳周期

    expect(violations).toContain('iframe-heartbeat-lost')
    expect(destroyed).toBe(true)
    expect(document.querySelector('iframe')).toBeNull() // frame 回收
  })
})
