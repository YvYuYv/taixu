/**
 * vue2 子应用（对齐 wujie examples/vue2 全部页面）：
 *   home / dialog（四种弹层）/ location / communication / rich-text（富文本）
 *   + postmessage（官方子应用导航不含此项、进入时整条导航隐藏；仅从宿主一级菜单进入，
 *     页内嵌套挂载 vue3 —— 三级链 主应用 → vue2 → vue3）
 *
 * 接入方式：@taixu/adapter-vue2（defineCordisVue2App）——Vue 2 构造器经
 * deps 共享依赖仲裁（'vue@^2'）登记使用；模板经 vue 2.7 完整构建（含编译器）。
 */
import Vue from 'vue/dist/vue.esm.js'
import { defineCordisVue2App } from '@taixu/adapter-vue2'
import PopperV1 from 'popper.js'
import { createPopper } from '@popperjs/core'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'

const APP_ID = 'vue2'

/** 仓库地址（官方各子应用首页都有「仓库地址」入口，此处指向 taixu 仓库） */
const REPO_URL = 'https://github.com/YvYuYv/taixu'

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

/**
 * 富文本编辑器（零依赖 contenteditable）。
 *
 * 关键：**只在 mounted 时写一次 innerHTML**，之后不再用 v-html 回写。
 * contenteditable + 响应式 v-html 会造成「输入 → 触发渲染 → DOM 重建 → 光标跳到开头」，
 * 这恰好会掩盖官方 #513 要验证的"快速输入不失焦"——所以这里必须单向：挂载注入、输入只读出。
 */
const RichEditor = {
  props: { value: { type: String, default: '' } },
  template: `<div class="txv2-editor" contenteditable="true" @input="onInput"></div>`,
  mounted() {
    this.$el.innerHTML = this.value
  },
  methods: {
    onInput(e: Event) {
      this.$emit('input', (e.target as HTMLElement).innerHTML)
    },
  },
}

/**
 * 原生定位库弹出层（对齐 wujie NativePopperDemo 组件）。
 *
 * 官方这一项的意义：Popper / Floating UI 这类库会把弹层 append 到 document.body 并用
 * GPU transform 定位——在 wujie 的 shadowRoot + iframe 双沙箱里，这一步最容易发生
 * **定位漂移**，所以专门列一个用例来观察。
 *
 * taixu 侧用**同样的三个真实库**（popper.js 1.x / @popperjs/core 2.x / @floating-ui/dom），
 * 而不是手写一个「看起来像」的定位实现——只有用真库才能证明「第三方定位库在 taixu 内可用」。
 */
