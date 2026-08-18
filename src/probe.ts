import type { Context, FiberState } from 'cordis'

/**
 * 探针应用的回报契约：主缝测试的观察手段（spec Testing Decisions）。
 * 探针 = 纯 `apply(ctx)` 插件，在派生 fiber 上下文内消费 ctx 契约并回报观察。
 */
export type ProbeReport =
  | { type: 'services'; available: string[] }
  | { type: 'fiber-state'; state: keyof typeof FiberState }
  | { type: 'app-event'; appId: string }
  | { type: 'cleaned' }

export interface ProbeOptions {
  /** 声明注入的服务（static inject 语义，Cordis 在就绪前保持 fiber PENDING） */
  inject?: string[]
}

/**
 * 创建探针应用：`createProbeApp(appId, onReport)` 返回纯插件对象。
 *
 * 回报全部来自**对 ctx 的真实观察**（不是复读配置）：
 * - services：apply 运行时逐个探测声明服务在 ctx 上的实际可见性
 * - fiber-state：读 `ctx.fiber.state`（apply 内 = LOADING；await 后 = ACTIVE）
 * - app-event：经 `{ global: true }` 旁听 app/* 通知族
 * - cleaned：effect 清理器被 runtime 回滚
 *
 * PENDING 发生在 apply 之前，探针自身不可见--主缝测试由宿主旁听补齐全序。
 */
export function createProbeApp(
  appId: string,
  onReport: (report: ProbeReport) => void,
  options: ProbeOptions = {},
) {
  const inject = options.inject ?? ['monitor', 'security']
  return {
    name: appId,
    inject,
    apply(ctx: Context) {
      const available = inject.filter((name) => (ctx as unknown as Record<string, unknown>)[name] != null)
      onReport({ type: 'services', available })
      onReport({ type: 'fiber-state', state: fiberStateNameOf(ctx.fiber.state) })
      ctx.effect(() => () => onReport({ type: 'cleaned' }))
      ctx.on('app/ready', (payload) => onReport({ type: 'app-event', appId: payload.appId }), {
        global: true,
      })
      ctx.fiber
        .await()
        .then(() => onReport({ type: 'fiber-state', state: fiberStateNameOf(ctx.fiber.state) }))
    },
  }
}

/** const enum 不支持反向映射，经数组索引取名（顺序即 FiberState 数值序） */
const FIBER_STATE_NAMES = [
  'PENDING',
  'LOADING',
  'ACTIVE',
  'FAILED',
  'DISPOSED',
  'UNLOADING',
] as const

function fiberStateNameOf(state: FiberState): keyof typeof FiberState {
  return FIBER_STATE_NAMES[state]
}
