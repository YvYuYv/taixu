import { Service, type Context } from 'cordis'
import '../events'
import type { AppPhase, ErrorMetric, Metric, Alert } from '../events'
import type { Span, TracingService } from './tracing'
import { createLeakDetector, type LeakDetectorHandle } from './leakDetector'
import { createErrorLedger, type ErrorLedgerHandle } from './monitor/errorLedger'
import { redactText, type PrivacyConfig } from './monitor/pii'
export type { PrivacyConfig } from './monitor/pii'

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
  /** 指标环形缓冲容量（默认 1024；溢出覆盖最旧——O(1)，修复 shift O(n)） */
  metricsBuffer?: number
  /** 泄漏探测（§四）：嫌疑 TTL 与轮询（默认 60s/5s）；hasGcActivity 注入 GC 活动证据源（测试/宿主） */
  leak?: { ttlMs?: number; pollMs?: number; hasGcActivity?: () => boolean }
  /**
   * sourcemap 还原管线（monitoring §二，F4）：错误 stack **入库前**经此重写，
   * 使 `errors()` 返回的是已还原堆栈（§十 只读查询面契约）。
   *
   * 宿主提供实现（如 Vite 预加载 `.map` + source-map 库）；capture 是同步入口，
   * 故异步的 map 加载须由宿主预缓存后同步消费。缺省 = 不还原（原始 stack，既有行为）。
   */
  sourcemap?: SourcemapRewriter
  /**
   * PII 脱敏（monitoring §六，F9）：错误 message/stack 入库前经脱敏管道
   * （敏感键联动掩码；与 state `sensitiveKeys` 同族规则）。缺省 = 不脱敏（既有行为）。
   */
  privacy?: PrivacyConfig
  /**
   * 开销自测（monitoring §九，F9"观测者效应自测"）：按 `sampleEvery` 抽样测量
   * 单事件处理耗时，超 `budgetMs` 的样本累计，按 `reportEveryMs` 周期上报
   * `MONITOR_OVERHEAD` 告警（deny-by-default：宿主需在 alertRules 注册该类型）。
   * 缺省 = 不自测（零开销）。
   */
  overhead?: OverheadBudget
}

/** 开销预算（§九：CPU < 1%、单事件处理 < 0.1ms） */
export interface OverheadBudget {
  /** 每 N 次采集采样一次（默认 100） */
  sampleEvery?: number
  /** 单事件处理预算 ms（默认 0.1） */
  budgetMs?: number
  /** 上报周期 ms（默认 30_000） */
  reportEveryMs?: number
}

/**
 * sourcemap 还原管线（monitoring §二）：`rewrite` 返回重写后的 stack；
 * 抛错或返回空值 → 降级为原始 stack（不阻断错误采集，也不上报——避免
 * monitor → security → monitor 回环）。devtools 与 monitor 共用同一注入实例。
 */
export interface SourcemapRewriter {
  rewrite(stack: string): string
}

/** 指标快照条目：计数 + 分位数（p50/p75/p95，§三分位数而非均值） */
export interface MetricSummary {
  count: number
  p50: number
  p75: number
  p95: number
  max: number
}

/** 定长环形缓冲（游标覆盖，O(1)；修复旧版 shift O(n)） */
class RingBuffer {
  private buf: number[] = []
  private cursor = 0
  constructor(private cap: number) {}
  push(v: number): void {
    if (this.buf.length < this.cap) this.buf.push(v)
    else {
      this.buf[this.cursor] = v
      this.cursor = (this.cursor + 1) % this.cap
    }
  }
  values(): number[] {
    return this.buf.length < this.cap ? [...this.buf] : [...this.buf.slice(this.cursor), ...this.buf.slice(0, this.cursor)]
  }
}

/** 分位数（最近邻插值；空序列返回 0） */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))
  return sorted[idx] as number
}

/**
 * 按应用隔离的主动上报入口（monitoring §2.1，ADR-0010/0025）：应用经挂载事务在
 * `isolate('monitor', appId)` ctx 上注入本门面——capture/count **自动归因 appId**
 * （应用无需手动传）；startSpan 续接为子 span（同 traceId 贯通，ADR-0022）。
 * 只暴露主动上报三件套：trigger/metricsSnapshot 等聚合面留在 root 单例（隔离边界）。
 */
