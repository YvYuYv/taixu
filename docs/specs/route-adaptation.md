# Cordis 路由适配（Route Adaptation）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> 术语修正：Cordis 中不存在"路由即 coeffect"的抽象；本文的正确表述是：**路由状态是一种 reactive coeffect（应用声明依赖的位置状态，变更时通知应用）**。`push 与 replace 互为逆操作`的说法废除（replace 丢弃历史记录，不可逆）。

## 一、问题分析

| 问题维度 | 具体表现 |
|----------|----------|
| 嵌套路由冲突 | 主应用 `/app1/detail` 与子应用路由重叠，双方同时匹配 |
| 状态丢失 | 切换应用时路由参数/query/hash 丢失 |
| 前进后退异常 | 跨应用切换时浏览器前进后退行为不一致 |
| URL 同步 | 子应用内部导航后主应用侧边栏/面包屑不更新 |
| 多版本路由共存 | Vue Router 2.x 与 4.x 实例冲突 |

## 二、Cordis 理论视角（修正版）

| Cordis 能力 | 路由模块用法 |
|-------------|-------------|
| Service + isolate 可见性 | router 是 root 服务；**每个 outlet 的视图**经 `ctx.isolate('router-view')` 隔离（isolate 白名单之一，ADR-0010）--**只读隔离**：隔离视图读本槽位位置；写（导航）必须经全局 NavigationController 做多槽位合并（ADR-0006） |
| reactive coeffect | 应用经 `ctx.router.watch(outlet, fn)` 订阅本槽位位置（`ctx.on('outlet/changed:{outlet}')` + 首跑同步取值，ADR-0047/0050） |
| `ctx.serial`（await 每个回调，非 null/false/undefined 截断） | 导航守卫管线的原生载体；守卫结果为显式枚举（ADR-0002，§4.3） |
| 事件解耦 | router 不 inject lifecycle：发 `router/navigate` serial 事件，lifecycle 执行挂载（基线 §2.3，消除旧死锁环） |

**废除的自造 API**（旧文档未定义、与 Cordis 惯用法冲突）：`ctx.service.lifecycleManager`、`ctx.onChange`、`ctx.addGuard`、`ctx.syncFromRoot/syncFromPathname/syncFromQuery/syncFromHash`、全局 `useRoute()/useRouter()`（无 ctx 参数）。统一经 router 服务：

```typescript
class RouterService extends Service {
  static [Context.provide] = 'router'
  static inject = ['monitor', 'security']

  /** 应用侧唯一入口：当前 outlet 的位置（reactive coeffect；经 outlet/* 事件族订阅） */
  watch(ctx: Context, outlet: string, fn: (loc: RouteLocation) => void) {
    // ADR-0001 同款：ctx.on 自动退订，不自建 watcher 注册表
    ctx.on(`outlet/changed:${outlet}`, (e: { outlet: string; matched: MatchedApp | null }) => {
      fn(this.toLocation(e))
    })
    fn(this.current(outlet))                     // 首跑：同步拿到当前值（无异步回放乱序）
  }

  /** 导航（写侧）：隔离视图内也经全局 NavigationController 合并--隔离实例不得直写 URL（ADR-0006） */
  navigate(to: Partial<RouteLocation>, options: { outlet?: string; replace?: boolean } = {}) { /* §4.1 */ }
}
```

## 三、URL 与槽位矩阵模型

### 3.1 多槽位 URL 文法（修复通道冲突与保留字撞名）

三通道分配（与旧版一致）+ **统一保留字前缀**：

```
https://host/main/path?__tx_main=1&__tx_sidebar=%2Flist&__tx_w0=%2Fdetail#w=__tx_widget%3D%2Fhome
     └── 主区域（pathname）  └── 侧栏（query）         └── widget（query）   └── 浮窗（hash，URL-encoded）
```

规则：

1. **保留字前缀 `__tx_`**：全部框架管理的槽位参数统一前缀；子应用业务参数撞名空间由 `__tx_` 前缀隔离（旧版 `sidebar_path` 裸名可被业务参数撞掉）。构建期 lint 检测子应用自身使用 `__tx_` 前缀参数并报错
2. **通道仲裁**：主区域 = pathname；非浮窗槽位（sidebar/多 widget）= query 通道；**hash 通道仅保留给浮窗类 widget**。hash 模式子应用（`/app1#/detail`）的 `#` 属于**主应用 pathname 通道内嵌**（`/app1` 是主区域路径，其 hash 由该应用的桥接层本地管理，不进 hash 通道）--消除旧版"hash 模式与 widget 争抢 `#`"的双 owner 冲突
3. **序列化格式**：hash 通道值为 URL-encoded 的 `槽位=路径` 映射（`w=__tx_widget%3D%2Fhome` 支持多浮窗）
4. **参数合并**：任一槽位导航时，router 以"全量槽位状态"重写 URL（读旧值 -> 仅改目标槽位 -> 写回），**不会**抹掉其他槽位（旧版子应用 `router.replace({query})` 只带自己的 query，sidebar 状态被清空）

