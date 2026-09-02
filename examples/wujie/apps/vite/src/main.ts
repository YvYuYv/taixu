/**
 * vite 子应用（对齐 wujie examples/vite：构建工具差异化——经 Vite lib mode 独立构建）：
 *   home / dialog / location / contact（通信）
 *
 * default export = taixu Plugin（与 esbuild 子应用产物同形态，宿主无感知）。
 */
import { defineCordisApp } from '@taixu/adapter-vue3'
import { defineComponent, h, ref, Teleport, type Component } from 'vue'

const APP_ID = 'vite'

const bridge: any = { ctx: null }

const Root = defineComponent({
  name: 'ViteRoot',
  setup() {
    const page = ref('home')
    bridge.setPage = (p: string) => (page.value = p)
    const pages: Array<[string, string]> = [
      ['home', '首页'],
      ['dialog', '弹窗'],
      ['location', '路由'],
      ['contact', '通信'],
    ]
    const nav = (p: string) => {
      page.value = p
      bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'sub-route-change', payload: { name: APP_ID, path: `/${p}` } })
    }
    return () =>
      h('div', null, [
        h(
          'nav',
          { class: 'txvt-nav' },
          pages.map(([key, label]) =>
            h('button', { class: page.value === key ? 'on' : '', onClick: () => nav(key) }, label),
          ),
        ),
        h('div', { class: 'txvt-page' }, [
          page.value === 'home' && h(Home),
          page.value === 'dialog' && h(Dialog),
          page.value === 'location' && h(Location),
          page.value === 'contact' && h(Contact),
        ]),
      ])
  },
})

const Home: Component = {
  setup() {
    return () =>
      h('div', null, [
        h('h2', null, 'vite 示例'),
        h('p', null, [
          '本子应用由 ',
          h('b', null, 'Vite lib mode'),
          ' 独立构建（构建工具差异化）——产物与 esbuild 子应用同形态：自包含 ESM（default export = taixu Plugin）。',
        ]),
        h('p', null, '页面目录：弹窗 / 路由 / 通信。'),
      ])
  },
}

const Dialog: Component = {
  setup() {
    const open = ref(false)
    return () =>
      h('div', null, [
        h('h2', null, '弹窗处理'),
        h('p', null, '弹窗无需子应用做任何处理就可使用（Teleport 挂 body）。'),
        h('h3', null, '1. 打开弹窗'),
        h('button', { class: 'txvt-btn', onClick: () => (open.value = true) }, 'Open Modal'),
        h('h3', null, '2. 下拉选择器'),
        h(
          'select',
          { class: 'txvt-select' },
          ['Jack', 'Lucy', 'Tom'].map((n) => h('option', { key: n }, n)),
        ),
        open.value &&
          h(Teleport, { to: 'body' }, () =>
            h(
              'div',
              { class: 'txvt-overlay', onClick: () => (open.value = false) },
              h(
                'div',
                { class: 'txvt-modal', onClick: (e: Event) => e.stopPropagation() },
                [
                  h('h3', null, 'Basic Modal'),
                  h('p', null, '弹窗内容（渲染在 body 下）'),
                  h('div', { style: { textAlign: 'right', marginTop: '14px' } }, [
                    h('button', { class: 'txvt-btn', onClick: () => (open.value = false) }, 'OK'),
                  ]),
                ],
              ),
            ),
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
          { class: 'txvt-btn warn', onClick: () => (window.location.href = 'https://github.com/taixu-micro') },
          '跳转 taixu 仓库',
        ),
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
            class: 'txvt-btn',
            onClick: () => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'react16' } }),
          },
          '点击跳转 react16',
        ),
        h('h3', null, '2. 调用宿主全局方法'),
        h('button', { class: 'txvt-btn', onClick: () => window.alert('子应用直接调用 window.alert') }, '显示 alert'),
        h('h3', null, '3. bus 去中心化事件'),
        h(
          'button',
          {
            class: 'txvt-btn',
            onClick: () => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'click', payload: 'vite' }),
          },
          '显示 alert（bus）',
        ),
      ])
  },
}

export default {
  name: APP_ID,
  inject: ['lifecycle', 'bus', 'monitor', 'style'],
  apply(ctx: any) {
    ctx.style.inject(ctx, { file: 'vite.css', css: STYLES })
    bridge.ctx = ctx

    ctx.on('message/receive', (e: any) => {
      const m = e.message
      if (m?.type === 'vite-router-change' && m.payload?.path) {
        bridge.setPage?.(String(m.payload.path).replace(/^\//, '') || 'home')
      }
    })

    defineCordisApp({ appId: APP_ID, rootComponent: Root }).apply(ctx)
  },
}

const STYLES = `
.txvt-nav { display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid #e5e8f0; flex-wrap:wrap; }
.txvt-nav button { border:none; background:none; color:#2c3e50; font-size:15px; cursor:pointer; padding:4px 2px; }
.txvt-nav button.on { color:#646cff; font-weight:700; border-bottom:2px solid #646cff; }
.txvt-page { padding:14px 6px; }
.txvt-page h2 { margin:6px 0 12px; font-size:20px; }
.txvt-page h3 { margin:14px 0 6px; font-size:16px; border-bottom:1px solid #eaecef; padding-bottom:4px; }
.txvt-page p, .txvt-page blockquote { font-size:14px; color:#445; line-height:1.7; margin:6px 0; }
.txvt-btn { background:#646cff; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:14px; margin:4px 8px 4px 0; }
.txvt-btn.warn { background:#e6a23c; }
.txvt-select { padding:6px 10px; border:1px solid #d5daea; border-radius:6px; font-size:14px; }
.txvt-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txvt-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
`
