/**
 * react17 页面集（home/dialog/location/communication/state）。
 */
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { version } from 'react'

/** 仓库地址（官方各子应用首页都有「仓库地址」入口，此处指向 taixu 仓库） */
const REPO = 'https://github.com/YvYuYv/taixu'

interface Bridge {
  ctx?: any
  notify: (page: string) => void
}
let bridge: Bridge = { notify: () => {} }
let forcePageImpl: (p: string) => void = () => {}

export function setCtx(b: any) {
  bridge = { ...bridge, ...b }
  if (b.page !== undefined) forcePageImpl(b.page)
}

const PAGES = [
  ['home', '首页'],
  ['dialog', '弹窗'],
  ['location', '路由'],
  ['communication', '通信'],
  ['state', '状态'],
] as const

export function App() {
  const [page, setPage] = useState('home')
  forcePageImpl = setPage
  useEffect(() => {
    bridge.notify(page)
  }, [page])

  return (
    <div>
      <nav className="tx17-nav">
        {PAGES.map(([key, label]) => (
          <button key={key} className={page === key ? 'on' : ''} onClick={() => setPage(key)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="tx17-page">
        {page === 'home' && <Home />}
        {page === 'dialog' && <Dialog />}
        {page === 'location' && <Location />}
        {page === 'communication' && <Communication />}
        {page === 'state' && <State />}
      </div>
    </div>
  )
}

function Home() {
  return (
    <div>
      <h2>react17 示例</h2>
      <p>
        当前 react 版本 <b>{version}</b>（保活模式演示：lifecycle.switch 挂起保活，切回零冷启动）
      </p>
      <p>官方示例 UI 库：antd 版本 4.18.3 —— 本示例以零依赖等价实现替代，避免为演示引入大型 UI 依赖。</p>
      <p>
        仓库地址：{' '}
        <a href={REPO} target="_blank" rel="noreferrer">
          {REPO}
        </a>
      </p>
    </div>
  )
}

function Dialog() {
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState(false)
  return (
    <div>
      <h2>弹窗处理</h2>
      <p>弹窗无需子应用做任何处理就可使用（Portal 挂 body，同文档无 iframe 边界）。</p>
      <h3>1. 打开弹窗</h3>
      <button className="tx17-btn" onClick={() => setOpen(true)}>
        Open Modal
      </button>
      <h3>2. 下拉选择器</h3>
      <select className="tx17-select" defaultValue="">
        <option value="">Select a person</option>
        <option>Jack</option>
        <option>Lucy</option>
      </select>
      <h3>3. 气泡卡片（悬停）</h3>
      <span className="tx17-pop" onMouseEnter={() => setPop(true)} onMouseLeave={() => setPop(false)}>
        <button className="tx17-btn" style={{ background: '#5a67d8' }}>
          Hover me
        </button>
        {pop && (
          <span className="tx17-pop-body">
            <div>Content</div>
            <div>Content</div>
          </span>
        )}
      </span>
      {open &&
        createPortal(
          <div className="tx17-overlay" onClick={() => setOpen(false)}>
            <div className="tx17-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Basic Modal</h3>
              <p>弹窗内容（渲染在 body 下）</p>
              <div style={{ textAlign: 'right', marginTop: 14 }}>
                <button className="tx17-btn" onClick={() => setOpen(false)}>
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
      <p>子应用页面变化 broadcast <code>sub-route-change</code>，宿主路由跟随；宿主变化经 <code>react17-router-change</code> 下发。</p>
      <h3>2. location 读取</h3>
      <p>
        window.location.host = <b>{window.location.host}</b>（同文档直读，无需劫持回填）
      </p>
      <h3>3. 修改 location.href</h3>
      <button className="tx17-btn" style={{ background: '#e6a23c' }} onClick={() => (window.location.href = 'https://github.com/taixu-micro')}>
        跳转 taixu 仓库
      </button>
    </div>
  )
}

function Communication() {
  return (
    <div>
      <h2>通信处理</h2>
      <h3>1. 宿主导航能力（= props.jump）</h3>
      <button className="tx17-btn" onClick={() => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'vue3' } })}>
        点击跳转 vue3
      </button>
      <button className="tx17-btn" style={{ background: '#5a67d8' }} onClick={() => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'angular12' } })}>
        跳转 angular12
      </button>
      <h3>2. 调用宿主全局方法</h3>
      <button className="tx17-btn" onClick={() => window.alert('子应用直接调用 window.alert')}>
        显示 alert
      </button>
      <h3>3. bus 去中心化事件</h3>
      <button className="tx17-btn" onClick={() => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'click', payload: 'react17' })}>
        显示 alert（bus）
      </button>
    </div>
  )
}

/** 状态页：保活计数 + 跨应用 bus 事件（'add' -> vue3 计数+1） */
function State() {
  const [count, setCount] = useState(10)
  return (
    <div>
      <h2>子应用保活</h2>
      <p>保活模式：切换应用时，子应用的路由和 state 都得到保留（suspend/resume 而非 dispose）。</p>
      <h3>1. 改动实例的状态，切换到 vue3 再回来看看</h3>
      <div className="tx17-count-row">
        <button className="tx17-btn" onClick={() => setCount((c) => c - 1)}>
          -
        </button>
        <span className="tx17-count">{count}</span>
        <button className="tx17-btn" onClick={() => setCount((c) => c + 1)}>
          +
        </button>
        <button
          className="tx17-btn"
          style={{ background: '#e56b5f' }}
          onClick={() => {
            // 跨应用事件：broadcast 'add'，vue3 的 State 页监听后计数 +1；随后跳回宿主路由
            bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'add', payload: {} })
            bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'vue3' } })
          }}
        >
          vue3 state+1 跳回
        </button>
      </div>
      <p>挂起期间到达的 bus 消息进挂起队列，恢复时回放——保活应用不丢消息。</p>
    </div>
  )
}
