/**
 * 主缝测试：保活三模式（§5.3）+ state.snapshot(scopeKeys)（A2/A8）。
 * dom = 默认挂起（08 号票已验收）；state = 销毁 DOM 留状态快照；memory = 全销毁仅留模块缓存。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'

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

/** 读写自身 local 键的应用（返回 Cordis 插件） */
function localReader(appId: string, read: Array<[string, unknown]>) {
  return {
    name: appId,
    inject: ['state'],
    apply(ctx: Context) {
      for (const row of read) row[1] = ctx.state.get(row[0], { appId })
    },
  }
}

describe('保活三模式（lifecycle §5.3）', () => {
  it("state 模式：切换销毁 DOM 留快照；切回重挂载注水暖启动（新 instanceId）", async () => {
    const reads: Array<[string, unknown]> = [['local:s-app:form', undefined]]
    const host = createCordis({
      apps: [
        defineApp('s-app', () => localReader('s-app', reads), { keepAlive: 'state' }),
        defineApp('other', () => ({ name: 'other', apply() {} })),
      ],
    })
    await settle()
    host.state.set('local:s-app:form', { draft: '半填的表单' })

    const first = await host.lifecycle.switch('main', 's-app')
    const second = await host.lifecycle.switch('main', 'other')
    await settle()
    expect(host.lifecycle.getAppState(first.instanceId)).toBe('disposed') // state 模式 = 销毁（非挂起）
    expect(sessionStorage.getItem('__tx_snapshot:s-app')).toBeTruthy() // 状态快照入池

    const back = await host.lifecycle.switch('main', 's-app') // 切回：重挂载（fiber 已销毁）
    await settle()
    expect(back.instanceId).not.toBe(first.instanceId) // 新实例（旧 fiber 不可复活）
    expect(reads[0]![1]).toEqual({ draft: '半填的表单' }) // 注水暖启动
    void second
  })

  it("memory 模式：切换销毁 DOM 与状态（无快照）；切回冷启动", async () => {
    const reads: Array<[string, unknown]> = [['local:m-app:data', undefined]]
    const host = createCordis({
      apps: [
        defineApp('m-app', () => localReader('m-app', reads), { keepAlive: 'memory' }),
        defineApp('other', () => ({ name: 'other', apply() {} })),
      ],
    })
    await settle()
    host.state.set('local:m-app:data', { x: 1 })
    const first = await host.lifecycle.switch('main', 'm-app')
    await host.lifecycle.switch('main', 'other')
    await settle()
    expect(host.lifecycle.getAppState(first.instanceId)).toBe('disposed')
    expect(sessionStorage.getItem('__tx_snapshot:m-app')).toBeNull() // 不留快照（状态一并销毁）

    await host.lifecycle.switch('main', 'm-app')
    await settle()
    expect(reads[0]![1]).toBeUndefined() // 冷启动（模块缓存保留 = 宿主入口工厂，P0 直载天然存在）
  })
})

describe('state.snapshot(scopeKeys)（A8）', () => {
  it('按键集合快照返回 {value, version}；未存储键如实缺失（version 0）', async () => {
    const host = createCordis({ apps: [defineApp('k-app', () => ({ name: 'k-app', apply() {} }))] })
    await settle()
    host.state.set('shared:cfg', { theme: 'dark' }) // v1
    host.state.set('shared:cfg', { theme: 'light' }) // v2
    const snap = host.state.snapshot(['shared:cfg', 'shared:absent'])
    expect(snap['shared:cfg']).toEqual({ value: { theme: 'light' }, version: 2 })
    expect(snap['shared:absent']).toEqual({ value: undefined, version: 0 })
  })
})
