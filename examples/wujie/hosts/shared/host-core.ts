/**
 * 宿主运行时核心（main-react / main-vue 共用逻辑的本文件副本）：
 * - createCordis 一口运行时：6 个远程子应用（独立构建 ESM，动态 import 加载）
 * - 主槽位 lifecycle.switch（默认挂起保活）+ all 页多槽位共存
 * - 双向路由同步：子应用 broadcast sub-route-change -> 宿主路由；宿主 -> 定向 send
 * - 预加载：提前动态 import 全部子应用产物（= wujie preloadApp + 预执行）
 * - 样式管线：withStylePipeline 演示 cssBefore/AfterLoaders 的 taixu 等价物
 */
import { createCordis, defineApp, type AppDefinition } from '@taixu/core'

export interface HostCore {
  host: ReturnType<typeof createCordis>
  show: (appId: string) => Promise<void>
  showAll: () => Promise<void>
  hideAll: () => Promise<void>
  /** 销毁某 appId 的全部实例（跨槽位），并同步清空主槽位占用记录 */
  destroyApp: (appId: string) => Promise<void>
  notifySubRoute: (appId: string, path: string) => Promise<void>
  sendRouterChange: (appId: string, path: string) => void
  preloadAll: () => Promise<void>
  readonly subIds: string[]
}

const SUB_IDS = ['react16', 'react17', 'vue2', 'vue3', 'vite', 'angular12'] as const
export const subIds = SUB_IDS as unknown as string[]

/** 远程子应用加载器：独立构建 ESM 的 default export = taixu Plugin */
function remote(appId: string): AppDefinition {
  return defineApp(appId, async () => {
    const url = new URL(`../../apps/${appId}/app.mjs?v=${Date.now()}`, window.location.href).href
    const mod = (await import(/* @vite-ignore */ url)) as { default: unknown }
    return mod.default
  })
}

/**
 * 样式管线（= wujie plugin.cssBeforeLoaders/cssAfterLoaders 的 taixu 等价物）：
 * 包裹远程 Plugin，在 effect 内先注入前置样式、渲染后再注入后置样式。
 * 这里给 vue2 注入一条演示样式（wujie main-vue 曾用 wangEditor 插件做同类演示）。
 */
function withStylePipeline(appId: string, plugin: any, before?: string, after?: string) {
  // 返回 plugin 对象（loader 的返回值经 loadApp 校验 apply，不能包 defineApp）。
  // name 必须沿用 appId：cordis fiber.name 决定 bus 裁决 source 与样式归属——
  // 改名会让 permissions 里 'vue2' 的授权全部落空。
  return {
    name: appId,
    inject: ['lifecycle', 'monitor', 'style', ...(plugin.inject ?? [])],
    apply(ctx: any) {
      if (before) ctx.style.inject(ctx, { file: `${appId}:before.css`, css: before })
      plugin.apply(ctx)
      if (after) ctx.style.inject(ctx, { file: `${appId}:after.css`, css: after })
    },
  }
}

const STATUS_KEY = 'tx-examples-status'

