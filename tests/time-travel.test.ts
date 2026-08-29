/**
 * 时间旅行（state-sharing §八，F10）：history 环形缓冲（500 条，含 version/source/ts）
 * + travelTo(version)（开发模式限定——默认禁用，生产安全默认）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

describe('时间旅行（F10，state-sharing §八）', () => {
  it('默认禁用：history() 空、travelTo 抛错（生产安全默认，规范"仅开发模式"）', async () => {
    const host = createCordis({ apps: [] })
    await settle()
    host.state.set('global:x', 1)
    expect(host.state.history()).toEqual([]) // 零记账
    expect(() => host.state.travelTo(1)).toThrow(/timeTravel\.enabled/)
  })

  it('启用后：commit 全量入账（version/source/ts/value），history 只读', async () => {
    const host = createCordis({
      state: { timeTravel: { enabled: true } },
      permissions: [{ appId: 'tt-app', allow: ['state:write:shared:k'] }],
      apps: [defineApp('tt-app', () => ({ name: 'tt-app', apply() {} }))],
    })
    await settle()
    const v1 = host.state.set('shared:k', { n: 1 }, { appId: 'tt-app' })
    host.state.set('shared:k', { n: 2 }, { appId: 'tt-app' })

    const history = host.state.history()
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ key: 'shared:k', version: v1, source: 'tt-app', value: { n: 1 } })
    expect(history[0]!.ts).toBeLessThanOrEqual(history[1]!.ts) // 时间序
    history.pop() // 外部改动不污染账本（防御性拷贝）
    expect(host.state.history()).toHaveLength(2)
  })

  it('travelTo：恢复该 version 的值（经同一 commit 管线，回滚本身也入账）', async () => {
    const host = createCordis({
      state: { timeTravel: { enabled: true } },
      permissions: [{ appId: 'tt-app', allow: ['state:write:shared:k', 'state:read:shared:k'] }],
      apps: [defineApp('tt-app', () => ({ name: 'tt-app', apply() {} }))],
    })
    await settle()
    const v1 = host.state.set('shared:k', 'first', { appId: 'tt-app' })
    host.state.set('shared:k', 'second', { appId: 'tt-app' })
    expect(host.state.get('shared:k', { appId: 'tt-app' })).toBe('second')

    const v3 = host.state.travelTo(v1) // 回滚到 first
    expect(v3).toBe(3) // 版本继续原子推进（回滚也是一次提交）
    expect(host.state.get('shared:k', { appId: 'tt-app' })).toBe('first')
    expect(host.state.history()).toHaveLength(3) // 回滚本身入账（可"再旅行回未来"）

    const v4 = host.state.travelTo(2) // 再旅行回 second（v2 的值）
    expect(host.state.get('shared:k', { appId: 'tt-app' })).toBe('second')
    expect(v4).toBe(4)

    expect(() => host.state.travelTo(999)).toThrow(/no history entry/)
  })

  it('环形缓冲：capacity 溢出覆盖最旧（默认 500）', async () => {
    const host = createCordis({
      state: { timeTravel: { enabled: true, capacity: 3 } },
      apps: [],
    })
    await settle()
    for (let i = 1; i <= 5; i++) host.state.set('global:k', i)
    const history = host.state.history()
    expect(history).toHaveLength(3) // 溢出覆盖最旧
    expect(history[0]!.version).toBe(3) // v1/v2 已被覆盖
    expect(history[2]!.value).toBe(5)
  })
})
