/**
 * 主缝测试：驱逐与暖启动（10 号票）。
 *
 * 主缝 = createCordis({ keepAlive, apps, permissions }) + lifecycle + state + 事件探针。
 * 语义源：lifecycle-management.md §5.4（LRU/水位/候选序，ADR-0019/0026/0031/0057）、
 * §5.5（快照注水，ADR-0029/0034/0044/0052）、state-sharing §三（local: 使用条款）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SNAP_KEY = (appId: string) => `__tx_snapshot:${appId}`

beforeEach(() => {
  document.body.textContent = ''
  sessionStorage.clear()
})

afterEach(() => {
  delete (performance as unknown as Record<string, unknown>).memory
})

/** 读写自身 local 键的应用（暖启动断言用） */
function localApp(appId: string, reads: Array<[string, unknown]> = []) {
  return defineApp(appId, () => ({
    name: appId,
    inject: ['state'],
    apply(ctx: Context) {
      for (const [key] of reads) {
        reads.find(([k]) => k === key)![1] = ctx.state.get(key, { appId })
      }
    },
  }))
}

describe('LRU 驱逐（§5.4，ADR-0019）', () => {
  it('保活池超上限驱逐最久未用；快照落 sessionStorage；app/evicted 派发', async () => {
    const evicted: string[] = []
    const host = createCordis({
      keepAlive: { maxCount: 2 },
      apps: [localApp('a'), localApp('b'), localApp('c')],
    })
    await settle()
    host.on('app/evicted', (e) => evicted.push(e.appId), { global: true })
    host.state.set('local:a:items', { cart: [1, 2] })

    const ia = await host.lifecycle.mount('a', 'main')
    const ib = await host.lifecycle.mount('b', 'o1')
    const ic = await host.lifecycle.mount('c', 'o2')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route') // 池 1
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route') // 池 2（满）
    await host.lifecycle.requestSuspend(host, ic.instanceId, 'keepalive', 'route') // 池 3 > 2
    await settle()
    await sleep(20) // 驱逐决策经 idle 回调（§5.4）

    expect(evicted).toEqual(['a']) // 最久未用（LRU 键 = lastAccessAt，挂起触点）
    expect(host.lifecycle.getInstances().map((i) => i.appId).sort()).toEqual(['b', 'c'])
    expect(sessionStorage.getItem(SNAP_KEY('a'))).toBeTruthy() // 快照已落池
    const snap = JSON.parse(decompressFromUTF16(sessionStorage.getItem(SNAP_KEY('a'))!)!)
    expect(snap.data['local:a:items']).toEqual({ cart: [1, 2] })
  })

  it('快照仅 local: 层（global/shared 不入快照，ADR-0044 隐私边界）', async () => {
    const host = createCordis({
      keepAlive: { maxCount: 1 },
      apps: [localApp('a'), localApp('b')],
    })
    await settle()
    host.state.set('local:a:profile', { x: 1 })
    host.state.set('shared:cfg', { theme: 'dark' }) // 不入快照
    host.state.set('global:user', { name: 'n' }) // 不入快照

    const ia = await host.lifecycle.mount('a', 'main')
    const ib = await host.lifecycle.mount('b', 'o1')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route')
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route') // 超限驱逐 a
    await settle()
    await sleep(20)

    const snap = JSON.parse(decompressFromUTF16(sessionStorage.getItem(SNAP_KEY('a'))!)!)
    expect(Object.keys(snap.data)).toEqual(['local:a:profile']) // 仅 local 层
  })

  it('快照池超上限按 LRU 回收最旧快照（快照丢失仅降级冷启动，ADR-0052）', async () => {
    const host = createCordis({
      keepAlive: { maxCount: 1, snapshotPoolBytes: 120 }, // 极小池：两条快照即超限
      apps: [localApp('a'), localApp('b'), localApp('c')],
    })
    await settle()
    host.state.set('local:a:items', { big: 'x'.repeat(40) })
    host.state.set('local:b:items', { big: 'y'.repeat(40) })

    const ia = await host.lifecycle.mount('a', 'main')
    const ib = await host.lifecycle.mount('b', 'o1')
    const ic = await host.lifecycle.mount('c', 'o2')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route')
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route') // 驱逐 a + 快照
    await settle()
    await sleep(20)
    expect(sessionStorage.getItem(SNAP_KEY('a'))).toBeTruthy()

    await host.lifecycle.requestSuspend(host, ic.instanceId, 'keepalive', 'route') // 驱逐 b + 快照超池
    await settle()
    await sleep(20)
    expect(sessionStorage.getItem(SNAP_KEY('b'))).toBeTruthy() // 最新保留
    expect(sessionStorage.getItem(SNAP_KEY('a'))).toBeNull() // 最旧快照被回收
    void ic
  })
})

