# Cordis JS 沙箱（JS Sandbox）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> **定位声明（全文一致的叙事）**：Proxy 沙箱提供的是**污染隔离与效应回收**，**不是安全边界**；安全边界只有 iframe `sandbox`（无 `allow-same-origin`）。第三方不可信应用一律走 iframe 沙箱（§五）。

## 一、问题分析

### 1.1 微前端中 JS 沙箱的必要性

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| 全局变量污染 | `window.Vue`、`window.React` 互相覆盖 | 高 |
| 全局函数冲突 | `window.$` 被 jQuery 占用 | 高 |
| 原型链污染 | `Array.prototype.xxx 被修改影响所有应用 | 高 |
| 定时器/监听泄漏 | 卸载后残留执行 | 中 |
| 逃逸与滥用 | 沙箱内代码获取真实 window/宿主能力 | 高 |

### 1.2 Cordis 理论视角（修正旧版混淆）

Cordis 的 effect isolation（效应回收）由 runtime dispose 机制完成，**不依赖 JS 沙箱**；反过来，JS 沙箱解决不了效应回收。两者的正确分工：

| 能力 | 归属 | 机制 |
|------|------|------|
| 定时器/监听/订阅的**自动清理** | Cordis | `ctx.effect` / `ctx.on`（fiber dispose 级联回收） |
| 全局变量/原型链的**污染隔离** | JS 沙箱 | Proxy 双窗口 + 原型快照守护 |
| 定时器/监听的**归因与冻结**（保活） | JS 沙箱 + SuspendScope | 包装 setTimeout/addEventListener 记账（沙箱侧），调度控制（lifecycle 侧） |
| **安全边界** | iframe | `sandbox` 属性 + postMessage 协议 |

因此沙箱的正确形态是：**创建动作与 teardown 挂在应用 fiber 的 effect 上**（生命周期管理 §四所有权表），内部的一切包装（定时器/监听/网络/存储）仅做**记账与转发**，卸载由 Cordis 统一回收。

## 二、沙箱架构

```typescript
class SandboxService extends Service {
  static [Context.provide] = 'sandbox'
  static inject = ['security', 'monitor']

  /** 每应用一个沙箱实例（不池化，理由见 §4.4）；销毁幂等（双保险：lifecycle 显式 + fiber effect） */
  async create(appId: string, options: SandboxOptions): Promise<Sandbox> {
    const sandbox = options.trust === 'third-party'
      ? new IframeSandbox(this.ctx, appId, options)
      : new ProxySandbox(this.ctx, appId, options)
    await sandbox.init()
    return sandbox
  }
}

interface Sandbox {
  readonly proxy: WindowProxyLike      // 注入应用执行环境的 globalThis 替身
  destroy(): Promise<void>             // 幂等
}
```

## 三、Proxy 沙箱（first-party）

### 3.1 逃逸向量清单（旧版完全缺失，全部显式缓解）

| # | 逃逸向量 | 缓解措施 |
|---|----------|----------|
| 1 | `(0, eval)('...')` / 裸 `eval` / `Function(...)`（直接作用域解析到真实全局） | §3.4：exec 管控 + CSP 策略声明；拦截不承诺"绝对"，承诺"记账+告警" |
| 2 | `sandbox.setTimeout.constructor('return this')()`（经透传函数对象取 constructor 链） | §3.2：透传函数对象的 `constructor/__proto__/prototype` 属性冻结为 getter（返回受控副本或触发告警）；关键：**冻结的是沙箱内可见的包装函数**，而包装函数本身是沙箱构造的新函数，其闭包不暴露真实引用 |
| 3 | `Object.getPrototypeOf(sandbox).constructor...`（fakeWindow 原型逃逸） | §3.2：`getPrototypeOf` trap 返回 `null`；fakeWindow 以 `Object.create(null)` 为基座 |
| 4 | `with(proxy)` + `Symbol.unscopables` | §3.2：`has` trap 恒真 + `get` 拦截 `Symbol.unscopables` 返回 undefined |
| 5 | `document.currentScript`、`document.defaultView`、`window.top/parent/opener` | §3.5：document 代理重定向；top/parent/opener 返回沙箱自身 |
| 6 | 动态 `import(url)`（引擎级解析，Proxy 拦不住） | heterogeneous-loading.md §六：统一 importmap + `__cordis_import__`（deps 服务白名单+SRI） |
| 7 | Worker / ServiceWorker / SharedWorker 注册 | §3.7：`navigator.serviceWorker.register`、`Worker` 构造函数经安全策略（默认 first-party 允许 Worker 但禁止 SW 注册；策略可配，违例告警） |
| 8 | 网络面（fetch/XHR/WebSocket/EventSource/sendBeacon/标签加载） | §3.6：全部经 bus.network 注入的包装（唯一链路） |
| 9 | `customElements.define` 全局注册冲突 | 沙箱提供 per-app registry 转发（同名冲突时以 `appId-tag` 前缀注册并告警） |
| 10 | `history.pushState` 劫持 | 重定向到 router 服务的受控 API（route-adaptation.md §4） |

> 残余风险声明：Proxy 沙箱对**已知向量**缓解、未知向量记账告警（security/violation）。安全要求高的应用请用 iframe 沙箱。此声明与 security.md §一、README 完全一致。

### 3.2 双窗口 fakeWindow（正确 trap 语义）

```typescript
class ProxySandbox implements Sandbox {
  private fakeWindow: Record<PropertyKey, unknown>
  private disposed = false

