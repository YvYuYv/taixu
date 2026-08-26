# Cordis 异构加载（Heterogeneous Loading）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> 命名修正：外部框架是 **wujie（无界）**，不是 "wujia"（旧版全文错误已修正）。

## 一、问题分析

| 层级 | 异构类型 | 核心冲突 |
|------|----------|----------|
| 同技术栈不同版本 | Vue 2 + Vue 3 | 全局变量冲突、插件机制不同 |
| 不同技术栈 | Vue + React + Angular + jQuery | VDOM/事件系统/生命周期不兼容 |
| Cordis vs 其他方案 | qiankun/wujie/micro-app | 上下文协议/加载/沙箱机制不同 |

冲突本质是**共享全局状态的副作用冲突**（全局变量/DOM/事件/CSS/路由）。Cordis 视角：这些是 effect 冲突--**副作用可逆化（ctx.effect）+ 服务注入（不经全局变量）** 从根上消除大部分冲突面；剩余部分由共享依赖仲裁（§七）与沙箱（js-sandbox.md）处理。

## 二、总体架构

```
宿主 ctx.plugin(monitor, security, bus, state, deps, sandbox, lifecycle, router)
                                     │
        deps 服务（本模块核心）
        ├─ manifest 加载与校验（版本/SRI）
        ├─ 共享依赖仲裁（§七 Dependency Negotiation）
        ├─ ESM importmap 加载（§六，Proxy 沙箱外的正路）
        └─ 适配器工厂（§四：目标框架 -> Cordis 插件）
```

**建模修正（旧版 H-1）**：子应用 = `ctx.plugin()`（唯一范式）；旧版 `LifecycleManager(bootstrap/mount/unmount)` 与自研 `effectTracker`（"假设存在"）废除。适配器只做一件事：**把宿主框架的 mount/unmount 包成一次 effect**。

## 三、加载流程（与 lifecycle §2.2 事务对齐）

```
deps.loadApp(appId, { signal })
  1. fetch manifest（带 schema 版本 + 签名；失败重试 §十）
  2. 校验 SRI（security §八）、URL 白名单、共享依赖声明
  3. 解析共享依赖：注册表仲裁（§七）
  4. 入口加载：ESM 路线 importmap（§六） / legacy 路线沙箱 exec（js-sandbox §3.4）
  5. 返回 { plugin } -- 适配器包装后的 Cordis 插件
```

## 四、框架适配器

### 4.1 通用形态（把 mount 包成 effect）

```typescript
export function defineCordisApp<T>(factory: AdapterFactory<T>): Plugin.Object {
  return {
    inject: ['lifecycle'],
    apply(ctx: Context) {
      let instance: T | undefined
      let unmounted = false
      ctx.effect(() => {
        instance = factory.mount(ctx, lifecycle.containerOf(ctx))   // 容器唯一路径（基线 §五）
        if (unmounted && instance?.update) instance.update(lifecycle.containerOf(ctx))  // 竞态：dispose 前 mount 完成
        return () => { unmounted = true; factory.unmount(instance) }
      })
      // 框架级错误边界（统一转 monitor.capture，lifecycle §6.2）
      factory.attachErrorBoundary?.(ctx, (error) => ctx.monitor.capture(error, { appId: ctx.fiber.name, phase: 'runtime' }))
    },
  }
}
```

- 接口签名统一：`load(module, container, ctx)` 一种形状（旧版同文件两种签名已废除）
- mount 返回句柄支持 `update(container)`（迁移容器，修复 React 适配器 "mount 永远无法迁移"）

### 4.2 Vue 3 / Vue 2 / React / Angular

```typescript
// Vue 3
export const vue3Adapter: AdapterFactory<VueApp> = {
  mount: (ctx, container) => {
    const app = (ctx.requireShared('vue') as typeof Vue).createApp(ctx.rootComponent)
    // 错误边界：app.config.errorHandler -> monitor.capture
    app.config.errorHandler = (err) => ctx.monitor.capture(err, { appId: ctx.appId, phase: 'runtime' })
    return { app, unmount: () => app.unmount() }
  },
  unmount: (i) => i.unmount(),
}

// React 18+（17 及以下经 legacy 分支，条件由共享依赖版本仲裁结果决定，不再无条件 createRoot）
export const reactAdapter: AdapterFactory<ReactRoot> = {
  mount: (ctx, container) => {
    const { createRoot, hydrateRoot } = ctx.requireShared('react-dom/client') ?? ctx.requireShared('react-dom')
    const root = createRoot(container)
    root.render(createElement(ctx.rootComponent))
    return { root, unmount: () => setTimeout(() => root.unmount(), 0), update: (c) => root.render(createElement(ctx.rootComponent)) }
  },
  unmount: (i) => i.unmount(),
}
```