describe('暖启动注水（§5.5，ADR-0029/0034）', () => {
  it('重挂载 pre-plugin() 注水：apply 时 local 键已就位', async () => {
    const reads: Array<[string, unknown]> = [['local:a:count', undefined]]
    const host = createCordis({
      keepAlive: { maxCount: 1 },
      apps: [localApp('a', reads), localApp('b')],
    })
    await settle()
    host.state.set('local:a:count', 5)

    const ia = await host.lifecycle.mount('a', 'main')
    const ib = await host.lifecycle.mount('b', 'o1')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route')
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route') // 驱逐 a
    await settle()
    await sleep(20)
    expect(host.lifecycle.getInstances().map((i) => i.appId)).toEqual(['b'])

    reads[0]![1] = undefined
    await host.lifecycle.mount('a', 'main') // 重挂载：注水后 apply
    await settle()
    expect(reads[0]![1]).toBe(5) // 暖启动：local 状态仍在（pre-plugin 注水）
  })

  it('版本漂移：无 migrate 则丢弃快照冷启动 + monitor 上报', async () => {
    const reports: string[] = []
    const reads: Array<[string, unknown]> = [['local:a:x', undefined]]
    const host = createCordis({
      apps: [localApp('a', reads)],
    })
    await settle()
    host.on('monitor/report', (e) => reports.push(e.metric.message), { global: true })
    // 预置版本不匹配的快照（模拟应用升级后旧快照残留）
    sessionStorage.setItem(SNAP_KEY('a'), compressToUTF16(JSON.stringify({ version: 999, data: { 'local:a:x': 1 } })))

    await host.lifecycle.mount('a', 'main')
    await settle()
    expect(reads[0]![1]).toBeUndefined() // 丢弃冷启动
    expect(reports.some((m) => m.includes('快照版本漂移'))).toBe(true)
  })

  it('版本迁移：manifest 声明 migrate 纯函数迁移后注水（ADR-0034）', async () => {
    const reads: Array<[string, unknown]> = [['local:a:x', undefined], ['local:a:new', undefined]]
    const host = createCordis({
      apps: [
        defineApp('a', () => ({
          name: 'a',
          inject: ['state'],
          apply(ctx: Context) {
            for (const row of reads) row[1] = ctx.state.get(row[0], { appId: 'a' })
          },
        }), { version: 2, migrate: (data) => ({ ...data, 'local:a:new': 'migrated' }) }),
      ],
    })
    await settle()
    // 预置 v1 快照
    sessionStorage.setItem(SNAP_KEY('a'), compressToUTF16(JSON.stringify({ version: 1, data: { 'local:a:x': 'old' } })))

    await host.lifecycle.mount('a', 'main')
    await settle()
    expect(reads).toEqual([['local:a:x', 'old'], ['local:a:new', 'migrated']]) // 迁移后注水
  })
})

describe('水位驱逐（§5.4，ADR-0026/0057）', () => {
  it('压力超阈值驱逐挂起应用（操作触发检查 + monitor 上报内存压力）', async () => {
    const evicted: string[] = []
    const reports: string[] = []
    const host = createCordis({
      keepAlive: { maxCount: 10 },
      apps: [localApp('a'), localApp('b')],
    })
    await settle()
    host.on('app/evicted', (e) => evicted.push(e.appId), { global: true })
    host.on('monitor/report', (e) => reports.push(e.metric.message), { global: true })

    const ia = await host.lifecycle.mount('a', 'main')
    const ib = await host.lifecycle.mount('b', 'o1')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route')
    await settle()
    await sleep(20)
    expect(evicted).toEqual([]) // 无压力 API（jsdom 未桩）不启用水位

    // 拉高压力（Chromium memory API 桩：used/limit = 0.95 > 0.85）后经挂起操作触发检查
    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 95, jsHeapSizeLimit: 100 },
      configurable: true,
    })
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route')
    await settle()
    await sleep(20)
    expect(evicted).toEqual(['a']) // 压力候选序：挂起最久者先驱逐
    expect(reports.some((m) => m.includes('内存压力'))).toBe(true)
  })

  it('压力候选序按挂起时长（非 lastAccessAt）：久挂者先驱逐（ADR-0031 候选清单）', async () => {
    const evicted: string[] = []
    const host = createCordis({
      keepAlive: { maxCount: 10 },
      apps: [localApp('a'), localApp('b'), localApp('c')],
    })
    await settle()
    host.on('app/evicted', (e) => evicted.push(e.appId), { global: true })

    const ia = await host.lifecycle.mount('a', 'main')
    const ib = await host.lifecycle.mount('b', 'o1')
    await host.lifecycle.mount('c', 'o2')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route')
    await sleep(30) // a 挂起更久
    // b 后挂起但被消息触达（lastAccessAt 更新）——候选序仍应先驱逐 a
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route')
    host.bus.send(host, { type: 'evt:x', payload: 'touch', target: 'b' })
    await settle()
    expect(evicted).toEqual([]) // 无压力不驱逐

    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 90, jsHeapSizeLimit: 100 },
      configurable: true,
    })
    // 触发压力检查（挂起 c）+ 回落压力（真实世界：驱逐释放内存后水位回落）
    const ic = host.lifecycle.getInstances().find((i) => i.appId === 'c')!
    await host.lifecycle.requestSuspend(host, ic.instanceId, 'keepalive', 'route')
    await settle()
    await sleep(20)
    expect(evicted).toEqual(['a']) // 挂起时长优先（候选序 ≠ LRU 键）
  })
})
