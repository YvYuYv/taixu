/**
 * 主缝测试：三层键空间 + 唯一写管线 + 订阅（06 号票）。
 *
 * 主缝 = createCordis({ permissions, apps }) + host.state / 应用 fiber ctx。
 * 语义源：state-sharing.md §三（键空间）、§4.1（写管线+权限）、§4.2（深层代理）、
 * §4.3（watch/ADR-0001）、§4.5（版本）、§五（权限联动）；ADR-0003（禁 isolate）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, type PermissionRule } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

const GRANTS: PermissionRule[] = [
  { appId: 'app-cart', allow: ['state:read:shared:cart', 'state:write:shared:cart', 'state:read:global:user'] },
  { appId: 'app-other', allow: ['state:read:global:user'] },
  { appId: 'watcher-app', allow: ['state:read:shared:cart'] },
]

describe('三层键空间（§三）', () => {
  it('global:/shared: 前缀语义：系统写入、授权应用可读', async () => {
    const host = createCordis({ permissions: GRANTS })
    await settle()
    host.state.set('global:user', { name: 'n' })
    host.state.set('shared:cart', { items: 1 })

    expect(host.state.get('global:user')).toEqual({ name: 'n' })
    expect(host.state.get('shared:cart', { appId: 'app-cart' })).toEqual({ items: 1 })
    expect(host.state.get('global:user', { appId: 'app-other' })).toEqual({ name: 'n' })
  })

  it('local:{appId}: 自动授予 owner、跨应用不可见（键前缀归属校验）', async () => {
    const host = createCordis({})
    await settle()
    host.state.set('local:app-cart:items', [1, 2], { appId: 'app-cart' })
    expect(host.state.get('local:app-cart:items', { appId: 'app-cart' })).toEqual([1, 2])

    // 跨应用读：deny-by-default（无授权规则）
    expect(() => host.state.get('local:app-cart:items', { appId: 'app-other' })).toThrow()
    // 跨应用写：归属校验拒绝（键前缀 local:B: 但调用方是 A）
    expect(() => host.state.set('local:app-cart:items', [3], { appId: 'app-other' })).toThrow(/local/)
  })
})

describe('唯一写入管线（§4.1/§4.5）', () => {
  it('权限校验 -> 版本推进 -> 单次通知：载荷携带 key/old/version/source', async () => {
    const host = createCordis({ permissions: GRANTS })
    await settle()
    const events: Array<{ key: string; old: unknown; version: number; source: string }> = []
    host.on('state/changed', (e) => events.push({ key: e.key, old: e.old, version: e.version, source: e.source }), { global: true })

    const v1 = host.state.set('shared:cart', { items: 1 }, { appId: 'app-cart' })
    const v2 = host.state.set('shared:cart', { items: 2 }, { appId: 'app-cart' })
    expect(v1).toBe(1)
    expect(v2).toBe(2) // 版本推进
    expect(events).toHaveLength(2) // 每次写恰好一次通知
    expect(events[0]).toMatchObject({ key: 'shared:cart', old: undefined, version: 1, source: 'app-cart' })
    expect(events[1]).toMatchObject({ key: 'shared:cart', old: { items: 1 }, version: 2 })
  })

  it('deny-by-default：无授权写/读均拒绝 + security/violation 上报', async () => {
    const host = createCordis({ permissions: GRANTS })
    await settle()
    const violations: string[] = []
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    expect(() => host.state.set('shared:cart', {}, { appId: 'app-other' })).toThrow()
    expect(() => host.state.get('shared:cart', { appId: 'app-other' })).toThrow()
    expect(violations).toContain('state-write')
  })

  it('深层路径授权一体匹配：write:shared:cart 覆盖 cart.items（点分/通配）', async () => {
    const grants: PermissionRule[] = [
      { appId: 'app-cart', allow: ['state:read:shared:cart', 'state:write:shared:cart.*'] },
    ]
    const host = createCordis({ permissions: grants })
    await settle()
    host.state.set('shared:cart', { items: [] })
    // 深层经代理写入（path = shared:cart.items）被通配授权覆盖
    host.state.setDeep('shared:cart', 'shared:cart.items', [7], { appId: 'app-cart' })
    expect((host.state.get('shared:cart') as { items: number[] }).items).toEqual([7])
  })
})

describe('订阅（§4.3，ADR-0001）', () => {
  it('watch：首跑送当前值 + 键过滤 + 事件变更通知', async () => {
    const host = createCordis({ permissions: GRANTS })
    await settle()
    host.state.set('shared:cart', { items: 0 })
    host.state.set('shared:other', 1)

    const seen: Array<{ items: number } | unknown> = []
    host.state.watch(host, 'shared:cart', (v) => seen.push(v))
    expect(seen).toEqual([{ items: 0 }]) // 首跑同步

    host.state.set('shared:other', 2) // 键过滤：不通知
    host.state.set('shared:cart', { items: 5 }, { appId: 'app-cart' })
    expect(seen).toEqual([{ items: 0 }, { items: 5 }])
  })

  it('dispose 自动退订：应用 fiber 销毁后回调不再触发', async () => {
    const hits = { count: 0 } // 模块级观察桶（经探针应用闭包回报，主缝断言外部行为）
    const host = createCordis({
      permissions: GRANTS,
      apps: [defineApp('watcher-app', () => ({
        name: 'watcher-app',
        inject: ['state'],
        apply(ctx: import('cordis').Context) {
          ctx.state.watch(ctx, 'shared:cart', () => {
            hits.count++
          })
        },
      }))],
    })
    await settle()
    const instance = await host.lifecycle.mount('watcher-app', 'main')
    await settle()

    host.state.set('shared:cart', { items: 1 }, { appId: 'app-cart' })
    await settle()
    expect(hits.count).toBe(2) // 首跑（当前值 undefined）+ 变更事件各一次

    await host.lifecycle.destroy(instance.instanceId, 'test')
    host.state.set('shared:cart', { items: 2 }, { appId: 'app-cart' })
    await settle()
    expect(hits.count).toBe(2) // dispose 后不再收
  })
})

describe('local: 使用条款（ADR-0029/0034/0044）', () => {
  it('值必须 JSON 可序列化：函数/DOM 引用写入即拒', async () => {
    const host = createCordis({})
    await settle()
    expect(() => host.state.set('local:a:x', () => {}, { appId: 'a' })).toThrow(/serializable/)
    expect(() => host.state.set('local:a:x', document.body, { appId: 'a' })).toThrow(/serializable/)
  })

  it('敏感键名拒绝（token/密码/PII）：写入时校验并上报', async () => {
    const host = createCordis({})
    await settle()
    const violations: string[] = []
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })
    expect(() => host.state.set('local:a:token', 'x', { appId: 'a' })).toThrow(/sensitive/)
    expect(() => host.state.set('local:a:userPassword', 'x', { appId: 'a' })).toThrow(/sensitive/)
    expect(violations).toContain('state-sensitive-key')
  })

  it('应用 dispose：local 键空间整体回收（§三按归属批量删除）', async () => {
    const host = createCordis({})
    await settle()
    host.state.set('local:app-x:data', { v: 1 }, { appId: 'app-x' })
    host.state.set('local:app-y:data', { v: 2 }, { appId: 'app-y' })
    expect(host.state.get('local:app-x:data')).toEqual({ v: 1 })

    host.emit('app/disposed', { appId: 'app-x', instanceId: 'app-x:i1' })
    expect(host.state.get('local:app-x:data')).toBeUndefined() // 归属键空间回收
    expect(host.state.get('local:app-y:data')).toEqual({ v: 2 }) // 他人键空间不受影响
  })
})

describe('深层响应式代理（§4.2）', () => {
  it('身份稳定：同一路径多次访问同引用（版本内缓存）', async () => {
    const host = createCordis({})
    await settle()
    host.state.set('global:cfg', { ui: { theme: 'dark' }, list: [1] })
    const a = host.state.get('global:cfg')
    const b = host.state.get('global:cfg')
    expect(a).toBe(b) // 根代理同引用
    const cfg = a as { ui: { theme: string } }
    expect(cfg.ui).toBe((b as { ui: { theme: string } }).ui) // 子代理同引用

    host.state.set('global:cfg', { ui: { theme: 'light' }, list: [1] }) // 版本推进 -> 新代理代际
    const c = host.state.get('global:cfg')
    expect(c).not.toBe(a)
  })

  it('深层写入走唯一管线：state/changed 携带 path 与真实 old', async () => {
    const host = createCordis({})
    await settle()
    host.state.set('global:cfg', { ui: { theme: 'dark' } })
    const events: Array<{ path: string; old: unknown }> = []
    host.on('state/changed', (e) => events.push({ path: e.path, old: e.old }), { global: true })

    host.state.setDeep('global:cfg', 'ui.theme', 'light')
    expect((host.state.get('global:cfg') as { ui: { theme: string } }).ui.theme).toBe('light')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ path: 'global:cfg.ui.theme', old: 'dark' })
  })

  it('代理 set trap 不可绕过写管线：未授权应用深层写入即拒', async () => {
    const host = createCordis({ permissions: [{ appId: 'app-r', allow: ['state:read:shared:cfg'] }] })
    await settle()
    host.state.set('shared:cfg', { ui: { theme: 'dark' } })
    // 未授权应用拿到只读代理（读经授权），深层写入走唯一管线 -> deny-by-default
    const cfg = host.state.get('shared:cfg', { appId: 'app-r' }) as { ui: { theme: string } }
    expect(() => {
      cfg.ui.theme = 'light'
    }).toThrow(/denied/)
    // 系统视图未被污染（trap 先管线后本地视图，拒绝即不变更）
    expect((host.state.get('shared:cfg') as { ui: { theme: string } }).ui.theme).toBe('dark')
  })

  it('双向键过滤：watch 子路径观察者收根键提交（根提交整体替换子树）', async () => {
    const host = createCordis({})
    await settle()
    host.state.set('shared:cfg', { ui: { theme: 'dark' } })
    const seen: unknown[] = []
    host.state.watch(host, 'shared:cfg.ui.theme', (v) => seen.push(v))
    expect(seen).toEqual(['dark']) // 首跑（子路径取值）

    host.state.set('shared:cfg', { ui: { theme: 'light' } }) // 根提交
    expect(seen).toEqual(['dark', 'light']) // 子路径观察者刷新
  })
})

describe('挂起感知（ADR-0023；全链在 08/09 验收）', () => {
  it('经 app/suspend/app/resume 事件感知（不 inject lifecycle）：挂起不推送、恢复发 state/sync', async () => {
    const host = createCordis({ permissions: GRANTS })
    await settle()
    host.state.set('shared:cart', { items: 0 })

    const hits: number[] = []
    host.state.watch(host, 'shared:cart', (v) => hits.push((v as { items: number }).items))
    const syncs: Array<Record<string, unknown>> = []
    host.on('state/sync', (e) => syncs.push(e.keys), { global: true })

    // root 层 watch 无 appId 归属，不受挂起影响 -- 用带 appId 的 watch 验证挂起分支
    const appHits: number[] = []
    host.state.watch(host, 'shared:cart', (v) => appHits.push((v as { items: number }).items), { appId: 'app-cart' })
    expect(appHits).toEqual([0]) // 首跑

    host.emit('app/suspend', { instanceId: 'app-cart:i1', reason: 'keepalive' })
    host.state.set('shared:cart', { items: 9 }, { appId: 'app-cart' })
    expect(appHits).toEqual([0]) // 挂起期间不推送（拉模型，ADR-0023）

    host.emit('app/resume', { instanceId: 'app-cart:i1' })
    expect(syncs).toHaveLength(1) // 恢复：按 watch 键集合一次性 state/sync
    expect(syncs[0]).toMatchObject({ 'shared:cart': { value: { items: 9 }, version: 2 } })
    expect(hits.length).toBeGreaterThanOrEqual(1) // root 观察者照常收（不属挂起应用）
  })
})

describe('setIfMatch 乐观并发 + batch 真原子（§4.4/4.5，A9）', () => {
  it('CAS：版本匹配提交；不匹配抛 VERSION_CONFLICT 且值不变；不绕过权限', async () => {
    const host = createCordis({ permissions: GRANTS })
    await settle()
    const v1 = host.state.set('shared:cart', { items: 1 }, { appId: 'app-cart' })
    const v2 = host.state.setIfMatch('shared:cart', v1, { items: 2 }, { appId: 'app-cart' })
    expect(v2).toBe(v1 + 1) // 命中：版本+值原子推进
    expect(() => host.state.setIfMatch('shared:cart', v1, { items: 3 }, { appId: 'app-cart' })).toThrow(/VERSION_CONFLICT/)
    expect(host.state.get('shared:cart', { appId: 'app-cart' })).toEqual({ items: 2 }) // 冲突不动真值
    expect(() => host.state.setIfMatch('shared:cart', v2, {}, { appId: 'app-other' })).toThrow() // 无写权限整批拒绝
  })

  it('batch：副本执行异常零通知；成功逐键恰好一次通知', async () => {
    const hits: string[] = []
    const host = createCordis({ permissions: GRANTS })
    await settle()
    host.state.set('shared:cart', { items: [1] }, { appId: 'app-cart' })
    host.state.set('global:user', { name: 'n' })
    host.on('state/changed', (e) => hits.push(e.key), { global: true })
    hits.length = 0

    // 异常路径：mutator 抛错 -> 真状态与订阅者零感知
    expect(() => host.state.batch(['shared:cart', 'global:user'], (draft) => {
      ;(draft['shared:cart'] as { items: number[] }).items.push(2)
      throw new Error('mutator boom')
    })).toThrow(/mutator boom/) // 系统身份批写（宿主编排）
    expect(hits).toEqual([]) // 零通知
    expect(host.state.get('shared:cart')).toEqual({ items: [1] }) // 真状态未动

    // 成功路径：两键各恰好一次通知
    const out = host.state.batch(['shared:cart', 'global:user'], (draft) => {
      ;(draft['shared:cart'] as { items: number[] }).items.push(3)
      ;(draft['global:user'] as { name: string }).name = 'm'
      return 'done'
    })
    expect(out).toBe('done')
    expect(hits).toEqual(['shared:cart', 'global:user']) // 每键一次
    expect(host.state.get('shared:cart')).toEqual({ items: [1, 3] })
    expect(host.state.get('global:user')).toEqual({ name: 'm' })
  })
})
