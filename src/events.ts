/**
 * 统一事件契约（基线 §2.4 的机器可读源）。
 *
 * 载荷一律单对象；声明形式 = 监听器函数签名（cordis v4 Events 契约）。
 * 通知族（app/*、state/*、message/*、monitor/*、outlet/*）fire-and-forget。
 * 调度结果契约按事件族划分见基线 §2.4.1（守卫枚举 / serial+包络 / 单点方法 / 通知）。
 */
import type { Context, FiberState } from 'cordis'

export interface RouteLocation {
  path: string
  query: Record<string, string>
}

export interface MatchedApp {
  appId: string
  outlet: string
}

/** 挂起来源（lifecycle §5.1.1 分级：路由 > 系统信号 > 手动命令，ADR-0018/0031） */
export type SuspendSource = 'route' | 'system' | 'command'

/** 挂起原因（app/suspend 载荷枚举，基线 §2.4） */
export type SuspendReason = 'keepalive' | 'navigation' | 'system'

export interface CordisMessage {
  id: string
  type: string
  source: string
  target: string
  /** 目标实例精确匹配（F1：同 appId 多实例定向；缺省 = 该 appId 最新实例） */
  targetInstanceId?: string
  payload: unknown
  /** 创建时间（TTL 裁决基准，bus 构建时注入） */
  createdAt: number
  /** 请求-应答关联（crypto.randomUUID；§3.3） */
  correlationId?: string
  /** 生存期 ms；过期消息投递前丢弃（含 retained，§3.1） */
  ttl?: number
  /** 同键合并元数据（状态快照类消息；挂起队列替换同键旧值，§5.5） */
  metadata?: { coalesceKey?: string }
  /** W3C Trace Context（ADR-0022；CSPRNG trace-id，bus 构建消息时自动注入） */
  traceparent?: string
}

/** 统一应答包络（ADR-0014）：三态可区分——ok 应答带值 / 裁决失败带因 / undefined 无应答者 */
export type Reply<T = unknown> = { ok: true; value: T } | { ok: false; reason: string }

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
    'app/suspend'(payload: { instanceId: string; reason: SuspendReason }): void
    'app/resume'(payload: { instanceId: string }): void
    // 恢复三通道收口（09 号票）：lifecycle 按统一时序依次派发——
    // app/resume（state/sync 在此收口，ADR-0023）-> router/replay（ADR-0056）-> bus/replay（ADR-0015）
    // 载荷不对称说明：router 按槽位（outlet）作用域重放；bus 按目标应用（instanceId 即目标）回放
    'router/replay'(payload: { instanceId: string; outlet: string }): void
    'bus/replay'(payload: { instanceId: string }): void
    'app/evicted'(payload: { appId: string; instanceId: string; cause: 'lru' | 'pressure' | 'ttl' }): void
    'app/disposed'(payload: { appId: string; instanceId: string }): void
    // 路由
    // 路由。router/navigate 是 serial 守卫管线（ADR-0002）：监听器返回 GuardResult
    // 显式枚举（{proceed|redirect|abort} 或 undefined 不表态）；经 serial 链式裁决
    'router/navigate'(payload: { from: RouteLocation; to: RouteLocation; outlet: string; signal: AbortSignal }): GuardResult | Promise<GuardResult>
    'router/aborted'(payload: { outlet: string; reason: 'guard' | 'superseded' | 'unmount' }): void
    'router/changed'(payload: { location: RouteLocation; outlets: Record<string, MatchedApp | null> }): void
    // 通信
    'message/send'(payload: { message: CordisMessage }): void
    'message/receive'(payload: { message: CordisMessage; targetCtx: Context }): void
    // 请求-应答（§3.3）：应答方 emit（type 前缀 response:），请求方 global 监听按 correlationId 匹配
    'message/response'(payload: { message: CordisMessage }): void
    'bus/overflow'(payload: { instanceId: string; coalescedKeys: string[]; droppedCount: number }): void
    // 状态
    'state/changed'(payload: { key: string; value: unknown; old: unknown; path: string; source: string; version: number }): void
    'state/sync'(payload: { instanceId: string; keys: Record<string, { value: unknown; version: number }> }): void
    // 监控（monitor 服务派发；旁听需 { global: true }）
    'monitor/report'(payload: { metric: Metric }): void
    'monitor/alert'(payload: { alert: Alert }): void
    // 安全
    'security/violation'(payload: { appId: string; rule: string; detail: unknown }): void
    /** KillSwitch 急停指令（security §十）：disable 时 lifecycle 销毁该应用全部实例 */
    'security/killswitch'(payload: { appId: string; action: 'disable' | 'enable'; reason: string }): void
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
