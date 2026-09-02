/**
 * vue3 子应用（对齐 wujie examples/vue3 全部页面）：
 *   home / dialog（Teleport 弹窗）/ location / contact（通信）/ state（保活计数 + 'add' 事件）/
 *   inline-event（行内事件验证）/ postmessage（bus 双向消息）
 *
 * 接入方式：@taixu/adapter-vue3（defineCordisApp），rootComponent 的 setup 闭包持有 ctx。
 */
import { defineCordisApp } from '@taixu/adapter-vue3'
import { createApp, defineComponent, h, ref, type Component } from 'vue'

const APP_ID = 'vue3'

const bridge: any = { ctx: null, root: null }

/** 根组件：页面切换 + 导航 + 各页面以子组件形态挂入 */
const Root = defineComponent({
  name: 'Vue3Root',
  setup() {
    const page = ref('home')
    bridge.setPage = (p: string) => {
      page.value = p
    }
    const pages: Array<[string, string]> = [
      ['home', '首页'],
      ['dialog', '弹窗'],
      ['location', '路由'],
      ['contact', '通信'],
      ['state', '状态'],
      ['inline-event', 'inline-event'],
      ['postmessage', 'postmessage'],
    ]
    const nav = (p: string) => {
      page.value = p
      bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'sub-route-change', payload: { name: APP_ID, path: `/${p}` } })
    }
    return () =>
      h('div', null, [
        h(
          'nav',
          { class: 'txv3-nav' },
          pages.map(([key, label]) =>
            h('button', { class: page.value === key ? 'on' : '', onClick: () => nav(key) }, label),
          ),
        ),
        h('div', { class: 'txv3-page' }, [
          page.value === 'home' && h(Home),
          page.value === 'dialog' && h(Dialog),
          page.value === 'location' && h(Location),
          page.value === 'contact' && h(Contact),
          page.value === 'state' && h(State),
          page.value === 'inline-event' && h(InlineEvent),
          page.value === 'postmessage' && h(PostMessage),
        ]),
      ])
  },
})

const Home: Component = {
  setup() {
    return () =>
      h('div', null, [
        h('h2', null, 'vue3 示例'),
        h('p', null, [
          '当前 Vue 版本 ',
          h('b', null, '3（本地独立副本）'),
          '，@taixu/adapter-vue3 接入（保活模式：suspend/resume）',
        ]),
      ])
  },
}

const Dialog: Component = {
  setup() {
    const open = ref(false)
    const pop = ref(false)
    return () =>
      h('div', null, [
        h('h2', null, '弹窗处理'),
        h('p', null, '弹窗无需子应用做任何处理就可使用 —— Teleport 直挂 body（同文档无 iframe 边界）。'),
        h('h3', null, '1. 打开弹窗（Teleport to body）'),
        h('button', { class: 'txv3-btn', onClick: () => (open.value = true) }, 'Open Modal'),
        h('h3', null, '2. 下拉选择器'),
        h(
          'select',
          { class: 'txv3-select' },
          ['Jack', 'Lucy', 'Tom'].map((n) => h('option', { key: n }, n)),
        ),
        h('h3', null, '3. 气泡卡片（悬停）'),
        h(
          'span',
          {
            class: 'txv3-pop',
            onMouseenter: () => (pop.value = true),
            onMouseleave: () => (pop.value = false),
          },
          [
            h('button', { class: 'txv3-btn', style: { background: '#5a67d8' } }, 'Hover me'),
            pop.value && h('span', { class: 'txv3-pop-body' }, [h('div', null, 'Content'), h('div', null, 'Content')]),
          ],
        ),
        open.value &&
          h(Teleport, { to: 'body' }, () =>
            h('div', { class: 'txv3-overlay', onClick: () => (open.value = false) }, [
              h(
                'div',
                { class: 'txv3-modal', onClick: (e: Event) => e.stopPropagation() },
                [
                  h('h3', null, 'Basic Modal'),
                  h('p', null, '弹窗内容（渲染在 body 下，而非子应用容器内）'),
                  h('div', { style: { textAlign: 'right', marginTop: '14px' } }, [
                    h('button', { class: 'txv3-btn', onClick: () => (open.value = false) }, 'OK'),
                  ]),
                ],
              ),
            ]),
          ),
      ])
  },
}

const Location: Component = {
  setup() {
    const host = window.location.host
    return () =>
      h('div', null, [
        h('h2', null, 'location 处理'),
        h('h3', null, '1. 获取 window.location.host 的值'),
        h('blockquote', null, h('b', null, host)),
        h('p', null, 'taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。'),
        h('h3', null, '2. 修改 window.location.href'),
        h(
          'button',
          { class: 'txv3-btn warn', onClick: () => (window.location.href = 'https://github.com/taixu-micro') },
          '跳转 taixu 仓库',
        ),
        h('p', null, '同窗应用直接跳转，无 shadow 删除 / iframe 替换等降级动作。'),
      ])
  },
}