### 3.2 深度链接与 query 传递（修复 token 泄漏与隐式携带）

- 跨应用跳转默认**只携带显式声明的参数**（应用的 `cordis.routes.json` 声明 `carry: ['tab']`）；`__tx_*` 槽位参数在合并层自动保留但不进应用可见 query
- **敏感参数过滤**：跳转经 `security.sanitizeQuery()`（默认剥离 `token/_t/sign` 等黑名单键 + 可配置），杜绝 `?token=xxx` 跨应用泄漏（旧版"自动提取 from 的 query 合并到 to"正好反向放大泄漏）

### 3.3 RouteContextTree 废除

旧版自研 `RouteContextNode/children/resolve` 复制了 Cordis 已有的上下文层级。新模型：

- **槽位注册**：`router.registerOutlet(outlet, { owner: appId, basePath? })`（lifecycle 挂载时调用，注销随应用 fiber dispose 自动完成--登记挂 ctx.effect）；槽位名为运行时枚举（DevTools 可列出全部已注册槽位，ADR-0050）
- **匹配**：pathname 前缀匹配按**路径段边界**（`/app1/mod` 不命中 `/app1/module-a` 的注册；同 basePath 重复注册显式报错，不静默覆盖）
- **视图隔离（读侧 only，ADR-0006/0010）**：`ctx.isolate('router-view', outlet)` 使每个 outlet 的 watcher 集合独立（Service 可见性过滤，基线 §1.3）；**写侧不隔离**--隔离视图的 `navigate` 全部汇聚到全局 NavigationController 做多槽位合并后写 URL（否则多槽位导航互相覆盖）
- **事件拆分（ADR-0036/0047）**：每槽位事件 `outlet/changed:{outlet}`（载荷 `{outlet, matched}`，模板字面量类型）--隔离视图只订阅本槽位；全局 `router/changed`（全槽位矩阵）仅 root 层 DevTools/monitor 可见（`global: true`），不对应用暴露（防跨槽位信息泄漏）
- **挂起恢复（ADR-0056）**：应用从保活池恢复后，router 对该槽位**重放一次 `outlet/changed:{outlet}`**（载荷为当前匹配结果），应用像响应正常导航一样同步--不为恢复发明第二套路由同步机制

## 四、导航管线

### 4.1 可取消导航 + 导航序号（修复竞态）

```typescript
class NavigationController {
  private seq = 0

  async navigate(to: NavigationIntent): Promise<NavigationResult> {
    const id = ++this.seq
    const controller = new AbortController()
    // 1. 超序号作废：任何更新的导航开始后，本导航全部阶段检查 seq
    const stale = () => id !== this.seq || controller.signal.aborted

    // 2. 守卫管线（serial，可拦截；结果为守卫枚举，见 §4.3）
    const verdict = await this.ctx.serial('router/navigate', {
      from: this.current(to.outlet), to: this.normalize(to), outlet: to.outlet, signal: controller.signal,
    })
    if (stale()) return { status: 'superseded' }        // 快速连点：旧导航静默让位
    if (verdict) {                                       // 非 undefined = 有守卫截断（§4.3 枚举裁决）
      if (verdict.type === 'redirect') return this.handleRedirect(verdict.to, 0)
      this.ctx.emit('router/aborted', { outlet: to.outlet, reason: 'guard' })
      return { status: 'guarded' }
    }

    // 3. URL 写入（history.replaceState 防重复记录）
    this.writeUrl(this.mergeOutlets(to), to.replace ? 'replace' : 'push')

    // 4. 挂载/切换经 lifecycle（事件解耦，非 inject）
    await this.lifecycleEvents.mountFor(to)
    if (stale()) { /* 新导航已接管挂载 */ }
    // 5. 双层变更通知（ADR-0036/0047）：本槽位事件给隔离视图；全局矩阵仅 root 旁听
    this.ctx.emit(`outlet/changed:${to.outlet}`, { outlet: to.outlet, matched: this.snapshot()[to.outlet] })
    this.ctx.emit('router/changed', { location: this.location(), outlets: this.snapshot() })   // root-only
    return { status: 'ok' }
  }
}
```

