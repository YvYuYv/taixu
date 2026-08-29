/**
 * SSR 同构 adopt（heterogeneous §九 同构模式，F5-04）：
 * 容器带 `data-tx-ssr="1"` 标记（服务端 renderToString 写入）时，vue3 适配器自动走
 * `createSSRApp` hydration 绑定——复用 SSR 节点（不卸载重建，首屏零闪烁）；无标记走
 * `createApp` CSR 重建（既有行为）。
 *
 * 断言核心：hydration 模式下 **SSR 节点被复用**（DOM 引用相同）；CSR 模式下节点被替换。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { h, createStaticVNode } from 'vue'
import { createCordis, defineApp, defineCordisApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

/** 渲染输出与 SSR HTML 同构的最小组件 */
function SsrLikeApp() {
  return {
    render: () => createStaticVNode('<div class="ssr-content">rendered on server</div>', 1),
  }
}

async function mountWithHost(container: Element) {
  const host = createCordis({
    apps: [defineApp('ssr-app', () => defineCordisApp({ appId: 'ssr-app', rootComponent: SsrLikeApp() }))],
  })
  await settle()
  const inst = await host.lifecycle.mount('ssr-app', 'main')
  void container
  await settle() // Vue 渲染异步
  return { host, inst }
}

describe('SSR 同构 adopt（F5-04，heterogeneous §九）', () => {
  it('宿主元素内有 SSR 容器（data-tx-ssr="1"）：lifecycle 复用之 + createSSRApp hydration', async () => {
    const outlet = document.createElement('div')
    outlet.id = 'main'
    // 服务端写入的容器（renderToString 宿主拼装）：容器自带 adopt 标记，内容为其产物
    const ssrContainer = document.createElement('div')
    ssrContainer.dataset.txSsr = '1'
    const ssrNode = document.createElement('div')
    ssrNode.className = 'ssr-content'
    ssrNode.textContent = 'rendered on server'
    ssrContainer.appendChild(ssrNode)
    outlet.appendChild(ssrContainer)
    document.body.appendChild(outlet)

    const { host, inst } = await mountWithHost(outlet)
    // lifecycle 复用 SSR 容器（不新建）；hydration 绑定：内容节点原样保留（引用相同）
    expect(inst.container).toBe(ssrContainer)
    expect((inst.container as HTMLElement).dataset.txSsr).toBe('1') // 标记保留（应用/诊断可读）
    expect(inst.container.querySelector('.ssr-content')).toBe(ssrNode)
    expect(ssrNode.isConnected).toBe(true)
    void host
  })

  it('宿主元素内无 SSR 容器：lifecycle 新建容器（既有行为），CSR 重建', async () => {
    const outlet = document.createElement('div')
    outlet.id = 'main'
    const stale = document.createElement('div')
    stale.className = 'stale'
    outlet.appendChild(stale)
    document.body.appendChild(outlet)

    const { inst } = await mountWithHost(outlet)
    expect((inst.container as HTMLElement).dataset.txSsr).toBeUndefined() // 新建容器无标记
    expect(inst.container).not.toBe(stale) // 新建（不复用）
    expect(inst.container.querySelector('.stale')).toBeNull() // SSR 残留不进新容器
  })
})