- **Angular（可行性诚实化）**：要求子应用以 **standalone components + AOT** 构建产出，经 `createApplication()`（每应用独立 ApplicationRef，规避"每页面仅一个 platform"限制）；运行时 `@NgModule` JIT 方案废除（旧版方案依赖 JIT 装饰器 + reflect-metadata + 单 platform，实际不可行）。Angular 路线为 P2，对比表从"支持"改为"实验性"
- **jQuery/原生**：直接 apply 内操作 DOM，全部写点经 ctx.effect

### 4.3 容器（修复 Shadow 分支不进 DOM）

```typescript
// lifecycle.createOutletContainer（唯一路径，style-isolation 引用）
function createOutletContainer(outlet: string, opts: StyleOptions): HTMLElement {
  const host = document.createElement(opts.tagName ?? 'div')
  host.id = `tx-${outlet}`
  document.querySelector(outletSelector(outlet))?.appendChild(host)   // 先入 DOM
  if (opts.mode === 'shadow') host.attachShadow({ mode: 'open' })    // 再 attach（旧版分支提前 return，宿主节点从未插入）
  return opts.mode === 'shadow' ? host.shadowRoot! : host
}
```

错误回退 UI 使用 `textContent` 组装（修复 `innerHTML + ${error.message}` XSS）。

## 五、外部框架兼容（qiankun / wujie / micro-app）

```typescript
// qiankun 产物适配（loadApp 形状统一为 qiankun 的单 props 对象）
export const qiankunCompat: AdapterFactory = {
  mount: async (ctx, container) => {
    const lifecycle = await deps.loadEntry(ctx.appId)
    const props: QiankunProps = { container, props: { ctx } }       // 单对象（旧版两种参数形状已统一）
    await lifecycle.bootstrap?.(props)
    await lifecycle.mount(props)
    return { unmount: async () => lifecycle.unmount(props) }
  },
  // globalState 桥：qiankun 的 onGlobalStateChange/setGlobalState 映射到 bus/state（协议实现于本适配器，
  // 旧版假定 context 上存在这两个方法但全文无定义）
}
```

```typescript
// wujie 产物适配（正确拼写）
export const wujieCompat: AdapterFactory = {
  mount: async (ctx, container) => {
    // wujie 官方 startApp API；同源假设显式声明：跨源 CDN 场景必须在 originAllowlist（security §十二）
    const instance = await startWujieApp({ url: ctx.entryUrl, el: container, sync: true })
    // 事件监听一次性注册于宿主 ctx（旧版每次 on() 新增 window message 监听且不移除）
    return { unmount: () => instance.destroy() }   // destroy 保留 wujie 自身预加载语义：传 keep-alive 配置时不销毁 iframe
  },
}
```

- `iframe.contentWindow.__cordis_context__` 跨源赋值（SecurityError）：改为经 wujie props/eventBus 通道，不直写跨源窗口
- micro-app 同理走 `<micro-app>` 元素生命周期映射

## 六、ESM 加载与 Proxy 沙箱的关系（根本矛盾的解决）

**旧版根本矛盾（跨文档 I-3）**：Proxy/with 沙箱拦截全局变量，但加载路线用原生 `import()`--引擎级模块解析 Proxy 拦不住，两套机制互相矛盾。

**解决方案：ESM 主路线 = importmap + 受控 globalThis 工厂，不走 eval**：

```html
<!-- 宿主页面注入（运行时由 deps 服务生成） -->
<script type="importmap">
{
  "imports": {
    "vue": "https://cdn.example.com/shared/vue@3.4.0/index.mjs",
    "react": "https://cdn.example.com/shared/react@18.2.0/index.mjs",
    "app-cart": "https://cdn.example.com/apps/cart@1.2.0/entry.mjs"
  }
</script>
```

