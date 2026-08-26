/**
 * 主缝测试：CSS-in-JS 运行时补丁 + 滚动锁代理 + z-index 分层（style-isolation §4.4/§4.2，P1）。
 * observeRuntimeStyles：未打标 style 归因当前应用 + §3.1 等价选择器前缀重写
 * （html/body/:root 语义重写为 scope；@media 递归；keyframes 原样——如实边界）；
 * dispose 断开观察。滚动锁：body.style.overflow 赋值重定向容器级。z-index token registry。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp, prefixSelectors, createSandbox } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
  document.head.textContent = ''
})

describe('CSS-in-JS 运行时补丁（§4.4）', () => {
  it('未打标 style 归因 + 前缀重写（含 @media 递归与 html/body 语义）；新注入节点实时观察', async () => {
    let appCtx!: Context
    const host = createCordis({
      apps: [
        defineApp('cj-app', () => ({
          name: 'cj-app',
          inject: ['style'],
          apply(ctx: Context) {
            appCtx = ctx
            ctx.style.observeRuntimeStyles(ctx)
          },
        })),
      ],
    })
    await settle()
    // 注册前已有未打标节点：无归因证据不捕（可能是宿主/主应用样式——误归因会错误重写）
    const legacy = document.createElement('style')
    legacy.textContent = '.btn{color:red}'
    document.head.appendChild(legacy)

    const inst = await host.lifecycle.mount('cj-app', 'main')
    await settle()
    await settle() // MutationObserver 回调

    expect(legacy.dataset.cordisApp).toBeUndefined() // 既有节点不动

    // 注册后新注入（emotion/styled-components 运行时行为）
    const fresh = document.createElement('style')
    fresh.textContent = '.card{border:0}html{margin:0}@media (min-width:600px){.card{padding:8px}}'
    document.head.appendChild(fresh)
    await settle()
    await settle()
    expect(fresh.dataset.cordisApp).toBe('cj-app')
    expect(fresh.textContent).toContain('[data-cordis-app="cj-app"] .card{border:0}')
    expect(fresh.textContent).toContain('[data-cordis-app="cj-app"]{margin:0}') // html 语义重写
    expect(fresh.textContent).toContain('@media (min-width:600px){[data-cordis-app="cj-app"] .card{padding:8px}}')

    await host.lifecycle.destroy(inst.instanceId, 't')
    await settle()
    const after = document.createElement('style')
    after.textContent = '.late{}'
    document.head.appendChild(after)
    await settle()
    expect(after.dataset.cordisApp).toBeUndefined() // dispose 断开观察
  })

  it('prefixSelectors：@keyframes/@font-face 原样保留（keyframes 名是文档级命名空间，如实边界）', () => {
    const out = prefixSelectors('@keyframes spin{from{opacity:0}to{opacity:1}}.a{x:1}', '[s]')
    expect(out).toContain('@keyframes spin{from{opacity:0}to{opacity:1}}')
    expect(out).toContain('[s] .a{x:1}')
  })
})

describe('滚动锁重定向（§4.2）', () => {
  it('body.style.overflow 赋值改容器级；真实 body 不受影响；其余 style 读写透传', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const host = createCordis({})
    await settle()
    const sandbox = await createSandbox(host, 'lock-app', { container })
    const doc = sandbox.proxy.document as Document
    const bodyStyle = doc.body.style

    bodyStyle.overflow = 'hidden'
    expect(container.style.overflow).toBe('hidden') // 容器级生效
    expect(document.body.style.overflow).not.toBe('hidden') // 主应用 body 不泄漏

    bodyStyle.color = 'red' // 其余属性透传真实 body
    expect(document.body.style.color).toBe('red')
    bodyStyle.setProperty('background', 'blue') // 方法绑定真实节点
    expect(document.body.style.background).toBe('blue')

    expect(doc.body.style.overflow).toBe('hidden') // 读镜像容器值（锁检查可见生效值）
    expect(doc.body.style).toBe(bodyStyle) // 身份稳定（缓存单例）
    bodyStyle.setProperty('overflow', 'scroll') // setProperty 路径同重定向
    expect(container.style.overflow).toBe('scroll')
    expect(document.body.style.overflow).not.toBe('scroll')

    await sandbox.destroy()
  })
})

describe('z-index 分层 registry（§4.2）', () => {
  it('token 写 :root 唯一写点；弹层经 var 取值', async () => {
    const host = createCordis({})
    await settle()
    host.style.setZLayers({ modal: 1000, popover: 1100 })
    expect(document.documentElement.style.getPropertyValue('--tx-z-modal')).toBe('1000')
    expect(host.style.zIndexVar('popover')).toBe('var(--tx-z-popover)')
  })
})
