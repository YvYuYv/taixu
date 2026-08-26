/**
 * 主缝测试：React 适配器（state-sharing §六，P1）。
 * CordisProvider 注入 ctx（非全局单例）；useSharedState：外部写自动同步渲染、
 * set 走唯一写管线（appId 归因）；组件卸载退订（watch 退订句柄归还）；
 * 无 Provider 显式抛错。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useState, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import type { Context } from 'cordis'
import { createCordis, defineApp, CordisProvider, useCordis, useReactSharedState as useSharedState } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

function render(root: Root, el: React.ReactNode) {
  act(() => {
    root.render(el)
  })
}

describe('React 适配器（§六）', () => {
  it('useSharedState：外部写自动同步渲染；set 走唯一写管线；卸载退订', async () => {
    const host = createCordis({
      permissions: [
        { appId: 'rx-app', allow: ['state:read:shared:cart', 'state:write:shared:cart'] },
      ],
      apps: [defineApp('rx-app', () => ({ name: 'rx-app', inject: ['state'], apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('rx-app', 'main')
    await settle()

    const div = document.createElement('div')
    document.body.appendChild(div)
    const root = createRoot(div)

    let renders = 0
    function Cart() {
      const [cart, setCart] = useSharedState<{ n: number } | undefined>('shared:cart')
      renders++
      return (
        <button onClick={() => setCart({ n: (cart?.n ?? 0) + 1 })} data-testid="btn">
          n={cart?.n ?? 0}
        </button>
      )
    }
    render(
      root,
      <CordisProvider ctx={inst.ctx} appId="rx-app">
        <Cart />
      </CordisProvider>,
    )
    expect(div.textContent).toContain('n=0')

    host.state.set('shared:cart', { n: 7 }) // 外部（root）写
    await settle()
    expect(div.textContent).toContain('n=7') // 自动同步渲染

    const before = renders
    act(() => {
      ;(div.querySelector('[data-testid="btn"]') as HTMLButtonElement).click()
    })
    await settle()
    expect(host.state.get('shared:cart')).toEqual({ n: 8 }) // set 走唯一写管线
    expect(div.textContent).toContain('n=8')

    act(() => root.render(null)) // 卸载：退订
    const afterUnmount = renders
    host.state.set('shared:cart', { n: 99 })
    await settle()
    expect(renders).toBe(afterUnmount) // 已退订：不再重渲染

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('useCordis：Provider 缺失显式抛错（ctx 非全局单例）', async () => {
    const host = createCordis({})
    await settle()
    const div = document.createElement('div')
    document.body.appendChild(div)
    const root = createRoot(div)
    const errors: string[] = []
    function Orphan() {
      try {
        useCordis()
      } catch (e) {
        errors.push((e as Error).message)
      }
      return <span>orphan</span>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ConsoleError = console.error
    console.error = () => {} // React 19 无 Provider 渲染错误静音（断言经 errors 数组）
    try {
      render(root, <Orphan />)
    } finally {
      console.error = ConsoleError
    }
    expect(errors[0]).toMatch(/no CordisProvider/)
    act(() => root.render(null))
  })

  it('state.watch 组件级退订句柄：off 后不再收到变更（服务层缺口收口）', async () => {
    const host = createCordis({
      permissions: [{ appId: 'watcher', allow: ['state:read:shared:k', 'state:write:shared:k'] }],
    })
    await settle()
    host.state.set('shared:k', 1, { appId: 'watcher' })
    const seen: number[] = []
    const off = host.state.watch(host, 'shared:k', (v) => seen.push(v as number))
    expect(seen).toEqual([1]) // 首跑
    off()
    host.state.set('shared:k', 2, { appId: 'watcher' })
    await settle()
    expect(seen).toEqual([1]) // 退订后不再收
  })
})
