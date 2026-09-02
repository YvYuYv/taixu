/**
 * vue2 子应用（对齐 wujie examples/vue2 全部页面）：
 *   home / dialog（四种弹层）/ location / communication / postmessage（bus 消息）/ rich-text（富文本）
 *
 * 接入方式：@taixu/adapter-vue2（defineCordisVue2App）——Vue 2 构造器经
 * deps 共享依赖仲裁（'vue@^2'）登记使用；模板经 vue 2.7 完整构建（含编译器）。
 */
import Vue from 'vue/dist/vue.esm.js'
import { defineCordisVue2App } from '@taixu/adapter-vue2'

const APP_ID = 'vue2'

/** 模块级桥（ctx 与宿主下行消息在 apply 期注入；Root 组件 mounted 时自登记实例） */
const bridge: any = {
  ctx: null,
  root: null,
  /** 跨组件响应式共享（postmessage 页的接收显示；Root 与子组件经此通信） */
  pm: Vue.observable({ received: '' }),
  setPage(p: string) {
    if (bridge.root) bridge.root.page = p
  },
}

/** 手动 append 到 body 的弹层（对齐 wujie AppendBody 组件） */
const AppendBody = {
  data: () => ({ visible: false }),
  template: `<div>
    <button class="txv2-btn" @click="toggle">{{ visible ? '关闭' : '打开' }} body 弹层</button>
    <div v-if="visible" class="txv2-overlay" @click="toggle">
      <div class="txv2-modal" @click.stop>
        <h3>append 到 body 的弹层</h3>
        <p>taixu 子应用与宿主同文档——直接 append 即可，无需样式兜底。</p>
      </div>
    </div>
  </div>`,
  methods: {
    toggle() {
      this.visible = !this.visible
    },
  },
}

const Root = {
  name: 'Vue2Root',
  data: () => ({ page: 'home' }),
  template: `
<div>
  <nav class="txv2-nav">
    <button v-for="p in pages" :key="p.key" :class="{ on: page === p.key }" @click="nav(p.key)">{{ p.label }}</button>
  </nav>
  <div class="txv2-page">
    <component :is="page" />
  </div>
</div>`,
  computed: {
    pages: () => [
      { key: 'home', label: '首页' },
      { key: 'dialog', label: '弹窗' },
      { key: 'location', label: '路由' },
      { key: 'communication', label: '通信' },
      { key: 'postmessage', label: 'postmessage' },
      { key: 'richtext', label: '富文本' },
    ],
  },
  mounted() {
    bridge.root = this
  },
  beforeDestroy() {
    bridge.root = null
  },
  methods: {
    nav(p: string) {
      this.page = p
      bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'sub-route-change', payload: { name: APP_ID, path: `/${p}` } })
    },
  },
}

const pages: Record<string, any> = {
  home: {
    template: `<div>
      <h2>vue2 示例</h2>
      <p>当前 Vue 版本 <b>2.7.16</b>（@taixu/adapter-vue2 接入，Vue 构造器经 deps 共享依赖仲裁）</p>
    </div>`,
  },
  dialog: {
    components: { AppendBody },
    data: () => ({ dialogVisible: false, pop: false, options: ['黄金糕', '双皮奶', '蚵仔煎'] }),
    template: `<div>
      <h2>弹窗处理</h2>
      <p>弹窗无需子应用做任何处理就可使用（同文档渲染，无 shadowRoot/iframe 边界）。</p>
      <h3>1. 打开对话框</h3>
      <button class="txv2-btn" @click="dialogVisible = true">点击打开 Dialog</button>
      <h3>2. 打开选择器</h3>
      <select class="txv2-select"><option v-for="o in options" :key="o">{{ o }}</option></select>
      <h3>3. 气泡卡片</h3>
      <span class="txv2-pop" @mouseenter="pop = true" @mouseleave="pop = false">
        <button class="txv2-btn" style="background:#5a67d8">Hover me</button>
        <span v-if="pop" class="txv2-pop-body"><div>Content</div><div>Content</div></span>
      </span>
      <h3>4. 手动向 body 中 append 弹层</h3>
      <AppendBody />
    </div>`,
  },
  location: {
    data: () => ({ host: window.location.host }),
    template: `<div>
      <h2>location 处理</h2>
      <h3>1. 获取 window.location.host 的值</h3>
      <blockquote><b>{{ host }}</b></blockquote>
      <p>taixu 子应用与宿主同文档，location 直读真实地址——无需框架劫持回填。</p>
      <h3>2. 修改 window.location.href</h3>
      <button class="txv2-btn warn" @click="jump">跳转 taixu 仓库</button>
      <p>同窗应用直接跳转，无 shadow 删除 / iframe 替换等降级动作。</p>
    </div>`,
    methods: {
      jump() {
        window.location.href = 'https://github.com/taixu-micro'
      },
    },
  },
  communication: {
    template: `<div>
      <h2>通信处理</h2>
      <h3>1. 宿主导航能力（= props.jump）</h3>
      <button class="txv2-btn" @click="nav('react17')">点击跳转 react17</button>
      <h3>2. 调用宿主全局方法</h3>
      <button class="txv2-btn" @click="alert2()">显示 alert</button>
      <h3>3. bus 去中心化事件</h3>
      <button class="txv2-btn" @click="emitClick()">显示 alert（bus）</button>
    </div>`,
    methods: {
      nav(name: string) {
        bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'navigate', payload: { name } })
      },
      alert2() {
        window.alert('子应用直接调用 window.alert')
      },
      emitClick() {
        bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'click', payload: 'vue2' })
      },
    },
  },
  /** wujie 的 postmessage 页演示 iframe 消息中继；taixu 同文档直接走 bus 双向消息 */
  postmessage: {
    computed: {
      received: () => bridge.pm.received,
    },
    template: `<div>
      <h2>postmessage 处理</h2>
      <p>wujie 因 iframe 隔离需要 postMessage 中继；taixu 同窗运行，直接走 bus 双向消息。</p>
      <h3>接收的消息：{{ received || '（空）' }}</h3>
      <button class="txv2-btn" @click="send">发送消息给主应用</button>
    </div>`,
    methods: {
      send() {
        bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'postmessage-ack', payload: { text: "hello, i'm vue2 sub app" } })
      },
    },
  },
  /** wujie vue2 的 rich-text 页（WangEditor/TinyMCE）——这里以零依赖 contenteditable 等价演示 */
  richtext: {
    data: () => ({ html: '<p>富文本编辑器运行在 vue2 子应用内 —— 无需框架为编辑器做任何特殊处理。</p>' }),
    template: `<div>
      <h2>富文本处理</h2>
      <p>wujie 版示例引入 wangEditor/TinyMCE 验证第三方富文本在沙箱内可用；taixu 同文档渲染，任何编辑器原生可用（此处以零依赖编辑器演示同等能力）。</p>
      <div class="txv2-toolbar">
        <button class="txv2-btn" @click="cmd('bold')"><b>B</b></button>
        <button class="txv2-btn" @click="cmd('italic')"><i>I</i></button>
        <button class="txv2-btn" @click="cmd('underline')"><u>U</u></button>
        <button class="txv2-btn" @click="cmd('insertUnorderedList')">列表</button>
      </div>
      <div class="txv2-editor" contenteditable="true" @input="html = $event.target.innerHTML" v-html="html"></div>
    </div>`,
    methods: {
      cmd(c: string) {
        document.execCommand(c)
      },
    },
  },
}

