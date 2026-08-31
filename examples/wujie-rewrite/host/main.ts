/**
 * 宿主（taixu 版 wujie 示例改造）：
 * - createCordis + 路由矩阵（菜单 -> lifecycle.switch 切换，默认保活）
 * - 子应用 = 独立构建的 ESM（apps 下各子应用的 app.mjs），经动态 import 远程加载（微前端正统语义）
 * - 跨技术栈共享状态：state `shared:cart`（React 子应用写入，宿主与 Vue 子应用消费）
 * - 全链路事件流旁听：app/* · bus/* · security/*
 *
 * 时序要点：cordis 服务是**异步激活**的（createCordis 返回后需让出微任务队列），
 * 故首行 await settle() 再访问 host.state / host.lifecycle（框架主缝测试同纪律）。
 */
import type { Context } from 'cordis'
import { createCordis, defineApp, type AppDefinition } from '@taixu/core'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T
const log = (text: string) => {
  const list = $('#flow')
  if (!list) return // 事件流面板缺失时静默（首屏 DOM 未就绪场景）
  const li = document.createElement('li')
  li.textContent = `[${new Date().toLocaleTimeString()}] ${text}`
  list.prepend(li)
}
// 未捕获错误也进事件流（示例的排障面：任何一步失败都可见，而不是静默白屏）
window.addEventListener('error', (e) => log(`error: ${(e as ErrorEvent).message}`))
window.addEventListener('unhandledrejection', (e) => log(`unhandled: ${String((e as PromiseRejectionEvent).reason)}`))

/** 远程子应用加载器：独立构建的 ESM（default export = taixu Plugin） */
const remote = (appId: string, url: string): AppDefinition =>
  defineApp(appId, async () => {
    log(`加载子应用 ESM: ${url}`)
    const mod = (await import(/* @vite-ignore */ url)) as { default: unknown }
    return mod.default
  })

const appDefs: AppDefinition[] = [
  remote('react17', new URL('../apps/react17/app.mjs', window.location.href).href),
  remote('vue3', new URL('../apps/vue3/app.mjs', window.location.href).href),
  remote('vite', new URL('../apps/vite/app.mjs', window.location.href).href),
]

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

const host = createCordis({
  outlets: { main: '#outlet-main', side: '#outlet-side' },
  keepAlive: { maxCount: 3 },
  permissions: [
    // 宿主侧读 shared 同样需声明（deny-by-default 对宿主不例外）
    { appId: 'host', allow: ['state:read:shared:cart'] },
    { appId: 'react17', allow: ['state:write:shared:cart', 'state:read:shared:cart'] },
    { appId: 'vue3', allow: ['state:write:shared:cart', 'state:read:shared:cart'] },
    { appId: 'vite', allow: ['state:write:shared:cart', 'state:read:shared:cart'] },
  ],
  apps: appDefs,
})

async function main() {
  await settle() // 等 cordis 服务激活（lifecycle/state/keepAlive…）

// —— 全链路事件流旁听（对齐 wujie 示例的可观测诉求）——
host.on('app/loaded', (e) => log(`app/loaded: ${e.appId}`), { global: true })
host.on('app/suspend', (e) => log(`app/suspend: ${e.appId}（保活中，回程零冷启动）`), { global: true })
host.on('app/resume', (e) => log(`app/resume: ${e.appId}`), { global: true })
host.on('app/evicted', (e) => log(`app/evicted: ${e.appId}（cause=${e.cause}）`), { global: true })
host.on('security/violation', (v) => log(`violation: ${v.rule} (appId=${v.appId})`), { global: true })

// —— 跨应用共享购物车（宿主侧消费 React/Vue 子应用的写入）——
const renderCart = () => {
  const items = host.state.get('shared:cart', { appId: 'host' }) as Array<{ name: string }> | undefined
  const list = $('#cart-list')
  list.textContent = ''
  for (const item of items ?? []) {
    const li = document.createElement('li')
    li.textContent = `🛒 ${item.name}`
    list.appendChild(li)
  }
  $('#cart-total').textContent = `合计 ${items?.length ?? 0} 件`
}
host.state.watch(host, 'shared:cart', renderCart)
renderCart()

// —— 菜单 -> lifecycle.switch（保活切换）——
const mounted = new Set<string>()
async function show(appId: string) {
  document.querySelectorAll<HTMLButtonElement>('#menu button').forEach((b) =>
    b.classList.toggle('active', b.dataset.app === appId),
  )
  $('#slot-side-wrap').hidden = appId !== 'all'
  if (appId === 'all') {
    // 多槽位共存：react17 主槽 + vue3 侧槽
    if (!mounted.has('react17')) await host.lifecycle.mount('react17', 'main')
    if (!mounted.has('vue3')) await host.lifecycle.mount('vue3', 'side')
    log('多槽位共存：main=react17，side=vue3')
    return
  }
  if (!mounted.has(appId)) {
    await host.lifecycle.mount(appId, 'main')
    mounted.add(appId)
    return
  }
  await host.lifecycle.switch('main', appId) // 保活切换（suspend/resume）
}

document.querySelectorAll<HTMLButtonElement>('#menu button').forEach((btn) => {
  btn.addEventListener('click', () => void show(btn.dataset.app!))
})

}

// 首屏：挂载 React17 子应用（远程 ESM）；整链兜底，失败在事件流可见
main()
  .then(() => show('react17'))
  .then(() => log('宿主就绪：@taixu/core + 3 个远程子应用清单'))
  .catch((e: unknown) => log(`启动失败: ${(e as Error).message}`))
export type HostCtx = Context