### 4.2 popstate 全链路（修复守卫逃逸）

```typescript
init(ctx: Context) {
  ctx.effect(() => {
    const onPop = async (e: PopStateEvent) => {
      // 浏览器后退/前进同样走完整导航管线（守卫+序号），修复旧版"popstate 直通 syncFromRoot 绕过鉴权守卫"
      const intent = this.parseLocation()          // 目标态来自 event.state 快照
      const result = await this.navigate({ ...intent, history: true })
      if (result.status === 'guarded') {
        // 守卫拒绝历史导航：以 replace 恢复原 URL（不产生新历史记录）
        this.writeUrl(this.lastCommitted, 'replace')
      }
    }
    addEventListener('popstate', onPop)
    const onHash = (e: HashChangeEvent) => this.dedupe(onPop, e)   // hash 模式双事件去重（同一 location 只处理一次）
    addEventListener('hashchange', onHash)
    return () => { removeEventListener('popstate', onPop); removeEventListener('hashchange', onHash) }
  })
}
```

- **history.state 快照**：每次 commit 将全部槽位状态写入 `history.state`；恢复时从 state 而非重新猜测（保证前进后退跨应用一致性）
- 在途导航（守卫 await 用户确认）期间 popstate 到达：`seq` 机制使旧导航 superseded，无交错写 URL

### 4.3 守卫（serial 管线 + 显式枚举结果，ADR-0002）

```typescript
/** 守卫结果：显式枚举（ADR-0002）--绝不用真值判断 */
type GuardResult =
  | { type: 'proceed' }                       // 明确放行（截断后续守卫）
  | { type: 'redirect'; to: string }          // 拦截并重定向
  | { type: 'abort' }                         // 拦截且中止
  | undefined                                  // 不表态，让给下一个守卫（serial 不截断）

// 守卫注册（应用/宿主均可；执行顺序 = 注册顺序，prepend 可选）
ctx.on('router/navigate', async (e): Promise<GuardResult> => {
  if (!requiresAuth(e.to)) return undefined             // 不表态
  if (!(await ctx.security.checkSession())) return { type: 'redirect', to: '/login' }
  return { type: 'proceed' }
}, { global: true })

// NavigationController 内的裁决与重定向防死循环：
if (verdict) {                                          // 非 undefined = 有守卫截断
  if (verdict.type === 'redirect') return this.handleRedirect(verdict.to, depth)
  this.ctx.emit('router/aborted', { outlet: to.outlet, reason: 'guard' })
  return { status: 'guarded' }
}

private async handleRedirect(redirect: string, depth: number) {
  if (depth >= 8) {                                   // 对齐 vue-router 的 8 次上限
    this.ctx.emit('monitor/alert', { alert: { type: 'ROUTER_REDIRECT_LOOP', detail: { redirect } } })
    return this.renderError('redirect-loop')
  }
  return this.navigate({ to: redirect, depth: depth + 1 })
}
```

- **为什么枚举而非真值**（ADR-0002，论证依据经 ADR-0016 修正）：serial 的截断判据是 `isBailed`（非 null/false/undefined 截断）--`false` 虽不截断，但"返回 false = 放行"的隐式约定让读者无法区分"明确放行"与"忘了返回"；枚举使守卫意图可静态校验，且与请求-应答包络（基线 §2.4.1）在族边界上清晰分离
- **守卫禁止返回 false 或裸字符串**（裸字符串属于"伪截断值"，语义不明）
- 修复旧版 `CrossAppGuardManager` + 手工 priority 排序（重复发明 serial）
- 修复旧版 `if (typeof result === 'string') { await this.navigate(result) }` 无上限重入

### 4.4 导航与 lifecycle 的解耦协议

```
router --serial('router/navigate')--> [守卫们]
router --mountFor(intent)--> lifecycle（内部经事件或服务调用，但 router 不 inject lifecycle：
   lifecycle 在启动时 ctx.on('router/navigate', e => 挂载回调, { global: true })？
   --否：lifecycle 主动订阅 router 服务暴露的挂载请求流；实现上 router 提供
   ctx.router.onResolve(cb)，lifecycle inject ['router'] 注册。
   方向：lifecycle -> router（单向），见基线 §2.3）
```

## 五、框架桥接

### 5.1 Vue Router 4（createRouter 路线）

