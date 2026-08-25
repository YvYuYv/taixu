/**
 * 主缝测试：state 持久化（§7.1）+ 跨 tab 同步（§7.2，B-状态）。
 * jsdom 无 BroadcastChannel——经配置注入内存总线（config-injection 验证原则）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, type CrossTabChannel } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

/** 内存总线：多 host 共享的跨 tab 通道替身 */
function memoryBus(): { bus: CrossTabChannel; deliver: () => void } {
  const listeners = new Set<(m: unknown) => void>()
  const pending: unknown[] = []
  return {
    bus: {
      post: (m) => pending.push(m),
      subscribe: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
    deliver: () => {
      while (pending.length) {
        const m = pending.shift()!
        for (const fn of [...listeners]) fn(m)
      }
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  document.body.textContent = ''
})

describe('持久化（§7.1）', () => {
  it('防抖批量落盘：命中键模式且非敏感；敏感键永不持久化', async () => {
    const host = createCordis({
      state: { persist: { keys: ['shared:*'], debounceMs: 5 } },
      apps: [defineApp('p1', () => ({ name: 'p1', apply() {} }))],
    })
    await settle()
    host.state.set('shared:cfg', { theme: 'dark' })
    host.state.set('shared:userToken', 'SECRET') // 敏感（token 子串）——即使命中 shared:* 也排除
    host.state.set('global:x', 1) // 不在持久化模式
    await new Promise((r) => setTimeout(r, 30)) // 防抖窗口

    const raw = localStorage.getItem('cordis-state:v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { schema: number; data: Record<string, unknown> }
    expect(parsed.schema).toBe(1)
    expect(parsed.data['shared:cfg']).toEqual({ theme: 'dark' })
    expect(parsed.data['shared:userToken']).toBeUndefined() // 敏感排除
    expect(parsed.data['global:x']).toBeUndefined()
  })

  it('恢复静默（不触发 state/changed）；watch 首跑取值；schema 漂移无 migrate 丢弃+上报', async () => {
    const reports: string[] = []
    localStorage.setItem('cordis-state:v1', JSON.stringify({
      schema: 1, savedAt: Date.now(), data: { 'shared:cfg': { theme: 'light' } }, versions: { 'shared:cfg': 7 },
    }))
    const host = createCordis({
      state: { persist: { keys: ['shared:*'], debounceMs: 99999 } },
      apps: [defineApp('p2', () => ({ name: 'p2', apply() {} }))],
    })
    await settle()
    const changed: string[] = []
    host.on('state/changed', (e) => changed.push(e.key), { global: true })
    expect(host.state.get('shared:cfg')).toEqual({ theme: 'light' }) // 静默恢复（版本保留）
    expect(changed).toEqual([]) // 恢复不触发 state/changed（订阅者经 watch 首跑取值）
    let seen = 0
    host.state.watch(host, 'shared:cfg', () => { seen++ })
    expect(seen).toBe(1) // watch 首跑取到恢复值

    // schema 漂移：v2 存储键内是 schema:1 数据，无 migrate -> 丢弃 + 上报
    localStorage.setItem('cordis-state:v2', JSON.stringify({
      schema: 1, savedAt: Date.now(), data: { 'shared:cfg': { theme: 'light' } },
    }))
    const host2Reports: string[] = []
    const host2 = createCordis({
      state: { persist: { keys: ['shared:*'], schemaVersion: 2 } },
      apps: [defineApp('p3', () => ({ name: 'p3', apply() {} }))],
    })
    host2.on('monitor/report', (e) => host2Reports.push(e.metric.message), { global: true })
    await settle()
    expect(host2.state.get('shared:cfg')).toBeUndefined() // 丢弃
    expect(host2Reports.some((m) => m.includes('schema 漂移丢弃'))).toBe(true)
    void reports
  })

  it('schema 迁移链：migrate 纯函数升级旧数据后恢复', async () => {
    localStorage.setItem('cordis-state:v2', JSON.stringify({
      schema: 1, savedAt: Date.now(), data: { 'shared:old': 'v1-shape' },
    }))
    const host = createCordis({
      state: {
        persist: {
          keys: ['shared:*'], schemaVersion: 2,
          migrate: (data, from) => ({ ...data, 'shared:migrated': `from-v${from}` }),
        },
      },
      apps: [defineApp('p4', () => ({ name: 'p4', apply() {} }))],
    })
    await settle()
    expect(host.state.get('shared:old')).toBe('v1-shape') // 原数据保留
    expect(host.state.get('shared:migrated')).toBe('from-v1') // 迁移产物
  })
})

describe('跨 tab 同步（§7.2）', () => {
  it('本地提交广播；远端应用通知订阅者（不 setSilent）；回声过滤；版本仲裁丢旧消息；敏感键不同步', async () => {
    const { bus, deliver } = memoryBus()
    const mk = async () => {
      const host = createCordis({
        state: { crossTab: { channel: bus } },
        apps: [defineApp('ct', () => ({ name: 'ct', apply() {} }))],
      })
      await settle()
      return host
    }
    const a = await mk()
    const b = await mk()

    const bChanged: Array<{ key: string; source: string }> = []
    b.on('state/changed', (e) => bChanged.push({ key: e.key, source: e.source }), { global: true })

    // A 提交 -> 广播 -> B 应用并通知订阅者
    a.state.set('shared:cfg', { v: 1 }) // A 本地 v1
    deliver()
    expect(b.state.get('shared:cfg')).toEqual({ v: 1 })
    expect(bChanged).toEqual([{ key: 'shared:cfg', source: expect.stringMatching(/^tab:/) }]) // 远端变更可见（修复失明）

    // 回声过滤：B 收到自己的消息不再应用（版本不二跳）
    b.state.set('shared:cfg', { v: 2 }) // B v2 -> 广播
    deliver()
    expect(a.state.get('shared:cfg')).toEqual({ v: 2 }) // A 应用
    deliver() // 任何残留回声
    expect(b.state.snapshot(['shared:cfg'])['shared:cfg']!.version).toBe(2) // 版本无二跳

    // 版本仲裁：旧消息丢弃
    ;(a.state as unknown as { onRemoteMessage: (m: unknown) => void }).onRemoteMessage({
      key: 'shared:cfg', value: { stale: true }, version: 1, source: 'other-tab', schema: 1,
    })
    expect(a.state.get('shared:cfg')).toEqual({ v: 2 })

    // 敏感键不同步
    a.state.set('shared:apiToken', 'x')
    deliver()
    expect(b.state.get('shared:apiToken')).toBeUndefined()
  })
})
