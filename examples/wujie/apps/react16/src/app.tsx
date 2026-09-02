/**
 * react16 页面集（对齐 wujie react16 的 home/dialog/location/communication/nest/font 六页）。
 * ctx 由 main.tsx 经 setCtx 注入（模块级持有——单实例示例的惯用法）。
 */
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createCordis, defineApp } from '@taixu/core'
import { version } from 'react'

/** 仓库地址（官方各子应用首页都有「仓库地址」入口，此处指向 taixu 仓库） */
const REPO = 'https://github.com/YvYuYv/taixu'

interface Bridge {
  ctx?: any
  notify: (page: string) => void
  page?: string
}
let bridge: Bridge = { notify: () => {} }

/** main.tsx 注入 ctx 与页面通知回调 */
export function setCtx(b: Partial<Bridge>) {
  bridge = { ...bridge, ...b }
  if (b.page !== undefined) forcePage(b.page)
}

let forcePageImpl: (p: string) => void = () => {}
function forcePage(p: string) {
  forcePageImpl(p)
}

const PAGES = [
  ['home', '首页'],
  ['dialog', '弹窗'],
  ['location', '路由'],
  ['communication', '通信'],
  ['nest', '内嵌'],
  ['font', '字体'],
] as const

export function App() {
  const [page, setPage] = useState('home')
  forcePageImpl = setPage
  // 页面变化 -> 通知宿主（宿主高亮菜单/同步路由）
  useEffect(() => {
    bridge.notify(page)
  }, [page])

  return (
    <div>
      <nav className="tx16-nav">
        {PAGES.map(([key, label]) => (
          <button key={key} className={page === key ? 'on' : ''} onClick={() => setPage(key)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="tx16-page">
        {page === 'home' && <Home />}
        {page === 'dialog' && <Dialog />}
        {page === 'location' && <Location />}
        {page === 'communication' && <Communication />}
        {page === 'nest' && <Nest />}
        {page === 'font' && <Font />}
      </div>
    </div>
  )
}

function Home() {
  return (
    <div>
      <h2>react16 示例</h2>
      <p>
        当前 react 版本 <b>{version}</b>（子应用独立副本，与宿主 React 18 多版本共存）
      </p>
      <p>
        官方示例 UI 库：antd 版本 4.18.3 —— 本示例以零依赖等价实现替代，避免为演示引入大型 UI 依赖。
      </p>
      <p>
        仓库地址：{' '}
        <a href={REPO} target="_blank" rel="noreferrer">
          {REPO}
        </a>
      </p>
      <p>页面目录：弹窗 / 路由 / 通信 / 内嵌 / 字体 —— 全部经 @taixu/core 运行时集成。</p>
    </div>
  )
}

function Dialog() {
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState(false)
  return (
    <div>
      <h2>弹窗处理</h2>
      <p>弹窗无需子应用做任何处理就可使用 —— taixu 子应用与宿主同文档渲染，Portal 直挂 document.body。</p>
      <h3>1. 打开弹窗（ReactDOM.createPortal 挂 body）</h3>
      <button className="tx16-btn" onClick={() => setOpen(true)}>
        Open Modal
      </button>
      <h3>2. 下拉选择器</h3>
      <select className="tx16-select" defaultValue="">
        <option value="">Select a person</option>
        <option>Jack</option>
        <option>Lucy</option>
        <option>Tom</option>
      </select>
      <h3>3. 气泡卡片（悬停）</h3>
      <span className="tx16-pop" onMouseEnter={() => setPop(true)} onMouseLeave={() => setPop(false)}>
        <button className="tx16-btn" style={{ background: '#5a67d8' }}>
          Hover me
        </button>
        {pop && (
          <span className="tx16-pop-body">
            <div>Content</div>
            <div>Content</div>
          </span>
        )}
      </span>
      {open &&
        createPortal(
          <div className="tx16-overlay" onClick={() => setOpen(false)}>
            <div className="tx16-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Basic Modal</h3>
              <p>弹窗内容（渲染在 body 下，而非子应用容器内）</p>
              <select className="tx16-select" defaultValue="">
                <option value="">Select a person（弹窗内）</option>
                <option>Jack</option>
                <option>Lucy</option>
              </select>
              <div style={{ textAlign: 'right', marginTop: 14 }}>
                <button className="tx16-btn" onClick={() => setOpen(false)}>
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function Location() {
  return (
    <div>
      <h2>路由处理</h2>
      <h3>1. 路由同步</h3>
      <p>
        子应用页面变化经 bus 消息 <code>sub-route-change</code> 通知宿主，宿主路由跟随；
        宿主路由变化经定向消息 <code>react16-router-change</code> 下发——双向同步。
      </p>
      <h3>2. location 读取</h3>
      <p>
        window.location.host = <b>{window.location.host}</b>
      </p>
      <p>taixu 子应用运行在宿主同文档，location 无需劫持回填——读到的就是真实地址。</p>
      <h3>3. 修改 window.location.href</h3>
      <button className="tx16-btn warn" onClick={() => (window.location.href = 'https://github.com/taixu-micro')}>
        跳转 taixu 仓库
      </button>
      <p>同窗应用直接跳转即可，无需删除 shadow / 替换 iframe 的降级动作。</p>
    </div>
  )
}

function Communication() {
  return (
    <div>
      <h2>通信处理</h2>
      <p>应用可以有三种方式进行通信（对应 wujie 的 props / window.parent / bus）：</p>
      <h3>1. 宿主注入的导航能力（= wujie props.jump）</h3>
      <p>子应用 broadcast 消息 navigate，宿主监听后跳转对应路由。</p>
      <button className="tx16-btn" onClick={() => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'vue3' } })}>
        点击跳转 vue3
      </button>
      <h3>2. 调用宿主全局方法（= wujie window.parent.alert）</h3>
      <p>taixu 子应用与宿主同窗运行——直接调用 window.alert，无需 window.parent 中转。</p>
      <button className="tx16-btn" onClick={() => window.alert('子应用直接调用 window.alert')}>
        显示 alert
      </button>
      <h3>3. bus 去中心化事件</h3>
      <p>子应用 broadcast click 事件，宿主全局旁听 message/send 后 alert。</p>
      <button className="tx16-btn" onClick={() => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'click', payload: 'react16' })}>
        显示 alert（bus）
      </button>
    </div>
  )
}

/** 内嵌：本子应用内再起一个 taixu 运行时，远程加载 react17 应用（= wujie 子应用嵌套） */
function Nest() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState('加载中…')
  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    const el = ref.current!
    el.id = 'tx-react16-nest'
    ;(async () => {
      try {
        // react17 产物与本应用同目录族（独立构建、独立部署）：/apps/react16/app.mjs -> /apps/react17/app.mjs
        const react17Url = new URL(`../react17/app.mjs?v=${Date.now()}`, import.meta.url).href
        const plugin = (await import(/* @vite-ignore */ react17Url)).default
        const nested = createCordis({
          outlets: { nest: '#tx-react16-nest' },
          keepAlive: { maxCount: 2 },
          permissions: [{ appId: 'react17', allow: ['message:*'] }, { appId: 'host', allow: ['message:*'] }],
          apps: [defineApp('react17', () => plugin)],
        })
        for (let i = 0; i < 10; i++) await Promise.resolve()
        await new Promise((r) => setTimeout(r, 0))
        await nested.lifecycle.mount('react17', 'nest')
        if (disposed) {
          await nested.lifecycle.destroyByAppId('react17', 'react16')
          return
        }
        setStatus('嵌套运行时已挂载 react17')
        cleanup = () => void nested.lifecycle.destroyByAppId('react17', 'react16')
      } catch (err) {
        setStatus(`嵌套失败: ${(err as Error).message}`)
      }
    })()
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])
  return (
    <div>
      <h2>子应用嵌套</h2>
      <p>react16 内部创建自己的 taixu 运行时（子应用也能当宿主），远程加载 react17：</p>
      <p>{status}</p>
      <div ref={ref} className="tx16-nest" />
    </div>
  )
}

