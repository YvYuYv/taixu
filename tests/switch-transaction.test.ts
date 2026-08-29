/**
 * 主缝测试：切换事务（lifecycle-management §3.3，F11）+ reveal 面。
 *
 * §3.3 要解决的是「卸 A 挂 B，B 失败页面悬空」与切换期间的闪烁/中间态：
 * 目标应用先 `mountHidden` 挂隐藏容器 -> 挂载成功后才让位当前应用 -> 末步 `reveal`。
 *
 * 顺带补 lifecycle 的测试盲区（此前 lifecycle 无同名 test，仅经其他 test 间接覆盖）。
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
  document.body.textContent = ''
})

/** 取容器宿主（shadow 应用 = shadowRoot.host；普通应用 = 容器本身） */
function hostOf(container: HTMLElement): HTMLElement {
  const root = container.getRootNode()
  return root instanceof ShadowRoot ? (root.host as HTMLElement) : container
}

describe('切换事务（F11，lifecycle §3.3）', () => {
  it('目标先隐藏挂载：apply 期间容器不可见，收尾 reveal 显示（无闪烁中间态）', async () => {
    const displayDuringApply: string[] = []
    let hostRef: ReturnType<typeof createCordis> | null = null
    const host = createCordis({
      apps: [
        defineApp('cur-app', () => ({ name: 'cur-app', apply() {} })),
        defineApp('next-app', () => ({
          name: 'next-app',
          apply(ctx: Context) {
            const container = hostRef!.lifecycle.containerOf(ctx)
            displayDuringApply.push(container ? hostOf(container).style.display : 'missing')
          },
        })),
      ],
    })
    hostRef = host
    await settle()
    await host.lifecycle.mount('cur-app', 'main')

    const next = await host.lifecycle.switch('main', 'next-app')
    expect(displayDuringApply).toEqual(['none']) // 挂载期间隐藏（mountHidden）
    expect(hostOf(next.container).style.display).toBe('') // 收尾已 reveal（置空交还宿主 CSS）
    expect(hostOf(next.container).dataset.txMountHidden).toBeUndefined() // 标记已清
  })

  it('目标挂载失败：当前应用留在原位（不留悬空窗口），错误上抛', async () => {
    const host = createCordis({
      recovery: { maxRetries: 0, backoffMs: 0 }, // 关重试退避：本例只关心失败后当前应用是否留位
      apps: [
        defineApp('cur-app', () => ({ name: 'cur-app', apply() {} })),
        defineApp('bad-app', () => ({
          name: 'bad-app',
          apply() {
            throw new Error('activate failed')
          },
        })),
      ],
    })
    await settle()
    await host.lifecycle.mount('cur-app', 'main')

    await expect(host.lifecycle.switch('main', 'bad-app')).rejects.toThrow()
    const current = host.lifecycle.getInstances().find((i) => i.appId === 'cur-app')
    expect(current).toBeTruthy()
    expect(current!.suspendSources.size).toBe(0) // 未被让位（仍在原位，页面不空白）
  })

  it('成功路径收尾 reveal；重复 reveal 幂等（不抛、不改写宿主样式）', async () => {
    const host = createCordis({
      apps: [
        defineApp('cur-app', () => ({ name: 'cur-app', apply() {} })),
        defineApp('next-app', () => ({ name: 'next-app', apply() {} })),
      ],
    })
    await settle()
    await host.lifecycle.mount('cur-app', 'main')
    const next = await host.lifecycle.switch('main', 'next-app')
    expect(hostOf(next.container).style.display).toBe('')
    // 重复 reveal 幂等（不抛、不改写宿主样式）
    expect(host.lifecycle.reveal(next.instanceId)).toBe(true)
    expect(hostOf(next.container).style.display).toBe('')
  })

  it('空槽位切换（无让位方）：同样收尾 reveal', async () => {
    const host = createCordis({ apps: [defineApp('solo', () => ({ name: 'solo', apply() {} }))] })
    await settle()
    const inst = await host.lifecycle.switch('main', 'solo')
    expect(hostOf(inst.container).style.display).toBe('')
  })

  it('shadow 应用切换：显隐作用于 shadow 宿主（容器在 shadow 内）', async () => {
    const host = createCordis({
      apps: [
        defineApp('cur-app', () => ({ name: 'cur-app', apply() {} })),
        defineApp('shadow-app', () => ({ name: 'shadow-app', apply() {} }), { shadow: true }),
      ],
    })
    await settle()
    await host.lifecycle.mount('cur-app', 'main')
    const next = await host.lifecycle.switch('main', 'shadow-app')

    // 容器在 shadowRoot 内；隐藏/显示必须落在宿主上（否则 shadow 内容仍可见）
    expect(next.container.getRootNode()).toBeInstanceOf(ShadowRoot)
    expect(hostOf(next.container).style.display).toBe('')
    expect(hostOf(next.container).dataset.txMountHidden).toBeUndefined()
  })
})

describe('reveal 面（§3.3 末步）', () => {
  it('未知 instanceId 返回 false（不抛）', async () => {
    const host = createCordis({ apps: [defineApp('r-app', () => ({ name: 'r-app', apply() {} }))] })
    await settle()
    expect(host.lifecycle.reveal('not-exist')).toBe(false)
  })

  it('普通 mount（非 mountHidden）不受影响：容器始终可见', async () => {
    const host = createCordis({ apps: [defineApp('p-app', () => ({ name: 'p-app', apply() {} }))] })
    await settle()
    const inst = await host.lifecycle.mount('p-app', 'main')
    expect(hostOf(inst.container).style.display).toBe('')
    expect(hostOf(inst.container).dataset.txMountHidden).toBeUndefined()
  })

  it('显式 mountHidden 挂载：需宿主自行 reveal（切换事务之外的用法）', async () => {
    const host = createCordis({ apps: [defineApp('h-app', () => ({ name: 'h-app', apply() {} }))] })
    await settle()
    const inst = await host.lifecycle.mount('h-app', 'main', { mountHidden: true })
    expect(hostOf(inst.container).style.display).toBe('none') // 保持隐藏直到 reveal
    expect(hostOf(inst.container).dataset.txMountHidden).toBe('1')
    host.lifecycle.reveal(inst.instanceId)
    expect(hostOf(inst.container).style.display).toBe('')
  })
})
