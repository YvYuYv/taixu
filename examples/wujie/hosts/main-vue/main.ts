/**
 * 宿主 main-vue（对齐 wujie examples/main-vue 的全部功能）：
 * - 侧边导航 + 子菜单（/react16、/react16-sub/:path …）
 * - 主槽位 lifecycle.switch（默认保活）；multiple 页 6 应用同屏（多槽位共存）
 * - postmessage 页：向 vue2 子应用定向发送 bus 消息并接收应答（= wujie iframe 中继的等价物）
 * - Home 页：预加载开关；降级不适用（taixu 无 iframe 依赖）
 *
 * 纯 h() 渲染（无 SFC 编译步骤）；hash 路由手写（无 vue-router 依赖）。
 */
import { createApp, defineComponent, h, ref, onMounted } from 'vue'
import { createHostCore, wireGlobalMessages, parseHash, subIds, type HostCore } from '../shared/host-core'

const SUB_MENUS: Record<string, string[]> = {
  react16: ['home', 'dialog', 'location', 'communication', 'nest', 'font'],
  react17: ['home', 'dialog', 'location', 'communication', 'state'],
  vue2: ['home', 'dialog', 'location', 'communication', 'postmessage', 'rich-text'],
  vue3: ['home', 'dialog', 'location', 'contact', 'state', 'inline-event', 'postmessage'],
  vite: ['home', 'dialog', 'location', 'contact'],
}

let core: HostCore | null = null
const message = ref('')
const pmMounted = ref(false)

function nav(to: string) {
  window.location.hash = to
}

/** 挂起期间保留主槽位实例，仅做视觉切换 */
function setWrapVisible(id: string, visible: boolean) {
  document.getElementById(id)?.classList.toggle('hidden', !visible)
}

/** 路由 effect：hash -> 槽位编排（与 main-react 同一套 HostCore） */
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
      } catch (err) {
        console.warn('[pm] mount vue2 失败', err)
      }
    })
    return
  }
  // 离开 postmessage：卸载专用槽位
  if (pmMounted.value) {
    pmMounted.value = false
    document.getElementById('pm-wrap')?.classList.add('hidden')
    void core.host.lifecycle.destroyByAppId('vue2', 'host').catch(() => {})
  }

  if (parsed.page === 'all') {
    setWrapVisible('outlet-main-wrap', false)
    document.getElementById('all-wrap')?.classList.remove('hidden')
    void core.showAll()
  } else if (parsed.page === 'app' && parsed.appId) {
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

const Nav = defineComponent({
  name: 'Nav',
  setup() {
    const open = ref<Record<string, boolean>>({})
    const toggle = (id: string) => {
      open.value = { ...open.value, [id]: !open.value[id] }
    }
    const link = (to: string, label: string, cls = '') =>
      h(
        'a',
        { href: `#${to}`, class: ['txh-route', cls], onClick: (e: Event) => e.preventDefault() || nav(to) },
        label,
      )
    return () =>
      h('nav', { class: 'txh-nav' }, [
        link('/home', '介绍'),
        ...['react16', 'react17', 'vue2', 'vue3', 'vite'].map((id) =>
          h('div', { key: id }, [
            h('div', { class: 'txh-row' }, [
              link(`/${id}`, id),
              (id === 'react17' || id === 'vue3') && h('span', { class: 'txh-alive' }, '保活'),
              h(
                'span',
                { style: { cursor: 'pointer', padding: '0 8px', opacity: '.7' }, onClick: () => toggle(id) },
                '▾',
              ),
            ]),
            open.value[id] &&
              h(
                'div',
                { class: 'txh-submenu' },
                (SUB_MENUS[id] ?? []).map((item) => link(`/${id}-sub/${item}`, item)),
              ),
          ]),
        ),
        link('/angular12', 'angular12'),
        link('/multiple', 'multiple'),
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
    return () =>
      h('div', { class: 'txh-home' }, [
        h('div', { class: 'txh-tools' }, [
          h('span', { class: ['txh-switch', preload.value ? 'on' : ''], onClick: togglePreload }, [
            h('span', { class: 'track' }, h('span', { class: 'dot' })),
            h('span', null, `预加载（${preload.value ? '开' : '关'}）`),
          ]),
          h('span', { class: 'txh-switch', style: { opacity: '.5' }, title: 'taixu 同窗运行，无 iframe 依赖' }, [
            h('span', { class: 'track' }),
            h('span', null, '降级（不适用）'),
          ]),
          h('a', { href: 'https://taixu-micro.github.io/taixu/', target: '_blank' }, '文档'),
          h('a', { href: 'https://github.com/taixu-micro/taixu', target: '_blank' }, '仓库'),
        ]),
        h('h1', null, '🌐 taixu'),
        h('h2', null, '—官方示例集（Vue 宿主）'),
        h(
          'div',
          { class: 'txh-cards' },
          [
            ['极速 🚀', ['预加载：动态 import 预热', '挂起/恢复零冷启动', '切换事务无闪烁']],
            ['强大 💪', ['多应用同时激活在线', '应用级保活（LRU 池）', '鉴权总线 + 请求-应答']],
            ['简单 🤞', ['子应用即 ESM Plugin', '同文档渲染无 iframe', '适配器一行接入']],
          ].map(([title, items]) =>
            h('div', { class: 'item' }, [
              h('div', { class: 'title' }, title as string),
              h('ul', null, (items as string[]).map((t) => h('li', null, t))),
            ]),
          ),
        ),
      ])
  },
})

const PostMessage = defineComponent({
  name: 'PostMessage',
  setup() {
    const send = () => {
      // 宿主 root ctx（source='system'）免裁决；定向 target 到 vue2
      core?.host.bus.send(core!.host as never, {
        type: 'postmessage',
        payload: { text: "hello, i'm main app" },
        target: 'vue2',
      })
    }
    return () =>
      h('div', { class: 'txh-postmessage' }, [
        h('h3', null, '主应用'),
        h('div', { class: 'main-content' }, [
          h('div', { style: { paddingBottom: '10px' } }, `接收的消息：${message.value || '（空）'}`),
          h('button', { class: 'txv2-btn', style: { marginRight: '10px' }, onClick: send }, '发送消息给vue2子应用'),
          h('span', { style: { fontSize: '13px', color: '#789' } }, '（wujie 版经 iframe postMessage 中继；taixu 走鉴权总线定向消息）'),
        ]),
        h('div', { class: 'sub-content' }),
      ])
  },
})

const App = defineComponent({
  name: 'App',
  setup() {
    const route = ref(window.location.hash.replace(/^#/, '') || '/home')
    return () => {
      const p = parseHash(route.value)
      const children: any[] = [h(Nav)]
      const content: any[] = []
      if (p.page === 'home') content.push(h(Home))
      if (p.page === 'postmessage') content.push(h(PostMessage))
      children.push(
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
          h('section', { id: 'pm-wrap', class: 'hidden', style: { height: '480px' } }, [
            h('div', { id: 'pm-vue2', style: { height: '100%', border: '1px dashed #ccc', borderRadius: '8px' } }),
          ]),
        ]),
      )
      return h('div', null, children)
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
  })

  window.addEventListener('hashchange', () => {
    route.value = window.location.hash.replace(/^#/, '') || '/home'
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
