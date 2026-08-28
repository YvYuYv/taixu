/**
 * Monitor errorLedger 子系统（monitoring §七 JS_ERROR_RATE + §十 错误清单）：
 *
 * errorTimes Map + errorLedger Array + JS_ERROR_RATE 触发逻辑从 monitor.ts 抽离——
 * 自洽子系统（无 ctx 依赖），与 metricsSnapshot / alertEngine / 隔离门面完全无共享。
 *
 * **C14-E 抽离动机**：monitor.ts 12 个状态字段中（C7-A 后仍 12）错误捕获子系统
 * （errorTimes + errorLedger + JS_ERROR_RATE）约 50 行；抽离后 monitor 状态机密度
 * 收敛到 metricsSnapshot / alertEngine / 隔离门面本职。
 *
 * **架构边界**：monitor.inject errorLedger 实例（非 cordis service 形态）——
 * 无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern（C7-A leakDetector 同节奏）。
 */
import type { AppPhase, ErrorMetric } from '../../events'

export interface ErrorLedgerConfig {
  /** 错误率窗口 ms（默认 300000 = 5min） */
  windowMs?: number
  /** 错误率阈值（默认 20；窗口内超阈值触发 JS_ERROR_RATE） */
  max?: number
  /** 错误清单容量（默认 50；溢出丢最旧） */
  ledgerCap?: number
}

export interface ErrorLedgerHandle {
  /** 错误捕获：appId 归因 + 错误率窗口计数；返回是否需要触发 JS_ERROR_RATE */
  capture(error: ErrorMetric, appId: string | undefined): { shouldAlert: boolean; count: number; windowMs: number }
  /** 错误清单（§十 DevTools 只读查询面） */
  entries(): readonly ErrorMetric[]
  /** 释放资源 */
  destroy(): void
}

/** 创建 errorLedger 账本（无 cordis service 形态——轻量闭包工厂） */
export function createErrorLedger(config: ErrorLedgerConfig = {}): ErrorLedgerHandle {
  const windowMs = config.windowMs ?? 300_000
  const max = config.max ?? 20
  const ledgerCap = config.ledgerCap ?? 50
  const errorTimes = new Map<string, number[]>()
  const errorLedger: ErrorMetric[] = []

  return {
    capture(metric, appId) {
      // 错误清单（§十 DevTools 只读查询）：有界环形（默认 50；溢出丢最旧）
      errorLedger.push(metric)
      if (errorLedger.length > ledgerCap) errorLedger.shift()
      // JS_ERROR_RATE（§七表）：appId 错误率窗口超阈值
      const key = appId ?? 'host'
      const now = Date.now()
      const times = (errorTimes.get(key) ?? []).filter((t) => now - t <= windowMs)
      times.push(now)
      errorTimes.set(key, times)
      if (times.length === max + 1) { // 恰超阈值那一刻触发一次（窗口内不重复计数触发）
        return { shouldAlert: true, count: times.length, windowMs }
      }
      return { shouldAlert: false, count: times.length, windowMs }
    },

    entries() {
      return errorLedger
    },

    destroy() {
      errorTimes.clear()
      errorLedger.length = 0
    },
  }
}