  constructor(private ctx: Context, private appId: string, private options: SandboxOptions) {
    // null 原型基座：关闭 getPrototypeOf 逃逸（向量 #3）
    this.fakeWindow = Object.create(null)
  }

  get proxy(): WindowProxyLike {
    return this._proxy ??= new Proxy(this.fakeWindow, {
      get: (target, key, receiver) => {
        if (this.disposed) throw new SandboxDisposedError(this.appId)
        if (key === Symbol.unscopables) return undefined                     // 向量 #4
        if (key === 'getPrototypeOf' || key === '__proto__') return () => null
        if (this.fakeBlacklist.has(key)) {
          this.ctx.emit('security/violation', { appId: this.appId, rule: 'sandbox-blacklist', detail: { key: String(key) } })
          return undefined
        }
        if (key in target) return Reflect.get(target, key, receiver)
        // 原生全局：Reflect + 正确 receiver（旧版 window[key] 解绑 this -> IllegalInvocation）
        const value = Reflect.get(globalThis, key, globalThis)
        if (typeof value === 'function' && this.nativeUnbound.has(key)) {
          return this.wrapNative(key, value)     // 包装（记账/替换注入），包装函数为沙箱构造，见向量 #2 缓解
        }
        if (this.isReadonlyPassthrough(key)) return this.readonlyView(key)  // document/location 等受控视图
        return value
      },
      set: (target, key, value) => {
        if (this.disposed) throw new SandboxDisposedError(this.appId)
        if (this.isProtectedGlobal(key)) {
          // location 赋值走 router 受控导航而非静默吞进 fakeWindow（旧版 window.location=x 静默失效）
          if (key === 'location') { this.ctx.router.navigate(String(value)); return true }
          this.ctx.emit('security/violation', { appId: this.appId, rule: 'protected-global-write', detail: { key: String(key) } })
          return true    // 恒 true：deleteProperty/set 不返回 false（strict mode 下会抛 TypeError）
        }
        target[key] = value
        this.modifiedKeys.add(key)            // 记账（供诊断与 snapshot 对比）
        return true
      },
      deleteProperty: (target, key) => {
        delete target[key]
        return true                            // 恒 true（同上）
      },
      has: () => true,                          // with 语句绑定全部走 traps（仅限 §3.4 非严格产物场景）
      getPrototypeOf: () => null,               // 向量 #3
    })
  }
}
```

要点：

- **set/deleteProperty 恒返回 true**（旧版键不存在时 `return false` 在 strict mode 直接 TypeError）
- **`location.href` 行为统一**：无论 `window.location = x` 还是 `location.href = x`，都重定向 router（旧版一个真实导航、一个静默吞掉，行为分裂）
- `readonlyPassthrough`（document/location/history）返回的是 **§3.5 的受控视图**，不是裸真实对象（旧版直接透传真实 document，"DOM 隔离"名不副实）

### 3.3 原型守护（可用性优先的正确实现）

旧版 `this.proxy.Object = { ...Object }` 展开只拷贝可枚举属性，`Object.keys` 直接变 undefined（子应用必挂）。修正：

```typescript
setupPrototypeGuard(ctx: Context) {
  // 不复制 Object：直接冻结原型（宿主可控开关，默认冻结常见污染点）
  const targets = [Object.prototype, Array.prototype, Function.prototype, String.prototype, ...]
  ctx.effect(() => {
    const descs: Record<string, PropertyDescriptorMap> = {}
    for (const proto of targets) {
      descs[key] = {}
      for (const name of Object.getOwnPropertyNames(proto)) {
        descs[key][name] = Object.getOwnPropertyDescriptor(proto, name)!
      }
      Object.freeze(proto)                    // freeze 先于应用加载（宿主启动期执行，时序明确）
    }
    return () => { /* 宿主销毁时无需恢复（页面即卸载）；freeze 是进程级策略 */ }
  })
  // defineProperty/直接赋值到原型：freeze 后 strict mode 抛错 -> 错误归因到 appId（monitor）
}
```

- 以 `Object.freeze` 为主（静默失败模式抛 TypeError 且归因），**不再**复制 Object 造成 API 丢失
- 类名混淆导致的 descriptor 键碰撞问题不存在（不再以 constructor.name 做键）
- 需要猴子补丁的宿主（如 mock 场景）配置 `prototypeGuard: 'off'`

### 3.4 代码执行（诚实的能力边界）

**结论先行：现代 ESM 产物不进 Proxy 沙箱执行。** 路由分派：

| 产物形态 | 执行方式 | 拦截能力 |
|----------|----------|----------|
| ESM（`import()`，主流） | **不包 eval**。经 deps 服务 importmap 白名单加载，模块拿到的是"注入过的 globalThis"（通过模块环境的 `globalThis` 覆写：入口模块以 `new Proxy` 作为 `globalThis` 形参的工厂包裹，见 heterogeneous-loading.md §六） | 变量级：模块内裸 `document` 等标识符经闭包形参解析 |
| 经典脚本字符串（遗留 UMD/IIFE） | `new Function('window','self','globalThis', withWrapped(code))`，仅限 `code` 不含 `"use strict"` 且产物兼容 `with` | 完整 Proxy trap 拦截 |
| 需 `eval/new Function` 的运行时代码 | 不拦截执行，但 `eval/Function` 在沙箱 fakeWindow 上是**记账包装**：执行经宿主 CSP（默认无 `unsafe-eval` 时此类代码直接被浏览器阻断） | 记账 + CSP 兜底 |

> 旧版"with 包裹 + has 恒真"对 ESM/严格模式产物直接 SyntaxError，且与框架自身的原生 `import()` 加载路线互相矛盾（跨文档 I-3）。本版把两种路线的能力边界写明。

### 3.5 Document 代理（修复三处硬伤）

```typescript
class DocumentProxy {
  constructor(private container: HTMLElement, private tracker: InjectedNodesTracker) {}

