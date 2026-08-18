import { Service, type Context } from 'cordis'
import '../events'
import type { AppPhase, ErrorMetric, Metric } from '../events'

/**
 * 监控服务：唯一错误入口（基线 §三）。
 *
 * - monitor 零业务依赖、最先可用（ADR-0054 依赖方向）
 * - capture() 是所有错误的唯一上报入口：归因 appId、派发 monitor/report 通知族事件
 * - 违规上报走 security/violation 事件由 monitor 旁听，不构成 security -> monitor 依赖（ADR-0054）
 */
export class MonitorService extends Service {
  static provide = 'monitor'

  constructor(ctx: Context) {
    super(ctx, 'monitor')
    // 旁听 security/violation（事件旁听不构成服务依赖，ADR-0054）
    ctx.on('security/violation', (violation) => {
      this.capture(new Error(`security violation: ${violation.rule}`), {
        appId: violation.appId,
        phase: 'runtime',
      })
    }, { global: true })
  }

  /** 唯一错误入口：appId 归因 + monitor/report 通知（fire-and-forget） */
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
  }
}

declare module 'cordis' {
  interface Context {
    monitor: MonitorService
  }
}