```typescript
// 子应用入口经构建插件生成为工厂形态（globalThis 经闭包形参注入，ESM 产物零 eval）：
export default function createApp(cordisGlobalThis) {   // 构建期注入形参（__cordis_g__）
  // 应用代码内的裸标识符 document/fetch/localStorage 在构建期被改写为 cordisGlobalThis.document/...
  // （scoped 改写仅限应用自身模块图，非全局替换；改写器只处理标识符引用，不做字符串替换）
  return { apply(ctx) { /* Cordis 插件 */ } }
}
```

- 模块内标识符经**构建期改写**指向注入的 `__cordis_g__`（沙箱代理）--变量级隔离不依赖 eval/with，与 ESM 兼容
- **共享依赖走 importmap**：双解析通道问题消除（旧版 external 化后又走自建注册表，与宿主 importmap 打架）--importmap 即注册表的运行时载体，仲裁结果（§七）生成 importmap
- legacy UMD/IIFE 产物：js-sandbox §3.4 经典脚本路线（with + 非严格限定）
- **CSP 兼容**：全程无 eval；动态 import 白名单经 importmap 天然约束（未映射的裸模块说明符直接失败）

### 6.1 动态 public path

- webpack5 `publicPath: 'auto'` 依赖 `document.currentScript`（ESM/eval 下为 null）-> 构建插件注入**运行时配置模块**（entry 首行 import `cordis-runtime-path`），该模块经 manifest 写入真实 CDN base（无时序竞态；旧版 `__webpack_public_path__` 沙箱注入的时序问题消除）
- Vite：改写器限定**产物 chunk 范围**（rollup `generateBundle` 钩子内仅处理本应用 chunk；`renderChunk` 的全局替换废除，不再误伤字符串/宿主 chunk）

## 七、共享依赖仲裁（Dependency Negotiation Matrix）

```typescript
class DepsService extends Service {
  static [Context.provide] = 'deps'
  static inject = ['security', 'monitor']

  private registry = new Map<string, SharedModule[]>()   // { range, version, module, refCount }

  /** SemVer 解析采用轻量实现（含 satisfies/prerelease；不用 node-semver 全量包） */

  async negotiate(name: string, range: string): Promise<SharedModule> {
    const candidates = this.registry.get(name) ?? []
    // 1. 最高满足版本（修复旧版"取注册顺序第一个满足者"导致同会话不同实例、故障不可复现）
    const best = maxSatisfying(candidates.map(c => c.version), range)
    if (best) { candidates.find(c => c.version === best)!.refCount++; return that }

    // 2. 单例冲突：无满足版本且存在 singleton 共享 -> 硬失败（不再"强制塞旧版本+console.warn"，
    //    旧版要求 ^3 的应用被塞给 2.7 运行时才炸；现在加载期 fail-fast 并进入 lifecycle 恢复策略）
    if (this.isSingleton(name)) {
      throw new DependencyConflictError(name, range, candidates.map(c => c.version))
    }

    // 3. fallback：私有副本（双实例风险显式管理，见下）
    return this.loadPrivateCopy(name, range)
  }

  /** 应用卸载注销：refCount 归零释放模块引用（importmap 条目在下一导航刷新） */
  release(name: string, version: string) {
    const mod = this.registry.get(name)?.find(c => c.version === version)
    if (mod && --mod.refCount <= 0) this.registry.get(name)!.splice(this.registry.get(name)!.indexOf(mod), 1)
  }
}
```

**fallback 双实例风险的管理**（旧版零提示；ADR-0038 版本分裂策略）：

- 私有副本启用前**静态检查**：应用 manifest 声明 `acceptsDuplicate: [dep]` 白名单（仅允许无全局单例假设的库，如 lodash）
- 框架类（vue/react/组件库）**禁止**私有副本（split-brain：两份 Vue 的 provide/inject、两份 React 的 invalid hook call）--冲突时硬失败并引导宿主调整版本矩阵
- **版本分裂 = iframe 隔离触发条件**（ADR-0038）：业务必须双实例共存时**强制走 iframe 沙箱**（物理隔离的 document，框架级全局副作用如 React 17 的 document 事件委托不冲突）而非 Proxy 沙箱；默认策略是**升级提示**（monitor 上报 `DEP_VERSION_SPLIT`，DevTools 提示统一升级）
- 传递依赖：私有副本的依赖图同样进入仲裁（旧版 fallback 副本自带全套传递依赖造成双份闭包）

