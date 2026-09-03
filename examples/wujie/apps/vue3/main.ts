/**
 * vue3 子应用（对齐 wujie examples/vue3 全部页面）：
 *   home / dialog（Teleport 弹窗）/ location / contact（通信）/ state（保活计数 + 'add' 事件）/
 *   inline-event（行内事件验证）/ postmessage（「vue3-iframe」页，官方嵌在 vue2 页内的三层链最内层；
 *   子应用导航不含此项、进入时整条导航隐藏）
 *
 * 接入方式：@taixu/adapter-vue3（defineCordisApp），rootComponent 的 setup 闭包持有 ctx。
 */
import { defineCordisApp } from '@taixu/adapter-vue3'
import { createApp, defineComponent, h, onBeforeUnmount, ref, version as vueVersion, type Component } from 'vue'

/** 仓库地址（官方各子应用首页都有「仓库地址」入口，此处指向 taixu 仓库） */
const REPO = 'https://github.com/YvYuYv/taixu'

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
    // 官方 vue3 子应用导航没有 postmessage 项，且进入 postmessage 页时整条导航隐藏
    //（官方 App.vue：v-if="$route.name !== 'Postmessage'"）——postmessage 页由宿主
    // 嵌套挂载时经 vue3-router-change 直达
    const pages: Array<[string, string]> = [
      ['home', '首页'],
      ['dialog', '弹窗'],
      ['location', '路由'],
      ['contact', '通信'],
      ['state', '状态'],
      ['inline-event', '内联事件'],
    ]
    const nav = (p: string) => {
      page.value = p
      bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'sub-route-change', payload: { name: APP_ID, path: `/${p}` } })
    }
    return () =>
      h('div', null, [
        page.value !== 'postmessage' &&
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
          '当前 vue 版本 ',
          h('b', null, vueVersion),
          '（子应用独立副本），@taixu/adapter-vue3 接入（保活模式：suspend/resume）',
        ]),
        h(
          'p',
          null,
          '官方示例 UI 库：element-plus 版本 2.2.6 / ant-design-vue 版本 2.2.8 —— 本示例以零依赖等价实现替代，避免为演示引入大型 UI 依赖。',
        ),
        h('p', null, ['仓库地址：', h('a', { href: REPO, target: '_blank', rel: 'noreferrer' }, REPO)]),
      ])
  },
}

const Dialog: Component = {
  setup() {
    const open = ref(false)
    const pop = ref(false)
    // ④ 手动向 body 中 append 弹层：完全绕开框架，直接 document.createElement + body.appendChild。
    //    wujie 需要把这批 DOM 操作代理回子应用的 shadowRoot；taixu 同文档渲染，原生即可。
    let node: HTMLElement | null = null
    const removeBody = () => {
      node?.remove()
      node = null
    }
    const insertBody = () => {
      if (node) return
      node = document.createElement('div')
      node.className = 'txv3-overlay'
      node.innerHTML =
        '<div class="txv3-modal"><h3>手动插入的弹层</h3>' +
        '<p>由子应用 document.createElement + document.body.appendChild 生成，不经任何框架 API。</p>' +
        '<p>taixu 同文档渲染：无需把 DOM 操作代理回子应用容器。</p>' +
        '<div style="text-align:right;margin-top:14px"><button class="txv3-btn txv3-remove">删除</button></div></div>'
      document.body.appendChild(node)
      node.querySelector('.txv3-remove')?.addEventListener('click', removeBody)
      node.addEventListener('click', (e) => {
        if (e.target === node) removeBody()
      })
    }
    onBeforeUnmount(removeBody)
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
        h('h3', null, '4. 手动向 body 中 append 弹层'),
        h('button', { class: 'txv3-btn', onClick: insertBody }, '点击插入 body'),
        h('button', { class: 'txv3-btn warn', onClick: removeBody }, '点击删除 body'),
        h('p', null, '脱离框架的原生 DOM 操作，直接挂到 document.body 下。'),
        open.value &&
          h(Teleport, { to: 'body' }, [
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
          ]),
      ])
  },
}