  get(target: Document, key: PropertyKey, receiver: unknown) {
    switch (key) {
      // 旧版 bug：HTMLElement 上不存在 getElementById，调用即 TypeError。
      // 修正：DOM 查询方法在 container 上等价存在（querySelector 等）才转发，getElementById 显式实现：
      case 'getElementById': return (id: string) =>
        this.container.querySelector(`[id="${cssEscape(id)}"]`) ?? target.getElementById(id).contains(this.container)
          ? this.container.querySelector(`[id="${cssEscape(id)}"]`)
          : null   // 只暴露容器内结果（scoped 查询语义）
      case 'head':
      case 'body': return this.stableView(key, target)      // 缓存单例代理：document.head === document.head（旧版每次 new Proxy）
      case 'currentScript': return this.tracker.currentScript ?? null   // 注入脚本上下文（publicPath 依赖）
      case 'defaultView': return this.sandbox.proxy
    }
    if (typeof key === 'string' && DOM_QUERY_KEYS.has(key)) {
      return this.scoped(key)   // querySelector/querySelectorAll/getElementsByClassName/... 限定 container 作用域（找不到回落 null/空）
    }
    return Reflect.get(target, key, receiver)
  }
}

class InjectedNodesTracker {
  // 追踪范围覆盖全部注入路径（旧版只拦 appendChild/insertBefore，append/prepend/replaceChildren/insertAdjacentHTML/innerHTML/write 全部绕过）
  patch(el: HTMLElement) {
    for (const method of ['appendChild', 'insertBefore', 'append', 'prepend', 'replaceChildren']) {
      const raw = el[method].bind(el)
      el[method] = (...nodes: Node[]) => {
        for (const n of nodes) if (n instanceof HTMLStyleElement || n instanceof HTMLScriptElement) this.record(n)
        return raw(...nodes)
      }
    }
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'innerHTML')
    Object.defineProperty(el, 'innerHTML', {
      set(html) { desc!.set!.call(el, html); this.harvest(el) },   // 解析后收割新增 style/script
      get: desc!.get!,
    })
  }
}
```

- 每应用的 style/script 注入全部记账 -> 卸载时统一移除（同时是 style-isolation §4 样式生命周期的数据源）
- `document.write` 直接禁用（first-party 场景告警）

### 3.6 网络与定时器包装（记账 + 转发）

```typescript
// 网络：不猴补 window.fetch（全局共享）；scopedFetch 经 bus.network 唯一链路注入（communication-protocol.md §六）
injectNetwork(appId: string) {
  this.fakeWindow.fetch = this.bus.network.scopedFetch(appId)
  this.fakeWindow.XMLHttpRequest = this.scopedXHR(appId)          // open/send 包装：URL 白名单 + traceparent + 埋点
  this.fakeWindow.WebSocket = this.scopedWS(appId)                 // 构造包装：URL 策略
  this.fakeWindow.EventSource = this.scopedES(appId)
  this.fakeWindow.navigator.sendBeacon = this.scopedBeacon(appId)
}

