/**
 * 沙箱服务（js-sandbox §二 / heterogeneous §十一）。
 *
 * - 每应用实例化、不池化（§4.4）
 * - 创建动作挂 fiber effect 由 lifecycle 在挂载事务内接线（§4.1，03 号票）；
 *   本票提供 createSandbox/createIframeSandbox 工厂与 destroy 幂等原语
 * - iframe 沙箱（third-party 安全边界，P1 范围，ADR-0049）：C4 wiring 第 2 票
 *   已将 IframeBridge + createIframeSandbox 工厂从原 src/iframe-sandbox.ts 迁入本服务；
 *   依赖方向回归 ADR-0011，消解原 iframe-sandbox.ts 的 as unknown 透穿 ctx。
 *
 * **硬硬化已迁出** `services/harden.ts`（C2 wiring）：
 * 5 类 escape vector 注册 + 受控构造器固化于独立模块；本服务仅 import 与消费。
 */
import { Service, type Context } from 'cordis'
import '../events'
import { createSandbox, type Sandbox, type SandboxOptions } from '../sandbox'
import { createProbeApp } from '../probe'

/**
 * 桥信封（communication-protocol §八 信封校验/nonce 防重放的最小面）
 * — C4 第 2 票迁移：原 src/iframe-sandbox.ts → 本服务
 */
export interface Envelope {
  v: 1
  appId: string
  nonce: string
  id: number
  kind: 'ready' | 'call' | 'result'
  call?: { service: string; method: string; args: unknown[] }
  result?: unknown
  error?: string
}

/**
 * IframeBridge 选项（C4 第 2 票迁移）
 * — origin 白名单 + 能力调用超时；handshake 与心跳周期由 IframeSandboxOptions 承载
 */
export interface IframeBridgeOptions {
  /** 入站 origin 白名单（缺省 ['null']：sandbox 无同源时 origin 恒为 "null"） */
  originAllowlist?: string[]
  /** 能力调用超时 ms（默认 10000；frame 无响应不无限滞留） */
  callTimeoutMs?: number
}

/**
 * IframeSandbox 选项（C4 第 2 票迁移，原 src/iframe-sandbox.ts）
 * —— 完整入参仍由本服务公共面持有（保持源公共 API 兼容）。
 */
export interface IframeSandboxOptions extends SandboxOptions {
  /** iframe 级 CSP（§五） */
  csp?: string
  /** 入站 origin 白名单（缺省 ['null']） */
  originAllowlist?: string[]
  /** handshake 超时 ms（默认 3000；测试注小值） */
  handshakeTimeoutMs?: number
  /** 能力调用超时 ms（默认 10000） */
  callTimeoutMs?: number
  /** 心跳周期 ms（§十一 崩溃感知；默认 5000） */
  heartbeatMs?: number
  /** 入口文档（缺省最小空文档；生产为受控 srcdoc 或跨源 URL） */
  srcdoc?: string
  /** 桥就位回调（handshake 前）：宿主接桥把 ctx 能力面（bus/state/monitor）代理进 iframe（§十一）；测试亦可模拟对端 */
  onBridge?: (bridge: IframeBridge) => void
}

/**
 * postMessage 桥：能力调用序列化转发 + 结果回传（id 配对，全异步）。
 * 入站信封校验：origin 白名单 + **source 判等** + appId + nonce + 信封形状，
 * 任一不符丢弃（防伪造/重放/串扰）。
 */
export class IframeBridge {
  private nonce = crypto.randomUUID()
  private seq = 0
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private allowOrigins: Set<string>
  private disposed = false
  private readonly callTimeoutMs: number
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatMissed = 0

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

  /** 入站校验（§十一/§八）：origin 白名单 + source 判等（'null' 源下所有 opaque frame
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
  call<T = unknown>(service: string, method: string, args: unknown[], callOptions: { timeoutMs?: number } = {}): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('iframe bridge: disposed'))
    const id = ++this.seq
    const env: Envelope = { v: 1, appId: this.appId, nonce: this.nonce, id, kind: 'call', call: { service, method, args } }
    return new Promise<T>((resolve, reject) => {
      // 调用级超时（默认 10s）：frame 死亡/无响应不无限滞留 pending（fail-closed 清理）
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`iframe bridge: call ${service}.${method} timeout`))
      }, callOptions.timeoutMs ?? this.callTimeoutMs)
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

  /** 心跳（§十一：崩溃由主框架 heartbeat 超时感知）：连续 2 次未应答 = 失联 onCrash */
  startHeartbeat(periodMs: number, onCrash: () => void): void {
    if (this.heartbeatTimer) return
    this.heartbeatTimer = setInterval(() => {
      void this.call('heartbeat', 'ping', [], { timeoutMs: periodMs })
        .then(() => {
          this.heartbeatMissed = 0
        })
        .catch(() => {
          this.heartbeatMissed += 1
          if (this.heartbeatMissed >= 2) {
            this.stopHeartbeat()
            onCrash()
          }
        })
    }, periodMs)
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** handshake 完成判定：入站合法 ready 信封即本会话 */
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
    this.stopHeartbeat()
    window.removeEventListener('message', this.onMessage)
    for (const p of this.pending.values()) p.reject(new Error('iframe bridge: disposed'))
    this.pending.clear()
  }
}