export interface AppMonitor {
  /** 唯一错误入口（隔离版）：appId 自动归因；phase 缺省 runtime */
  capture(error: unknown, meta?: { phase?: AppPhase }): void
  /** 指标计数（隔离版）：自动附 appId 标签，聚合汇于 root sink */
  count(name: string, value: number, tags?: Record<string, unknown>): void
  /** 开 span（隔离版）：带 parentTraceparent 则同 traceId 续接；tracing 未启用返回 null（诚实降级） */
  startSpan(name: string, parentTraceparent?: string): Span | null
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
 *
 * **C7-A 抽离**：leak detection（§四）已独立为 `services/leakDetector.ts` 闭包模块；
 *   monitor 仅持 detector 引用 + LEAK_SUSPECT 告警去抖 + 轮询定时器。
 *   关注面从 7+ 收敛到：错误/指标/告警/隔离门面 4 类本职。
 */
export class MonitorService extends Service<MonitorConfig> {
  static provide = 'monitor'

  private rules: Record<string, AlertRule>
  private cooldowns = new Map<string, number>()
  /** 指标缓冲（name -> 环形缓冲） */
  private series = new Map<string, RingBuffer>()
  private bufferCap: number
  /** sourcemap 还原管线（§二，F4）：null = 不还原（原始 stack，既有行为） */
  private sourcemap: SourcemapRewriter | null
  /** 挂载计时（app_loading -> app_ready 时长，§三 加载指标）：instanceId -> 起始时刻 */
  private loadingSince = new Map<string, number>()
  /** Leak detector 闭包（C7-A）：源自 services/leakDetector.ts；
   *   告警去抖 `leakReported` 由 monitor 持有——LEAK_SUSPECT 触发的副作用在 monitor 自身 */
  private leakDetector: LeakDetectorHandle
  /** LEAK_SUSPECT 告警去抖：同 instanceId 只报一次（§四：决疑证据弱，避免风暴） */
  private leakReported = new Set<string>()
  /** Error ledger 账本（C14-E）：errorTimes Map + errorLedger Array + JS_ERROR_RATE
   *   子系统已抽离到 monitor/errorLedger.ts；monitor 改持 errorLedger 引用。 */
  private errorLedger: ErrorLedgerHandle
  /** PII 脱敏配置（§六，F9）：null = 不脱敏（既有行为） */
  private privacy: PrivacyConfig | null
  /** 开销自测（§九，F9）：null = 不自测（零开销） */
  private overhead: Required<OverheadBudget> | null
  /** 自测采样计数（每 sampleEvery 次采一次） */
  private sampleTick = 0
  /** 超预算样本数（周期内累计，上报后清零） */
  private overBudget = 0
  /** 最近一次上报时刻（0 = 未上报过） */
  private overheadReportedAt = 0

  constructor(ctx: Context, config: MonitorConfig = {}) {
    super(ctx, 'monitor')
    this.rules = config.alertRules ?? {}
    this.bufferCap = config.metricsBuffer ?? 1024
    this.sourcemap = config.sourcemap ?? null // §二 sourcemap 还原管线（缺省不还原）
    this.privacy = config.privacy ?? null // §六 PII 脱敏（缺省不脱敏）
    this.overhead = config.overhead
      ? {
          sampleEvery: config.overhead.sampleEvery ?? 100,
          budgetMs: config.overhead.budgetMs ?? 0.1,
          reportEveryMs: config.overhead.reportEveryMs ?? 30_000,
        }
      : null // §九 开销自测（缺省不自测）
    this.leakDetector = createLeakDetector(config.leak)
    // C14-E：errorLedger 子系统抽离到 monitor/errorLedger.ts；monitor 改持 errorLedger 引用
    this.errorLedger = createErrorLedger({
      windowMs: config.errorRate?.windowMs,
      max: config.errorRate?.max,
    })
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
    // 指标采集（§三）：state 变更计数；应用加载时长（app/loading -> app/ready 事件差，含重试）
    ctx.on('state/changed', (e) => this.count('state_change', 1, { key: e.key }), { global: true })
    ctx.on('app/loading', (e) => this.loadingSince.set(e.instanceId, Date.now()), { global: true })
    ctx.on('app/ready', (e) => {
      const startedAt = this.loadingSince.get(e.instanceId)
      if (startedAt !== undefined) {
        this.loadingSince.delete(e.instanceId)
        this.count('app_load_ms', Date.now() - startedAt, { appId: e.appId })
      }
    }, { global: true })
    // 泄漏探测轮询（§四）：嫌疑存活超 TTL + 期间发生过 GC 才告警
    const pollMs = config.leak?.pollMs ?? 5_000
    const poll = setInterval(() => {
      for (const s of this.leakDetector.sweepOnce()) {
        if (!this.leakReported.has(s.instanceId)) {
          this.leakReported.add(s.instanceId)
          this.trigger({
            type: 'LEAK_SUSPECT',
            appId: s.instanceId.split(':')[0],
            level: 'warning',
            detail: { instanceId: s.instanceId, ttlMs: config.leak?.ttlMs ?? 60_000 },
          })
        }
      }
    }, pollMs)
    ctx.effect(() => () => {
      clearInterval(poll)
      this.leakDetector.destroy()
    })
  }