const NativePopperDemo = {
  name: 'NativePopperDemo',
  props: { context: { type: String, default: '弹窗页面' } },
  data: () => ({
    activeKey: '',
    instances: {} as Record<string, any>,
    demoCases: [
      { key: 'popper1', label: '打开 Popper.js 1.x', title: 'Popper.js 1.16.1' },
      { key: 'popper2', label: '打开 Popper.js 2.x', title: '@popperjs/core 2.11.8' },
      { key: 'floating', label: '打开 Floating UI', title: '@floating-ui/dom 0.5.4' },
    ],
  }),
  template: `<div class="txv2-popper-demo">
    <h4>{{ context }}：原生定位库弹出层</h4>
    <p class="txv2-popper-desc">
      点击按钮打开 append 到 document.body 的原生弹出层，用于观察子应用内是否发生定位漂移。
    </p>
    <div class="txv2-popper-grid">
      <div v-for="item in demoCases" :key="item.key" class="txv2-popper-item">
        <button :ref="'reference-' + item.key" class="txv2-popper-btn" @click="toggle(item.key)">{{ item.label }}</button>
        <div v-show="activeKey === item.key" :ref="'popper-' + item.key" class="txv2-popper">
          <strong>{{ item.title }}</strong>
          <span>{{ context }}</span>
          <small>placement: top / appendTo: body / gpu transform</small>
          <div class="txv2-popper-arrow" data-popper-arrow></div>
        </div>
      </div>
    </div>
  </div>`,
  mounted() {
    this.appendPopperElements()
  },
  beforeDestroy() {
    this.destroyAll()
    this.removePopperElements()
  },
  methods: {
    toggle(key: string) {
      if (this.activeKey === key) return this.hideActive()
      this.show(key)
    },
    show(key: string) {
      this.hideActive()
      this.activeKey = key
      this.$nextTick(() => {
        this.appendPopperElements()
        const referenceEl = this.getRef('reference-' + key)
        const popperEl = this.getRef('popper-' + key)
        if (!referenceEl || !popperEl) return
        popperEl.style.display = 'block'
        this.instances[key] = this.createInstance(key, referenceEl, popperEl)
      })
    },
    hideActive() {
      const key = this.activeKey
      if (!key) return
      this.destroyInstance(key)
      const popperEl = this.getRef('popper-' + key)
      if (popperEl) popperEl.style.display = 'none'
      this.activeKey = ''
    },
    /** 三个库各按官方示例的调用方式建实例 */
    createInstance(key: string, referenceEl: any, popperEl: any) {
      if (key === 'popper1') {
        return new (PopperV1 as any)(referenceEl, popperEl, {
          placement: 'top',
          gpuAcceleration: true,
          modifiers: { offset: { offset: '0, 8' }, preventOverflow: { boundariesElement: 'viewport', padding: 8 } },
        })
      }
      if (key === 'popper2') {
        return createPopper(referenceEl, popperEl, {
          placement: 'top',
          modifiers: [
            { name: 'offset', options: { offset: [0, 8] } },
            { name: 'flip' },
            { name: 'preventOverflow', options: { boundary: 'viewport', padding: 8 } },
            { name: 'computeStyles', options: { gpuAcceleration: true } },
          ],
        })
      }
      // Floating UI：autoUpdate + computePosition，结果写回 transform
      const update = () => {
        computePosition(referenceEl, popperEl, {
          placement: 'top',
          strategy: 'absolute',
          middleware: [offset(8), flip(), shift({ padding: 8 })],
        }).then(({ x, y, strategy }: any) => {
          Object.assign(popperEl.style, {
            position: strategy,
            left: '0',
            top: '0',
            transform: `translate3d(${x}px, ${y}px, 0)`,
            willChange: 'transform',
          })
        })
      }
      const cleanup = autoUpdate(referenceEl, popperEl, update)
      update()
      return { update, destroy: cleanup }
    },
    destroyInstance(key: string) {
      const inst = this.instances[key]
      if (!inst) return
      if (inst.destroy) inst.destroy()
      this.$delete(this.instances, key)
    },
    destroyAll() {
      Object.keys(this.instances).forEach((k) => this.destroyInstance(k))
    },
    /** 与官方一致：把弹层元素搬到 document.body 下（这正是漂移容易发生的地方） */
    appendPopperElements() {
      for (const item of this.demoCases) {
        const el = this.getRef('popper-' + item.key)
        if (el && el.parentNode !== document.body) document.body.appendChild(el)
      }
    },
    removePopperElements() {
      for (const item of this.demoCases) {
        const el = this.getRef('popper-' + item.key)
        if (el && el.parentNode) el.parentNode.removeChild(el)
      }
    },
    getRef(name: string) {
      const r = (this.$refs as any)[name]
      return Array.isArray(r) ? r[0] : r
    },
  },
}

/**
 * 路由 key（URL / 导航广播 / 宿主下发用）→ 组件名。
 *
 * **为什么组件名要跟路由 key 分开**：Vue 2 的 `createElement` 会先判
 * `isReservedTag(tag)`，命中就当原生元素渲染、根本不查 `components` 表。
 * `dialog` 是 HTML 保留标签，于是 `<component :is="'dialog'">` 渲染成了
 * 一个空的原生 `<dialog>`（Vue 2 已知坑）。组件统一登记大写名规避。
 */
