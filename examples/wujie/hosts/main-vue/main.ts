/**
 * 宿主 main-vue（一比一还原 wujie examples/main-vue 的功能与界面）：
 * - 侧边导航 + 子菜单（/react16、/react16-sub/:path …），菜单项/顺序/href 与官方一致
 * - 主槽位 lifecycle.switch（默认保活）；all 页 6 应用同屏（多槽位共存）
 * - postmessage 页（三级链，对齐官方）：主应用（2 按钮）→ vue2 子应用 postmessage 页（2 按钮）
 *   → 页内嵌 vue3 postmessage 页（3 按钮，官方为 iframe 直载；taixu 为「应用内再挂应用」）
 * - Home 页：降级开关（不适用，taixu 无 iframe/shadow/proxy 依赖）+ 预加载开关 + 三张特性卡
 *
 * 纯 h() 渲染（无 SFC 编译步骤）；hash 路由手写（无 vue-router 依赖）。
 */
import { createApp, defineComponent, h, ref, onMounted, Fragment, type VNodeChild } from 'vue'

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
  ],
  vue3: [
    ['home', 'home'],
    ['dialog', 'dialog'],
    ['location', 'location'],
    ['contact', 'contact'],
    ['state', 'state'],
    ['inline-event', 'inline-event'],
  ],
  vite: [
    ['home', 'home'],
    ['dialog', 'dialog'],
    ['location', 'location'],
    ['contact', 'contact'],
  ],
}

/** 保活应用（官方 vue3/react17 带「保活」徽标） */
const ALIVE_APPS = new Set(['react17', 'vue3'])

/** 另一宿主入口（官方两站互跳） */
const SIBLING_HOST = { href: '/taixu/demo-wujie/hosts/main-react/', label: 'react主应用' }

