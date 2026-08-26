import { Service, type Context } from 'cordis'
import '../events'
import type { AppPhase, ErrorMetric, Metric, Alert } from '../events'
import type { Span, TracingService } from './tracing'

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
 */
export class MonitorService extends Service<MonitorConfig> {
  static provide = 'monitor'

  private rules: Record<string, AlertRule>
  private cooldowns = new Map<string, number>()
  /** 错误计数（JS_ERROR_RATE）：appId -> 窗口内时刻列表 */
  private errorTimes = new Map<string, number[]>()
  /** 指标缓冲（name -> 环形缓冲） */
  private series = new Map<string, RingBuffer>()
  private bufferCap: number
  /** 挂载计时（app_loading -> app_ready 时长，§三 加载指标）：instanceId -> 起始时刻 */
  private loadingSince = new Map<string, number>()
  /** 泄漏嫌疑（§四）：instanceId -> { ref, at }；FinalizationRegistry 回收确认即移除 */
  private suspects = new Map<string, { ref: WeakRef<object>; at: number }>()
  private leakReported = new Set<string>() // 告警去抖：同 instanceId 只报一次
  private gcActivity: () => boolean
  private lastHeap: number | undefined

  constructor(ctx: Context, config: MonitorConfig = {}) {
    super(ctx, 'monitor')
    this.rules = config.alertRules ?? {}
    this.bufferCap = config.metricsBuffer ?? 1024
    this.errorRate = { windowMs: config.errorRate?.windowMs ?? 300_000, max: config.errorRate?.max ?? 20 }
    // 泄漏探测特性检测（§四）：WeakRef/FinalizationRegistry 缺失则降级为纯记账（不抛错）
    this.leakSupported = typeof WeakRef === 'function' && typeof FinalizationRegistry === 'function'
    if (this.leakSupported) {
      this.registry = new FinalizationRegistry((key: string) => {
        this.suspects.delete(key) // 回收确认：被 GC -> 移出嫌疑（修复 deref 误报）
      })
    }
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
    // 泄漏探测轮询（§四）：嫌疑存活超 TTL 且期间发生过 GC 才告警（deref 非空不能证明泄漏）
    this.gcActivity = config.leak?.hasGcActivity ?? (() => this.observeHeapDecline())
    const ttlMs = config.leak?.ttlMs ?? 60_000
    const pollMs = config.leak?.pollMs ?? 5_000
    const poll = setInterval(() => this.sweepSuspects(ttlMs), pollMs)
    ctx.effect(() => () => clearInterval(poll))
  }

  private errorRate: { windowMs: number; max: number }
  private leakSupported: boolean
  private registry?: FinalizationRegistry<string>

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
   */
  trackDisposed(target: { instanceId: string; object: object }): void {
    if (!this.leakSupported) return // 特性降级：不探测（检测插件自身不抛错）
    this.suspects.set(target.instanceId, { ref: new WeakRef(target.object), at: Date.now() })
    this.registry?.register(target.object, target.instanceId)
  }

  /** 泄漏嫌疑清单（§十 DevTools 只读查询面）：instanceId -> 登记时刻 */
  leakSuspects(): { instanceId: string; at: number }[] {
    return [...this.suspects].map(([instanceId, s]) => ({ instanceId, at: s.at }))
  }

  /** 嫌疑清扫（轮询）：超 TTL + 有 GC 活动 + 引用仍活着 -> LEAK_SUSPECT（去抖一次） */
  private sweepSuspects(ttlMs: number): void {
    const now = Date.now()
    for (const [key, s] of [...this.suspects]) {
      if (s.ref.deref() === undefined) {
        this.suspects.delete(key) // 已回收（Registry 回调之外的兜底）
        continue
      }
      if (now - s.at > ttlMs && !this.leakReported.has(key) && this.gcActivity()) {
        this.leakReported.add(key)
        this.suspects.delete(key)
        this.trigger({ type: 'LEAK_SUSPECT', appId: key.split(':')[0], level: 'warning', detail: { instanceId: key, ttlMs } })
      }
    }
  }

  /** GC 活动证据（§四）：performance.memory 下降事件（无此 API = 无证据 -> 不告警，诚实降级） */
  private observeHeapDecline(): boolean {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
    if (!mem) return false
    if (this.lastHeap !== undefined && mem.usedJSHeapSize < this.lastHeap) {
      this.lastHeap = mem.usedJSHeapSize
      return true // 发生过 GC（堆下降）
    }
    this.lastHeap = mem.usedJSHeapSize
    return false
  }

  /** 错误清单（§十 DevTools 只读查询面；sourcemap 还原随宿主管线接入后在此层应用） */
  errors(): readonly ErrorMetric[] {
    return this.errorLedger
  }

  private errorLedger: ErrorMetric[] = []

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
    // 错误清单（§十 DevTools 只读查询）：有界环形（默认 50；溢出丢最旧）
    this.errorLedger.push(metric)
    if (this.errorLedger.length > 50) this.errorLedger.shift()
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
