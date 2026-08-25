import { Service, type Context } from 'cordis'
import '../events'
import type { AppPhase, ErrorMetric, Metric, Alert } from '../events'

/** 告警规则（§七 AlertEngine）：condition 真实执行 + 冷却按 (appId, type) 维度 */
export interface AlertRule {
  /** 触发条件（缺省 = 恒真——注册即启用） */
  condition?: (appId: string | undefined, detail: unknown) => boolean
  /** 冷却 ms（默认 30000；冷却期内同 (appId, type) 静默——一个应用报警不静默其他应用） */
  cooldownMs?: number
}

export interface MonitorConfig {
  /** 告警规则表（type -> rule；deny-by-default：未注册 type 的 trigger 直接丢弃） */
  alertRules?: Record<string, AlertRule>
  /** 错误率告警（JS_ERROR_RATE）：窗口与阈值 */
  errorRate?: { windowMs?: number; max?: number }
}

/**
 * 监控服务：唯一错误入口（基线 §三）+ 告警引擎（monitoring §七）。
 *
 * - monitor 零业务依赖、最先可用（ADR-0054 依赖方向）
 * - capture() 是所有错误的唯一上报入口：归因 appId、派发 monitor/report 通知族事件；
 *   同时按 (appId, 5min 窗口) 计数，超阈值触发 JS_ERROR_RATE
 * - alertEngine.trigger：规则查表（deny-by-default）-> condition 裁决 ->
 *   (appId, type) 维度冷却 -> monitor/alert 派发
 * - 违规上报走 security/violation 事件由 monitor 旁听，不构成 security -> monitor 依赖（ADR-0054）
 */
export class MonitorService extends Service<MonitorConfig> {
  static provide = 'monitor'

  private rules: Record<string, AlertRule>
  private cooldowns = new Map<string, number>()
  /** 错误计数（JS_ERROR_RATE）：appId -> 窗口内时刻列表 */
  private errorTimes = new Map<string, number[]>()

  constructor(ctx: Context, config: MonitorConfig = {}) {
    super(ctx, 'monitor')
    this.rules = config.alertRules ?? {}
    this.errorRate = { windowMs: config.errorRate?.windowMs ?? 300_000, max: config.errorRate?.max ?? 20 }
    // 旁听 security/violation（事件旁听不构成服务依赖，ADR-0054）
    ctx.on('security/violation', (violation) => {
      this.capture(new Error(`security violation: ${violation.rule}`), {
        appId: violation.appId,
        phase: 'runtime',
      })
    }, { global: true })
    // 内置规则 APP_LOAD_FAILED（§七表）：load 阶段错误（含重试耗尽）告警
    ctx.on('app/error', (e) => {
      if (e.phase === 'load') this.trigger({ type: 'APP_LOAD_FAILED', appId: e.appId, detail: { message: e.error.message } })
    }, { global: true })
  }

  private errorRate: { windowMs: number; max: number }

  /** 唯一错误入口：appId 归因 + monitor/report 通知（fire-and-forget）+ 错误率计数 */
  capture(error: unknown, meta: { appId?: string; phase: AppPhase } = { phase: 'runtime' }): void {
    const normalized = error instanceof Error ? error : new Error(String(error))
    const metric: ErrorMetric = {
      kind: 'error',
      message: normalized.message,
      stack: normalized.stack,
      appId: meta.appId,
      phase: meta.phase,
    }
    this.ctx.emit('monitor/report', { metric } satisfies { metric: Metric })
    // JS_ERROR_RATE（§七表）：appId 错误率窗口超阈值
    const key = meta.appId ?? 'host'
    const now = Date.now()
    const times = (this.errorTimes.get(key) ?? []).filter((t) => now - t <= this.errorRate.windowMs)
    times.push(now)
    this.errorTimes.set(key, times)
    if (times.length === this.errorRate.max + 1) { // 恰超阈值那一刻触发一次（窗口内不重复计数触发）
      this.trigger({ type: 'JS_ERROR_RATE', appId: meta.appId, detail: { count: times.length, windowMs: this.errorRate.windowMs } })
    }
  }

  /**
   * 告警触发（§七 AlertEngine）：规则查表（未注册 = 丢弃，deny-by-default）->
   * condition 真实执行 -> 冷却按 (appId, type) 维度（旧版全局一份的缺陷修复）->
   * monitor/alert 派发（security 审计/宿主通知经 ctx.on 订阅）。
   */
  trigger(alert: { type: string; appId?: string; detail?: unknown; level?: Alert['level'] }): boolean {
    const rule = this.rules[alert.type]
    if (!rule) return false // deny-by-default：未注册类型不告警
    if (rule.condition && !rule.condition(alert.appId, alert.detail)) return false
    const key = `${alert.appId ?? 'host'}:${alert.type}`
    const now = Date.now()
    const last = this.cooldowns.get(key)
    if (last !== undefined && now - last < (rule.cooldownMs ?? 30_000)) return false // 冷却静默
    this.cooldowns.set(key, now)
    const payload: Alert = { level: alert.level ?? 'warning', message: alert.type, appId: alert.appId }
    this.ctx.emit('monitor/alert', { alert: payload })
    return true
  }
}

declare module 'cordis' {
  interface Context {
    monitor: MonitorService
  }
}