/**
 * 路由页（对齐官方 vue3/location）。
 *
 * 官方把「路由同步」压在文末一句补充（"如果子应用配置路由同步，浏览器可通过回退回到
 * 子应用"）；taixu 是**真机制**（上行 sub-route-change / 下行 vue3-router-change，
 * 宿主 history 同步写入），所以提升为第 1 项并给出可点击的前进/后退验证按钮。
 */
const Location: Component = {
  setup() {
    const host = window.location.host
    return () =>
      h('div', null, [
        h('h2', null, 'location 处理'),
        h('p', null, '当用户访问 location 来获取当前的 url 时，wujie 统一拦截并回填子应用正确的地址；taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。'),
        h('h3', null, '1. 路由同步'),
        h('p', null, [
          '子应用页面变化经 bus 消息 ',
          h('code', null, 'sub-route-change'),
          ' 通知宿主，宿主路由跟随；宿主路由变化经定向消息 ',
          h('code', null, 'vue3-router-change'),
          ' 下发——双向同步。浏览器的刷新、前进、后退都可以作用到子应用上。',
        ]),
        h('div', { class: 'txv3-row' }, [
          h('button', { class: 'txv3-btn', onClick: () => window.history.back() }, '后退一页'),
          h('button', { class: 'txv3-btn', onClick: () => window.history.forward() }, '前进一页'),
        ]),
        h('h3', null, '2. 获取 window.location.host 的值'),
        h('blockquote', null, h('b', null, host)),
        h('p', null, 'taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。'),
        h('h3', null, '3. 修改 window.location.href'),
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
        h('p', null, '应用可以有三种方式进行通信（对应 wujie 的 props / window.parent / bus）：'),
        h('h3', null, '1. 宿主注入的导航能力（= wujie props.jump）'),
        h('p', null, '子应用 broadcast 消息 navigate，宿主监听后跳转对应路由。'),
        h(
          'button',
          {
            class: 'txv3-btn',
            onClick: () => bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name: 'react16' } }),
          },
          '点击跳转 react16',
        ),
        h('h3', null, '2. 调用宿主全局方法（= wujie window.parent.alert）'),
        h('p', null, 'taixu 子应用与宿主同窗运行——直接调用 window.alert，无需 window.parent 中转。'),
        h('button', { class: 'txv3-btn', onClick: () => window.alert('子应用直接调用 window.alert') }, '显示 alert'),
        h('h3', null, '3. bus 去中心化事件（= wujie bus.$emit）'),
        h('p', null, '子应用 broadcast click 事件，宿主全局旁听后 alert。'),
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

/**
 * 行内事件验证（对齐 wujie inline-event 页的 6 个场景）。
 *
 * 官方页的意义：wujie 双沙箱要把 `<button onclick="greet()">` 改写成
 * `onclick='with(window.__getWujieWindow__("appId")){ greet() }'`，否则内联处理器会绑到
 * 宿主 window 上而找不到子应用的函数。6 个场景就是在逐条验证这个改写是否生效。
 *
 * taixu 侧：子应用与宿主同文档、无 JS 沙箱代理 → 内联属性**原生执行**，无需改写，
 * 也没有 with 带来的作用域查找开销。因此这里仍跑同样的 6 个场景作为回归证明。
 *
 * 注意：全局函数名加了 `vue3` 前缀——taixu 子应用与宿主共享同一个 window，
 * 裸名（basicTest 等）会污染宿主；wujie 因有 iframe 隔离才用裸名。
 */
const INLINE_EVENT_HTML = `
<div class="ie-section">
  <h3>测试场景</h3>
  <p>以下按钮使用传统的 onclick 内联事件，验证是否能在子应用作用域中正常执行</p>
  <div class="ie-grid">
    <div class="ie-case">
      <h4>场景 1: 基本功能测试</h4>
      <button onclick="vue3BasicTest('hello from inline event')">基本测试</button>
      <div class="ie-result" id="vue3-ie-1">等待测试...</div>
    </div>
    <div class="ie-case">
      <h4>场景 2: 多参数测试</h4>
      <button onclick="vue3MultiParams('param1', 'param2', 123)">多参数测试</button>
      <div class="ie-result" id="vue3-ie-2">等待测试...</div>
    </div>
    <div class="ie-case">
      <h4>场景 3: 访问全局变量</h4>
      <button onclick="vue3AccessGlobal()">访问全局变量</button>
      <div class="ie-result" id="vue3-ie-3">等待测试...</div>
    </div>
    <div class="ie-case">
      <h4>场景 4: 复杂表达式</h4>
      <button onclick="vue3ComplexExpression(10, 20)">复杂表达式</button>
      <div class="ie-result" id="vue3-ie-4">等待测试...</div>
    </div>
    <div class="ie-case">
      <h4>场景 5: 事件对象访问</h4>
      <button onclick="vue3EventObjectTest(event)">事件对象测试</button>
      <div class="ie-result" id="vue3-ie-5">等待测试...</div>
    </div>
    <div class="ie-case">
      <h4>场景 6: 多个内联事件</h4>
      <button onclick="vue3MultiEvent('click')" onmouseover="vue3MultiEvent('mouseover')"
        onmouseout="vue3MultiEvent('mouseout')">多事件测试</button>
      <div class="ie-result" id="vue3-ie-6">等待测试...</div>
    </div>
  </div>
</div>
<div class="ie-section">
  <h3>测试说明</h3>
  <ul>
    <li>✅ 如果所有按钮都能正常工作，说明内联事件处理器可用</li>
    <li>❌ 如果出现 "xxx is not defined" 错误，说明作用域绑定失败</li>
    <li>📝 所有函数都定义在子应用可访问的作用域中</li>
  </ul>
</div>
<div class="ie-section">
  <h3>实现原理对比</h3>
  <p>wujie：编译前 <code>&lt;button onclick="greet()"&gt;</code>，编译后
     <code>&lt;button onclick='with(window.__getWujieWindow__("appId")){ greet() }'&gt;</code>
     ——必须编译期改写，才能把行内事件绑回子应用作用域。</p>
  <p>taixu：子应用与宿主同文档、无 JS 沙箱代理，行内事件属性原生执行——无需改写，
     也没有 with 带来的作用域查找开销。</p>
</div>
`

const InlineEvent: Component = {
  setup() {
    const w = window as any
    const put = (id: string, text: string) => {
      const el = document.getElementById(id)
      if (el) el.textContent = `✅ 成功: ${text}`
    }
    w.vue3BasicTest = (msg: string) => put('vue3-ie-1', msg)
    w.vue3MultiParams = (p1: string, p2: string, p3: number) => put('vue3-ie-2', `${p1}, ${p2}, ${p3}`)
    w.vue3TestGlobalVar = '我是全局变量'
    w.vue3AccessGlobal = () => put('vue3-ie-3', w.vue3TestGlobalVar)
    w.vue3ComplexExpression = (a: number, b: number) => put('vue3-ie-4', `${a} + ${b} = ${a + b}`)
    w.vue3EventObjectTest = (e: Event) => put('vue3-ie-5', `事件类型=${e.type}, 目标=${(e.target as HTMLElement)?.tagName}`)
    w.vue3MultiEvent = (t: string) => put('vue3-ie-6', `${t} 事件触发`)
    return () =>
      h('div', null, [
        h('h2', null, '内联事件处理器测试'),
        h('p', null, '验证 HTML 内联事件属性的作用域绑定（taixu 同文档渲染，无需编译期改写）。'),
        // 用 innerHTML 装载：才能产生**真正的** HTML 内联事件属性（h() 会把 onclick 当监听器处理）
        h('div', { class: 'txv3-ie', innerHTML: INLINE_EVENT_HTML }),
      ])
  },
}

/**
 * postmessage 页（一比一还原官方 vue3/views/PostMessage.vue，即「vue3-iframe」页）。
 *
 * 官方这一页以 iframe 形态嵌在 vue2 的 postmessage 页里（三层链的最内层），
 * 三个按钮对应三条官方消息路径：
 *   发送消息给主应用              → window.parent（主应用显示）
 *   发送消息给vue2子应用(借助主应用) → 够不着兄弟应用，发到父窗口由主应用中继转发
 *   发送消息给自己(借助主应用)      → 同上，主应用中继回自己
 *
 * taixu 落法：broadcast postmessage-ack（主应用旁听显示）/ broadcast
 * postmessage-relay（主应用收到后按 payload.target 定向转发）——「借助主应用」
 * 的中继语义原样保留，而不是让 bus 直连（官方正是因为嵌套应用够不着兄弟才有此设计）。
 */
const PostMessage: Component = {
  setup() {
    const received = ref('')
    bridge.onPost = (text: string) => (received.value = text)
    const ack = () =>
      bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'postmessage-ack', payload: { text: "hello, i'm sub app's iframe" } })
    const relay = (target: string) =>
      bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'postmessage-relay', payload: { target, text: "hello, i'm sub app's iframe" } })
    return () =>
      h('div', null, [
        h('div', { class: 'txv3-pm-title' }, 'vue3-iframe'),
        h('div', { style: { paddingBottom: '10px' } }, `接收的消息：${received.value || '（空）'}`),
        h('button', { class: 'txv3-btn', style: { marginRight: '10px' }, onClick: ack }, '发送消息给主应用'),
        h('button', { class: 'txv3-btn', style: { marginRight: '10px' }, onClick: () => relay('vue2') }, '发送消息给vue2子应用(借助主应用)'),
        h('button', { class: 'txv3-btn', onClick: () => relay('vue3') }, '发送消息给自己(借助主应用)'),
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
.txv3-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:6px 0; }
.txv3-page code { background:#f2f4f8; border-radius:4px; padding:1px 5px; font-size:13px; color:#c7254e; }
.txv3-pop { position:relative; display:inline-block; }
.txv3-pop-body { position:absolute; top:110%; left:0; background:#fff; border:1px solid #e5e8f0; box-shadow:0 4px 14px rgba(0,0,0,.12); border-radius:8px; padding:10px 14px; width:220px; z-index:50; }
.txv3-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txv3-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.txv3-count { font-size:44px; font-weight:800; color:#41b883; display:inline-block; width:110px; text-align:center; }
.txv3-count-row { display:flex; align-items:center; justify-content:center; gap:6px; padding:16px 0; }
/* postmessage 页（对齐官方 vue3/views/PostMessage.vue「vue3-iframe」页） */
.txv3-pm-title { margin-top:20px; text-align:center; font-size:20px; font-weight:800; }
/* 内联事件测试页（对齐 wujie InlineEvent.vue） */
.txv3-ie .ie-section { margin:16px 0; padding:16px; border:1px solid #ddd; border-radius:8px; }
.txv3-ie .ie-section h3 { margin:0 0 8px; font-size:16px; }
.txv3-ie .ie-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-top:12px; }
.txv3-ie .ie-case { padding:14px; background:#f5f5f5; border-radius:6px; }
.txv3-ie .ie-case h4 { margin:0 0 8px; font-size:14px; color:#333; }
.txv3-ie .ie-case button { padding:9px 18px; background:#41b883; color:#fff; border:none; border-radius:5px; cursor:pointer; font-size:14px; }
.txv3-ie .ie-case button:hover { background:#3aa876; }
.txv3-ie .ie-result { margin-top:10px; padding:10px; background:#fff; border-radius:3px; font-family:monospace; font-size:13px; color:#666; }
.txv3-ie .ie-section ul { line-height:1.8; font-size:14px; }
.txv3-ie .ie-section code { background:#f0f0f0; padding:2px 6px; border-radius:3px; font-family:monospace; font-size:13px; }
`