  /**
   * 指标计数（§三）：值进环形缓冲（分位数而非均值）；连续型指标（`fps` 前缀）
   * 在 `document.hidden` 时暂停（修复后台误报 LOW_FPS）。
   */
  count(name: string, value: number, _tags?: Record<string, unknown>): void {
    if (name.startsWith('fps') && document.hidden) return // 后台暂停（§三）
    const ring = this.series.get(name) ?? new RingBuffer(this.bufferCap)
    ring.push(value)
    this.series.set(name, ring)
  }

  /** 指标快照：计数 + 分位数（p50/p75/p95）+ max */
  metricsSnapshot(): Record<string, MetricSummary> {
    const out: Record<string, MetricSummary> = {}
    for (const [name, ring] of this.series) {
      const sorted = [...ring.values()].sort((a, b) => a - b)
      out[name] = {
        count: sorted.length,
        p50: quantile(sorted, 0.5),
        p75: quantile(sorted, 0.75),
        p95: quantile(sorted, 0.95),
        max: sorted[sorted.length - 1] ?? 0,
      }
    }
    return out
  }

  /**
   * 泄漏嫌疑登记（§四）：dispose 后登记（宿主/lifecycle 调用）；FinalizationRegistry
   * 在 GC 时自动洗清嫌疑；存活超 TTL 且期间有 GC 活动证据才告警（LEAK_SUSPECT，
   * 同 instanceId 去抖一次）。能力边界：只覆盖可 WeakRef 的对象（分离 DOM 等），
   * JS 堆泄漏（闭包/数组）由沙箱记账审计补位。
   * C7-A：thin delegate 到 leakDetector.trackDisposed。
   */
  trackDisposed(target: { instanceId: string; object: object }): void {
    this.leakDetector.trackDisposed(target)
  }

  /** 泄漏嫌疑清单（§十 DevTools 只读查询面）：C7-A 透传 leakDetector.leakSuspects */
  leakSuspects(): { instanceId: string; at: number }[] {
    return this.leakDetector.leakSuspects()
  }

  /**
   * sourcemap 还原（§二，F4）：未配管线则原样返回；管线抛错或返回空值 →
   * 降级为原始 stack（错误采集不被还原管线阻断，也不上报——避免 monitor →
   * security → monitor 回环）。缓存交给宿主管线（map 解析结果可长期复用）。
   */
  private rewriteStack(stack: string): string {
    if (!this.sourcemap) return stack
    try {
      return this.sourcemap.rewrite(stack) || stack
    } catch {
      return stack
    }
  }

  /**
   * 错误清单（§十 DevTools 只读查询面）：stack 已在 capture 入库前经 sourcemap
   * 管线还原（monitoring §二，F4）—— 此处不再二次重写，devtools 复用同一结果。
   * C14-E：thin delegate 到 errorLedger.entries。
   */
  errors(): readonly ErrorMetric[] {
    return this.errorLedger.entries()
  }

