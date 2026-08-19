/**
 * 统一事件契约（基线 §2.4 的机器可读源）。
 *
 * 载荷一律单对象；声明形式 = 监听器函数签名（cordis v4 Events 契约）。
 * 通知族（app/*、state/*、message/*、monitor/*、outlet/*）fire-and-forget。
 * 调度结果契约按事件族划分见基线 §2.4.1（守卫枚举 / serial+包络 / 单点方法 / 通知）。
 */
import type { FiberState } from 'cordis'

export interface RouteLocation {
  path: string
  query: Record<string, string>
}

export interface MatchedApp {
  appId: string
  outlet: string
}

export interface CordisMessage {
  id: string
  type: string
  source: string
  target: string
  payload: unknown
  traceparent?: string
}

/** 错误采集阶段（与 app/error 的 phase 枚举一致，基线 §2.4） */
export type AppPhase = 'load' | 'activate' | 'runtime'

export interface ErrorMetric {
  kind: 'error'
  message: string
  stack?: string
  appId?: string
  phase: AppPhase
}

/** Metric 判别联合：kind 区分变体，形状可机器校验（基线 §2.4 monitor/report 单对象） */
export type Metric = ErrorMetric

export interface Alert {
  level: 'info' | 'warning' | 'error'
  message: string
  appId?: string
}

/** Fiber 六态的运行时名字表（const enum 不支持反向映射，经数组索引取名） */
export const FiberStateNames = [
  'PENDING',
  'LOADING',
  'ACTIVE',
  'FAILED',
  'DISPOSED',
  'UNLOADING',
] as const

export type FiberStateName = (typeof FiberStateNames)[number]

/** fiber 状态名查值（供测试断言用） */
export function fiberStateName(state: FiberState): FiberStateName {
  return FiberStateNames[state] as FiberStateName
}

/** 槽位事件载荷（`outlet/changed:{outlet}` 族，ADR-0047/0050） */
export interface OutletChangedPayload {
  outlet: string
  matched: MatchedApp | null
}

/** 守卫结果：显式枚举（ADR-0002）--绝不用真值判断；undefined = 不表态 */
export type GuardResult =
  | { type: 'proceed' } // 明确放行（serial 截断后续守卫）
  | { type: 'redirect'; to: string } // 拦截并重定向
  | { type: 'abort' } // 拦截且中止
  | undefined

declare module 'cordis' {
  interface Events {
    // 生命周期（由 lifecycle 服务派发；旁听用 { global: true } 在根注册）
    'app/loading'(payload: { appId: string; instanceId: string; signal: AbortSignal }): void
    'app/loaded'(payload: { appId: string; instanceId: string }): void
    'app/ready'(payload: { appId: string; instanceId: string }): void
    'app/error'(payload: { appId: string; instanceId: string; phase: 'load' | 'activate' | 'runtime'; error: Error; recoverable: boolean }): void
    'app/suspend'(payload: { instanceId: string; reason: 'keepalive' | 'navigation' | 'system' }): void
    'app/resume'(payload: { instanceId: string }): void
    'app/evicted'(payload: { appId: string; instanceId: string }): void
    'app/disposed'(payload: { appId: string; instanceId: string }): void
    // 路由
    // 路由。router/navigate 是 serial 守卫管线（ADR-0002）：监听器返回 GuardResult
    // 显式枚举（{proceed|redirect|abort} 或 undefined 不表态）；经 serial 链式裁决
    'router/navigate'(payload: { from: RouteLocation; to: RouteLocation; outlet: string; signal: AbortSignal }): GuardResult | Promise<GuardResult>
    'router/aborted'(payload: { outlet: string; reason: 'guard' | 'superseded' | 'unmount' }): void
    'router/changed'(payload: { location: RouteLocation; outlets: Record<string, MatchedApp | null> }): void
    // 通信
    'message/send'(payload: { message: CordisMessage }): void
    'message/receive'(payload: { message: CordisMessage }): void
    'bus/overflow'(payload: { instanceId: string; coalescedKeys: string[]; droppedCount: number }): void
    // 状态
    'state/changed'(payload: { key: string; value: unknown; old: unknown; path: string; source: string; version: number }): void
    'state/sync'(payload: { instanceId: string; keys: Record<string, { value: unknown; version: number }> }): void
    // 监控（monitor 服务派发；旁听需 { global: true }）
    'monitor/report'(payload: { metric: Metric }): void
    'monitor/alert'(payload: { alert: Alert }): void
    // 安全
    'security/violation'(payload: { appId: string; rule: string; detail: unknown }): void
    // 槽位事件族（ADR-0047/0050，模板字面量键）：router 以每槽位具体键派发；
    // 载荷形状 `{ outlet, matched }`（基线 §2.4）；emit 侧以 'outlet/changed:main'
    // 形式落键（interface 不支持计算模板键，实现侧窄化见 router 服务）
    'outlet/changed:main'(payload: OutletChangedPayload): void
  }
}

// 槽位事件族 `outlet/changed:{outlet}` 是模板字面量键（ADR-0047/0050），
// interface 合并不支持模板字面量计算键--05 号票落地 router 时以每个槽位的
// 具体键注册；12 号票机器验证时以本注释所指的基线 §2.4 为源核对形状
// `{ outlet: string; matched: MatchedApp | null }`。
