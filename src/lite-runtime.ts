/**
 * iframe 精简运行时（heterogeneous §十一，ADR-0043/0049）：Lite Runtime。
 *
 * - **本地管理 fiber/effect 子集**（effect 记账随 dispose 全回收——iframe 卸载
 *   即效应消亡），**不跑服务、不跑调度管线**
 * - **代理 ctx 桥接**：ctx.bus.send / ctx.state.set / ctx.monitor.capture 等
 *   服务调用序列化后经 transport 转发主框架执行、结果回传（跨边界全异步——
 *   诚实语义）
 * - **不复制能力面**：scopedFetch/挂起注册表/样式拦截不在 iframe 重建
 * - transport 抽象（post/onMessage）：真实环境为 frame 内 window.postMessage
 *   （srcdoc 打包为构建步骤）；本模块环境无关、可独立验证
 * - heartbeat 应答：主框架侧 IframeBridge 周期 ping（service 'heartbeat'），
 *   本运行时应答——双向活性证据；失联由主框架侧清理（js-sandbox §五）
 */
import type { Envelope } from './services/sandbox'

/** 传输抽象（真实环境 = frame 内 window.postMessage ↔ message 事件） */
export interface LiteTransport {
  post(envelope: unknown): void
  onMessage(handler: (envelope: Envelope) => void): () => void
}

/** 代理 ctx（§十一：能力调用异步化——全部返回 Promise/void，无同步跨界面） */
export interface LiteCtx {
  bus: { send: (...args: unknown[]) => Promise<unknown>; request: (...args: unknown[]) => Promise<unknown> }
  state: { set: (...args: unknown[]) => Promise<unknown>; get: (...args: unknown[]) => Promise<unknown> }
  monitor: { capture: (...args: unknown[]) => Promise<unknown> }
}

export interface LiteRuntime {
  /** 握手就绪信封（主框架 handshake 的对端） */
  ready(): void
  /** 代理 ctx（应用执行环境内的服务面） */
  ctx: LiteCtx
  /** 本地 effect 记账（fiber 子集：dispose 全回收） */
  effect(fn: () => (() => void) | void): () => void
  /** 全量回收（frame 卸载语义） */
  dispose(): void
}

/**
 * 建 Lite Runtime：nonce 为主框架 handshake 会话 nonce（信封防伪造/防重放）。
 */
export function createLiteRuntime(options: {
  appId: string
  nonce: string
  transport: LiteTransport
}): LiteRuntime {
  const { appId, nonce, transport } = options
  let seq = 0
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const disposers: Array<() => void> = []
  let disposed = false

  const off = transport.onMessage((env) => {
    if (disposed || env.v !== 1 || env.appId !== appId || env.nonce !== nonce) return
    if (env.kind === 'result' && typeof env.id === 'number') {
      const p = pending.get(env.id)
      if (!p) return
      pending.delete(env.id)
      if (env.error) p.reject(new Error(env.error))
      else p.resolve(env.result)
      return
    }
    if (env.kind === 'call' && env.call?.service === 'heartbeat') {
      // 活性应答（主框架 IframeBridge 周期 ping 的对端）
      transport.post({ v: 1, appId, nonce, id: env.id, kind: 'result', result: 'pong' } satisfies Envelope)
    }
  })

  const call = (service: string, method: string, args: unknown[]): Promise<unknown> => {
    if (disposed) return Promise.reject(new Error('lite runtime: disposed'))
    const id = ++seq
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      transport.post({ v: 1, appId, nonce, id, kind: 'call', call: { service, method, args } } satisfies Envelope)
    })
  }

  const proxyService = (service: string) =>
    new Proxy({} as Record<string, (...args: unknown[]) => Promise<unknown>>, {
      get: (_t, method) => {
        if (typeof method !== 'string') throw new Error(`lite runtime: invalid method ${String(method)}`)
        return (...args: unknown[]) => call(service, method, args)
      },
    })

  return {
    ready: () => {
      transport.post({ v: 1, appId, nonce, id: 0, kind: 'ready' } satisfies Envelope)
    },
    ctx: {
      bus: proxyService('bus') as LiteCtx['bus'],
      state: proxyService('state') as LiteCtx['state'],
      monitor: proxyService('monitor') as LiteCtx['monitor'],
    },
    effect: (fn) => {
      const dispose = fn()
      if (typeof dispose === 'function') {
        disposers.push(dispose)
        return () => {
          const idx = disposers.indexOf(dispose)
          if (idx >= 0) {
            dispose()
            disposers.splice(idx, 1)
          }
        }
      }
      return () => {} // 无清理器：注册即完（fiber effect 语义）
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      off()
      // 逆序全回收（fiber effect 语义）
      for (const d of disposers.reverse()) d()
      disposers.length = 0
      for (const p of pending.values()) p.reject(new Error('lite runtime: disposed'))
      pending.clear()
    },
  }
}
