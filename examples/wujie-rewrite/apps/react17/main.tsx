/**
 * React 17 风格子应用（实际 React 18 + @taixu/adapter-react）：
 * - default export = taixu Plugin（宿主经动态 import 远程加载）
 * - useSharedState 写 `shared:cart` —— 宿主与 Vue 子应用实时同步（跨技术栈共享状态）
 * - 副作用（createRoot/unmount）包成一次 ctx.effect
 */
import { CordisProvider, useSharedState } from '@taixu/adapter-react'
import { createRoot } from 'react-dom/client'
import { createElement as h, useState } from 'react'

interface CartItem {
  name: string
}

function React17App(): ReturnType<typeof h> {
  const [cart, setCart] = useSharedState<CartItem[]>('shared:cart', [])
  const [pong, setPong] = useState('')

  const addItem = () =>
    setCart([...(cart ?? []), { name: `React 商品 ${(Math.random() * 1000) | 0}` }])

  return h('div', { className: 'subcard' }, [
    h('h4', null, 'React 18 子应用（@taixu/adapter-react）'),
    h('p', null, 'shared:cart 写入方 —— 宿主与 Vue 子应用实时同步'),
    h('button', { className: 'taixu-btn', onClick: addItem }, '加入购物车'),
    h('p', { style: { fontSize: 13, color: '#667' } }, pong || '当前购物车条目数: ' + (cart?.length ?? 0)),
  ])
}

// 远程子应用导出 **Plugin 对象**（有 apply）——defineApp 是宿主侧的清单声明 API，
// 不应出现在子应用产物里（宿主侧 defineApp(appId, async () => (await import(url)).default)
// 负责把远程 Plugin 包装进应用清单）
export default {
  name: 'react17',
  inject: ['state'],
  apply(ctx: import('cordis').Context) {
    ctx.effect(() => {
      const container = ctx.lifecycle.containerOf(ctx)
      if (!container) throw new Error('react17: no container')
      const root = createRoot(container)
      root.render(h(CordisProvider, { ctx }, h(React17App)))
      return () => root.unmount()
    })
  },
}
