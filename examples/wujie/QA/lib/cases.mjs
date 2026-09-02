/**
 * 统一的「一比一还原」用例清单——同一份用例跑 4 个目标：
 *   official-vue / official-react（wujie 官方部署站）· taixu-vue / taixu-react（taixu 重写版）
 *
 * 用例直接取自 wujie 官方 examples 的菜单树（main-vue/App.vue + main-react/App.js）：
 *   介绍 · react16(6) · react17(5,保活) · vue2(5,vue 站含富文本) · vue3(6,保活) · vite(4) · angular12 · all · postmessage(vue 站独有)
 */
export const CASES = [
  { id: 'home', hosts: ['vue', 'react'] },
  { id: 'react16', top: 'react16', hosts: ['vue', 'react'] },
  { id: 'react16/home', top: 'react16', sub: 'home', hosts: ['vue', 'react'] },
  { id: 'react16/dialog', top: 'react16', sub: 'dialog', hosts: ['vue', 'react'] },
  { id: 'react16/location', top: 'react16', sub: 'location', hosts: ['vue', 'react'] },
  { id: 'react16/communication', top: 'react16', sub: 'communication', hosts: ['vue', 'react'] },
  { id: 'react16/nest', top: 'react16', sub: 'nest', hosts: ['vue', 'react'] },
  { id: 'react16/font', top: 'react16', sub: 'font', hosts: ['vue', 'react'] },
  { id: 'react17', top: 'react17', hosts: ['vue', 'react'] },
  { id: 'react17/home', top: 'react17', sub: 'home', hosts: ['vue', 'react'] },
  { id: 'react17/dialog', top: 'react17', sub: 'dialog', hosts: ['vue', 'react'] },
  { id: 'react17/location', top: 'react17', sub: 'location', hosts: ['vue', 'react'] },
  { id: 'react17/communication', top: 'react17', sub: 'communication', hosts: ['vue', 'react'] },
  { id: 'react17/state', top: 'react17', sub: 'state', hosts: ['vue', 'react'] },
  { id: 'vue2', top: 'vue2', hosts: ['vue', 'react'] },
  { id: 'vue2/home', top: 'vue2', sub: 'home', hosts: ['vue', 'react'] },
  { id: 'vue2/dialog', top: 'vue2', sub: 'dialog', hosts: ['vue', 'react'] },
  { id: 'vue2/location', top: 'vue2', sub: 'location', hosts: ['vue', 'react'] },
  { id: 'vue2/communication', top: 'vue2', sub: 'communication', hosts: ['vue', 'react'] },
  // 官方 vue 站有「富文本」（href=rich-text）；react 站的 subMap.vue2 没有该项
  { id: 'vue2/rich-text', top: 'vue2', sub: 'rich-text', subLabel: '富文本', hosts: ['vue'] },
  { id: 'vue3', top: 'vue3', hosts: ['vue', 'react'] },
  { id: 'vue3/home', top: 'vue3', sub: 'home', hosts: ['vue', 'react'] },
  { id: 'vue3/dialog', top: 'vue3', sub: 'dialog', hosts: ['vue', 'react'] },
  { id: 'vue3/location', top: 'vue3', sub: 'location', hosts: ['vue', 'react'] },
  { id: 'vue3/contact', top: 'vue3', sub: 'contact', hosts: ['vue', 'react'] },
  { id: 'vue3/state', top: 'vue3', sub: 'state', hosts: ['vue', 'react'] },
  { id: 'vue3/inline-event', top: 'vue3', sub: 'inline-event', hosts: ['vue', 'react'] },
  { id: 'vite', top: 'vite', hosts: ['vue', 'react'] },
  { id: 'vite/home', top: 'vite', sub: 'home', hosts: ['vue', 'react'] },
  { id: 'vite/dialog', top: 'vite', sub: 'dialog', hosts: ['vue', 'react'] },
  { id: 'vite/location', top: 'vite', sub: 'location', hosts: ['vue', 'react'] },
  { id: 'vite/contact', top: 'vite', sub: 'contact', hosts: ['vue', 'react'] },
  { id: 'angular12', top: 'angular12', role: 'angular12', hosts: ['vue', 'react'] },
  { id: 'all', top: 'all', role: 'all', hosts: ['vue', 'react'] },
  // postmessage 页仅官方 vue 站有（react 站菜单无此项）
  { id: 'postmessage', top: 'postmessage', role: 'postmessage', hosts: ['vue'] },
]

/**
 * 功能点判定表（判断「阉割」的核心依据）。
 *
 * 为什么不用整段文本 token 重合率：taixu 的示例文案刻意解释了 taixu 自己的语义
 * （同文档渲染 / bus 通信 / 保活），与 wujie 的 iframe+proxy 描述天然不同，
 * 逐字重合会大面积误报。这里改成**能力级**判定：每项给若干同义正则，命中任一即算覆盖。
 */