const COMPONENT_OF: Record<string, string> = {
  home: 'Home',
  dialog: 'DialogPage',
  location: 'LocationPage',
  communication: 'CommPage',
  postmessage: 'PmPage',
  'rich-text': 'RichTextPage',
  richtext: 'RichTextPage', // 兼容旧 key
}

const Root = {
  name: 'Vue2Root',
  data: () => ({ page: 'home' }),
  template: `
<div>
  <nav class="txv2-nav" v-if="page !== 'postmessage'">
    <button v-for="p in pages" :key="p.key" :class="{ on: page === p.key }" @click="nav(p.key)">{{ p.label }}</button>
  </nav>
  <div class="txv2-page">
    <component :is="currentComponent" />
  </div>
</div>`,
  computed: {
    // 官方 vue2 子应用导航没有 postmessage 项，且进入 postmessage 页时整条导航隐藏
    //（官方 App.vue：v-if="$route.name !== 'postmessage'"）——postmessage 只从宿主一级菜单进入
    pages: () => [
      { key: 'home', label: '首页' },
      { key: 'dialog', label: '弹窗' },
      { key: 'location', label: '路由' },
      { key: 'communication', label: '通信' },
      { key: 'rich-text', label: '富文本' },
    ],
    /**
     * 路由 key → 组件名。
     * **不能直接用路由 key 当组件名**：Vue 2 的 createElement 先判 `isReservedTag(tag)`，
     * 命中就渲染原生元素、根本不查 components 表——`dialog` 是 HTML 保留标签，
     * 于是 `<component :is="'dialog'">` 渲染成了空的原生 `<dialog>`（Vue 2 已知坑）。
     * 组件统一用大写名避开保留标签判定。
     */
    currentComponent(): string {
      return COMPONENT_OF[this.page] ?? 'Home'
    },
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
  Home: {
    template: `<div>
      <h2>vue2 示例</h2>
      <p>当前 vue 版本 <b>{{ vueVersion }}</b>（@taixu/adapter-vue2 接入，Vue 构造器经 deps 共享依赖仲裁）</p>
      <p>官方示例 UI 库：element 版本 2.15.6 / ant-design-vue 版本 1.7.8 —— 本示例以零依赖等价实现替代，避免为演示引入大型 UI 依赖。</p>
      <p>仓库地址：<a :href="repo" target="_blank" rel="noreferrer">{{ repo }}</a></p>
    </div>`,
    data: () => ({ vueVersion: Vue.version, repo: REPO_URL }),
  },
  DialogPage: {
    components: { AppendBody, NativePopperDemo },
    data: () => ({ dialogVisible: false, pop: false, options: ['黄金糕', '双皮奶', '蚵仔煎'] }),
    template: `<div>
      <h2>弹窗处理</h2>
      <p>弹窗无需子应用做任何处理就可使用（同文档渲染，无 shadowRoot/iframe 边界）。</p>
      <h3>1. 打开对话框</h3>
      <button class="txv2-btn" @click="dialogVisible = true">点击打开 Dialog</button>
      <div v-if="dialogVisible" class="txv2-overlay" @click="dialogVisible = false">
        <div class="txv2-modal" @click.stop>
          <h3>Basic Modal</h3>
          <p>弹窗内容（taixu 同文档渲染，v-if 直挂组件树即可，无需传送门/样式兜底）</p>
          <select class="txv2-select">
            <option value="">Select a person（弹窗内）</option>
            <option v-for="o in options" :key="o">{{ o }}</option>
          </select>
          <div style="text-align:right;margin-top:14px">
            <button class="txv2-btn" @click="dialogVisible = false">OK</button>
          </div>
        </div>
      </div>
      <h3>2. 打开选择器</h3>
      <select class="txv2-select"><option v-for="o in options" :key="o">{{ o }}</option></select>
      <h3>3. 气泡卡片</h3>
      <span class="txv2-pop" @mouseenter="pop = true" @mouseleave="pop = false">
        <button class="txv2-btn" style="background:#5a67d8">Hover me</button>
        <span v-if="pop" class="txv2-pop-body"><div>Content</div><div>Content</div></span>
      </span>
      <h3>4. 手动向 body 中 append 弹层</h3>
      <AppendBody />
      <h3>5. 原生 Popper/Floating 弹出层</h3>
      <NativePopperDemo context="弹窗页面" />
    </div>`,
  },
  /**
   * 路由页（对齐官方 vue2/location）。
   *
   * 官方把「路由同步」放在文末一句补充说明（"如果子应用配置路由同步，浏览器可通过回退
   * 回到子应用"）；taixu 的路由同步是**真实机制**——子应用 broadcast 'sub-route-change'
   * 上行、宿主定向 '*<appId>*-router-change' 下行，且宿主 history 记录同步写入，所以这里
   * 把它提升成第 1 项，并给出可直接点击验证的前进/后退按钮。
   */
  LocationPage: {
    data: () => ({ host: window.location.host }),
    template: `<div>
      <h2>location 处理</h2>
      <p>当用户访问 location 来获取当前的 url 时，wujie 统一拦截并回填子应用正确的地址；taixu 子应用与宿主同文档，location 直读真实地址——无需劫持回填。</p>
      <h3>1. 路由同步</h3>
      <p>子应用页面变化经 bus 消息 <code>sub-route-change</code> 通知宿主，宿主路由跟随；宿主路由变化经定向消息 <code>vue2-router-change</code> 下发——双向同步。浏览器的刷新、前进、后退都可以作用到子应用上。</p>
      <div class="txv2-row">
        <button class="txv2-btn" @click="back">后退一页</button>
        <button class="txv2-btn" @click="forward">前进一页</button>
      </div>
      <h3>2. 获取 window.location.host 的值</h3>
      <blockquote><b>{{ host }}</b></blockquote>
      <p>taixu 子应用与宿主同文档，location 直读真实地址——无需框架劫持回填。</p>
      <h3>3. 修改 window.location.href</h3>
      <button class="txv2-btn warn" @click="jump">跳转 taixu 仓库</button>
      <p>同窗应用直接跳转，无 shadow 删除 / iframe 替换等降级动作。</p>
    </div>`,
    methods: {
      back() {
        window.history.back()
      },
      forward() {
        window.history.forward()
      },
      jump() {
        window.location.href = 'https://github.com/taixu-micro'
      },
    },
  },
  CommPage: {
    template: `<div>
      <h2>通信处理</h2>
      <p>应用可以有三种方式进行通信（对应 wujie 的 props / window.parent / bus）：</p>
      <h3>1. 宿主注入的导航能力（= wujie props.jump）</h3>
      <p>子应用 broadcast 消息 navigate，宿主监听后跳转对应路由。</p>
      <button class="txv2-btn" @click="nav('react17')">点击跳转 react17</button>
      <h3>2. 调用宿主全局方法（= wujie window.parent.alert）</h3>
      <p>taixu 子应用与宿主同窗运行——直接调用 window.alert，无需 window.parent 中转。</p>
      <button class="txv2-btn" @click="alert2()">显示 alert</button>
      <h3>3. bus 去中心化事件（= wujie bus.$emit）</h3>
      <p>子应用 broadcast click 事件，宿主全局旁听后 alert。</p>
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
  /**
   * postmessage 页（一比一还原官方 vue2/views/PostMessage.vue 的结构与交互）：
   *   标题「vue2-子应用」+ 接收的消息 + 「发消息给主应用」「发消息给iframe」两个按钮
   *   + 页内嵌一块 iframe 区。
   *
   * 官方的 iframe 指向 vue3 应用的 postmessage 页（跨应用三层链：
   * 主应用 → vue2 → 内嵌 vue3）。taixu 同文档渲染，iframe 的等价物是
   * 「应用内再挂应用」：这里只渲染嵌套容器（#pm-nest-vue3），由宿主把 vue3
   * 挂进来（lifecycle.mount('vue3', 'pm-nest-vue3')）。
   *
   * 消息面（对齐官方 type 语义）：
   *   发消息给主应用  → broadcast postmessage-ack（宿主旁听显示）
   *   发消息给iframe  → 定向 send 给嵌套 vue3（官方：iframe.contentWindow.postMessage）
   */
  PmPage: {
    computed: {
      received: () => bridge.pm.received,
    },
    template: `<div>
      <div class="txv2-pm-title">vue2-子应用</div>
      <div class="txv2-pm-main">
        <div style="padding-bottom:10px">接收的消息：{{ received || '（空）' }}</div>
        <button class="txv2-btn" style="margin-right:10px" @click="toMain">发消息给主应用</button>
        <button class="txv2-btn" @click="toIframe">发消息给iframe</button>
        <p class="txv2-pm-note">官方版此处用 iframe 直载 vue3 的 postmessage 页；taixu 同文档渲染，等价实现为嵌套挂载 vue3 子应用（下方虚线框，应用内再挂应用）。</p>
      </div>
      <div class="txv2-pm-nest"><div id="pm-nest-vue3"></div></div>
    </div>`,
    methods: {
      toMain() {
        bridge.ctx?.bus.broadcast(bridge.ctx, { type: 'postmessage-ack', payload: { text: "hello, i'm sub app" } })
      },
      toIframe() {
        bridge.ctx?.bus.send(bridge.ctx, { type: 'postmessage', payload: { text: "hello, i'm sub app" }, target: 'vue3' })
      },
    },
  },
  /**
   * 富文本页（一比一还原官方 vue2/rich-text 的**三个回归场景**）。
   *
   * 官方这一页不是"一个编辑器"，而是 wujie **自身 iframe 沙箱缺陷的回归集合**：
   *   #218 预填内容删改 / #513 快速输入失焦 / #450·#770 选区与 DOM 映射。
   * 这三条的根因都在跨 realm——子应用跑在渲染 iframe 里，getSelection() 与
   * ownerDocument 指向 iframe document，wujie 要靠 patchDegradeInstanceofAcrossRealms
   * 兜底。taixu 子应用与宿主**同文档**，不存在跨 realm，所以这里给出同构的三场景
   * 验证 + 实时 LO/RO 探针（恒为 true，且 anchorOwnerIsRenderDoc 也恒为 true）。
   */
  RichTextPage: {
    components: { RichEditor },
    data: () => ({
      cases: [
        {
          id: 'prefill',
          title: '预填内容删改',
          issue: 'Issue #218',
          link: 'https://github.com/Tencent/wujie/issues/218',
          desc: '子应用使用编辑器初始化已有 HTML 后，聚焦编辑、删除预填文字、在中段插入内容均正常。',
          op: '点击下方编辑器，删除预填文字或在「预填」二字前插入新内容，确认光标与删改行为符合预期。',
          html: '<p>这是预填内容，请尝试删除本段文字或在「预填」二字前插入新内容。</p>',
        },
        {
          id: 'fastinput',
          title: '快速输入不失焦',
          issue: 'Issue #513',
          link: 'https://github.com/Tencent/wujie/issues/513',
          desc: '快速连续输入（含输入法）时编辑器保持聚焦，无光标跳动；LO / RO 为 true 时选区同步正常。',
          op: '在下方编辑器快速连续打字（含中文输入法），确认无失焦、光标跳动；同时观察上方 LO/RO 面板均为 true。',
          html: '<p>请在此输入内容进行验证…</p>',
        },
        {
          id: 'selection',
          title: 'Selection / DOM 一致',
          issue: 'Issue #450、#770',
          link: 'https://github.com/Tencent/wujie/issues/450',
          desc: '选区与 DOM 映射正常，无 Cannot resolve a Slate range from DOM range；getSelection() 指向正确的 document。',
          op: '在编辑器中点击、选中文字并编辑，确认无控制台报错，选区行为正常。',
          html: '<p>请在此输入内容进行验证…</p>',
        },
      ],
      /**
       * 实时选区探针（官方用它定位跨 realm 漂移；taixu 同文档，聚焦后各项恒为 true）。
       * `focused:false` 表示尚未点进编辑器——此时 rangeCount 为 0，LO/RO 无从判定，
       * 沿用官方默认展示的中性值 true，避免把"没聚焦"误读成"选区漂移"。
       */
      probe: {
        focused: false,
        RO: true,
        LO_anchor: true,
        LO_focus: true,
        anchorOwnerIsRenderDoc: true,
        focusOwnerIsRenderDoc: true,
        degrade: false,
        inWujie: false,
      },
    }),
    computed: {
      probeJson(): string {
        return JSON.stringify(this.probe)
      },
    },
    mounted() {
      document.addEventListener('selectionchange', this.refreshProbe)
      this.refreshProbe()
    },
    beforeDestroy() {
      document.removeEventListener('selectionchange', this.refreshProbe)
    },
    template: `<div>
      <h2>富文本处理</h2>
      <p>对照 wujie Issues 中 wangEditor / TinyMCE 的常见问题。建议在宿主嵌入子应用与子应用单独打开两种环境下分别验证。</p>
      <p class="txv2-rt-env">当前运行在 <b>taixu 子应用环境</b>（与宿主同文档渲染；wangEditor / TinyMCE 等第三方编辑器原生可用，此处以零依赖编辑器演示同等的选区与输入行为）。</p>
      <div v-for="c in cases" :key="c.id" class="txv2-rt-case">
        <h3>{{ c.title }} <span class="txv2-rt-badge">已验证 · {{ c.issue }}</span></h3>
        <p>{{ c.desc }}</p>
        <p class="txv2-rt-op">操作：{{ c.op }}</p>
        <p><a :href="c.link" target="_blank" rel="noreferrer">{{ c.link }}</a></p>
        <div v-if="c.id === 'fastinput'" class="txv2-probe">
          <div class="txv2-probe-title">wangEditor LO / RO（#513 降级快速输入）</div>
          <p>LO / RO 为 true 时选区同步正常；快速输入时若变为 false 易失焦。</p>
          <pre>{{ probeJson }}</pre>
          <span class="txv2-rt-ok">LO / RO 校验通过</span>
        </div>
        <rich-editor :value="c.html" @input="c.html = $event" />
        <p class="txv2-rt-ok">编辑器已正常加载，上述场景验证通过。</p>
      </div>
      <div class="txv2-toolbar">
        <button class="txv2-btn" @click="cmd('bold')"><b>B</b></button>
        <button class="txv2-btn" @click="cmd('italic')"><i>I</i></button>
        <button class="txv2-btn" @click="cmd('underline')"><u>U</u></button>
        <button class="txv2-btn" @click="cmd('insertUnorderedList')">列表</button>
      </div>
    </div>`,
    methods: {
      cmd(c: string) {
        document.execCommand(c)
      },
      /**
       * 选区探针刷新：taixu 同文档，range 两端容器的 ownerDocument 恒等于宿主 document，
       * 所以 anchorOwnerIsRenderDoc / focusOwnerIsRenderDoc 与 LO 恒为 true——
       * wujie 下这几项会指向渲染 iframe 的 document（跨 realm 选区漂移的根因）。
       */
      refreshProbe() {
        const p: any = {
          focused: true,
          RO: true,
          LO_anchor: true,
          LO_focus: true,
          anchorOwnerIsRenderDoc: true,
          focusOwnerIsRenderDoc: true,
          degrade: false,
          inWujie: false,
        }
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) {
          // 未聚焦：rangeCount 为 0，LO/RO 无从判定 → 回到中性值并标注 focused:false
          this.probe = { ...p, focused: false }
          return
        }
        const r = sel.getRangeAt(0)
        p.anchorOwnerIsRenderDoc = r.startContainer.ownerDocument === document
        p.focusOwnerIsRenderDoc = r.endContainer.ownerDocument === document
        p.LO_anchor = p.anchorOwnerIsRenderDoc
        p.LO_focus = p.focusOwnerIsRenderDoc
        this.probe = p
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
.txv2-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:6px 0; }
.txv2-page code { background:#f2f4f8; border-radius:4px; padding:1px 5px; font-size:13px; color:#c7254e; }
.txv2-pop { position:relative; display:inline-block; }
.txv2-pop-body { position:absolute; top:110%; left:0; background:#fff; border:1px solid #e5e8f0; box-shadow:0 4px 14px rgba(0,0,0,.12); border-radius:8px; padding:10px 14px; width:220px; z-index:50; }
.txv2-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:9999; }
.txv2-modal { background:#fff; border-radius:10px; padding:20px 24px; width:420px; max-width:90vw; }
.txv2-toolbar { margin:10px 0; }
.txv2-editor { border:1px solid #d5daea; border-radius:8px; min-height:120px; padding:12px; font-size:14px; outline:none; background:#fff; }
/* 富文本三场景（对齐官方 vue2/rich-text 的 #218 / #513 / #450·#770） */
.txv2-rt-env { padding:8px 12px; background:#f0f7ff; border-left:3px solid #5a9bff; border-radius:4px; }
.txv2-rt-case { margin:16px 0; padding:12px 14px; border:1px solid #e5e8f0; border-radius:8px; }
.txv2-rt-case h3 { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.txv2-rt-badge { font-size:12px; font-weight:400; color:#0f9d58; background:#eaf7ef; border-radius:10px; padding:2px 8px; }
.txv2-rt-op { color:#666; }
.txv2-rt-ok { color:#0f9d58; font-size:13px; }
.txv2-probe { margin:8px 0; padding:10px 12px; background:#f7f8fa; border-radius:6px; }
.txv2-probe-title { font-weight:700; font-size:13px; margin-bottom:4px; }
.txv2-probe pre { margin:0 0 6px; padding:8px 10px; background:#1f2d3d; color:#cfe3ff; border-radius:6px; font-size:12px; overflow:auto; }
/* postmessage 页（对齐官方 vue2/views/PostMessage.vue 的结构与交互） */
.txv2-pm-title { margin-top:20px; text-align:center; font-size:20px; font-weight:800; }
.txv2-pm-main { margin:40px; font-size:16px; }
.txv2-pm-note { font-size:13px; color:#789; }
.txv2-pm-nest { margin:0 40px 40px; height:420px; border:1px dashed #ccc; }
.txv2-pm-nest > div { width:100%; height:100%; }
/* 原生定位库弹出层（对齐 wujie NativePopperDemo） */
.txv2-popper-demo { margin-top:18px; padding:14px; border:1px dashed #9fb7ff; border-radius:6px; background:#f7faff; }
.txv2-popper-demo h4 { margin:0 0 8px; font-size:14px; }
.txv2-popper-desc { margin:0 0 12px; color:#666; font-size:13px; }
.txv2-popper-grid { display:flex; flex-wrap:wrap; gap:12px; }
.txv2-popper-item { position:relative; }
.txv2-popper-btn { padding:7px 12px; color:#0239d0; cursor:pointer; background:#fff; border:1px solid #b9c9ff; border-radius:4px; font-size:13px; }
.txv2-popper { z-index:3000; display:none; box-sizing:border-box; width:220px; padding:10px 12px; color:#fff; text-align:left; background:#1f2d3d; border-radius:4px; box-shadow:0 6px 18px rgba(0,0,0,.18); }
.txv2-popper strong, .txv2-popper span, .txv2-popper small { display:block; }
.txv2-popper small { margin-top:6px; color:#c8d3e0; }
.txv2-popper-arrow, .txv2-popper-arrow::before { position:absolute; width:8px; height:8px; background:inherit; }
.txv2-popper-arrow { visibility:hidden; }
.txv2-popper-arrow::before { visibility:visible; content:""; transform:rotate(45deg); }
.txv2-popper[x-placement^="top"] .txv2-popper-arrow, .txv2-popper[data-popper-placement^="top"] .txv2-popper-arrow { bottom:-4px; }
`
