/**
 * Tracing 服务（monitoring §八 / communication-protocol §七 同一实现）。
 *
 * - CSPRNG traceId/spanId（禁止全零——W3C；与 bus 的 traceparent 生成同源约定）
 * - `startSpan(name, parentTraceparent?)`：新 span（有 parent 则同 traceId 延续，跨异步边界
 *   经 end() 显式收口）；轻量 span 记录 {name, traceId, spanId, parentId, at, durationMs}
 * - span 缓冲有界（默认 500，环形覆盖）；`spans()` 查询（DevTools/上报出站源）
 * - 通知族上报：span 结束经 monitor/report 派发轻量 metric（不 inject bus——零依赖方向）
 * - 第三方域请求不注入 header（外泄边界）——由 scopedFetch 消费方遵守，本服务只产 span
 *
 * **C6-A 抽离**：原 bus.ts 顶部重复定义的 W3C trace helpers + `nextFrame` + `linkSpan`
 * 全部下移到本文件统一 source of truth。
 */
import { Service, type Context } from 'cordis'
import '../events'

export interface TracingConfig {
  /** span 缓冲容量（默认 500；溢出覆盖最旧） */
  bufferLimit?: number
}

export interface SpanRecord {
  name: string
  traceId: string
  spanId: string
  parentId?: string
  at: number
  durationMs?: number
}

export interface Span {
  readonly traceparent: string
  end(): number
}

/** CSPRNG hex（n 字节；禁止全零——W3C 对 trace-id/span-id 的要求） */
function randomHex(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  if (bytes.every((b) => b === 0)) return randomHex(n)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** CSPRNG traceId（16 字节 hex，禁止全零——W3C 要求） */
export function generateTraceId(): string {
  return randomHex(16)
}

/** CSPRNG spanId（8 字节 hex；禁止全零） */
export function generateSpanId(): string {
  return randomHex(8)
}

export function parseTraceparent(tp: string): { traceId: string; spanId: string } | null {
  const m = tp.match(/^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/)
  return m ? { traceId: m[1] as string, spanId: m[2] as string } : null
}

export function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`
}

/**
 * 每帧分批回放（ADR-0015：50/帧避免长任务）；无 rAF 环境（jsdom）退化为 setTimeout(0)
 * ——与 span duration 计时的"避免长任务"语义同源，下移到 tracing.ts。
 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

/**
 * Span link（ADR-0030）：有原 traceparent 则保持原 traceId + 换新 spanId
 * （不计队列滞留时长）；无/不可解析时**原样透传**——非 OTel 兼容降级为如实
 * 长 span（span 时长诚实包含队列滞留），不伪造新 trace 切断关联。
 */
export function linkSpan(message: { traceparent?: string }): { traceparent?: string } {
  if (message.traceparent === undefined) return message
  const trace = parseTraceparent(message.traceparent)
  if (!trace) return message // 不可解析：诚实长 span（§七-5 降级路径）
  return { traceparent: formatTraceparent(trace.traceId, generateSpanId()) }
}

export class TracingService extends Service<TracingConfig> {
  static provide = 'tracing'

  private limit: number
  private buffer: SpanRecord[] = []

  constructor(ctx: Context, config: TracingConfig = {}) {
    super(ctx, 'tracing')
    this.limit = config.bufferLimit ?? 500
  }

  /**
   * 开 span：无 parent 则新 traceId（CSPRNG）；有 parent（W3C traceparent）则同 traceId 延续。
   * end() 显式收口（duration 只计真实处理时间——回放 span link 语义与 linkSpan 一致）。
   */
  startSpan(name: string, parentTraceparent?: string): Span {
    const parent = parentTraceparent ? parseTraceparent(parentTraceparent) : null
    const traceId = parent?.traceId ?? generateTraceId()
    const spanId = generateSpanId()
    const at = Date.now()
    const record: SpanRecord = { name, traceId, spanId, parentId: parent?.spanId, at }
    return {
      traceparent: formatTraceparent(traceId, spanId),
      end: () => {
        record.durationMs = Date.now() - at
        this.buffer.push(record)
        if (this.buffer.length > this.limit) this.buffer.shift() // 有界：覆盖最旧
        return record.durationMs
      },
    }
  }

  /** span 查询（DevTools/上报出站的数据源） */
  spans(): readonly SpanRecord[] {
    return this.buffer
  }
}

declare module 'cordis' {
  interface Context {
    tracing: TracingService
  }
}
