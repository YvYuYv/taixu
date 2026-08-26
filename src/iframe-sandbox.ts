/**
 * IframeSandbox（js-sandbox §五 / heterogeneous §十一，P1）：第三方不可信应用的
 * 真正安全边界。
 *
 * - frame 属性：`sandbox="allow-scripts allow-forms allow-popups"`——**无
 *   allow-same-origin**（旧版 +allow-same-origin 组合可移除自身 sandbox 属性逃逸）；
 *   referrerpolicy no-referrer；可选 iframe 级 CSP；display:none（JS 执行环境，
 *   渲染容器由宿主决定）
 * - 不共享任何对象：proxy getter 抛错（无共享 Proxy 面——能力调用走桥）
 * - postMessage 桥（IframeBridge）：信封 {v, appId, nonce, id, kind}——origin
 *   白名单校验（sandbox 无同源时 origin 恒为 "null"）+ appId + nonce 防伪造/重放；
 *   能力调用（bus.send/state.set/monitor.capture 等）序列化转发、结果回传
 *   （跨边界全异步——诚实语义）
 * - targetOrigin 张力注记：security §十一禁 '*'，但无 allow-same-origin 的
 *   opaque-origin frame **只能**以 '*' 收件（标准无替代）；本桥发件目标是本
 *   沙箱自建 srcdoc frame（内容受控），入站侧严格校验白名单/nonce/appId
 * - 保活冻结：iframe 侧效应不可跨界面冻结（如实边界——frame 生命周期即效应
 *   生命周期，第三方应用建议 keepAlive:false）
 */
import type { Context } from 'cordis'
import type { Sandbox, SandboxOptions } from './sandbox'

/** 桥信封（communication-protocol §八 信封校验/nonce 防重放的最小面） */
interface Envelope {
  v: 1
  appId: string
  nonce: string
  id: number
  kind: 'ready' | 'call' | 'result'
  call?: { service: string; method: string; args: unknown[] }
  result?: unknown
  error?: string
}

export interface IframeBridgeOptions {
  /** 入站 origin 白名单（缺省 ['null']：sandbox 无同源时 origin 恒为 "null"） */
  originAllowlist?: string[]
  /** 能力调用超时 ms（默认 10000；frame 无响应不无限滞留） */
  callTimeoutMs?: number
}

/** postMessage 桥：能力调用序列化转发 + 结果回传（id 配对，全异步） */
export class IframeBridge {
  private nonce = crypto.randomUUID() // 会话 nonce：信封防伪造/防重放
  private seq = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private allowOrigins: Set<string>
  private disposed = false

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly appId: string,
    options: IframeBridgeOptions = {},
  ) {
    this.allowOrigins = new Set(options.originAllowlist ?? ['null'])
    this.callTimeoutMs = options.callTimeoutMs ?? 10_000
    window.addEventListener('message', this.onMessage)
  }

  /** 会话 nonce 观测面（nonce 随出站信封对 frame 本就可读——宿主/测试侧模拟对端用） */
  get sessionNonce(): string {
    return this.nonce
  }

  /** 入站校验（§十一/§八）：origin 白名单 + **source 判等**（'null' 源下所有 opaque frame
   * 同源——source 才是帧身份的权威判据）+ appId + nonce + 信封形状（任一不符丢弃） */
  private isValidEnvelope(e: MessageEvent, kind: 'ready' | 'result'): boolean {
    if (e.source !== this.frame.contentWindow) return false
    if (!this.allowOrigins.has(e.origin)) return false
    const env = e.data as Partial<Envelope> | null
    return env?.v === 1 && env.appId === this.appId && env.nonce === this.nonce && env.kind === kind
  }

  private onMessage = (e: MessageEvent): void => {
    if (this.disposed) return
    if (!this.isValidEnvelope(e, 'result')) return
    const env = e.data as Envelope
    if (typeof env.id === 'number') {
      const p = this.pending.get(env.id)
      if (!p) return
      this.pending.delete(env.id)
      if (env.error) p.reject(new Error(env.error))
      else p.resolve(env.result)
    }
  }

  /** 能力调用转发（§十一：ctx.bus.send / ctx.state.set / ctx.monitor.capture 等异步化） */
  call<T = unknown>(service: string, method: string, args: unknown[]): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('iframe bridge: disposed'))
    const id = ++this.seq
    const env: Envelope = { v: 1, appId: this.appId, nonce: this.nonce, id, kind: 'call', call: { service, method, args } }
    return new Promise<T>((resolve, reject) => {
      // 调用级超时（默认 10s）：frame 死亡/无响应不无限滞留 pending（fail-closed 清理）
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`iframe bridge: call ${service}.${method} timeout`))
      }, this.callTimeoutMs)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          ;(resolve as (v: unknown) => void)(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })
      // opaque-origin frame 只能以 '*' 收件（标准无替代；发件目标为自建受控 frame）
      this.frame.contentWindow?.postMessage(env, '*')
    })
  }

  private readonly callTimeoutMs: number

  /** handshake 完成判定：入站合法 ready 信封即本会话（供 sandbox.init 消费） */
  async handshake(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('iframe bridge: handshake timeout'))
      }, timeoutMs)
      const onEarly = (e: MessageEvent): void => {
        if (!this.isValidEnvelope(e, 'ready')) return
        cleanup()
        resolve()
      }
      const cleanup = () => {
        clearTimeout(timer)
        window.removeEventListener('message', onEarly)
      }
      window.addEventListener('message', onEarly)
    })
  }

  dispose(): void {
    this.disposed = true
    window.removeEventListener('message', this.onMessage)
    for (const p of this.pending.values()) p.reject(new Error('iframe bridge: disposed'))
    this.pending.clear()
  }
}