const Contact: Component = {
  setup() {
    return () =>
      h('div', null, [
        h('h2', null, '通信处理'),
        h('h3', null, '1. 宿主导航能力（= props.jump）'),
        h(
          'button',
          {
            class: 'txv3-btn',
            onClick: () => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'react16' } }),
          },
          '点击跳转 react16',
        ),
        h('h3', null, '2. 调用宿主全局方法'),
        h('button', { class: 'txv3-btn', onClick: () => window.alert('子应用直接调用 window.alert') }, '显示 alert'),
        h('h3', null, '3. bus 去中心化事件'),
        h(
          'button',
          {
            class: 'txv3-btn',
            onClick: () => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'click', payload: 'vue3' }),
          },
          '显示 alert（bus）',
        ),
      ])
  },
}

/** 状态页：保活计数 + 监听 react17 广播的 'add' 事件（跨应用状态联动） */
const State: Component = {
  setup() {
    const count = ref(10)
    bridge.ctx?.on?.('message/receive', (e: any) => {
      if (e.message?.type === 'add') count.value += 1
    })
    return () =>
      h('div', null, [
        h('h2', null, '子应用保活'),
        h('p', null, '保活模式：切换应用时，子应用的路由和 state 都得到保留。'),
        h('h3', null, '1. 改动实例的状态，切换到 react17 再回来看看'),
        h('div', { class: 'txv3-count-row' }, [
          h('button', { class: 'txv3-btn', onClick: () => (count.value -= 1) }, '-'),
          h('span', { class: 'txv3-count' }, String(count.value)),
          h('button', { class: 'txv3-btn', onClick: () => (count.value += 1) }, '+'),
        ]),
        h('p', null, '本页监听 react17 广播的 add 事件（bus），react17 的「vue3 state+1 跳回」按钮会让这里 +1。'),
      ])
  },
}

/** 行内事件验证（对齐 wujie inline-event 页：行内事件处理器在集成环境正常工作） */
const InlineEvent: Component = {
  setup() {
    const n = ref(0)
    return () =>
      h('div', null, [
        h('h2', null, '行内事件'),
        h('p', null, '模板行内事件处理器在 taixu 运行时集成下正常工作（无代理劫持损耗）。'),
        h('button', { class: 'txv3-btn', onClick: () => (n.value += 1) }, `点我计数：${n.value}`),
      ])
  },
}

const PostMessage: Component = {
  setup() {
    const received = ref('')
    bridge.onPost = (text: string) => (received.value = text)
    return () =>
      h('div', null, [
        h('h2', null, 'postmessage 处理'),
        h('p', null, 'wujie 版本演示 iframe 消息中继；taixu 同窗运行，bus 双向消息等价实现。'),
        h('h3', null, `接收的消息：${received.value || '（空）'}`),
        h(
          'button',
          {
            class: 'txv3-btn',
            onClick: () => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'postmessage-ack', payload: { text: "hello, i'm vue3 sub app" } }),
          },
          '发送消息给主应用',
        ),
      ])
  },
}

// Teleport 引用（从 vue 取）
import { Teleport } from 'vue'

export default {
  name: APP_ID,
  inject: ['lifecycle', 'bus', 'monitor', 'style'],
  apply(ctx: any) {
    ctx.style.inject(ctx, { file: 'vue3.css', css: STYLES })
    bridge.ctx = ctx

    ctx.on('message/receive', (e: any) => {
      const m = e.message
      if (m?.type === 'vue3-router-change' && m.payload?.path) {
        bridge.setPage?.(String(m.payload.path).replace(/^\//, '') || 'home')
      }
      if (m?.type === 'postmessage') bridge.onPost?.(m.payload?.text ?? '')
    })

    defineCordisApp({ appId: APP_ID, rootComponent: Root }).apply(ctx)
  },
}

const STYLES = `
.txv3-nav { display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid #e5e8f0; flex-wrap:wrap; }
.txv3-nav button { border:none; background:none; color:#2c3e50; font-size:15px; cursor:pointer; padding:4px 2px; }
.txv3-nav button.on { color:#35495e; font-weight:700; border-bottom:2px solid #41b883; }
.txv3-page { padding:14px 6px; }
.txv3-page h2 { margin:6px 0 12px; font-size:20px; }
.txv3-page h3 { margin:14px 0 6px; font-size:16px; border-bottom:1px solid #eaecef; padding-bottom:4px; }
.txv3-page p, .txv3-page blockquote { font-size:14px; color:#445; line-height:1.7; margin:6px 0; }
.txv3-btn { background:#41b883; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:14px; margin:4px 8px 4px 0; }
.txv3-btn.warn { background:#e6a23c; }
.txv3-select { padding:6px 10px; border:1px solid #d5daea; border-radius:6px; font-size:14px; }
.txv3-pop { position:relative; display:inline-block; }
.txv3-pop-body { position:absolute; top:110%; left:0; background:#fff; border:1px solid #e5e8f0; box-shadow:0 4px 14px rgba(0,0,0,.12); border-radius:8px; padding:10px 14px; width:220px; z-index:50; }
.txv3-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txv3-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.txv3-count { font-size:44px; font-weight:800; color:#41b883; display:inline-block; width:110px; text-align:center; }
.txv3-count-row { display:flex; align-items:center; justify-content:center; gap:6px; padding:16px 0; }
`