/**
 * 官方 Font.js 用 tdesign-icons-react 渲染 IconFont，用来演示「相对地址字体在沙箱内可用」。
 * 这里不引第三方图标库，直接吃 TDesign icon 的原始 css（同一份 CDN 资源），
 * 更能说明差别：wujie 需框架把 url('./t.woff') 改写成绝对地址，taixu 靠浏览器原生解析。
 */
const ICON_CSS = 'https://tdesign.gtimg.com/icon/0.1.1/fonts/index.css'

function Font() {
  useEffect(() => {
    if (document.querySelector(`link[data-tx-icon]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = ICON_CSS
    link.setAttribute('data-tx-icon', '')
    document.head.appendChild(link)
  }, [])
  return (
    <div>
      <h2>字体处理</h2>
      <h3>背景</h3>
      <p>wujie 的子应用 DOM 挂在 shadowRoot 内，shadowRoot 内部的字体文件不会加载。</p>
      <h3>解决</h3>
      <p>
        wujie 的做法：框架加载子应用时将自定义字体样式提取到 shadowRoot 外部，且主应用与子应用的 @font-face
        font-family 不能重名，否则会互相覆盖。
      </p>
      <p>
        taixu 的做法：<strong>无需处理</strong>——子应用与宿主<strong>同文档渲染</strong>（无 shadowRoot
        隔离），@font-face 与相对地址字体原生加载，零框架介入；样式注入走 <code>ctx.style.inject</code>{' '}
        显式登记（样式冲突可经 DevTools <code>scanStyleConflicts</code> 扫描）。
      </p>
      <h3>IconFont 图标示例</h3>
      <p>TDesign icon</p>
      <p style={{ fontSize: '2em', display: 'flex', gap: 12 }}>
        <i className="t-icon t-icon-loading" />
        <i className="t-icon t-icon-close" />
        <i className="t-icon t-icon-check-circle-filled" />
      </p>
      <h3>相对地址</h3>
      <p>浏览器按 css 文件自身的 URL 解析相对地址，无需框架改写。</p>
      <p>比如 TDesign icon 的 css 文件地址为:</p>
      <p> {ICON_CSS}</p>
      <p>index.css 文件中 @font-face 中 url('./t.woff') 最终解析为:</p>
      <p> https://tdesign.gtimg.com/icon/0.1.1/fonts/t.woff</p>
    </div>
  )
}