/**
 * IframeSandbox 工厂（C4 第 2 票迁移；保留 createIframeSandbox 函数式导出以兼容现有测试/调用方）：
 * - frame 属性（sandbox 无 allow-same-origin）就位 → load → handshake → 桥建立
 * - heartbeat lost：ctx 公共面 emit violation + 触发 onDestroy（依赖方向回归 ADR-0011）
 *
 * 该工厂仍导出为独立函数（不绑 SandboxService 内部）以保留 **公共 API 形态**：
 * 已有的 `import { createIframeSandbox } from '<pkg>'` 调用方不需要重写。
 * SandboxService.createIframeSandbox 只是它的轻包装。
 */
export async function createIframeSandbox(
  ctx: Context,
  appId: string,
  options: IframeSandboxOptions = {},
): Promise<Sandbox> {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups')
  frame.setAttribute('referrerpolicy', 'no-referrer')
  if (options.csp) frame.setAttribute('csp', options.csp)
  frame.style.display = 'none'
  frame.srcdoc = options.srcdoc ?? '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'

  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })
  document.body.appendChild(frame)
  await loaded

  const bridge = new IframeBridge(frame, appId, {
    originAllowlist: options.originAllowlist,
    callTimeoutMs: options.callTimeoutMs,
  })
  options.onBridge?.(bridge)
  try {
    await bridge.handshake(options.handshakeTimeoutMs ?? 3000)
  } catch (error) {
    bridge.dispose()
    frame.remove()
    ctx.emit('security/violation', { appId, rule: 'iframe-handshake-timeout', detail: { appId } })
    throw error
  }

  const sandbox: Sandbox = {
    get proxy(): Record<PropertyKey, unknown> {
      throw new Error('iframe sandbox: no shared proxy; use bus bridge')
    },
    injectSlot: {}, // 不注入 iframe（不复制能力面，§十一）
    injectedNodes: () => [], // 不可跨界面记账
    modifiedKeys: () => [],
    closedSockets: () => [], // iframe 自治，不消费主框架 SuspendScope
    reconnectSocket: () => undefined,
    destroy: async () => {
      bridge.dispose()
      frame.remove()
      options.onDestroy?.()
    },
  }
  // heartbeat：失联即桥解绑 + frame 回收 + 审计 + onDestroy 回调
  // C4 wiring：依赖方向走 ctx 公共面（emit）—— 服务内部对 monitor/lifecycle 的消费已迁移至 services/sandbox
  const heartbeatMs = options.heartbeatMs ?? 5000
  bridge.startHeartbeat(heartbeatMs, () => {
    bridge.dispose()
    frame.remove()
    ctx.emit('security/violation', { appId, rule: 'iframe-heartbeat-lost', detail: { appId } })
    options.onDestroy?.()
    void Promise.resolve()
  })
  return sandbox
}

/**
 * 沙箱服务（C4 第 2 票：作为 iframe 工厂与公共 seam 的统一入口）。
 *
 * - first-party 工厂：转发到 src/sandbox.ts 的 createSandbox（污染隔离与效应回收层）
 * - third-party 工厂：转发到本文件内嵌的 createIframeSandbox（真正安全边界）
 *
 * 双向调用方保留函数式导出（便于 import 测试与宿主脚本），服务仅作 thin alias。
 * C4 决策 Q6：依赖方向收敛，但 public re-export 形态不变 —— 不破坏既有 iframe-sandbox
 * 用户（测试 / 第三方 sandbox adapter 等）的 import 路径。
 */
export class SandboxService extends Service<Record<never, never>> {
  static provide = 'sandbox'
  static inject = ['security', 'monitor']

  constructor(ctx: Context, _config: Record<never, never> = {}) {
    super(ctx, 'sandbox')
  }

  /** first-party 沙箱工厂（js-sandbox §二）：不池化 */
  create(appId: string, options: SandboxOptions & { trust?: 'first-party' | 'third-party' } & Partial<IframeSandboxOptions> = {}): Promise<Sandbox> {
    if (options.trust === 'third-party') {
      return this.createIframeSandbox(appId, options)
    }
    // 网络面 URL 裁决默认接线（js-sandbox §3.6，security §六 覆盖面）：
    // XHR/EventSource/WebSocket 与 fetch 共用 `net:fetch:{origin}` 授权面。
    // 调用方显式提供 adjudicateNetworkUrl 则优先（测试/宿主自定义策略）。
    const adjudicateNetworkUrl =
      options.adjudicateNetworkUrl ??
      ((url: string, api: 'xhr' | 'eventsource' | 'websocket') =>
        this.ctx.security.checkNetUrl(appId, url, api === 'websocket')) // ws/wss: 豁免 https-only 协议门
    return createSandbox(this.ctx, appId, { ...options, adjudicateNetworkUrl })
  }

  /** iframe 沙箱工厂（C4 双方法独立签名，Q3 决策：保留双方法不合并 mode 开关） */
  createIframeSandbox(appId: string, options: Partial<IframeSandboxOptions> = {}): Promise<Sandbox> {
    return createIframeSandbox(this.ctx, appId, options as IframeSandboxOptions)
  }
}

declare module 'cordis' {
  interface Context {
    sandbox: SandboxService
  }
}
