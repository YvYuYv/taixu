/**
 * Tracing 服务（monitoring §八 / communication-protocol §七 同一实现）。
 *
 * - CSPRNG traceId/spanId（禁止全零——W3C；与 bus 的 traceparent 生成同源约定）
 * - `startSpan(name, parentTraceparent?)`：新 span（有 parent 则同 traceId 延续，跨异步边界
 *   经 end() 显式收口）；轻量 span 记录 {name, traceId, spanId, parentId, at, durationMs}
 * - span 缓冲有界（默认 500，环形覆盖）；`spans()` 查询（DevTools/上报出站源）
 * - 通知族上报：span 结束经 monitor/report 派发轻量 metric（不 inject bus——零依赖方向）
 * - 第三方域请求不注入 header（外泄边界）——由 scopedFetch 消费方遵守，本服务只产 span
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

export function parseTraceparent(tp: string): { traceId: string; spanId: string } | null {
  const m = tp.match(/^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/)
  return m ? { traceId: m[1] as string, spanId: m[2] as string } : null
}

export function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`
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
   * end() 显式收口（duration 只计真实处理时间——回放 span link 语义与 bus.linkSpan 一致）。
   */
  startSpan(name: string, parentTraceparent?: string): Span {
    const parent = parentTraceparent ? parseTraceparent(parentTraceparent) : null
    const traceId = parent?.traceId ?? randomHex(16)
    const spanId = randomHex(8)
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
