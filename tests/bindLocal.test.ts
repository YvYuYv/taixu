/**
 * bindLocal 上提测试（C3.1 落地）
 *
 * - 自写不回调（writing flag 已上提至 state 层）
 * - 外部写（不同 prefix / host system）正常通知
 * - `local:{appId}:` 前缀生效（非 local 键抛错）
 */
import { describe, it, expect } from 'vitest'
import { createCordis, type CreateCordisOptions } from '../src'

describe('bindLocal（state 服务 helper，C3 wiring）', () => {
  async function makeHost(
    permissions: NonNullable<CreateCordisOptions['permissions']>,
    apps?: CreateCordisOptions['apps'],
  ) {
    const host = createCordis({ permissions, apps })
    // 等 Cordis plugin effect 跑完
    await new Promise((r) => setTimeout(r, 0))
    return host
  }

  it('bindLocal：shared: 键也生效（C3.2 调整：去 prefix 限制）', async () => {
    const host = await makeHost([
      { appId: 'app-a', allow: ['state:read:*', 'state:write:shared:cart'] },
    ])
    const events: string[] = []
    host.state.watch(
      host,
      'shared:cart',
      () => events.push('changed'),
      { appId: 'app-a', filterSelfWrite: true },
    )
    const initialLen = events.length
    const local = host.state.bindLocal(host, 'shared:cart', 'app-a')
    local.set({ item: 'apple' }) // 自身写 → 不应触发回调
    expect(events.length).toBe(initialLen)
  })

  it('bindLocal：self-write 不回调（writing flag 上提至 state 层）', async () => {
    const host = await makeHost([
      { appId: 'app-a', allow: ['state:read:*', 'state:write:local:app-a:*'] },
    ])
    const events: string[] = []
    host.state.watch(
      host,
      'local:app-a:cart',
      () => events.push('changed'),
      { appId: 'app-a', filterSelfWrite: true },
    )
    // 首跑送当前值（undefined）已入 events 队列
    const initialLen = events.length
    const local = host.state.bindLocal(host, 'local:app-a:cart', 'app-a')
    local.set({ item: 'apple' }) // 自身写 → 不应触发回调
    expect(events.length).toBe(initialLen) // 长度未增（selfWriting 短路成功）
  })

  it('bindLocal：外部写（同 prefix 不同 key）正常通知', async () => {
    const host = await makeHost([
      { appId: 'app-a', allow: ['state:read:*', 'state:write:local:app-a:*'] },
      { appId: 'app-b', allow: ['state:read:*', 'state:write:local:app-b:*'] },
    ])
    const events: unknown[] = []
    host.state.watch(
      host,
      'local:app-a:cart',
      (v) => events.push(v),
      { appId: 'app-a', filterSelfWrite: true },
    )
    const initialLen = events.length
    host.state.set('local:app-b:cart', { item: 'b-data' }, { appId: 'app-b' })
    expect(events.length).toBe(initialLen)
    host.state.set('local:app-a:cart', { item: 'from-host' })
    expect(events.length).toBe(initialLen + 1)
    expect(events[events.length - 1]).toEqual({ item: 'from-host' })
  })

  it('bindLocal：host/system 写入仍正常通知（host 是"外部"）', async () => {
    const host = await makeHost([
      { appId: 'app-a', allow: ['state:read:*', 'state:write:local:app-a:*'] },
    ])
    const events: unknown[] = []
    host.state.watch(
      host,
      'local:app-a:cart',
      (v) => events.push(v),
      { appId: 'app-a', filterSelfWrite: true },
    )
    const initialLen = events.length
    host.state.set('local:app-a:cart', { item: 'from-host' })
    expect(events.length).toBe(initialLen + 1)
    expect(events[events.length - 1]).toEqual({ item: 'from-host' })
  })

  it('bindLocal.get：返回最新值（含自身写）', async () => {
    const host = await makeHost([
      { appId: 'app-a', allow: ['state:read:*', 'state:write:local:app-a:*'] },
    ])
    const local = host.state.bindLocal(host, 'local:app-a:cart', 'app-a')
    expect(local.get()).toBeUndefined()
    local.set({ item: 'banana' })
    expect(local.get()).toEqual({ item: 'banana' })
  })
})
