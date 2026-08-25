/**
 * 主缝测试：状态框架适配器最小集（state-sharing §六，S2-5）。
 * 适配器只消费写入管线事件（无双通道/无手动 emit）：Vue3 useSharedState（shallowRef）
 * 与 Vue2 defineSharedState（defineProperty 兼容层——写走唯一写管线，读经 watch 闭包回放）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Ref } from 'vue'
import type { Context } from 'cordis'
import { createCordis, defineApp, useSharedState, defineSharedState } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

describe('状态适配器（§六）', () => {
  it('Vue3 useSharedState：shallowRef 外部变更自动同步；set 走唯一写管线（appId 归因）', async () => {
    const refs: Ref<{ theme: string }>[] = []
    let setter: ((v: { theme: string }) => void) | null = null
    const host = createCordis({
      permissions: [
        { appId: 'v3-app', allow: ['state:read:shared:theme', 'state:write:shared:theme'] },
      ],
      apps: [
        defineApp('v3-app', () => ({
          name: 'v3-app',
          inject: ['state'],
          apply(ctx: Context) {
            const { state, set } = useSharedState<{ theme: string }>(ctx, 'shared:theme', 'v3-app')
            refs.push(state)
            setter = set
          },
        })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('v3-app', 'main')
    await settle()

    expect(refs[0]!.value).toBeUndefined() // 未初始化键（首跑送当前值）

    host.state.set('shared:theme', { theme: 'dark' }) // 外部（root）写入
    await settle()
    expect(refs[0]!.value).toEqual({ theme: 'dark' }) // shallowRef 经 watch 自动同步

    setter!({ theme: 'light' }) // 应用侧 set
    expect(host.state.get('shared:theme')).toEqual({ theme: 'light' }) // 走唯一写管线

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('Vue2 defineSharedState：defineProperty 盒子写走唯一写管线；外部变更经 watch 回放；onExternalChange 通知', async () => {
    const boxes: { current: { count: number } }[] = []
    let notified = 0
    const host = createCordis({
      permissions: [
        { appId: 'v2-app', allow: ['state:read:shared:count', 'state:write:shared:count'] },
      ],
      apps: [
        defineApp('v2-app', () => ({
          name: 'v2-app',
          inject: ['state'],
          apply(ctx: Context) {
            boxes.push(defineSharedState<{ count: number }>(ctx, 'shared:count', 'v2-app', () => notified++))
          },
        })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('v2-app', 'main')
    await settle()

    // 属性为访问器（Vue2 defineReactive 可在既有 getter/setter 上挂 dep——兼容层前提）
    const desc = Object.getOwnPropertyDescriptor(boxes[0], 'current')!
    expect(desc.get).toBeInstanceOf(Function)
    expect(desc.set).toBeInstanceOf(Function)

    host.state.set('shared:count', { count: 1 })
    await settle()
    expect(boxes[0]!.current).toEqual({ count: 1 }) // 外部变更回放
    expect(notified).toBe(1) // dep.notify 桥（应用侧 Vue2 重渲染钩子）

    boxes[0]!.current = { count: 5 } // 应用侧写
    expect(host.state.get('shared:count')).toEqual({ count: 5 }) // 走唯一写管线
    expect(notified).toBe(1) // 自身写不回调 onChange（Vue2 setter dep 已覆盖重渲染）

    await host.lifecycle.destroy(inst.instanceId, 't')
  })
})
