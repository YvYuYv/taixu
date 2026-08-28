/**
 * Bus 网络拦截链（security §6.2 NetworkGateway 挂 bus 链 / communication §六）：
 *
 * runNetwork 链执行逻辑（中间件循环 + tracing span 包裹 + monitor 计时）从 bus.ts
 * 抽离——与 scopedFetch 已独立（C5-C）的下层自然分离面。
 *
 * **C15-A 抽离动机**：C5-C scopedFetch 已独立为纯模块，bus 内部仍承载 40+ 行
 * 网络链执行逻辑——中间件循环、tracing span 包裹、monitor 计时、terminal fetch
 * 调用。抽离后 bus 责任面收敛到"消息分发"本职（定向投递 / 请求-应答 / 挂起队列 /
 * DLQ / 广播），网络链是独立子系统。
 *
 * **架构边界**：bus.inject networkChain 实例（非 cordis service 形态）——
 * 无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern（C7-A leakDetector 同节奏）。
 */
import type { NetworkMiddleware } from '../bus'

/** tracing 最小面（懒取——bus 不 inject tracing，ADR-0054 依赖方向；未启用 = 无 span） */
export interface TracingLike {
  startSpan(name: string, parentTraceparent?: string): { traceparent: string; end(): number }
}

/** monitor 最小面（net_ms 计时 + net_err 计数 + capture 上报） */
export interface MonitorLike {
  count(name: string, value: number, tags?: Record<string, unknown>): void
  capture(error: unknown, meta: { appId: string; phase: string }): void
}

/** monitor capture phase 类型（与 events.ts AppPhase 对齐——networkChain 只产 'runtime'） */
const RUNTIME_PHASE = 'runtime' as const

export interface NetworkChainHandle {
  /** 中间件注册面（宿主/DevTools）：返回 disposer；随注册序执行 */
  intercept(appId: string, middleware: NetworkMiddleware): () => void
  /**
   * 链执行（§6.2 链序）：tracing span（外包裹）-> 自定义中间件（注册序）->
   * monitor net_ms 计时 -> 终端 fetch。security 裁决由调用方（scopedFetch）
   * 前置完成——拒绝路径不进链（fail-closed 第一闸）。
   *
   * C15-A：tracing 由调用方传入（懒取——bus 不 inject tracing，ADR-0054 依赖方向）。
   */
  runWithTracing(
    appId: string,
    tracing: TracingLike | null,
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    terminal: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ): Promise<Response>
  /** 清理应用拦截链（app/disposed 随应用销毁清理） */
  clear(appId: string): void
  /** 释放资源 */
  destroy(): void
}

/** 创建网络拦截链（无 cordis service 形态——轻量闭包工厂） */
export function createNetworkChain(tracing: TracingLike | null, monitor: MonitorLike): NetworkChainHandle {
  const networkMiddlewares = new Map<string, NetworkMiddleware[]>()

  return {
    intercept(appId, middleware) {
      const list = networkMiddlewares.get(appId) ?? []
      list.push(middleware)
      networkMiddlewares.set(appId, list)
      return () => {
        const l = networkMiddlewares.get(appId)
        if (!l) return
        const idx = l.indexOf(middleware)
        if (idx >= 0) l.splice(idx, 1)
      }
    },

    async runWithTracing(
      appId: string,
      tracing: TracingLike | null,
      input: RequestInfo | URL,
      init: RequestInit | undefined,
      terminal: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
    ) {
      const middlewares = [...(networkMiddlewares.get(appId) ?? [])]
      const dispatch = (i: RequestInfo | URL, ini: RequestInit | undefined, idx: number): Promise<Response> => {
        if (idx < middlewares.length) {
          const mw = middlewares[idx]!
          return mw(i, ini, (ii, ii2) => dispatch(ii, ii2, idx + 1))
        }
        return terminal(i, ini)
      }
      // tracing 内建（懒取——bus 不 inject tracing，ADR-0054 依赖方向；未启用 = 无 span）
      let spanName: string
      try {
        const url = new URL(input instanceof Request ? input.url : String(input), document.baseURI)
        spanName = `fetch:${url.host}${url.pathname}`
      } catch {
        spanName = `fetch:${String(input)}` // 不可解析目标：以原样命名（span 命名不炸链）
      }
      const span = tracing?.startSpan(spanName)
      const startedAt = Date.now()
      try {
        const res = await dispatch(input, init, 0)
        monitor.count('net_ms', Date.now() - startedAt, { appId }) // monitor 内建（成功）
        return res
      } catch (error) {
        // 失败路径不留盲区：net_err 计数 + monitor 上报（安全审计经 monitor 可见）
        monitor.count('net_err', 1, { appId })
        monitor.capture(error, { appId, phase: 'runtime' })
        throw error
      } finally {
        span?.end()
      }
    },

    clear(appId) {
      networkMiddlewares.delete(appId)
    },

    destroy() {
      networkMiddlewares.clear()
    },
  }
}