```jsonc
// cordis.dependencies.json（清单，进 manifest 签名范围）
{
  "shared": {
    "vue": { "range": "^3.2.0", "singleton": true },
    "lodash": { "range": "^4.17.0", "acceptsDuplicate": true },
    "react-dom": { "range": "^18.0.0", "singleton": true, "strict": true }
  }
}
```

- `strict: true`：版本不满足时直接失败（不做任何 fallback）
- 仲裁告警接入 monitor（`DEP_NEGOTIATION_FALLBACK` / `DEP_CONFLICT`），非 console.warn
- 落地形式（P1）：清单通道已就位——`createCordis({ deps: { shared } })`（cordis.dependencies.json 形状），`negotiate(name, range, options)` 逐调用 options 优先、清单兜底；`DEP_VERSION_SPLIT` 升级提示按依赖去重一次（ADR-0038 默认策略；强制双实例共存须走 iframe 沙箱——接线随适配票）；容灾 404 与 SRI 失败均经 `onSkew` 清单重取比对 entry 变更才 `DEPLOY_SKEW`（未注入回调维持 404 即报）。**仍未落地**：传递依赖进仲裁（私有副本依赖图）、清单 range 的注册侧版本校验

### 7.1 与 Module Federation / AMD 的关系

- **importmap 优先**；宿主已有 MF remote：适配层将 MF 共享模块注册为 registry 条目（`negotiate` 结果一致）
- AMD/UMD 全局 `define('vue')` 撞名：legacy 路线中 AMD loader 经沙箱 per-app 命名空间包装（`__cordis_define__`），同名模块按 appId 隔离（P2）

## 八、多版本共存（Vue2 + Vue3 案例）

- 共享声明互不重叠（`vue@^2` 与 `vue@^3` 是 registry 两个条目，importmap 双映射 `vue2`/`vue3` 别名）
- 应用内部 import 'vue' 经构建期改写为版本别名（构建插件根据 manifest 注入）
- `window.Vue` 污染：ESM 路线天然无全局挂载；legacy 路线经沙箱 fakeWindow 隔离

## 九、SSR（分阶段）

- 基础模式：主应用 SSR + 子应用 CSR（default）
- 同构模式：子应用产出 ESM 且无浏览器依赖 -> 服务端 `createApplication`/`renderToString` 输出片段，宿主拼装；hydration 经 router 初始槽位矩阵（route-adaptation §六 SSR）
- 边缘 ESI：CDN 层组装（P3）

## 十、预加载与容灾

```typescript
// 预加载（修复瀑布与句柄泄漏）
class Preloader {
  preload(appId: string) {
    // manifest -> entry -> 声明的 chunks 与共享依赖，全部 <link rel="modulepreload"> 并行
    // crossorigin="anonymous"（CORS CDN 避免双重下载；旧版只 preload 单入口无 crossorigin）
  }
  // 策略：idle（requestIdleCallback）/ hover 菜单项 / 路由预测（历史访问频次）
}

// 容灾
class ResilientLoader {
  async load(url: string, init: LoadInit): Promise<Response> {
    const sources = [url, ...init.fallbackSources]     // 多 CDN
    let lastError: unknown
    for (const src of sources) {
      for (let attempt = 0; attempt <= init.retries; attempt++) {
        try { return await fetch(src, { signal: init.signal, integrity: init.integrity }) }
        catch (e) { lastError = e; await sleep(200 * 2 ** attempt) }
      }
    }
    throw lastError
  }
  // 版本偏斜（部署后旧 HTML 引用已删除 chunk -> 404）：
  // 404/SRI 失败时重取最新 manifest，若 entry 变更 -> 提示刷新（monitor 上报 DEPLOY_SKEW，基线 §五唯一策略）
}
```

- LazyLoader 的 IntersectionObserver 挂 ctx.effect（dispose 自动 disconnect）；回调内 try/catch

## 十一、iframe 沙箱的运行时模型：精简运行时 + 代理 ctx（ADR-0043/0049）

