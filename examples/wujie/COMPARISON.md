# wujie vs taixu 全方位指标对比

> 对比对象：[Tencent/wujie](https://github.com/Tencent/wujie)（v1.0.x，无界微前端）与
> [taixu](https://github.com/taixu-micro/taixu)（@taixu/* 0.1.0）。本示例集
> （`examples/wujie/`）即以 taixu 完整重写 wujie 官方示例全集后的产物，逐项对齐了
> wujie 示例覆盖的全部场景，对比结论均有示例/文档可验证的对应实现。

## 一、架构模型（根本差异）

| 维度 | wujie | taixu |
| --- | --- | --- |
| 核心机制 | **iframe + shadowRoot 双容器**：JS 在隐藏 iframe 中运行，DOM 渲染到宿主 shadowRoot | **同文档运行时集成**：子应用即 ESM Plugin，与宿主同一 JS 语境、同一 DOM 文档 |
| 子应用形态 | 任意 URL 的独立页面（框架无形态约束） | 自包含 ESM（default export = Plugin），构建期产物 |
| 框架耦合 | 框架无关（iframe 天然隔离） | 框架无关（核心零 UI 依赖）+ 4 个官方适配器（React/Vue3/Vue2/Angular） |
| 运行时 | 独立内核（~30KB min+gzip） | cordis 内核 + @taixu/core（服务面：bus/state/lifecycle/security/monitor/style/deps） |
| 集成位置 | iframe window（代理劫持） | cordis Context（DI 服务注入） |

**本质区别**：wujie 用「两个浏览器原语拼出一个假同窗」（iframe 跑 JS + shadowRoot 放 DOM，
再花大量代码在 window/location/document 三层代理上弥合裂痕）；taixu 直接同窗运行，
把隔离问题转化为**权限与作用域问题**（鉴权总线、deps 仲裁、effect 作用域）。

## 二、JS 沙箱与全局变量

| 维度 | wujie | taixu |
| --- | --- | --- |
| 沙箱实现 | iframe 天然 window 隔离 + Proxy 代理（patch window/document/location） | effect 作用域 + suspendScope；子应用代码经模块作用域天然隔离 |
| 全局变量逃逸 | 代理补丁不全即漏（已知 class/原型/事件目标等补丁边界） | 无代理无补丁——同窗直读，无「补丁矩阵」面 |
| 严格模式/原生行为 | document 假对象（`document instanceof Document === false`） | 真 document，原生行为 100% |
| 全局污染防护 | iframe 隔离 | 应用级 opt-in 硬化（原型守护 F12、Trusted Types F8）；权限模型兜底 |

## 三、样式隔离

| 维度 | wujie | taixu |
| --- | --- | --- |
| 隔离边界 | shadowRoot 天然隔离（子→宿主），宿主样式需 CSS Variables/自定义前缀穿透 | 无 shadowRoot（同文档）——**显式登记** `ctx.style.inject`（随 effect 自动回收） |
| 样式作用域改写 | 无自动 prefix | style 服务（含冲突扫描 `scanStyleConflicts`） |
| 弹窗/Portal 到 body | 需要 `appendBody` 等专项处理（脱离 shadowRoot 后丢样式） | Portal/Teleport/append 原生可用，样式全局可寻 |
| @font-face | 需框架提取到外部（shadowRoot 内不加载） | 原生加载，零处理 |

## 四、路由同步

| 维度 | wujie | taixu |
| --- | --- | --- |
| 内部路由 | iframe location 劫持 + sync 属性同步到宿主 URL（query `?path=`） | 约定消息：子应用 `bus.broadcast('sub-route-change')` → 宿主路由跟随；宿主 → 定向 `*-router-change` 下发 |
| 刷新/回退保真 | 依赖 iframe URL 同步（保活模式失效，需通信切换路由） | 保活态下消息队列回放，路由与状态均可恢复 |
| history 模式 | iframe 同源限制 + 降级处理 | 同文档直读真实 location，无特殊处理 |

## 五、通信机制

| 维度 | wujie | taixu |
| --- | --- | --- |
| 通道 | props 注入 / window.parent / EventBus（`$emit/$on`，无鉴权） | **鉴权总线**：broadcast（去中心化）/ send（定向）/ request-reply（请求-应答）+ `message/send` 全局旁听 |
| 权限控制 | 无（任意应用可监听任意事件） | 宿主声明式 `permissions` 清单（`message:<type>` 通配），未授权投递被拒 |
| 跨应用状态 | 无内建 | `state` 服务（三层键空间 `shared:app:key`、冲突消解四策略、时间旅行） |
| 挂起期消息 | 丢失（保活应用 iframe 隐藏仍存活，但无队列语义） | 挂起队列按全序回放，保活应用不丢消息 |
| 实例定向 | 无（事件广播全局可达） | instanceId 定向投递（F1） |

## 六、生命周期与多实例

| 维度 | wujie | taixu |
| --- | --- | --- |
| 保活 | keepAlive 模式（iframe 隐藏保活；切回零加载） | `lifecycle.switch` 挂起事务（suspend/resume + `mountHidden/reveal`，无闪烁） |
| 销毁重建 | destroy 模式 | `lifecycle.destroyByAppId`（effect 逆序回收，容器清空校验） |
| 多应用同屏 | 多个 `<wujie-vue>` 实例并存 | 多槽位并存（outlet 清单 + per-slot mount），切换事务原子化 |
| 嵌套 | 不支持（iframe 内可再套 wujie，但示例未覆盖） | 官方示例演示子应用内再起运行时（react16 nest 页） |
| 切换事务 | 无原子性（两容器各自插拔） | switch 事务（F11）：挂起→挂载→揭示单事务，失败回滚 |

## 七、性能

| 维度 | wujie | taixu |
| --- | --- | --- |
| 首屏 | iframe 创建 + 资源二次加载（有 preload 缓解） | 动态 import（可预加载预热），无容器创建开销 |
| 代理开销 | 每个子应用三层 Proxy（window/document/location）热路径劫持 | 无代理——热路径零劫持损耗 |
| 内存 | iframe + shadowRoot 双份容器；保活常驻 | 单文档；保活 LRU 池（maxCount 可调） |
| 白屏 | iframe 加载期需 loading/降级兜底 | 模块加载完成即挂载（切换事务保证无闪烁） |

## 八、接入成本（本示例集实测）

| 维度 | wujie | taixu |
| --- | --- | --- |
| 宿主接入 | 引 `wujie-vue/wujie-react`，`<WujieVue name url>` 一行 | `createCordis({ outlets, apps, permissions })` + `lifecycle.switch` |
| 子应用改造 | **零改造**（原 URL 直接载入） | 导出 Plugin（约 5 行样板：name/inject/apply/effect）；React/Vue 适配器可再压缩 |
| 多版本框架共存 | 天然（iframe 各自打包） | 各应用独立 bundle 自包含（react16/17 同页共存已验证） |
| 共享依赖 | 无（各自全量打包） | `deps` 共享依赖仲裁（版本区间协商、singleton 强约束，vue2/angular 单例） |
| 构建约束 | 无 | 需产出 ESM（Vite lib mode / esbuild / ng application builder 均可） |

## 九、安全与可观测性

| 维度 | wujie | taixu |
| --- | --- | --- |
| 网络 | fetch 劫持可选 | 同步裁决面 `checkNetUrl`：XHR/EventSource/WebSocket open/构造级拦截（F3） |
| 内容安全 | 无 | DOMPurify 消毒管线 + Trusted Types（F8，opt-in） |
| PII | 无 | PII 管道 + 开销自测（F9，opt-in） |
| 监控 | 无内建 | monitor 服务唯一错误入口（适配器错误边界均转发 capture）、DevTools 快照（含 sourcemap 还原 stack） |
| 契约校验 | 无 | 事件契约 / 依赖 DAG 静态层机器校验（CI 看门狗） |

## 十、工程质量（仓库实测数据）

| 维度 | wujie | taixu |
| --- | --- | --- |
| 测试 | 少量单测，无端到端契约校验 | 360 case 全绿 + typecheck 干净 + verify 链（build→typecheck→test） |
| 类型 | JS 为主 | TypeScript 全量 + dts 镜像发布 |
| 发布 | 单包（wujie-core/vue/react） | 5 包 monorepo（core + 4 适配器，changesets linked） |
| 文档 | 独立文档站 | docsify 文档站 + 在线可运行示例（Pages 部署） |
| 维护状态 | 腾讯开源，社区维护 | 本项目持续迭代（架构收敛：lifecycle 846→610 行，19 个 seam 模块） |

## 十一、taixu 的诚实代价（wujie 强项）

1. **子应用零改造优势丧失**：wujie 可直接加载任何存量 URL；taixu 要求子应用导出 Plugin
   （适配器可压缩但非零）。存量应用接入成本 wujie ≈ 0 < taixu。
2. **无天然 CSS 边界**：shadowRoot 的样式隔离换成了「显式登记 + 冲突扫描」的纪律，
   未登记的第三方库样式可能泄漏（提供沙箱自动兜底但非边界保证）。
3. **同窗即同信任域**：iframe 的硬隔离换成了权限模型的软约束——恶意子应用与宿主共享
   window/原型链，只能靠 opt-in 硬化（原型守护/Trusted Types）收窄。
4. **构建形态要求**：必须产出 ESM 产物；wujie 无任何构建要求。
5. **Angular 路线**：实验性，且硬约束 standalone + AOT（本示例集的 angular 子应用
   即按此约束以 Angular 17 构建）。

## 十二、结论

wujie 的核心价值是**用浏览器原语换来了「零改造接入」与「天然隔离」**，代价是永久背负
双容器代理弥合层（location/document/window 劫持的复杂度与边界 bug 面）以及 iframe
带来的性能与白屏治理。

taixu 的核心价值是**同文档运行时把「隔离」重构为「权限 + 作用域」**，换来零代理损耗、
原生行为 100%（弹窗/字体/路由无需任何专项处理）、鉴权通信、保活事务与全链路可观测，
代价是子应用需要以 ESM Plugin 形态接入（改造点小但非零）。

选型口径：
- **存量多团队 URL 级接入、强样式/安全隔离诉求** → wujie 更合适；
- **可控子应用来源、追求原生行为保真 + 权限化治理 + 可观测性** → taixu 更合适。