  /** 唯一错误入口：appId 归因 + monitor/report 通知（fire-and-forget）+ 错误率计数——
   * C14-E：errorLedger.capture 消费账本；JS_ERROR_RATE 触发逻辑保留在 monitor（告警副作用）。 */
  capture(error: unknown, meta: { appId?: string; phase: AppPhase } = { phase: 'runtime' }): void {
    const startedAt = this.overhead ? now() : 0 // §九 开销自测采样（未启用时零开销）
    const normalized = error instanceof Error ? error : new Error(String(error))
    const metric: ErrorMetric = {
      kind: 'error',
      // §六 PII 脱敏（F9）：入库前掩码敏感键值（脱敏失败不影响采集）
      message: this.redact(normalized.message),
      // §二 sourcemap 还原（F4）：入库前重写，使 errors() 返回已还原堆栈（§十）
      stack: normalized.stack === undefined ? undefined : this.redact(this.rewriteStack(normalized.stack)),
      appId: meta.appId,
      phase: meta.phase,
    }
    const { shouldAlert, count, windowMs } = this.errorLedger.capture(metric, meta.appId)
    this.ctx.emit('monitor/report', { metric } satisfies { metric: Metric })
    // JS_ERROR_RATE（§七表）：appId 错误率窗口超阈值
    if (shouldAlert) {
      this.trigger({ type: 'JS_ERROR_RATE', appId: meta.appId, detail: { count, windowMs } })
    }
    if (this.overhead) this.sampleOverhead(now() - startedAt)
  }

  /**
   * PII 脱敏（§六，F9）：未配置则原样返回；脱敏管线抛错静默降级——
   * 采集不被脱敏阻断（同样不上报，避免 monitor → security → monitor 回环）。
   */
  private redact(text: string): string {
    if (!this.privacy) return text
    try {
      return redactText(text, this.privacy)
    } catch {
      return text
    }
  }

  /** 开销采样（§九）：按 sampleEvery 抽样，超预算累计；到周期上报 MONITOR_OVERHEAD */
  private sampleOverhead(elapsedMs: number): void {
    const cfg = this.overhead
    if (!cfg) return
    if (++this.sampleTick % cfg.sampleEvery !== 0) return
    if (elapsedMs > cfg.budgetMs) this.overBudget++
    const nowMs = Date.now()
    if (this.overheadReportedAt !== 0 && nowMs - this.overheadReportedAt < cfg.reportEveryMs) return
    this.overheadReportedAt = nowMs
    if (this.overBudget === 0) return
    const over = this.overBudget
    this.overBudget = 0
    // deny-by-default：宿主需在 alertRules 注册 MONITOR_OVERHEAD 才会派发
    this.trigger({ type: 'MONITOR_OVERHEAD', level: 'warning', detail: { over, budgetMs: cfg.budgetMs } })
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

  /**
   * 造按应用隔离的主动上报门面（monitoring §2.1）：capture/count 走 root 管线
   * （自动归因 appId——聚合汇于 root sink）；startSpan 懒取 tracing（不 inject，
   * 保持 monitor 零依赖方向 ADR-0054；tracing 未启用 = null 诚实降级）。
   */
  forApp(appId: string): AppMonitor {
    return {
      capture: (error, meta) => this.capture(error, { appId, phase: meta?.phase ?? 'runtime' }),
      count: (name, value, tags) => this.count(name, value, { appId, ...tags }),
      startSpan: (name, parentTraceparent) => {
        // 懒取 tracing（不 inject，保持 monitor 零依赖方向 ADR-0054）；
        // tracing 服务未注册时运行时为 undefined = null 诚实降级（不产 span）
        const tracing = (this.ctx as { tracing?: TracingService }).tracing
        return tracing ? tracing.startSpan(name, parentTraceparent) : null
      },
    }
  }
}

declare module 'cordis' {
  interface Context {
    monitor: MonitorService
  }
}

/** 单调时钟（§九 开销自测）：`performance.now` 不可用时回落 Date.now（精度下降但不失败） */
function now(): number {
  const perf = (globalThis as unknown as { performance?: { now?: () => number } }).performance
  return typeof perf?.now === 'function' ? perf.now() : Date.now()
}
