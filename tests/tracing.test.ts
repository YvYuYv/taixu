/**
 * 主缝测试：TracingService（monitoring §八 / communication §七，B-通信）。
 * CSPRNG traceId、parent 延续同 traceId、span 有界缓冲、duration 收口。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, parseTraceparentForTracing } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => { document.body.textContent = '' })

describe('TracingService（§八）', () => {
  it('独立 span 新 traceId（CSPRNG 非全零）；end 收口 duration；parent 延续同 traceId', async () => {
    const host = createCordis({ apps: [defineApp('t1', () => ({ name: 't1', apply() {} }))] })
    await settle()

    const root = host.tracing.startSpan('nav')
    const parsed = parseTraceparentForTracing(root.traceparent)
    expect(parsed).not.toBeNull()
    expect(parsed!.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(parsed!.spanId).toMatch(/^[0-9a-f]{16}$/)
    expect(parsed!.traceId).not.toBe('0'.repeat(32)) // 禁全零（W3C）

    // 子 span 延续（同 traceId、parentId 链接）
    const child = host.tracing.startSpan('mount', root.traceparent)
    const childParsed = parseTraceparentForTracing(child.traceparent)!
    expect(childParsed.traceId).toBe(parsed!.traceId) // 同链路
    expect(childParsed.spanId).not.toBe(parsed!.spanId)

    await new Promise((r) => setTimeout(r, 15))
    expect(root.end()).toBeGreaterThanOrEqual(10) // duration 只计真实处理时间
    child.end()
    const spans = host.tracing.spans()
    expect(spans).toHaveLength(2)
    expect(spans[1]!.parentId).toBe(parsed!.spanId) // 父子链接
    expect(spans[0]!.name).toBe('nav')
  })

  it('span 缓冲有界（容量配置）：溢出覆盖最旧', async () => {
    const host = createCordis({ tracing: { bufferLimit: 3 }, apps: [] })
    await settle()
    for (let i = 1; i <= 5; i++) host.tracing.startSpan(`op-${i}`).end()
    const names = host.tracing.spans().map((s) => s.name)
    expect(names).toEqual(['op-3', 'op-4', 'op-5']) // 覆盖最旧
  })
})