// 定时器：经 SuspendScope（lifecycle-management.md §5.2）-> 保活可冻结；dispose 由 fiber effect 兜底清除
injectTimers(ctx: Context, scope: SuspendScopeService) {
  this.fakeWindow.setTimeout = (fn, ms, ...args) => scope.setTimeout(() => fn(...args), ms)
  this.fakeWindow.setInterval = (fn, ms, ...args) => {
    const id = this.raw.setInterval(() => fn(...args), ms)
    ctx.effect(() => () => clearInterval(id))     // Cordis 原生回收
    return id
  }
  this.fakeWindow.requestAnimationFrame = (cb) => scope.raf(cb)
}

// 事件监听：key 用 WeakMap<listener, {type, capture}>（旧版 listener.toString() 源码碰撞删错条目）
addEventListener(target: EventTarget, type: string, listener: EventListener, options?: unknown) {
  target.addEventListener(type, listener, options)
  const ctx = this.currentCtx()   // 当前应用 fiber 的 ctx（同步注册期确定，异步回调内归因见 §4.3）
  ctx.effect(() => () => target.removeEventListener(type, listener, options))
}
```

- **监听器清理**：注册即挂应用 fiber effect（旧版自建 trackedListeners 且 `removeEventListener('*')` 是无效代码）--Cordis 原生解决"卸载残留监听"
- rAF 经 SuspendScope：保活冻结（旧版 AsyncScopeTracker 无冻结能力且 observe 重挂不登记）

### 3.7 存储隔离（真实 Storage 语义）

```typescript
class StorageNamespace {
  constructor(private raw: Storage, private prefix: string) {}

