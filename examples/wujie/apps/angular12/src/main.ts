/**
 * angular 子应用入口（构建为自包含 ESM，default export = taixu Plugin）。
 *
 * 产物管线：ng build（application builder，AOT + optimization）产出 main.js ——
 * 模块副作用把 Plugin 挂到 globalThis，构建脚本追加 `export default` 行得到 app.mjs。
 */
import 'zone.js'
import { ErrorHandler, VERSION } from '@angular/core'
import { createApplication } from '@angular/platform-browser'
import { defineCordisAngularApp } from '@taixu/adapter-angular'
import { AppComponent } from './app.component'
import { bridge } from './bridge'

const APP_ID = 'angular12'

/** adapter 依赖仲裁所需的最小 @angular/core 面：createApplication + ErrorHandler token */
const ngCore = { createApplication, ErrorHandler }

const inner = defineCordisAngularApp({ appId: APP_ID, rootComponent: AppComponent })

const plugin = {
  name: APP_ID,
  inject: ['lifecycle', 'bus', 'monitor', 'style', 'deps'],
  apply(ctx: any) {
    ctx.style.inject(ctx, { file: 'angular12.css', css: STYLES })
    bridge.ctx = ctx

    // 宿主下行：路由同步（angular12-router-change { path }）
    ctx.on('message/receive', (e: any) => {
      const m = e.message
      if (m?.type === 'angular12-router-change' && m.payload?.path) {
        bridge.setPage?.(String(m.payload.path).replace(/^\//, '') || 'home')
      }
    })

    // 子应用页面变化 -> 宿主路由跟随
    bridge.notify = (page: string) => {
      ctx.bus.broadcast(ctx, { type: 'sub-route-change', payload: { name: APP_ID, path: `/${page}` } })
    }

    // 共享依赖先行登记（Angular 框架类 singleton + strict，禁止双实例 DI 树），
    // 再走适配器（内部 negotiate('@angular/core', '*', { singleton, strict })）
    ctx.deps.registerShared('@angular/core', { version: VERSION.full, module: ngCore })

    ;(inner as any).apply(ctx)
  },
}

// 副作用挂载（构建脚本据此合成 default export）
;(globalThis as any).__TX_ANGULAR12_PLUGIN__ = plugin

const STYLES = `
.txng-nav { display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid #e5e8f0; flex-wrap:wrap; }
.txng-nav button { border:none; background:none; color:#2c3e50; font-size:15px; cursor:pointer; padding:4px 2px; }
.txng-nav button.on { color:#dd0031; font-weight:700; border-bottom:2px solid #dd0031; }
.txng-page { padding:14px 6px; }
.txng-page h2 { margin:6px 0 12px; font-size:20px; }
.txng-page h3 { margin:14px 0 6px; font-size:16px; border-bottom:1px solid #eaecef; padding-bottom:4px; }
.txng-page p, .txng-page blockquote { font-size:14px; color:#445; line-height:1.7; margin:6px 0; }
.txng-btn { background:#dd0031; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:14px; margin:4px 8px 4px 0; }
.txng-btn.warn { background:#e6a23c; }
.txng-select { padding:6px 10px; border:1px solid #d5daea; border-radius:6px; font-size:14px; }
.txng-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txng-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
`