let core: HostCore | null = null
const message = ref('')
const pmMounted = ref(false)
/** 当前路由（导航高亮与子菜单自动展开共用；官方由 vue-router 的 $route.name 提供） */
const curHash = ref(window.location.hash.replace(/^#/, '') || '/home')

function nav(to: string) {
  curHash.value = to
  window.location.hash = to
}

/** 挂起期间保留主槽位实例，仅做视觉切换 */
function setWrapVisible(id: string, visible: boolean) {
  document.getElementById(id)?.classList.toggle('hidden', !visible)
}

/** 路由 effect：hash -> 槽位编排（与 main-react 同一套 HostCore） */
/** 嵌套 vue3 的挂载容器 id（vue2 postmessage 页渲染；= 官方 vue2 页内嵌的 iframe 位） */
const PM_NEST_ID = 'pm-nest-vue3'

function routeEffect(hash: string) {
  if (!core) return
  const parsed = parseHash(hash.replace(/^#/, ''))
  message.value = ''
  if (parsed.page === 'postmessage') {
    pmMounted.value = true
    setWrapVisible('outlet-main-wrap', false)
    setWrapVisible('all-wrap', false)
    document.getElementById('pm-wrap')?.classList.remove('hidden')
    void core.hideAll().then(async () => {
      if (!pmMounted.value) return
      try {
        await core!.host.lifecycle.mount('vue2', 'pm-vue2')
        core!.sendRouterChange('vue2', '/postmessage')
        // 官方 postmessage 页是三级链：主应用 → vue2 子应用（postmessage 页）→ 页内嵌 vue3
        // postmessage 页（官方用 iframe 直载；taixu 同文档，等价做法是「应用内再挂应用」）。
        // 等 vue2 渲染出嵌套容器后挂 vue3 并路由到其 postmessage 页。
        for (let i = 0; i < 40 && !document.getElementById(PM_NEST_ID); i++) {
          await new Promise((r) => setTimeout(r, 50))
          if (!pmMounted.value) return
        }
        if (!pmMounted.value || !document.getElementById(PM_NEST_ID)) return
        await core!.host.lifecycle.mount('vue3', PM_NEST_ID)
        core!.sendRouterChange('vue3', '/postmessage')
      } catch (err) {
        console.warn('[pm] mount 失败', err)
      }
    })
    return
  }
  // 离开 postmessage：卸载专用槽位
  if (pmMounted.value) {
    pmMounted.value = false
    document.getElementById('pm-wrap')?.classList.add('hidden')
    // 销毁 vue2 全部实例（含主槽位），并同步清空主槽位占用记录
    void core.destroyApp('vue2')
    // 嵌套 vue3 只销毁 pm 槽位实例——主槽位（保活）实例不受影响，回 /vue3 原样恢复
    const nest = core.host.lifecycle.getInstances().find((i: any) => i.outlet === PM_NEST_ID)
    if (nest) void core.host.lifecycle.destroy(nest.instanceId, 'host: leave postmessage')
  }

  if (parsed.page === 'all') {
    setWrapVisible('outlet-main-wrap', false)
    document.getElementById('all-wrap')?.classList.remove('hidden')
    void core.showAll()
  } else if ((parsed.page === 'app' || parsed.page === 'sub') && parsed.appId) {
    // app = 顶层入口（/#/react16）；sub = 子页面（/#/react16-sub/dialog）——两者共用主槽位
    setWrapVisible('all-wrap', false)
    void core.hideAll().then(async () => {
      setWrapVisible('outlet-main-wrap', true)
      await core!.show(parsed.appId!)
      if (parsed.sub && parsed.sub !== '/') core!.sendRouterChange(parsed.appId!, parsed.sub)
    })
  } else {
    // home：主槽位实例保留（保活），仅视觉隐藏
    setWrapVisible('all-wrap', false)
    setWrapVisible('outlet-main-wrap', false)
  }
}

/** 官方 vue-router 的 router-link-active 语义：前缀匹配（-sub 子路由使父项高亮） */
function isActive(to: string) {
  const cur = curHash.value
  return cur === to || cur.startsWith(`${to}/`) || cur.startsWith(`${to}-sub`)
}

const Nav = defineComponent({
  name: 'Nav',
  setup() {
    // 官方：处于 xxx-sub 路由时对应子菜单自动展开
    const open = ref<Record<string, boolean>>(
      Object.fromEntries(
        Object.keys(SUB_MENUS).map((id) => [id, new RegExp(`/${id}-sub`).test(curHash.value)]),
      ),
    )
    const toggle = (id: string) => {
      open.value = { ...open.value, [id]: !open.value[id] }
    }
    const link = (to: string, children: VNodeChild) =>
      h(
        'a',
        {
          href: `#${to}`,
          class: [isActive(to) ? 'active' : ''],
          onClick: (e: Event) => {
            e.preventDefault()
            nav(to)
          },
        },
        children,
      )
    /** 展开箭头（官方 antd caret-up 图标，展开态 rotate(180deg) 变向下） */
    const caret = (id: string) =>
      h(
        'span',
        {
          class: ['main-icon', open.value[id] ? 'active' : ''],
          onClick: (e: Event) => {
            // 阻止冒泡到 <a>，避免展开子菜单的同时触发路由跳转
            e.preventDefault()
            e.stopPropagation()
            toggle(id)
          },
        },
        '▴',
      )
    return () =>
      h('nav', { class: 'txh-nav' }, [
        link('/home', '介绍'),
        ...Object.keys(SUB_MENUS).map((id) =>
          h(Fragment, { key: id }, [
            link(`/${id}`, [
              id,
              ALIVE_APPS.has(id) && h('span', { class: 'txh-alive' }, '保活'),
              caret(id),
            ]),
            open.value[id] &&
              h(
                'div',
                { class: 'txh-submenu' },
                (SUB_MENUS[id] ?? []).map(([href, label]) => link(`/${id}-sub/${href}`, label)),
              ),
          ]),
        ),
        link('/angular12', 'angular12'),
        link('/all', 'all'),
        link('/postmessage', 'postmessage'),
        h('p', { class: 'txh-status' }, localStorage.getItem('tx-examples-status') ?? ''),
      ])
  },
})

const Home = defineComponent({
  name: 'Home',
  setup() {
    const preload = ref(localStorage.getItem('preload') !== 'false')
    const togglePreload = () => {
      preload.value = !preload.value
      localStorage.setItem('preload', String(preload.value))
      if (preload.value && core) void core.preloadAll()
    }
    onMounted(() => {
      if (preload.value && core) void core.preloadAll()
    })
    /** 开关（antd Switch 的零依赖等价物） */
    const sw = (on: boolean, label: string, onToggle?: () => void, disabled = false, title = '') =>
      h(
        'span',
        {
          class: ['txh-switch', on ? 'on' : ''],
          style: disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {},
          title,
          onClick: disabled ? undefined : onToggle,
        },
        [h('span', { class: 'track' }, h('span', { class: 'dot' })), h('span', null, label)],
      )
    return () =>
      h('div', { class: 'txh-home' }, [
        h('div', { class: 'txh-tools' }, [
          h('div', { class: 'button-list' }, [
            // 降级：taixu 同文档渲染，无 iframe/shadow DOM/proxy 依赖，无降级概念
            sw(false, '降级关', undefined, true, 'taixu 同文档渲染，无 iframe / shadow DOM / proxy 依赖，无降级概念'),
            sw(preload.value, preload.value ? '预加载开' : '预加载关', togglePreload),
            h('a', { class: 'docs', href: SIBLING_HOST.href, target: '_blank' }, SIBLING_HOST.label),
            h('a', { class: 'docs', href: 'https://github.com/taixu-micro/taixu', target: '_blank' }, '仓库'),
            h('a', { class: 'docs', href: 'https://taixu-micro.github.io/taixu/', target: '_blank' }, '文档'),
          ]),
        ]),
        h('h1', { class: 'txh-header' }, [
          h('span', { style: { marginRight: '15px' } }, '🌐'),
          h('span', { class: 'bland' }, 'taixu'),
        ]),
        h('h2', { class: 'txh-subtitle' }, '—极致的微前端框架'),
        h(
          'div',
          { class: 'txh-cards' },
          [
            ['极速 🚀', ['极致预加载提速', '应用秒开无白屏', '应用丝滑般切换']],
            ['强大 💪', ['多应用同时激活在线', '应用级别保活', '去中心化的通信']],
            ['简单 🤞', ['更小的体积', '精简的API', '开箱即用']],
          ].map(([title, items]) =>
            h('div', { class: 'item' }, [
              h('div', { class: 'title' }, title as string),
              h('div', { class: 'detail' }, h('ul', null, (items as string[]).map((t) => h('li', null, t)))),
            ]),
          ),
        ),
      ])
  },
})

const PostMessage = defineComponent({
  name: 'PostMessage',
  setup() {
    /** 官方两个按钮：发给 vue2 子应用 / 发给 vue2 页内嵌的 iframe（taixu = 嵌套 vue3） */
    const sendTo = (target: string) => {
      // 宿主 root ctx（source='system'）免裁决；定向 target
      core?.host.bus.send(core!.host as never, {
        type: 'postmessage',
        payload: { text: "hello, i'm main app" },
        target,
      })
    }
    return () =>
      h('div', { class: 'txh-postmessage' }, [
        h('h3', null, '主应用'),
        h('div', { class: 'main-content' }, [
          h('div', { style: { paddingBottom: '10px' } }, `接收的消息：${message.value || '（空）'}`),
          h('button', { class: 'txv2-btn', style: { marginRight: '10px' }, onClick: () => sendTo('vue2') }, '发送消息给vue2子应用'),
          h('button', { class: 'txv2-btn', onClick: () => sendTo('vue3') }, '发送消息给vue2子应用的iframe'),
          h(
            'span',
            { style: { fontSize: '13px', color: '#789', marginLeft: '8px' } },
            '（wujie 版第二条经 shadow iframe 穿透；taixu 走鉴权总线定向到嵌套 vue3）',
          ),
        ]),
        h('div', { class: 'sub-content' }),
      ])
  },
})

const App = defineComponent({
  name: 'App',
  setup() {
    return () => {
      const p = parseHash(curHash.value)
      const content: VNodeChild[] = []
      if (p.page === 'home') content.push(h(Home))
      if (p.page === 'postmessage') content.push(h(PostMessage))
      // Fragment 直接铺进 #app：多包一层 div 会让 #app 的 display:flex 失效、内容区塌陷
      return h(Fragment, null, [
        h(Nav),
        h('div', { class: 'txh-content' }, [
          ...content,
          h(
            'section',
            { id: 'outlet-main-wrap', class: 'hidden', style: { height: '100%' } },
            h('div', { id: 'outlet-main', style: { height: '100%' } }),
          ),
          h(
            'section',
            { id: 'all-wrap', class: 'hidden' },
            h(
              'div',
              { class: 'txh-all-grid' },
              subIds.map((id) => h('div', { class: 'txh-all-item', id: `all-${id}`, key: id })),
            ),
          ),
          // 官方 postmessage 页的子应用容器为 .sub-content（500px 虚线框）
          h('section', { id: 'pm-wrap', class: 'hidden', style: { margin: '40px' } }, [
            h('div', { id: 'pm-vue2', style: { height: '500px', border: '1px dashed #ccc' } }),
          ]),
        ]),
      ])
    }
  },
})

async function main() {
  core = createHostCore()
  // 服务激活等待（cordis 异步激活；与框架主缝测试同纪律）
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))

  // 全局旁听：子应用 broadcast 消息（= wujie bus.$on / window message 监听）
  wireGlobalMessages(core.host, {
    onSubRoute: (appId, path) => {
      const current = window.location.hash.replace('#', '')
      if (current.startsWith(`/${appId}-sub`)) nav(`/${appId}-sub${path}`)
    },
    onNavigate: (name) => nav(`/${name}`),
    onClick: (from) => window.alert(`主应用收到 ${from} 的 bus 事件`),
    onPostMessageAck: (text) => {
      message.value = text
    },
    // 官方「(借助主应用)」中继：嵌套 vue3 够不着兄弟应用，主应用代为定向转发
    onPostMessageRelay: (target, text) => {
      if (target !== 'vue2' && target !== 'vue3') return
      core?.host.bus.send(core!.host as never, { type: 'postmessage', payload: { text }, target })
    },
  })

  window.addEventListener('hashchange', () => {
    curHash.value = window.location.hash.replace(/^#/, '') || '/home'
    routeEffect(window.location.hash)
  })

  createApp(App).mount('#app')
  // 槽位编排须在宿主 DOM 渲染后首跑（outlet 元素此时才存在）
  routeEffect(window.location.hash)
}

main().catch((err) => {
  const el = document.getElementById('app')
  if (el) el.textContent = `宿主启动失败: ${(err as Error).message}`
})