```typescript
export function createCordisRouter(ctx: Context, options: VueRouterOptions): Router {
  const outlet = options.__cordis_outlet ?? 'main'
  const fiberCtx = ctx
  // 桥接实现 CordisRouterLike 接口：current 为稳定 reactive 引用（修复旧版每次 get 新建 reactive 导致依赖收集失效）
  const currentRef = shallowReactive({ route: toBridgeRoute(fiberCtx.router.current(outlet)) })
  fiberCtx.router.watch(fiberCtx, outlet, (loc) => { currentRef.route = toBridgeRoute(loc) })

  return {
    currentRoute: computed(() => currentRef.route),    // 稳定身份 + 跨副本安全：computed 属于子应用自己的 Vue 副本
    push: (to) => fiberCtx.router.navigate({ ...normalize(to), outlet }),
    replace: (to) => fiberCtx.router.navigate({ ...normalize(to), outlet, replace: true }),
    go: (n) => history.go(n),                          // 原生（popstate 管线接管）
    beforeEach: (fn) => fiberCtx.on('router/navigate', wrapLocalGuard(fn, outlet), { global: true }),
    isReady: () => Promise.resolve(),
    // 其余 API（afterEach/beforeResolve/resolve/getRoutes）按需映射；范围在适配器文档明确列出
  } as Router
}
```

- **跨 Vue 副本安全**：桥接对象不引用运行时全局的 `reactive`（旧版用框架运行时的 Vue 副本创建对象，子应用沙箱内是另一份 Vue 时互不识别）--computed 由子应用入口注入或退化为纯 getter+订阅回调
- 落地形式（P1，`createCordisRouter`）：`reactive` 容器与 `computed` 须**同源成对注入**（子应用同一 Vue 副本——只注 computed 不注 reactive 则依赖永不失效，如实约定）；VR3 桥（`bridgeVueRouter2`）abstract 实例由调用方 new 后传入（桥接管读写面）；**API 范围**：currentRoute/push/replace/go/back/forward/beforeEach/isReady/onChange 已映射，afterEach/beforeResolve/resolve/getRoutes/params 解析不在桥（路由表归子应用 Router，位置事实归 Cordis）
- `push` 返回真实 Promise（导航完成后 resolve），修复旧版 `Promise.resolve()` 使 `await router.push()` 失效

### 5.2 Vue Router 3（真实实例 + 全 API 代理）

```typescript
export function bridgeVueRouter2(ctx: Context, Vue: any, options: any) {
  const router = new VueRouter({ mode: 'abstract', routes: options.routes ?? [] })
  // abstract 模式：实例不监听 popstate/hashchange（旧版真实 history 模式与 Cordis 根路由双写 History）
  router.push = (to: any) => ctx.router.navigate({ ...normalizeV2(to), outlet })
  router.replace = (to: any) => ctx.router.navigate({ ...normalizeV2(to), outlet, replace: true })
  router.go = (n: number) => history.go(n)
  router.back = () => history.go(-1)
  router.forward = () => history.go(1)
  ctx.router.watch(ctx, outlet, (loc) => {
    router['app']?.$nextTick?.(() => (router as any).history?.transitionTo?.(loc.path))
    ;(router as any).currentRoute = toV2Route(loc)     // 受控更新（不再依赖内部 API history.updateRoute）
  })
  // $router 注入：Vue.prototype.$router = router（修复旧版仅 this.$root 赋值、子组件取不到）
  Object.defineProperty(Vue.prototype, '$router', { get: () => router })
  return router
}
```

- **abstract 模式**消除双写 History；不再锁死 3.6.5 内部 API（旧版依赖 `history.updateRoute` 且建议锁版本，与"多版本共存"目标冲突）

### 5.3 构建期转换（能力边界诚实化）

- 转换目标收窄为**模式化场景**：`import.meta.env` 守卫下的入口注入、`createRouter` 工厂替换
- 变量名静态匹配（`router.push` 成员调用）不可靠场景（别名/解构/`.push` 数组误伤）**不再承诺转换**；替代路径：运行时桥接对象直接替换 import（external 化 cordis-router-bridge，零 AST 魔法）
- "零改动适配"修订为"**约定式近零改动**"（README 同步修订）：入口处一行 `export default defineCordisApp(...)` 或构建插件 externals 重定向

### 5.4 history 模式服务端 fallback（新增）

```
# nginx
location / { try_files $uri $uri/ /index.html; }
# CDN（静态托管）：error page 404 -> /index.html 重写规则（各云厂商等价配置）
```