  // 用 Proxy 保留真实 Storage 的完整接口（含命名属性访问），而不是普通对象包装
  // （旧版普通对象导致 localStorage.token = 'x' 静默写进包装对象丢数据；length 每次全表扫描）
  static wrap(raw: Storage, prefix: string): Storage {
    const map = new Map<string, string>()
    const enumerate = () => {
      map.clear()
      for (let i = 0; i < raw.length; i++) {
        const k = raw.key(i)!
        if (k.startsWith(prefix)) map.set(k.slice(prefix.length), raw.getItem(k)!)
      }
    }
    return new Proxy({} as Storage, {
      get: (_, key: string) => {
        switch (key) {
          case 'length': { enumerate(); return map.size }   // O(n) 但带缓存窗口；批量操作经 batch API
          case 'getItem': return (k: string) => raw.getItem(prefix + k)
          case 'setItem': return (k: string, v: string) => { this.quotaCheck(); raw.setItem(prefix + k, v) }
          case 'removeItem': return (k: string) => raw.removeItem(prefix + k)
          case 'clear': return () => { enumerate(); for (const k of map.keys()) raw.removeItem(prefix + k) }
          case 'key': return (i: number) => { enumerate(); return [...map.keys()][i] ?? null }
        }
        return raw.getItem(prefix + key) ?? undefined       // 命名属性访问（localStorage.token）
      },
      set: (_, key: string, v) => { raw.setItem(prefix + key, String(v)); return true },
      deleteProperty: (_, key: string) => { raw.removeItem(prefix + key); return true },
    })
  }
}
```

- 前缀统一 `__cordis__${appId}__`（旧文档两套前缀 `__taixu_`/`cordis_:` 并存，统一）
- **此实现真正接线**：ProxySandbox init 时注入 `fakeWindow.localStorage/sessionStorage`（旧版整段被注释=零隔离）
- IndexedDB：per-app database name 前缀 + 打开数量预算；Cookie：默认共享（同源语义），需隔离的应用配置 `cookieScoped`（iframe 沙箱）

### 3.8 AsyncScopeTracker（Observers/rAF）

- MutationObserver/ResizeObserver/IntersectionObserver 包装：`observe()` 调用时登记到当前应用 ctx 的 effect；`disconnect()` 时注销
- 修复旧版"disconnect 后再 observe 不登记"：包装层维护 per-instance 状态（observed set），observe 幂等登记
- Worker：包装构造，terminate 挂 effect

## 四、生命周期接线

### 4.1 创建与销毁（挂 fiber effect）

```typescript
// lifecycle 挂载事务内（lifecycle-management.md §2.2）：
const sandbox = await this.sandbox.create(appId, { trust, signal })
// 双保险：teardown 注册在应用 fiber 上
fiber.ctx.effect(() => () => sandbox.destroy())
```

### 4.2 destroy（幂等）

```typescript
async destroy() {
  if (this.disposed) return
  this.disposed = true
  // fakeWindow 上记账的注入节点移除（§3.5 tracker）、存储句柄释放、
  // modifiedKeys 报告（monitor：全局污染残留诊断）
  // 定时器/监听已由 fiber effect 逆序回收（§3.6），此处只做沙箱自身资源
}
```

### 4.3 异步归因

定时器/监听包装在**注册期**绑定应用 ctx（同步栈内）；异步回调内的行为经 tracing 的 span 携带 appId（monitoring.md §4.6），错误归因不失效。

### 4.4 不池化（废除沙箱池）

旧版池化复用把上一应用的存储前缀、document proxy 容器引用、闭包残留带进下一应用（跨应用泄漏），且 `private appId` 赋值/`private cleanup` 外部调用均为编译错误。**沙箱对象轻量（两个 Proxy + 若干 Map），池化收益不抵风险，废除**。"相同技术栈复用沙箱"的优化改为：deps 服务的模块缓存复用（heterogeneous-loading.md §十）。

## 五、iframe 沙箱（third-party，安全边界）

```typescript
class IframeSandbox implements Sandbox {
  async init() {
    this.frame = document.createElement('iframe')
    // 关键：无 allow-same-origin（旧版 allow-scripts+allow-same-origin 组合可移除自身 sandbox 属性逃逸）
    this.frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups')
    this.frame.setAttribute('referrerpolicy', 'no-referrer')
    if (this.config.csp) this.frame.setAttribute('csp', this.config.csp)   // iframe 级 CSP
    this.frame.style.display = 'none'   // JS 执行环境；渲染容器由宿主决定是否显示
    document.body.appendChild(this.frame)

    // 加载完成 handshake 后再建立桥（旧版 appendChild 后立刻取 contentDocument 有竞态）
    await this.loadEntry()
    await this.handshake()
    this.bridge = new IframeBridge(this.bus, this.frame, this.appId, this.expectedOrigin)
  }
  get proxy(): never { throw new Error('iframe sandbox: no shared proxy; use bus bridge') }
}
```

- 通信：postMessage 桥（origin 校验 + 信封 nonce，communication-protocol.md §八）；**不共享任何对象**
- entry URL 跨源：默认 `crossOriginIsolated` 策略；`srcdoc` 仅用于同源受控内容（且仍带 sandbox 属性）
- 样式天然隔离（style-isolation.md 引用此路径）；destroy = 桥解绑 + frame 移除

## 六、配置

```typescript
interface SandboxConfig {
  defaultTrust: 'first-party' | 'third-party'
  prototypeGuard: 'freeze' | 'off'          // 默认 freeze
  blacklist: string[]                        // 沙箱内禁访全局（默认含 __CORDIS_* 全部句柄）
  workers: { serviceWorker: 'deny' | 'allow'; dedicated: 'allow' | 'deny' }
  storage: { quotaPerApp: number }
  iframe?: { csp?: string; originAllowlist: string[] }
}
```

## 七、DevTools 联动

- 沙箱面板：modifiedKeys、注入节点清单、监听/定时器记账（按 appId）
- 泄漏探测：monitor 的 Detached DOM Monitor 消费 tracker 数据（monitoring.md §4.7）

## 八、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | ProxySandbox 双窗口 + trap 语义修复 + fiber effect 接线 |
| P0 | 定时器/监听包装（SuspendScope 接入）+ 存储命名空间（真接线） |
| P1 | Document 代理（scoped 查询 + 注入记账）+ 网络 scopedFetch 注入 |
| P1 | IframeSandbox（sandbox 属性 + handshake 桥） |
| P2 | 原型 freeze 策略、customElements 前缀注册、AsyncScopeTracker 全覆盖 |

## 九、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| 1.1 全文无 ctx、EffectTracker 是 ctx.effect 劣质复刻 | §1.2/§4.1 记账挂 fiber effect，Cordis 原生回收 |
| 2.1 `new Function('window',...)` 只换三个形参，裸标识符全穿透 | §3.4 诚实分派：ESM 不进 eval、经典脚本 with、eval 记账+CSP |
| 2.2 with 包裹炸严格模式产物/拦截装饰性 | §3.4 路线分派表 + 能力边界声明 |
| 2.3 deleteProperty 返回 false 抛 TypeError | §3.2 恒 true |
| 2.4 Object 展开洗掉 API | §3.3 Object.freeze 策略 |
| 2.5 getElementById TypeError/head 身份不稳定/注入追踪绕过 | §3.5 显式实现 + 缓存单例 + 全路径记账 |
| 2.6 listener.toString() 碰撞 | §3.6 WeakMap 记账 |
| 2.7 activate 调用未定义 takeSnapshot | 废除 snapshot 路径（双窗口不需要） |
| 2.8 池化跨应用泄漏 + 编译错误 | §4.4 不池化 |
| 2.9 destroy 调 IframeSandbox 不存在的 deactivate | §五 接口统一（destroy 幂等） |
| 2.10 SnapshotSandbox 不完整/自认互扰 | Snapshot 模式降级为 legacy 附录（不推荐）；主推 Proxy 双窗口 |
| 2.11 iframe 无 sandbox 属性非隔离 | §五 无 allow-same-origin + csp 属性 |
| 2.12 LeakDetector `removeEventListener('*')` 无效代码 | 废除，fiber effect 原生回收 |
| 2.13 Observer 重挂不追踪 | §3.8 per-instance 状态 |
| 2.14 存储隔离被注释/丢命名属性语义 | §3.7 真接线 + Proxy 完整 Storage |
| 2.15 location 行为分裂 | §3.2 统一重定向 router |
| 缺失向量 #1-#10 | §3.1 清单化缓解 |
