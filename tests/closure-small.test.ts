/**
 * 主缝测试：P0 收口后小项补完——A1 keepAlive:false / A3 快照池跨会话账本 / A7 深链启动挂载。
 * 语义源：cordis-alignment §2.6（ADR-0020 keepAlive:false）、lifecycle §5.5（ADR-0052 池预算）、
 * route-adaptation §三（深链直达挂载侧）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp } from '../src'
import { compressToUTF16 } from 'lz-string'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  document.body.textContent = ''
  sessionStorage.clear()
})

describe('A1: keepAlive:false 显式销毁（ADR-0020）', () => {
  it('声明的应用切换时直接 dispose（不进保活池）；未声明仍默认挂起', async () => {
    const events: string[] = []
    const host = createCordis({
      apps: [
        defineApp('ephemeral', () => ({ name: 'ephemeral', apply() {} }), { keepAlive: false }),
        defineApp('sticky', () => ({ name: 'sticky', apply() {} })),
        defineApp('next-app', () => ({ name: 'next-app', apply() {} })),
      ],
    })
    await settle()
    host.on('app/suspend', (e) => events.push(`suspend:${e.instanceId.slice(0, 1)}`), { global: true })
    host.on('app/disposed', (e) => events.push(`disposed:${e.appId}`), { global: true })

    await host.lifecycle.switch('main', 'ephemeral')
    await host.lifecycle.switch('main', 'next-app') // ephemeral 声明 keepAlive:false -> 销毁
    expect(host.lifecycle.getInstances().map((i) => i.appId)).toEqual(['next-app'])
    expect(events).toEqual(['disposed:ephemeral']) // 无 suspend（未进保活池）

    await host.lifecycle.switch('o1', 'sticky')
    await host.lifecycle.switch('o1', 'next-app') // 未声明 -> 默认挂起
    expect(host.lifecycle.getAppState(host.lifecycle.getInstances().find((i) => i.appId === 'sticky')!.instanceId)).toBe('suspended')
  })
})

describe('A3: 快照池跨会话账本（ADR-0052）', () => {
  it('上一会话残留快照入账（at=0 最旧）；新快照超预算时优先回收残留', async () => {
    // 模拟上一会话残留（未经本会话 lifecycle 写入）
    const stale = compressToUTF16(JSON.stringify({ version: 0, data: { 'local:old:x': Array.from({ length: 40 }, (_, i) => `old-item-${i}-payload`) } }))
    sessionStorage.setItem('__tx_snapshot:old', stale)

    const host = createCordis({
      keepAlive: { maxCount: 1, snapshotPoolBytes: 350 }, // 容一条不放两条（fresh=330 old=300）
      apps: [defineApp('fresh', () => ({ name: 'fresh', apply() {} })), defineApp('other', () => ({ name: 'other', apply() {} }))],
    })
    await settle()
    host.state.set('local:fresh:items', { big: Array.from({ length: 40 }, (_, i) => `fresh-item-${i}-payload`) })

    const ia = await host.lifecycle.mount('fresh', 'main')
    const ib = await host.lifecycle.mount('other', 'o1')
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'keepalive', 'route') // 池 1（满）
    await host.lifecycle.requestSuspend(host, ib.instanceId, 'keepalive', 'route') // 驱逐 fresh + 快照入池
    await settle()
    await new Promise((r) => setTimeout(r, 20))

    expect(sessionStorage.getItem('__tx_snapshot:fresh')).toBeTruthy() // 本会话快照保留
    expect(sessionStorage.getItem('__tx_snapshot:old')).toBeNull() // 残留（at=0 最旧）优先回收
  })
})

describe('A7: 深链启动挂载（route-adaptation §三）', () => {
  it('冷启动按 URL 矩阵对已匹配槽位派发挂载意图（同一 onResolve 回调，无第二套机制）', async () => {
    window.history.replaceState(null, '', '/deep/page?tab=1')
    const intents: Array<{ appId: string; outlet: string; path: string }> = []
    const host = createCordis({
      routes: [
        { basePath: '/deep', appId: 'deep-app' },
        { basePath: '/side', appId: 'side-app' },
      ],
      onResolve: (intent) => intents.push(intent),
      apps: [defineApp('deep-app', () => ({ name: 'deep-app', apply() {} }))],
    })
    await settle()
    // pathname 深链命中 main 槽位（段边界匹配：/deep/page 命中 /deep）
    expect(intents).toContainEqual({ appId: 'deep-app', outlet: 'main', path: '/deep/page' })
    // 无其他通道槽位 -> 只有一条意图
    expect(intents).toHaveLength(1)
    void host
  })

  it('无 onResolve 接线时深链解析静默跳过（读侧矩阵仍就位）', async () => {
    window.history.replaceState(null, '', '/x')
    const host = createCordis({ routes: [{ basePath: '/x', appId: 'x-app' }] })
    await settle()
    expect(host.router.current('main').path).toBe('/x')
  })
})
