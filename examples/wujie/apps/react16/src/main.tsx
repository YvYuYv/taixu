/**
 * react16 子应用（对齐 wujie examples/react16 的全部演示页面）：
 *   home / dialog（弹窗+Portal）/ location（路由说明）/ communication（三种通信）/
 *   nest（子应用嵌套：本应用内再起一个 taixu 运行时挂 react17）/ font（字体说明）
 *
 * 接入方式：default export = taixu Plugin（宿主经动态 import 远程加载）。
 * 与宿主的通信全部走 ctx.bus：
 *   - 页面变化 -> broadcast 'sub-route-change' { name, path }
 *   - 接收宿主定向消息 'react16-router-change' { path } 切页
 *   - 通信页演示 navigate（=wujie props.jump）/ window.alert（同窗无需 parent）/ bus 事件
 *
 * 注意：本应用自带一份 React 16.13（多版本 React 与宿主 React 18 共存，互不干扰）。
 */
import React from 'react'
import ReactDOM from 'react-dom'
import { createCordis, defineApp } from '@taixu/core'
import { App, setCtx } from './app'

const APP_ID = 'react16'

export default {
  name: APP_ID,
  inject: ['lifecycle', 'bus', 'monitor', 'style'],
  apply(ctx: any) {
    // 样式显式登记（= wujie cssLoader 通道的 taixu 对应物；随 effect 自动移除）
    ctx.style.inject(ctx, { file: 'react16.css', css: STYLES })

    // 接收宿主定向消息：宿主路由 -> 子应用页面
    ctx.on('message/receive', (e: any) => {
      const m = e.message
      if (m?.type === 'react16-router-change' && m.payload?.path) {
        setCtx({ page: String(m.payload.path).replace(/^\//, '') || 'home' })
      }
    })

    ctx.effect(() => {
      const container = ctx.lifecycle.containerOf(ctx)
      if (!container) throw new Error('react16: no container')

      setCtx({ ctx, notify: (page: string) => {
        ctx.bus.broadcast(ctx, { type: 'sub-route-change', payload: { name: APP_ID, path: `/${page}` } })
      } })

      ReactDOM.render(React.createElement(App), container)
      return () => {
        ReactDOM.unmountComponentAtNode(container)
      }
    })
  },
}

const STYLES = `
.tx16-nav { display:flex; gap:14px; padding:10px 4px; border-bottom:1px solid #e5e8f0; flex-wrap:wrap; }
.tx16-nav button { border:none; background:none; color:#2c3e50; font-size:15px; cursor:pointer; padding:4px 2px; }
.tx16-nav button.on { color:#e56b5f; font-weight:700; border-bottom:2px solid #e56b5f; }
.tx16-page { padding:14px 6px; }
.tx16-page h2 { margin:6px 0 12px; font-size:20px; }
.tx16-page h3 { margin:14px 0 6px; font-size:16px; border-bottom:1px solid #eaecef; padding-bottom:4px; }
.tx16-page p { font-size:14px; color:#445; line-height:1.7; margin:6px 0; }
.tx16-btn { background:#e56b5f; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:14px; margin:4px 8px 4px 0; }
.tx16-btn.warn { background:#e6a23c; }
.tx16-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.tx16-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.tx16-select { padding:6px 10px; border:1px solid #d5daea; border-radius:6px; font-size:14px; }
.tx16-pop { position:relative; display:inline-block; }
.tx16-pop-body { position:absolute; top:110%; left:0; background:#fff; border:1px solid #e5e8f0; box-shadow:0 4px 14px rgba(0,0,0,.12); border-radius:8px; padding:10px 14px; width:220px; z-index:50; font-size:13px; }
.tx16-nest { border:1px dashed #bbb; border-radius:8px; min-height:320px; padding:4px; overflow:auto; }
`
