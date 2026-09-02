/**
 * react17 子应用（对齐 wujie examples/react17 全部页面）：
 *   home / dialog / location / communication / state（保活计数 + bus 'add' 跨应用联动）
 *
 * 保活语义：宿主 lifecycle.switch 对本应用挂起（suspend）而非销毁——
 * 切走再切回，React state（计数）不丢；挂起期间到达的 bus 消息进挂起队列，
 * 恢复时按全序回放（不丢消息）。
 */
import React from 'react'
import ReactDOM from 'react-dom'
import { App, setCtx } from './app'

const APP_ID = 'react17'

export default {
  name: APP_ID,
  inject: ['lifecycle', 'bus', 'monitor', 'style'],
  apply(ctx: any) {
    ctx.style.inject(ctx, { file: 'react17.css', css: STYLES })

    ctx.on('message/receive', (e: any) => {
      const m = e.message
      if (m?.type === 'react17-router-change' && m.payload?.path) {
        setCtx({ page: String(m.payload.path).replace(/^\//, '') || 'home' })
      }
    })

    ctx.effect(() => {
      const container = ctx.lifecycle.containerOf(ctx)
      if (!container) throw new Error('react17: no container')

      setCtx({ ctx, notify: (page: string) => {
        ctx.bus.broadcast(ctx, { type: 'sub-route-change', payload: { name: APP_ID, path: `/${page}` } })
      } })

      ReactDOM.render(React.createElement(App), container)
      return () => ReactDOM.unmountComponentAtNode(container)
    })
  },
}

const STYLES = `
.tx17-nav { display:flex; gap:14px; padding:10px 4px; border-bottom:1px solid #e5e8f0; flex-wrap:wrap; }
.tx17-nav button { border:none; background:none; color:#2c3e50; font-size:15px; cursor:pointer; padding:4px 2px; }
.tx17-nav button.on { color:#7c3aed; font-weight:700; border-bottom:2px solid #7c3aed; }
.tx17-page { padding:14px 6px; }
.tx17-page h2 { margin:6px 0 12px; font-size:20px; }
.tx17-page h3 { margin:14px 0 6px; font-size:16px; border-bottom:1px solid #eaecef; padding-bottom:4px; }
.tx17-page p { font-size:14px; color:#445; line-height:1.7; margin:6px 0; }
.tx17-btn { background:#7c3aed; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:14px; margin:4px 8px 4px 0; }
.tx17-count { font-size:44px; font-weight:800; color:#7c3aed; display:inline-block; width:110px; text-align:center; }
.tx17-count-row { display:flex; align-items:center; justify-content:center; gap:6px; padding:16px 0; }
.tx17-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.tx17-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.tx17-select { padding:6px 10px; border:1px solid #d5daea; border-radius:6px; font-size:14px; }
`
