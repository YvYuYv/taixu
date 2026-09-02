/**
 * 宿主 main-react（对齐 wujie examples/main-react 全部功能）：
 * - 左侧导航 + 子菜单（与 wujie 相同的信息架构：/react16、/react16-sub/:path …）
 * - 主槽位 lifecycle.switch（默认保活）· all 页 6 应用同屏（多槽位共存，主槽位实例状态保留）
 * - Home 页：预加载开关（= wujie preloadApp 预执行开关）；降级开关不适用（taixu 无 iframe 依赖，页面内说明）
 * - 全局旁听子应用消息：sub-route-change -> 宿主路由跟随；navigate -> 路由跳转；click -> alert
 */
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { createHostCore, wireGlobalMessages, parseHash, subIds, type HostCore } from '../shared/host-core'

const SUB_MENUS: Record<string, string[]> = {
  react16: ['home', 'dialog', 'location', 'communication', 'nest', 'font'],
  react17: ['home', 'dialog', 'location', 'communication', 'state'],
  vue2: ['home', 'dialog', 'location', 'communication', 'postmessage', 'rich-text'],
  vue3: ['home', 'dialog', 'location', 'contact', 'state', 'inline-event'],
  vite: ['home', 'dialog', 'location', 'contact'],
}

let core: HostCore | null = null
const navigateRef: { current: ((to: string) => void) | null } = { current: null }

function Nav() {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  // 子应用页面变化 -> 宿主路由跟随（= wujie bus.$on('sub-route-change')）；navigate -> 路由跳转
  useEffect(() => {
    if (!core) return
    wireGlobalMessages(core.host, {
      onSubRoute: (appId, path) => {
        const current = window.location.hash.replace('#', '')
        if (current.startsWith(`/${appId}-sub`)) navigateRef.current?.(`/${appId}-sub${path}`)
      },
      onNavigate: (name) => navigateRef.current?.(`/${name}`),
      onClick: (from) => window.alert(`主应用收到 ${from} 的 bus 事件`),
    })
  }, [])

  return (
    <nav className="txh-nav">
      <NavLink to="/home" className={({ isActive }) => (isActive ? 'active' : '')}>
        介绍
      </NavLink>
      {['react16', 'react17', 'vue2', 'vue3', 'vite'].map((id) => (
        <React.Fragment key={id}>
          <NavLink to={`/${id}`} className={({ isActive }) => (isActive ? 'active' : '')}>
            {id}
            {(id === 'react17' || id === 'vue3') && <span className="txh-alive">保活</span>}
            <span
              style={{ cursor: 'pointer', padding: '0 8px', opacity: 0.7 }}
              onClick={(e) => {
                e.preventDefault()
                toggle(id)
              }}
            >
              ▾
            </span>
          </NavLink>
          {open[id] && (
            <div className="txh-submenu">
              {(SUB_MENUS[id] ?? []).map((item) => (
                <NavLink key={item} to={`/${id}-sub/${item}`} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {item}
                </NavLink>
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
      <NavLink to="/angular12" className={({ isActive }) => (isActive ? 'active' : '')}>
        angular12
      </NavLink>
      <NavLink to="/all" className={({ isActive }) => (isActive ? 'active' : '')}>
        all
      </NavLink>
      <p className="txh-status" />
    </nav>
  )
}

function Home() {
  const [preload, setPreload] = useState(localStorage.getItem('preload') !== 'false')
  const togglePreload = () => {
    const next = !preload
    localStorage.setItem('preload', String(next))
    setPreload(next)
    if (next && core) void core.preloadAll()
  }
  useEffect(() => {
    if (preload && core) void core.preloadAll()
  }, [])
  return (
    <div className="txh-home">
      <div className="txh-tools">
        <span className="txh-switch" onClick={togglePreload}>
          <span className={'track' + (preload ? ' on' : '')}>
            <span className="dot" />
          </span>
          <span>预加载（{preload ? '开' : '关'}）</span>
        </span>
        <span className="txh-switch" style={{ opacity: 0.5 }} title="taixu 同窗运行，无 iframe 依赖，无降级概念">
          <span className="track" />
          <span>降级（不适用）</span>
        </span>
        <a href="https://taixu-micro.github.io/taixu/" target="_blank" rel="noreferrer">
          文档
        </a>
        <a href="https://github.com/taixu-micro/taixu" target="_blank" rel="noreferrer">
          仓库
        </a>
      </div>
      <h1>
        <span style={{ marginRight: 12 }}>🌐</span>
        <span>taixu</span>
      </h1>
      <h2>—官方示例集（React 宿主）</h2>
      <div className="txh-cards">
        <div className="item">
          <div className="title">极速 🚀</div>
          <ul>
            <li>预加载：动态 import 预热</li>
            <li>挂起/恢复零冷启动</li>
            <li>切换事务无闪烁</li>
          </ul>
        </div>
        <div className="item">
          <div className="title">强大 💪</div>
          <ul>
            <li>多应用同时激活在线</li>
            <li>应用级保活（LRU 池）</li>
            <li>鉴权总线 + 请求-应答</li>
          </ul>
        </div>
        <div className="item">
          <div className="title">简单 🤞</div>
          <ul>
            <li>子应用即 ESM Plugin</li>
            <li>同文档渲染无 iframe</li>
            <li>适配器一行接入</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    navigateRef.current = (to: string) => navigate(to)
  }, [navigate])

  const parsed = parseHash(location.pathname)
  useEffect(() => {
    if (!core) return
    const mainWrap = document.getElementById('outlet-main-wrap')
    const allWrap = document.getElementById('all-wrap')
    if (parsed.page === 'all') {
      mainWrap?.classList.add('hidden')
      allWrap?.classList.remove('hidden')
      void core.showAll()
    } else if ((parsed.page === 'app' || parsed.page === 'sub') && parsed.appId) {
      allWrap?.classList.add('hidden')
      void core.hideAll().then(async () => {
        mainWrap?.classList.remove('hidden')
        await core!.show(parsed.appId!)
        if (parsed.sub && parsed.sub !== '/') core!.sendRouterChange(parsed.appId!, parsed.sub)
      })
    } else {
      // home / postmessage：主槽位实例保留（保活），仅视觉隐藏
      allWrap?.classList.add('hidden')
      mainWrap?.classList.add('hidden')
    }
  }, [location.pathname])

  return (
    <>
      <Nav />
      <div className="txh-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Home />} />
          <Route path="*" element={null} />
        </Routes>
        <section id="outlet-main-wrap" className="hidden" style={{ height: '100%' }}>
          <div id="outlet-main" style={{ height: '100%' }} />
        </section>
        <section id="all-wrap" className="hidden">
          <div className="txh-all-grid">
            {subIds.map((id) => (
              <div className="txh-all-item" id={`all-${id}`} key={id} />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

async function main() {
  core = createHostCore()
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  createRoot(document.getElementById('root')!).render(
    <Router>
      <App />
    </Router>,
  )
}

main().catch((err) => {
  document.getElementById('root')!.textContent = `宿主启动失败: ${(err as Error).message}`
})
