/**
 * 主缝测试：IframeSandbox 真正安全边界（js-sandbox §五 / heterogeneous §十一，P1）。
 * frame 属性（无 allow-same-origin）；不共享对象（proxy 抛错）；postMessage 桥
 * 信封校验（origin 白名单/appId/nonce）+ 能力调用转发回传；handshake 成功/超时
 * （超时 fail-closed + violation + frame 回收）；destroy 桥解绑 + frame 移除。
 * 注：jsdom 不执行 frame 内脚本——桥入站以合成 MessageEvent 驱动（协议面真实；
 * nonce 经 sessionNonce 观测面取得——nonce 本就随出站信封对 frame 可见）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, createIframeSandbox, IframeBridge } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

describe('IframeSandbox（§五）', () => {
  it('handshake 超时 fail-closed：violation 留痕 + frame 回收不留残骸', async () => {
    const violations: string[] = []
    const host = createCordis({})
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    await expect(createIframeSandbox(host, 'tp-app', { handshakeTimeoutMs: 30 })).rejects.toThrow(/handshake timeout/)
    expect(violations).toContain('iframe-handshake-timeout')
    expect(document.querySelector('iframe')).toBeNull() // 超时路径不留 frame
  })

  it('成功握手：frame 属性就位（sandbox 无 allow-same-origin、no-referrer、display none、CSP）；proxy 抛错；destroy 移除', async () => {
    const host = createCordis({})
    await settle()

    // onBridge 拿到同会话桥：以 sessionNonce 回合成 ready 信封（模拟受控对端）
    let liveBridge: IframeBridge | null = null
    const p = createIframeSandbox(host, 'ok-app', {
      csp: "default-src 'none'",
      handshakeTimeoutMs: 2000,
      onBridge: (b) => {
        liveBridge = b
        queueMicrotask(() => {
          const f = document.querySelector('iframe') // 就地取（回调先于测试局部 frame 声明执行）
          window.dispatchEvent(
            new MessageEvent('message', { origin: 'null', source: f!.contentWindow, data: { v: 1, appId: 'ok-app', nonce: b.sessionNonce, kind: 'ready' } }),
          )
        })
      },
    })
    const sandbox = await p
    const frame = document.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups') // 无 allow-same-origin
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame.style.display).toBe('none')
    expect(frame.getAttribute('csp')).toBe("default-src 'none'")
    expect(liveBridge).toBeTruthy()

    expect(() => sandbox.proxy).toThrow(/no shared proxy/) // 不共享任何对象（§五）
    expect(sandbox.injectedNodes()).toEqual([]) // 不可跨界面记账（如实）
    expect(sandbox.modifiedKeys()).toEqual([])

    await sandbox.destroy()
    expect(document.querySelector('iframe')).toBeNull() // 桥解绑 + frame 移除
    await sandbox.destroy() // 幂等
  })

  it('bridge.handshake：合法 ready 信封（同会话 nonce + origin 白名单）放行；异源/异 nonce 丢弃', async () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const bridge = new IframeBridge(frame, 'hs-app')

    const sendReady = (nonce: string, origin = 'null') => {
      window.dispatchEvent(new MessageEvent('message', { origin, source: frame.contentWindow, data: { v: 1, appId: 'hs-app', nonce, kind: 'ready' } }))
    }

    const hs = bridge.handshake(50) // 先挂监听（同步），再投递信封
    sendReady('forged') // 错 nonce：丢弃
    sendReady(bridge.sessionNonce, 'https://evil.example.com') // 异源：丢弃
    sendReady(bridge.sessionNonce) // 合法：放行
    await hs

    bridge.dispose()
    frame.remove()
  })

  it('桥信封：call 经 contentWindow postMessage 转发；合法回信配对 resolve；伪造/异源回信丢弃', async () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const bridge = new IframeBridge(frame, 'br-app')
    const seen: unknown[] = []
    const handler = (e: MessageEvent) => {
      const env = e.data as { v?: number; appId?: string; nonce?: string; id?: number; kind?: string; call?: { service: string; method: string; args: unknown[] } }
      if (env?.v !== 1 || env.appId !== 'br-app' || env.kind !== 'call') return
      seen.push(env)
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'null',
          source: frame.contentWindow,
          data: { v: 1, appId: 'br-app', nonce: env.nonce, id: env.id, kind: 'result', result: { echoed: env.call!.args } },
        }),
      )
    }
    frame.contentWindow?.addEventListener('message', handler)

    const result = await bridge.call('bus', 'send', [{ type: 'evt:x' }])
    expect(result).toEqual({ echoed: [{ type: 'evt:x' }] }) // 合法回信配对
    expect(seen.length).toBe(1)

    frame.contentWindow?.removeEventListener('message', handler) // 应答器离场：悬挂态可观测

    // 伪造 nonce / 异源回信：丢弃（悬挂而非污染）
    const race = Promise.race([
      bridge.call('state', 'set', ['k', 1]).then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('timeout'), 30)),
    ])
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'null', source: frame.contentWindow, data: { v: 1, appId: 'br-app', nonce: 'forged', id: 2, kind: 'result', result: 'evil' } }),
    )
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://evil.example.com', source: frame.contentWindow, data: { v: 1, appId: 'br-app', nonce: 'x', id: 2, kind: 'result', result: 'evil' } }),
    )
    expect(await race).toBe('timeout')

    bridge.dispose()
    await expect(bridge.call('bus', 'send', [])).rejects.toThrow(/disposed/) // dispose 后拒绝
    frame.remove()
  })
})
