/**
 * vite 子应用（对齐 wujie examples/vite：构建工具差异化——经 Vite lib mode 独立构建）：
 *   home / dialog / location / contact（通信）
 *
 * default export = taixu Plugin（与 esbuild 子应用产物同形态，宿主无感知）。
 */
import { defineCordisApp } from '@taixu/adapter-vue3'
import { defineComponent, h, onBeforeUnmount, ref, Teleport, version as vueVersion, type Component } from 'vue'

/** 仓库地址（官方各子应用首页都有「仓库地址」入口，此处指向 taixu 仓库） */
const REPO = 'https://github.com/YvYuYv/taixu'
/** 构建工具版本：由 vite.config.ts 在 define 中注入（对齐官方首页的「当前vite版本」） */
declare const __VITE_VERSION__: string

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
          '当前 vite 版本 ',
          h('b', null, __VITE_VERSION__),
          '，当前 vue 版本 ',
          h('b', null, vueVersion),
          '（本子应用由 Vite lib mode 独立构建——构建工具差异化；产物与 esbuild 子应用同形态：自包含 ESM，default export = taixu Plugin）。',
        ]),
        h(
          'p',
          null,
          '官方示例 UI 库：element-plus 版本 2.2.6 / ant-design-vue 版本 2.2.8 —— 本示例以零依赖等价实现替代，避免为演示引入大型 UI 依赖。',
        ),
        h('p', null, ['仓库地址：', h('a', { href: REPO, target: '_blank', rel: 'noreferrer' }, REPO)]),
        h('p', null, '页面目录：弹窗 / 路由 / 通信。'),
      ])
  },
}

const Dialog: Component = {
  setup() {
    const open = ref(false)
    const pop = ref(false)
    // ④ 手动向 body 中 append 弹层：绕开框架，直接 document.createElement + body.appendChild
    let node: HTMLElement | null = null
    const removeBody = () => {
      node?.remove()
      node = null
    }
    const insertBody = () => {
      if (node) return
      node = document.createElement('div')
      node.className = 'txvt-overlay'
      node.innerHTML =
        '<div class="txvt-modal"><h3>手动插入的弹层</h3>' +
        '<p>由子应用 document.createElement + document.body.appendChild 生成，不经任何框架 API。</p>' +
        '<div style="text-align:right;margin-top:14px"><button class="txvt-btn txvt-remove">删除</button></div></div>'
      document.body.appendChild(node)
      node.querySelector('.txvt-remove')?.addEventListener('click', removeBody)
      node.addEventListener('click', (e) => {
        if (e.target === node) removeBody()
      })
    }
    onBeforeUnmount(removeBody)
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
        h('h3', null, '3. 气泡卡片（悬停）'),
        h(
          'span',
          {
            class: 'txvt-pop',
            onMouseenter: () => (pop.value = true),
            onMouseleave: () => (pop.value = false),
          },
          [
            h('button', { class: 'txvt-btn', style: { background: '#5a67d8' } }, 'Hover me'),
            pop.value && h('span', { class: 'txvt-pop-body' }, [h('div', null, 'Content'), h('div', null, 'Content')]),
          ],
        ),
        h('h3', null, '4. 手动向 body 中 append 弹层'),
        h('button', { class: 'txvt-btn', onClick: insertBody }, '点击插入 body'),
        h('button', { class: 'txvt-btn warn', onClick: removeBody }, '点击删除 body'),
        open.value &&
          h(Teleport, { to: 'body' }, [
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
          ]),
      ])
  },
}

/**
 * 路由页（对齐官方 vite/location）。
 *
 * 官方这一页的核心其实是**讲 vite 的坑**：`<script type="module">` 无法用闭包劫持
 * location，只能把代理挂到 `$wujie.location`，并要求业务代码全部改写。taixu 同文档
 * 渲染没有这一层，所以这里把差异讲清楚（而不是照抄一个用不上的 $wujie），并把官方
 * 压在文末的「路由同步」提升为第 1 项——taixu 是真机制，且给出可点击的前进/后退验证。
 */
const Location: Component = {
  setup() {
    const host = window.location.host
    return () =>
      h('div', null, [
        h('h2', null, 'location 处理'),
        h('p', null, [
          '官方 vite 示例因 ',
          h('code', null, '<script type="module">'),
          ' 无法用闭包劫持 location，需把代理挂到 ',
          h('code', null, '$wujie.location'),
          '，子应用所有用到 ',
          h('code', null, 'window.location'),
          ' 的代码都要改写成 ',
          h('code', null, '$wujie.location'),
          '；taixu 子应用与宿主同文档渲染，location 直读真实地址，无需任何改写。',
        ]),
        h('h3', null, '1. 路由同步'),
        h('p', null, [
          '子应用页面变化经 bus 消息 ',
          h('code', null, 'sub-route-change'),
          ' 通知宿主，宿主路由跟随；宿主路由变化经定向消息 ',
          h('code', null, 'vite-router-change'),
          ' 下发——双向同步。浏览器的刷新、前进、后退都可以作用到子应用上。',
        ]),
        h('div', { class: 'txvt-row' }, [
          h('button', { class: 'txvt-btn', onClick: () => window.history.back() }, '后退一页'),
          h('button', { class: 'txvt-btn', onClick: () => window.history.forward() }, '前进一页'),
        ]),
        h('h3', null, '2. 获取 window.location.host 的值'),
        h('blockquote', null, h('b', null, host)),
        h('p', null, 'taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。'),
        h('h3', null, '3. 修改 window.location.href'),
        h(
          'button',
          { class: 'txvt-btn warn', onClick: () => (window.location.href = 'https://github.com/taixu-micro') },
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
        h('p', null, '应用可以有三种方式进行通信（对应 wujie 的 props / window.parent / bus）：'),
        h('h3', null, '1. 宿主注入的导航能力（= wujie props.jump）'),
        h('p', null, '子应用 broadcast 消息 navigate，宿主监听后跳转对应路由。'),
        h(
          'button',
          {
            class: 'txvt-btn',
            onClick: () => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'react16' } }),
          },
          '点击跳转 react16',
        ),
        h('h3', null, '2. 调用宿主全局方法（= wujie window.parent.alert）'),
        h('p', null, 'taixu 子应用与宿主同窗运行——直接调用 window.alert，无需 window.parent 中转。'),
        h('button', { class: 'txvt-btn', onClick: () => window.alert('子应用直接调用 window.alert') }, '显示 alert'),
        h('h3', null, '3. bus 去中心化事件（= wujie bus.$emit）'),
        h('p', null, '子应用 broadcast click 事件，宿主全局旁听后 alert。'),
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
.txvt-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:6px 0; }
.txvt-page code { background:#f2f4f8; border-radius:4px; padding:1px 5px; font-size:13px; color:#c7254e; }
.txvt-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txvt-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.txvt-pop { position:relative; display:inline-block; }
.txvt-pop-body { position:absolute; top:110%; left:0; background:#fff; border:1px solid #e5e8f0; box-shadow:0 4px 14px rgba(0,0,0,.12); border-radius:8px; padding:10px 14px; width:220px; z-index:50; }
`