iframe 沙箱（third-party 与版本分裂场景）的 `window` 是真实的另一个 window--scopedFetch/挂起注册表/样式拦截都挂在 Proxy 沙箱的 window 上，两套沙箱能力面不对称。模型：

- **iframe 内跑精简运行时（Lite Runtime）**：Cordis 子集--本地管理 fiber/effect（副作用随 iframe 卸载自然消亡），**不跑服务、不跑调度管线**
- **代理 ctx 桥接**：iframe 内应用拿到的 ctx 对 `ctx.bus.send`、`ctx.state.set`、`ctx.monitor.capture` 等服务调用**序列化后经 postMessage 转发**到主框架执行、结果回传（所有能力调用异步化--跨边界的诚实语义）
- **不复制能力面**：不在 iframe 里重建 scopedFetch/挂起注册表/样式拦截（那等于跑第二套框架）
- **卸载清理**：正常 dispose 经 postMessage 通知；**崩溃**（非正常卸载）由主框架 heartbeat 超时感知（默认 5s 周期），按 appId **批量清理**主框架侧为该应用注册的所有资源（消息订阅、状态键权限、挂起注册表条目）
- 桥接协议（信封校验/origin 白名单/nonce 防重放）见 communication-protocol.md §八

## 十二、对比表（诚实化）

| 能力 | Cordis | qiankun | wujie |
|------|--------|---------|-------|
| 隔离 | Proxy（first-party）/ iframe（third-party + 版本分裂，ADR-0038） | Proxy+Snapshot | iframe |
| 共享依赖 | importmap + SemVer 仲裁（分裂强制 iframe） | externals 约定 | iframe 天然隔离+proxy 注入 |
| Angular | **实验性（standalone+AOT 路线，P2）** | 有限 | 支持 |
| 零改动 | **约定式近零改动**（一行 defineCordisApp 或 externals 重定向） | 接近零改动 | 接近零改动 |

## 十三、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | DepsService（manifest+SRI+仲裁）+ importmap 生成 + 构建期标识符改写器 |
| P0 | Vue3/React 适配器（defineCordisApp）+ 容器唯一路径 |
| P1 | 共享依赖 release/冲突硬失败/私有副本白名单、预加载、容灾重试 |
| P1 | qiankun/wujie 兼容适配 |
| P1 | iframe 精简运行时 + 代理 ctx 桥 + heartbeat 清理（§十一） |
| P2 | Vue2/Angular standalone 路线、AMD 命名空间、SSR 同构 |

## 十四、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| H-1 自称 effect isolation 实为自研 tracker | §二 唯一范式 ctx.plugin + effect |
| H-2 三套依赖解析自造 API | DepsService 单一入口（requireShared） |
| H-3 Service 注册两种写法 | 统一 `static [Context.provide]`（基线） |
| H-4 自研 EventBus | bus 服务（communication-protocol） |
| H-5 Proxy 沙箱与 ESM 根本矛盾 | §六 importmap + 构建期标识符改写（零 eval） |
| H-6 Shadow 分支宿主不入 DOM | §4.3 先 append 再 attach |
| H-7 semver 取首个/塞旧版/fallback 双实例/注册表泄漏/传递依赖 | §七 最高满足版本 + 硬失败 + 白名单 + release + 传递闭包仲裁 |
| H-8 错误页 XSS | textContent |
| H-9 React 版本/API 错配 | §4.2 按仲裁结果分支 + update 句柄 |
| H-10 Angular JIT 不可行 | standalone+AOT 路线，标注实验性 |
| H-11 qiankun 参数形状/globalState 无定义 | §五 统一单 props + 桥实现于适配器 |
| H-12 wujia 拼写/跨源赋值/监听泄漏 | §五 修正拼写 + props 通道 + 一次性注册 |
| H-13 沙箱池跨应用感染 | 废除池化（js-sandbox §4.4） |
| H-14 预加载瀑布/IO 泄漏 | §十 modulepreload 全链 + effect 托管 |
| H-15 HeterogeneousRouter 空壳/与路由文档双轨 | 废除，路由归 route-adaptation |
| H-16 publicPath 时序/replace 误伤 | §6.1 运行时配置模块 + chunk 范围限定 |
| I-16 load 签名自相矛盾 | §4.1 单一形状 |
