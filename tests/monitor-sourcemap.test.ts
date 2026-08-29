/**
 * 主缝测试：sourcemap 还原管线（monitoring §二，F4）。
 *
 * 主缝 = createCordis({ monitor: { sourcemap } }) + monitor.capture / errors() +
 * devtools.snapshot()。语义源：monitoring.md §二（capture 归因 + sourcemap rewrite）、
 * §十（DevTools 只读查询面：错误清单 sourcemap 已还原，devtools 复用同管线）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, type SourcemapRewriter } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

/** 压缩栈 -> 源码栈的替身管线（真实实现由宿主提供，如 source-map 库） */
function fakeRewriter(mapping: Record<string, string> = {}): SourcemapRewriter & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    rewrite(stack: string) {
      calls.push(stack)
      return Object.entries(mapping).reduce((acc, [from, to]) => acc.split(from).join(to), stack)
    },
  }
}

describe('sourcemap 还原管线（F4，monitoring §二）', () => {
  it('未配管线：原始 stack 直出（既有行为零变化）', async () => {
    const host = createCordis({ apps: [defineApp('s-app', () => ({ name: 's-app', apply() {} }))] })
    await settle()
    host.monitor.capture(new Error('boom'), { appId: 's-app', phase: 'runtime' })
    const [err] = host.monitor.errors()
    expect(err?.stack).toContain('boom')
  })

  it('配置管线：错误 stack 在入库前重写（errors() 返回已还原堆栈）', async () => {
    const rewriter = fakeRewriter({ 'bundle.min.js:1:234': 'src/views/cart.ts:42:7' })
    const host = createCordis({
      monitor: { sourcemap: rewriter },
      apps: [defineApp('s-app', () => ({ name: 's-app', apply() {} }))],
    })
    await settle()
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at r (bundle.min.js:1:234)'
    host.monitor.capture(err, { appId: 's-app', phase: 'runtime' })

    const [recorded] = host.monitor.errors()
    expect(recorded?.stack).toContain('src/views/cart.ts:42:7') // 已还原
    expect(recorded?.stack).not.toContain('bundle.min.js') // 原始位置已替换
    expect(rewriter.calls).toHaveLength(1) // 入库前一次重写，查询面不二次重写
  })

  it('monitor/report 事件与 errors() 同源（通知与查询面一致，无两套 stack）', async () => {
    const rewriter = fakeRewriter({ 'a.min.js': 'src/a.ts' })
    const host = createCordis({ monitor: { sourcemap: rewriter }, apps: [] })
    await settle()
    const seen: Array<{ message: string; stack?: string }> = []
    host.on('monitor/report', (e) => seen.push(e.metric as { message: string; stack?: string }), { global: true })
    const err = new Error('evt-boom')
    err.stack = 'Error: evt-boom\n    at x (a.min.js:1:1)'
    host.monitor.capture(err, { phase: 'runtime' })

    expect(seen[0]?.stack).toContain('src/a.ts') // 事件载荷也是还原后
    expect(host.monitor.errors()[0]?.stack).toBe(seen[0]?.stack)
  })

  it('管线抛错 / 返回空值：降级为原始 stack（不阻断错误采集，不制造 monitor→security 回环）', async () => {
    const host = createCordis({
      monitor: { sourcemap: { rewrite: () => { throw new Error('map load failed') } } },
      apps: [],
    })
    await settle()
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at r (bundle.min.js:1:1)'
    expect(() => host.monitor.capture(err, { phase: 'runtime' })).not.toThrow() // 不阻断
    expect(host.monitor.errors()[0]?.stack).toBe(err.stack) // 原始 stack 保底

    // 返回空串同样降级（不写入空 stack）
    const host2 = createCordis({ monitor: { sourcemap: { rewrite: () => '' } }, apps: [] })
    await settle()
    host2.monitor.capture(err, { phase: 'runtime' })
    expect(host2.monitor.errors()[0]?.stack).toBe(err.stack)
  })

  it('devtools 复用同管线：snapshot().errors 直出已还原 stack（唯一数据源）', async () => {
    const rewriter = fakeRewriter({ 'bundle.min.js': 'src/views/cart.ts' })
    const host = createCordis({
      monitor: { sourcemap: rewriter },
      apps: [defineApp('s-app', () => ({ name: 's-app', apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('s-app', 'main')
    await settle()
    const err = new Error('devtools-boom')
    err.stack = 'Error: devtools-boom\n    at r (bundle.min.js:1:9)'
    host.monitor.capture(err, { appId: 's-app', phase: 'runtime' })

    const snapshot = host.devtools.snapshot()
    expect(snapshot.errors[0]?.stack).toContain('src/views/cart.ts')
    expect(snapshot.errors[0]?.message).toBe('devtools-boom')
    expect(snapshot.instances[0]?.instanceId).toBe(inst.instanceId)
  })
})