export function createHostCore(): HostCore {
  const appDefs: AppDefinition[] = SUB_IDS.map((id) => {
    if (id === 'vue2') {
      // 样式管线演示目标（其余应用走原始 remote 加载）
      return defineApp(id, async () => {
        const url = new URL(`../../apps/${id}/app.mjs?v=${Date.now()}`, window.location.href).href
        const plugin = ((await import(/* @vite-ignore */ url)) as { default: any }).default
        return withStylePipeline(
          id,
          plugin,
          'blockquote { border-left: 3px solid #41b883; padding-left: 10px; margin: 8px 0; }',
          '/* css-after-loaders 等价注入 */ .txv2-page p:last-child::after { content: " ✦"; color:#41b883; }',
        )
      })
    }
    return remote(id)
  })

  const outlets: Record<string, string> = { main: '#outlet-main' }
  for (const id of SUB_IDS) outlets[`all-${id}`] = `#all-${id}`

  const host = createCordis({
    outlets,
    keepAlive: { maxCount: 9 },
    permissions: [
      { appId: 'host', allow: ['message:*'] },
      { appId: 'react16', allow: ['message:sub-route-change', 'message:navigate', 'message:click'] },
      { appId: 'react17', allow: ['message:sub-route-change', 'message:navigate', 'message:click', 'message:add'] },
      {
        appId: 'vue2',
        allow: ['message:sub-route-change', 'message:navigate', 'message:click', 'message:postmessage-ack'],
      },
      { appId: 'vue3', allow: ['message:sub-route-change', 'message:navigate', 'message:click'] },
      { appId: 'vite', allow: ['message:sub-route-change', 'message:navigate', 'message:click'] },
      { appId: 'angular12', allow: ['message:sub-route-change', 'message:navigate'] },
    ],
    apps: appDefs,
  })

  const allMounted = new Set<string>()
  /**
   * 主槽位当前占用者（null = 空槽位）。
   * 关键：切换必须走 lifecycle.switch——它才会在挂载新应用后 retire 旧实例（默认挂起保活）。
   * 若对每个新 appId 都直接 mount，旧应用的容器不会被摘离，#outlet-main 下会同时残留多个
   * 子应用容器（实测 vue2 → vue3 切换后 outlet 内出现两个 #tx-main）。
   */
  let mainSlotApp: string | null = null

  /** 服务激活等待（cordis 异步激活；框架主缝测试同纪律） */
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  }

  async function show(appId: string) {
    if (!SUB_IDS.includes(appId as (typeof SUB_IDS)[number])) return
    if (mainSlotApp === appId) return
    // 空槽位首次 mount；此后一律 switch（switch 内部对未挂载应用会走「隐藏挂载 → 让位 → reveal」切换事务）
    if (mainSlotApp === null) await host.lifecycle.mount(appId, 'main')
    else await host.lifecycle.switch('main', appId)
    mainSlotApp = appId
  }

  async function showAll() {
    for (const id of SUB_IDS) {
      if (allMounted.has(id)) continue
      try {
        await host.lifecycle.mount(id, `all-${id}`)
        allMounted.add(id)
      } catch (err) {
        console.warn(`[all] mount ${id} 失败`, err)
      }
    }
  }

  async function hideAll() {
    for (const id of SUB_IDS) {
      if (!allMounted.has(id)) continue
      try {
        // destroyByAppId 会销毁该 appId 的**全部**实例（跨槽位），主槽位实例若同 id 一并消失
        await host.lifecycle.destroyByAppId(id, 'host')
      } catch (err) {
        console.warn(`[all] destroy ${id} 失败`, err)
      }
      allMounted.delete(id)
      if (mainSlotApp === id) mainSlotApp = null // 重置，避免 show() 误判槽位仍被占用
    }
  }

  /** 销毁某 appId 的全部实例（跨槽位），并同步清空主槽位占用记录 */
  async function destroyApp(appId: string) {
    try {
      await host.lifecycle.destroyByAppId(appId, 'host')
    } catch (err) {
      console.warn(`[destroy] ${appId} 失败`, err)
    }
    if (mainSlotApp === appId) mainSlotApp = null
  }

  /** 子应用页面变化后的路由对齐（宿主导航到 /<id>-sub<path>） */
  async function notifySubRoute(appId: string, path: string) {
    const target = `/${appId}-sub${path}`
    if (window.location.hash.replace(/^#/, '') !== target) {
      window.location.hash = target
    }
  }

  function sendRouterChange(appId: string, path: string) {
    // 宿主 root ctx（source='system'）为受信层免裁决；定向 target 到子应用
    void host.bus.send(host as never, { type: `${appId}-router-change`, payload: { path }, target: appId })
  }

  async function preloadAll() {
    const t0 = performance.now()
    const jobs = SUB_IDS.map(async (id) => {
      const url = new URL(`../../apps/${id}/app.mjs?v=${Date.now()}`, window.location.href).href
      await import(/* @vite-ignore */ url)
    })
    const results = await Promise.allSettled(jobs)
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const elapsed = Math.round(performance.now() - t0)
    localStorage.setItem(STATUS_KEY, `preload ${ok}/${SUB_IDS.length} @ ${elapsed}ms`)
    document.querySelectorAll<HTMLElement>('.txh-status').forEach((el) => {
      el.textContent = localStorage.getItem(STATUS_KEY) ?? ''
    })
  }

  return { host, show, showAll, hideAll, destroyApp, notifySubRoute, sendRouterChange, preloadAll, subIds }
}

/** 宿主全局旁听：子应用 broadcast 消息（sub-route-change / navigate / click / add / postmessage-ack） */
export function wireGlobalMessages(
  host: ReturnType<typeof createCordis>,
  handlers: {
    onSubRoute: (appId: string, path: string) => void
    onNavigate: (name: string) => void
    onClick: (from: string) => void
    onPostMessageAck?: (text: string) => void
  },
) {
  host.on(
    'message/send',
    (e: any) => {
      const m = e.message
      if (!m) return
      if (m.type === 'sub-route-change') handlers.onSubRoute(m.payload?.name, m.payload?.path ?? '/')
      else if (m.type === 'navigate') handlers.onNavigate(m.payload?.name)
      else if (m.type === 'click') handlers.onClick(String(m.payload ?? ''))
      else if (m.type === 'postmessage-ack') handlers.onPostMessageAck?.(m.payload?.text ?? '')
    },
    { global: true } as any,
  )
}

/** 解析宿主 hash 路由：'/react16-sub/dialog' -> { appId: 'react16', sub: '/dialog' } */
export function parseHash(hash: string): { page: string; appId?: string; sub?: string } {
  const path = hash.replace(/^#/, '') || '/home'
  const m = path.match(/^\/(react16|react17|vue2|vue3|vite|angular12)(-sub)?(\/.*)?$/)
  if (m) {
    return { page: m[2] ? 'sub' : 'app', appId: m[1], sub: m[3] ?? '/' }
  }
  if (path.startsWith('/all') || path.startsWith('/multiple')) return { page: 'all' }
  if (path.startsWith('/postmessage')) return { page: 'postmessage' }
  return { page: 'home' }
}