- 宿主部署文档必须包含；`cordis-cli doctor` 检测深链直达 200/404 状态并提示

## 六、场景补全

| 场景 | 方案 |
|------|------|
| 懒 outlet | `loadOnVisible: true`（IntersectionObserver 触发挂载；observer 挂 ctx.effect）。落地形式：`createCordis({ router: { lazyOutlets: ['side'] } })`——清单等价于逐槽位 `loadOnVisible: true`；宿主选择器与 lifecycle `outlets` 同一约定（缺省 `#{outlet}`）；pending 期间多次导航只派最新意图；IO 能力/宿主元素缺失降级立即派发（优化不阻塞挂载） |
| 应用级错误边界 | 挂载失败 -> lifecycle ErrorOutlet（路由文档引用，UI 属 lifecycle §6.2） |
| 保活期间路由状态 | suspend 时 router 记录槽位位置快照；resume 校验 URL 与快照不一致时以 URL 为准（用户可能后退） |
| scroll restoration | history.state 记录 scrollTop；restore 时应用 |
| 版本偏斜 | 旧 HTML 缓存 + chunk 404 -> deps 服务重取 manifest -> 提示刷新（基线 §五） |
| CDN 失败重试 | deps 服务多源退避（heterogeneous-loading.md §十） |
| base path 运行时可配 | `cordis.routes.json` 的 basePath 支持 `${env.BASE}` 占位，运行时由宿主注入 |
| i18n 路由 | basePath 支持 locale 前缀模式（`/:locale/app1`），router 解析时剥离 |
| SSR 水合 | router 服务端解析 URL -> 初始槽位矩阵注入 hydration payload；CSR 端首次 watch 直取（P2，与 heterogeneous-loading §SSR 衔接）<br>**阶段 1 已落地（F5-01/02/03）**：\`RouterConfig.initialUrl\`（解析源可注入，单一源无竞态）+ \`readHydrationPayload\`/\`hydrationMismatch\`（payload 读取 + 以客户端 URL 为准）；首次 watch 直取由 ADR-0047 首跑同步取值天然满足。阶段 2（同构 adopt）待应用侧生态推动 |

## 七、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | RouterService（槽位矩阵 + `__tx_` 保留字 + 参数合并）+ NavigationController（序号 + abort） |
| P0 | popstate 全链路 + history.state 快照恢复 |
| P1 | 守卫 serial 管线 + 重定向上限 + Vue Router 4/3 桥接 |
| P1 | 懒 outlet、scroll restoration、敏感 query 过滤 |
| P2 | ~~SSR 水合阶段 1~~（F5 已落地）、i18n、base path 占位符 |

## 八、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| R-1 "路由即 coeffect"伪理论/push-replace 互逆 | §二 修正表述 |
| R-2 自研 RouteContextTree | §3.3 废除，isolate + ctx.effect 登记注销 |
| R-3 `ctx.isolate()` 误解 | §二/§3.3 正确用于 router-view 隔离 |
| R-4 `ctx.effect` 返回 Promise 当 disposer/双重 unmount | §二 watch 正确用法（返回真 disposer） |
| R-5 `ctx.service.*`/全局 useRoute 自造 API | §二 统一 router 服务 API |
| R-6 手工 priority 守卫管线 | §4.3 serial + prepend |
| R-7 多槽位通道冲突/query 抹除/token 泄漏 | §3.1 保留字+仲裁 / §3.2 合并规则+sanitizeQuery |
| R-8 popstate 绕过守卫/无导航序号 | §4.1/§4.2 |
| R-9 守卫重定向死循环 | §4.3 depth 上限 8 |
| R-10 Vue4 桥接 currentRoute 身份/push 假 Promise | §5.1 |
| R-11 Vue2 桥接双写 History/锁版本/$router 注入 | §5.2 abstract 模式 + prototype |
| R-12 前缀匹配歧义/静默覆盖 | §3.3 段边界 + 显式报错 |
| R-13 pushState 写 hash 不触发 hashchange | §4.2 hashchange/popstate 去重管线 |
| R-14 DeepLink 单槽位 pending/无 owner fallback | §4.1 序号化 + lifecycle fallback 应用有 owner（挂 main outlet） |
| R-15 构建期 AST 不可靠承诺 | §5.3 收窄 + externals 路线 |
| R-16 三种创建 API 并存/cordova 笔误 | §5.1 统一 createCordisRouter |
| 缺失 history fallback/懒 outlet/保活快照 | §5.4/§六 |
