/**
 * 宿主 main-react（一比一还原 wujie examples/main-react 的功能与界面）：
 * - 左侧导航 + 子菜单（与 wujie 相同的信息架构：/react16、/react16-sub/:path …）
 * - 主槽位 lifecycle.switch（默认保活）· all 页 6 应用同屏（多槽位共存，主槽位实例状态保留）
 * - Home 页：降级开关（不适用）+ 预加载开关 + 三张特性卡 + 主应用互跳 / 仓库 / 文档
 * - 全局旁听子应用消息：sub-route-change -> 宿主路由跟随；navigate -> 路由跳转；click -> alert
 */
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter as Router, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { createHostCore, wireGlobalMessages, parseHash, subIds, type HostCore } from '../shared/host-core'

/** 子菜单：[href, 展示文案]——官方 vue2 的 rich-text 显示为「富文本」 */
const SUB_MENUS: Record<string, [string, string][]> = {
  react16: [
    ['home', 'home'],
    ['dialog', 'dialog'],
    ['location', 'location'],
    ['communication', 'communication'],
    ['nest', 'nest'],
    ['font', 'font'],
  ],
  react17: [
    ['home', 'home'],
    ['dialog', 'dialog'],
    ['location', 'location'],
    ['communication', 'communication'],
    ['state', 'state'],
  ],
  vue2: [
    ['home', 'home'],
    ['dialog', 'dialog'],
    ['location', 'location'],
    ['communication', 'communication'],
    ['rich-text', '富文本'],
    ['postmessage', 'postmessage'],
  ],
  vue3: [
    ['home', 'home'],
    ['dialog', 'dialog'],
    ['location', 'location'],
    ['contact', 'contact'],
    ['state', 'state'],
    ['inline-event', 'inline-event'],
    ['postmessage', 'postmessage'],
  ],
  vite: [
    ['home', 'home'],
    ['dialog', 'dialog'],
    ['location', 'location'],
    ['contact', 'contact'],
  ],
}

/** 保活应用（官方 react17 / vue3 带「保活」徽标） */
const ALIVE_APPS = new Set(['react17', 'vue3'])

/** 另一宿主入口（官方两站互跳） */
const SIBLING_HOST = { href: '/taixu/demo-wujie/hosts/main-vue/', label: 'vue主应用' }

let core: HostCore | null = null
const navigateRef: { current: ((to: string) => void) | null } = { current: null }

/** 开关（antd Switch 的零依赖等价物；on 态类必须挂 .txh-switch 上，CSS 才能命中 .track/.dot） */
function Switch({
  on,
  label,
  onToggle,
  disabled = false,
  title = '',
}: {
  on: boolean
  label: string
  onToggle?: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <span
      className={'txh-switch' + (on ? ' on' : '')}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
      title={title}
      onClick={disabled ? undefined : onToggle}
    >
      <span className="track">
        <span className="dot" />
      </span>
      <span>{label}</span>
    </span>
  )
}

function Nav() {
  const location = useLocation()
  // 官方：处于 xxx-sub 路由时对应子菜单自动展开
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(SUB_MENUS).map((id) => [id, location.pathname.includes(`${id}-sub`)])),
  )
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

  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')

  return (
    <nav className="txh-nav">
      <NavLink to="/home" className={cls}>
        介绍
      </NavLink>
      {Object.keys(SUB_MENUS).map((id) => (
        <React.Fragment key={id}>
          <NavLink to={`/${id}`} className={cls}>
            {id}
            {ALIVE_APPS.has(id) && <span className="txh-alive">保活</span>}
            <span
              className={'main-icon' + (open[id] ? ' active' : '')}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggle(id)
              }}
            >
              ▴
            </span>
          </NavLink>
          {open[id] && (
            <div className="txh-submenu">
              {SUB_MENUS[id].map(([href, label]) => (
                <NavLink key={href} to={`/${id}-sub/${href}`} className={cls}>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
      <NavLink to="/angular12" className={cls}>
        angular12
      </NavLink>
      <NavLink to="/all" className={cls}>
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
        <div className="button-list">
          {/* 降级：taixu 同文档渲染，无 iframe / shadow DOM / proxy 依赖，无降级概念 */}
          <Switch
            on={false}
            label="降级关"
            disabled
            title="taixu 同文档渲染，无 iframe / shadow DOM / proxy 依赖，无降级概念"
          />
          <Switch on={preload} label={preload ? '预加载开' : '预加载关'} onToggle={togglePreload} />
          <a className="docs" href={SIBLING_HOST.href} target="_blank" rel="noreferrer">
            {SIBLING_HOST.label}
          </a>
          <a className="docs" href="https://github.com/taixu-micro/taixu" target="_blank" rel="noreferrer">
            仓库
          </a>
          <a className="docs" href="https://taixu-micro.github.io/taixu/" target="_blank" rel="noreferrer">
            文档
          </a>
        </div>
      </div>
      <h1 className="txh-header">
        <span style={{ marginRight: 15 }}>🌐</span>
        <span className="bland">taixu</span>
      </h1>
      <h2 className="txh-subtitle">—极致的微前端框架</h2>
      <div className="txh-cards">
        <div className="item">
          <div className="title">极速 🚀</div>
          <div className="detail">
            <ul>
              <li>极致预加载提速</li>
              <li>应用秒开无白屏</li>
              <li>应用丝滑般切换</li>
            </ul>
          </div>
        </div>
        <div className="item">
          <div className="title">强大 💪</div>
          <div className="detail">
            <ul>
              <li>多应用同时激活在线</li>
              <li>应用级别保活</li>
              <li>去中心化的通信</li>
            </ul>
          </div>
        </div>
        <div className="item">
          <div className="title">简单 🤞</div>
          <div className="detail">
            <ul>
              <li>更小的体积</li>
              <li>精简的API</li>
              <li>开箱即用</li>
            </ul>
          </div>
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
      // home：主槽位实例保留（保活），仅视觉隐藏
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