export const FEATURES = {
  home: [
    { name: '展示框架/运行时版本', any: [/当前\s*(react|vue|vite|angular|antd|element)\s*版本/i, /版本\s*[0-9]+\.[0-9]+/] },
    { name: '展示 UI 库版本（antd / element / ant-design-vue）', any: [/antd\s*版本|element(-plus)?\s*版本|ant-design-vue\s*版本/i] },
    { name: '「仓库地址」链接', any: [/仓库地址|仓库/] },
  ],
  dialog: [
    { name: '① 打开弹窗', any: [/打开(antd)?弹窗|打开对话框|Open Modal|el-dialog|ant-modal/i] },
    { name: '② 下拉选择器', any: [/打开(antd)?选择器|下拉选择器|Select a person|ant-select/] },
    { name: '③ 气泡卡片', any: [/气泡卡片|Hover me|popover/i] },
    { name: '④ 手动 append 到 body 的弹层', any: [/append\s*弹窗|append\s*弹层|插入\s*body|append\s*到\s*body/i] },
    { name: '⑤ 原生定位库弹出层（Popper / Floating UI）', any: [/Popper|Floating\s*UI/i] },
  ],
  location: [
    { name: '① 路由同步', any: [/路由同步|sub-route-change|router-change/] },
    { name: '② 读取 window.location.host', any: [/location\.host|location\s*读取|location\s*劫持/] },
    { name: '③ 修改 window.location.href', any: [/修改\s*(window\.)?location\.href|跳转(无极|taixu)/] },
  ],
  communication: [
    { name: '① 宿主注入方法（= props.jump）', any: [/props\s*属性注入|props\.jump|宿主注入|宿主导航能力|navigate/] },
    { name: '② 宿主全局方法（= window.parent）', any: [/window\.parent|全局方法/] },
    { name: '③ bus 去中心化事件', any: [/bus|去中心化/] },
    { name: '④ postmessage 方式', any: [/postmessage/i] },
  ],
  contact: [
    { name: '① 宿主注入方法（= props.jump）', any: [/props\s*属性注入|props\.jump|宿主注入|宿主导航能力|navigate/] },
    { name: '② 宿主全局方法（= window.parent）', any: [/window\.parent|全局方法/] },
    { name: '③ bus 去中心化事件', any: [/bus|去中心化/] },
  ],
  state: [
    { name: '计数 +/- 交互', any: [/-\s*\d+\s*\+|state\s*\+\s*1|计数/] },
    { name: '跳转其它应用', any: [/跳转|跳到|切换到/] },
    { name: '跳回验证状态保留', any: [/跳回|回来看看|保活/] },
  ],
  nest: [{ name: '子应用嵌套（应用内再挂应用）', any: [/子应用嵌套|嵌套运行时/] }],
  font: [{ name: '字体处理演示', any: [/字体|font-face/i] }],
  // 官方这一页是 wujie 自身 iframe 沙箱缺陷的回归集合（3 个 issue 场景），
  // 不是"一个编辑器"——所以按场景逐条判定，而不是只判"有编辑器"
  'rich-text': [
    { name: '富文本编辑器可用', any: [/富文本|编辑器|wangEditor|TinyMCE/i] },
    { name: '预填内容删改（#218）', any: [/预填(内容|文字)|#218/] },
    { name: '快速输入不失焦（#513）', any: [/快速(连续)?输入|不失焦|#513/] },
    { name: 'Selection / DOM 一致（#450·#770）', any: [/Selection\s*\/\s*DOM|#450|#770/] },
  ],
  'inline-event': [
    { name: '场景1 基本功能测试', any: [/基本(功能)?测试/] },
    { name: '场景2 多参数测试', any: [/多参数/] },
    { name: '场景3 访问全局变量', any: [/访问全局变量|全局变量/] },
    { name: '场景4 复杂表达式', any: [/复杂表达式/] },
    { name: '场景5 事件对象访问', any: [/事件对象/] },
    { name: '场景6 多个内联事件', any: [/多个内联|多事件/] },
  ],
  postmessage: [
    { name: '接收消息展示', any: [/接收的消息|接收/] },
    { name: '发送消息按钮', any: [/发消息|发送消息|发送/] },
  ],
  all: [{ name: '多应用同屏（≥4 个子应用）', any: [/示例|版本/] }],
  angular12: [{ name: 'angular 子应用渲染', any: [/angular/i] }],
}

/** 用例 → 页面角色（决定用 FEATURES 的哪一组判定） */
export const roleOf = (c) => c.role ?? c.sub ?? 'home'

export const TARGETS = {
  'official-vue': {
    flavor: 'vue',
    impl: 'wujie',
    entry: 'https://wujie-micro.github.io/demo-main-vue/home',
    navSel: '#nav',
    contentSel: '.content',
    subMenuSel: '.sub-menu',
  },
  'official-react': {
    flavor: 'react',
    impl: 'wujie',
    entry: 'https://wujie-micro.github.io/demo-main-react/#/home',
    navSel: '.nav',
    contentSel: '.content',
    subMenuSel: '.sub-menu',
  },
  'taixu-vue': {
    flavor: 'vue',
    impl: 'taixu',
    entry: (process.env.BASE ?? 'http://localhost:7700') + '/hosts/main-vue/#/home',
    navSel: '.txh-nav',
    contentSel: '.txh-content',
    subMenuSel: '.txh-submenu',
  },
  'taixu-react': {
    flavor: 'react',
    impl: 'taixu',
    entry: (process.env.BASE ?? 'http://localhost:7700') + '/hosts/main-react/#/home',
    navSel: '.txh-nav',
    contentSel: '.txh-content',
    subMenuSel: '.txh-submenu',
  },
}

/** 布局/样式锚点（官方 App.vue / index.css 的实测值） */
export const STYLE_ANCHORS = {
  navWidth: 210,
  navFontSize: '20px',
  navPadding: '30px 0px',
  navItemPadding: '10px 30px',
  bodyFontSize: '20px',
  themeColor: 'rgb(241, 107, 95)',
  fontFamily: 'Avenir',
}