export interface IframeSandboxOptions extends SandboxOptions {
  /** iframe 级 CSP（§五） */
  csp?: string
  /** 入站 origin 白名单（缺省 ['null']） */
  originAllowlist?: string[]
  /** handshake 超时 ms（默认 3000；测试注小值） */
  handshakeTimeoutMs?: number
  /** 能力调用超时 ms（默认 10000） */
  callTimeoutMs?: number
  /** 入口文档（缺省最小空文档；生产为受控 srcdoc 或跨源 URL） */
  srcdoc?: string
  /** 桥就位回调（handshake 前）：宿主接桥把 ctx 能力面（bus/state/monitor）代理进 iframe（§十一）；测试亦可模拟对端 */
  onBridge?: (bridge: IframeBridge) => void
}

/**
 * IframeSandbox 工厂：frame 属性就位 -> load -> handshake -> 桥建立。
 * Sandbox 面实现：proxy 抛错（不共享对象）；记账面为空（不可跨界面观察——如实）；
 * freeze/unfreeze 空实现（iframe 效应不可冻结，建议第三方 keepAlive:false）。
 */
export async function createIframeSandbox(
  ctx: Context,
  appId: string,
  options: IframeSandboxOptions = {},
): Promise<Sandbox> {
  const frame = document.createElement('iframe')
  // 关键：无 allow-same-origin（+allow-same-origin 组合可移除自身 sandbox 逃逸，§五）
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups')
  frame.setAttribute('referrerpolicy', 'no-referrer')
  if (options.csp) frame.setAttribute('csp', options.csp)
  frame.style.display = 'none' // JS 执行环境；渲染容器由宿主决定
  frame.srcdoc = options.srcdoc ?? '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'

  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })
  document.body.appendChild(frame)
  await loaded // load 后再建桥（旧版 appendChild 后立刻取 contentDocument 有竞态）

  const bridge = new IframeBridge(frame, appId, {
    originAllowlist: options.originAllowlist,
    callTimeoutMs: options.callTimeoutMs,
  })
  options.onBridge?.(bridge) // 桥就位即交宿主（能力代理/对端模拟都在 handshake 窗口内可用）
  try {
    await bridge.handshake(options.handshakeTimeoutMs ?? 3000)
  } catch (error) {
    bridge.dispose()
    frame.remove()
    ctx.emit('security/violation', { appId, rule: 'iframe-handshake-timeout', detail: { appId } })
    throw error
  }

  const sandbox: Sandbox = {
    // 不共享任何对象（§五）：能力调用经桥（bridge 随闭包暴露给宿主侧桥接层）
    get proxy(): Record<PropertyKey, unknown> {
      throw new Error('iframe sandbox: no shared proxy; use bus bridge')
    },
    injectSlot: {}, // scopedFetch 不注入 iframe（不复制能力面，§十一）
    injectedNodes: () => [], // iframe 内注入不可跨界面记账（如实：效应随 frame 生命周期）
    modifiedKeys: () => [],
    freeze: () => {}, // 不可跨界面冻结（如实边界）
    unfreeze: () => {},
    closedSockets: () => [],
    destroy: async () => {
      bridge.dispose() // 桥解绑
      frame.remove()
      options.onDestroy?.()
    },
  }
  return sandbox
}