/** pages 声明在 Root 之后（对象字面量闭包引用无碍），此处回填组件注册表 */
;(Root as any).components = pages

export default {
  name: APP_ID,
  inject: ['lifecycle', 'deps', 'monitor', 'style', 'bus'],
  apply(ctx: any) {
    ctx.style.inject(ctx, { file: 'vue2.css', css: STYLES })
    bridge.ctx = ctx

    // 宿主下行：路由同步 + postmessage 页消息
    ctx.on('message/receive', (e: any) => {
      const m = e.message
      if (m?.type === 'vue2-router-change' && m.payload?.path) {
        bridge.setPage(String(m.payload.path).replace(/^\//, '') || 'home')
      }
      if (m?.type === 'postmessage') {
        bridge.pm.received = m.payload?.text ?? ''
      }
    })

    // registerShared 先行（Vue 2.7 构造器来自本应用自身的 bundle），再走适配器仲裁；
    // 重复挂载（dispose 后重挂）时已注册同版本——容忍即幂等
    try {
      ctx.deps.registerShared('vue', { version: '2.7.16', module: { default: Vue } })
    } catch {
      /* 已注册同版本（同一 bundle 实例），幂等 */
    }

    defineCordisVue2App({
      appId: APP_ID,
      vueRange: '^2',
      render: (h: any) => h(Root),
    }).apply(ctx)
  },
}

const STYLES = `
.txv2-nav { display:flex; gap:12px; padding:10px 4px; border-bottom:1px solid #e5e8f0; flex-wrap:wrap; }
.txv2-nav button { border:none; background:none; color:#2c3e50; font-size:15px; cursor:pointer; padding:4px 2px; }
.txv2-nav button.on { color:#0f9d58; font-weight:700; border-bottom:2px solid #0f9d58; }
.txv2-page { padding:14px 6px; }
.txv2-page h2 { margin:6px 0 12px; font-size:20px; }
.txv2-page h3 { margin:14px 0 6px; font-size:16px; border-bottom:1px solid #eaecef; padding-bottom:4px; }
.txv2-page p, .txv2-page blockquote { font-size:14px; color:#445; line-height:1.7; margin:6px 0; }
.txv2-btn { background:#0f9d58; color:#fff; border:none; border-radius:6px; padding:7px 14px; cursor:pointer; font-size:14px; margin:4px 8px 4px 0; }
.txv2-btn.warn { background:#e6a23c; }
.txv2-select { padding:6px 10px; border:1px solid #d5daea; border-radius:6px; font-size:14px; }
.txv2-pop { position:relative; display:inline-block; }
.txv2-pop-body { position:absolute; top:110%; left:0; background:#fff; border:1px solid #e5e8f0; box-shadow:0 4px 14px rgba(0,0,0,.12); border-radius:8px; padding:10px 14px; width:220px; z-index:50; }
.txv2-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txv2-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.txv2-toolbar { margin:10px 0; }
.txv2-editor { border:1px solid #d5daea; border-radius:8px; min-height:160px; padding:12px; font-size:14px; outline:none; }
`
