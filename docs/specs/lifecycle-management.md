# Cordis 生命周期管理（Lifecycle Management）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。本文档所有 Cordis API 语义以基线 §一 为准。

## 一、设计目标与理论定位

### 1.1 Cordis 理论视角

在 Cordis 中，**微应用就是插件**，其生命周期本质上由 Fiber 状态机管理：

```
PENDING -> LOADING -> ACTIVE -> UNLOADING -> DISPOSED
              ↘ FAILED ↙
```

- **时间维（effect）**：微应用的一切副作用（DOM 挂载、事件监听、定时器、订阅）经 `ctx.effect()` / `ctx.on()` 注册，runtime 在 dispose 时自动逆序执行逆操作--生命周期管理的核心问题（卸载残留）由 Cordis 原生解决。
- **空间维（coeffect）**：微应用通过 `static inject = ['router', 'state']` 声明服务依赖；依赖未就绪时 Fiber 停留 PENDING，就绪后自动激活--**"加载顺序/拓扑排序"不是本模块的职责**，禁止手写初始化顺序表。

因此本模块的职责被重新定义为（只做 Cordis 不做的事）：

1. **挂载编排**：把"资源加载 -> 沙箱/容器准备 -> 插件挂载"编排为一次可取消的事务
2. **保活（Suspend/Resume）**：Cordis dispose 不可逆，"临时挂起"是本模块新增的框架层概念
3. **多实例管理**：同一应用的多个实例（多槽位/弹窗）各自对应独立 Fiber
4. **错误恢复**：加载/激活失败的统一恢复策略

### 1.2 微前端生命周期挑战（问题域不变）

| 问题类型 | 具体表现 | 本模块对策 |
|----------|----------|-----------|
| 应用加载顺序 | 多子应用并发加载资源竞争 | outlet 级事务并行、应用间由 Cordis inject 天然编排（§1.1） |
| 切换状态丢失 | 切换时原应用状态丢失 | Suspend/Resume 保活（§五） |
| 资源释放不完整 | 定时器/监听残留 | `ctx.effect`/`ctx.on` 原生回收 + 级联销毁（§四） |
| 保活机制复杂 | 保活与卸载语义纠缠 | Suspended 明确建模为挂载层状态（§5.1） |
| 错误恢复困难 | 加载失败无法优雅降级 | 统一恢复策略（§六） |

### 1.3 反模式声明（本模块明确不做）

| 反模式 | 说明 |
|--------|------|
| 平行状态机 | ❌ 不维护 `loaded/activating/active` 等自有状态字符串；应用状态**从 `fiber.state` 派生**（见 §2.3） |
| 双生命周期协议 | ❌ 废除 `bootstrap/mount/unmount` 钩子协议；唯一范式是 `apply(ctx)`（外部框架产物经适配器包装，见 heterogeneous-loading.md §四/§五） |
| 自建钩子接口 | ❌ `AppLifecycle.onCreated/onLoading/...` 接口废除；扩展点 = 基线 §2.4 事件契约 |
| 自建拓扑排序 | ❌ 服务依赖交给 Cordis inject；应用级依赖（appId 依赖）见 §七 |

## 二、核心模型

### 2.1 应用实例与 Fiber 的一一映射

```typescript
// @taixu/core（lifecycle 服务）
import { Context, Service, Fiber } from '@cordisjs/core'

interface AppInstance {
  /** 唯一实例标识（同 appId 可多实例） */
  instanceId: string
  appId: string
  outlet: string
  fiber: Fiber
  ctx: Context          // fiber 派生的子上下文（应用内访问服务的入口）
  suspendState?: SuspendState
}

interface SuspendState {
  mode: 'dom' | 'state' | 'memory'
  domFragment?: DocumentFragment   // dom 模式：摘除的容器
  stateKeys?: string[]             // state 模式：应用声明的作用域键（见 §5.3）
  detachedAt: number
}
```

关键点：

- **`instances: Map<string, AppInstance>` 以 `instanceId` 为键**（不是 appId）--支撑同一应用多实例
- 应用对外的"状态"只有三种：`Active`（fiber ACTIVE + 已挂载 outlet）、`Suspended`（保活挂起）、`Disposed`（fiber DISPOSED），全部由 lifecycle 从 fiber.state + suspendState 计算，**不另存状态字段**

### 2.2 挂载事务（一次可取消的挂载流水线）

```typescript
class LifecycleService extends Service {
  static [Context.provide] = 'lifecycle'
  static inject = ['security', 'router', 'sandbox', 'bus', 'state', 'deps', 'monitor']   // 唯一多注入编排者（ADR-0054）；security 显式注入 = fail-closed（ADR-0009）

  /** outlet 级串行队列：同一槽位的事务按序执行；不同槽位并行 */
  private outletLocks = new Map<string, Promise<void>>()
  private instances = new Map<string, AppInstance>()

  async mount(appId: string, outlet: string, options: MountOptions = {}): Promise<AppInstance> {
    const signal = options.signal ?? new AbortController().signal
    // 1. outlet 级互斥：同一槽位的上一个事务（含其 unmount）完成后才开始
    const prev = this.outletLocks.get(outlet) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>(r => release = r)
    this.outletLocks.set(outlet, prev.then(() => gate))
    await prev
    try {
      return await this._mount(appId, outlet, signal, options)
    } finally {
      release()
    }
  }

  private async _mount(appId: string, outlet: string, signal: AbortSignal, options: MountOptions) {
    const instanceId = `${appId}:${crypto.randomUUID()}`
    this.ctx.emit('app/loading', { appId, instanceId, signal })

    // 2. 资源加载（deps 服务负责 manifest + chunk + 共享依赖仲裁，signal 全程透传）
    const entry = await this.deps.loadApp(appId, { signal })
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')

    // 3. 沙箱创建（销毁路径见 §四所有权表；teardown 双保险注册在 fiber effect 上）
    const sandbox = await this.sandbox.create(appId, { trust: 'first-party', signal })

    // 4. 容器准备（唯一路径，style-isolation/heterogeneous 复用）
    const container = this.createOutletContainer(outlet, options.styleIsolation)

    // 5. 插件挂载：apply 内由适配器完成框架 mount；inject 未满足时 Fiber 停留 PENDING，
    //    依赖就绪自动激活（Cordis reactive coeffect）--此处 await 其 ACTIVE 或 FAILED
    const fiber = this.ctx.plugin(entry.plugin, options.config)
    const instance: AppInstance = { instanceId, appId, outlet, fiber, ctx: fiber.ctx }

    try {
      await fiber   // resolve = ACTIVE；reject = FAILED（含错误）
    } catch (error) {
      // 失败必须级联清理：fiber（可能部分初始化）、沙箱、容器
      await fiber.dispose().catch(() => {})
      await this.sandbox.destroy(sandbox).catch(() => {})
      this.removeOutletContainer(container)
      throw error
    }

    // 6. 登记与广播（旁听者经 global 监听，见基线 §2.4）
    this.instances.set(instanceId, instance)
    this.ctx.emit('app/ready', { appId, instanceId })
    return instance
  }
}
```

修复要点（相对旧设计）：

1. **锁的正确性**：旧 `withLock` 存在等待者竞态（多个等待者被同一已 settle 的 promise 唤醒后并发穿透 while 检查）。新实现为 **outlet 级 promise 链**（`prev.then(() => gate)`），天然串行、无唤醒窗口。
2. **load 失败不再泄漏**：旧设计 `ctx.plugin()` 成功后若后续失败只置 `state='error'`，fork 永久泄漏且 retry 会产生重复 fork。新设计在 fiber reject / 后续阶段失败时**显式级联 dispose**。
3. **import() 不可取消**：AbortSignal 语义是"结果作废 + 尚未开始的阶段不再开始"，已完成加载的资源由 deps 服务缓存复用（不是回滚）。
4. **apply 的执行时机**：挂载发生在 plugin() 内（依赖满足即跑），`app/loading -> app/ready` 事件围绕 fiber 生命周期发出，与 Cordis 状态机**同源**而非平行。

### 2.3 应用状态查询（从 fiber 派生）

```typescript
getAppState(instanceId: string):
  'pending' | 'loading' | 'active' | 'failed' | 'disposed' | 'suspended' | 'unloading' {
  const instance = this.instances.get(instanceId)
  if (!instance) return 'disposed'
  if (instance.suspendState) return 'suspended'
  switch (instance.fiber.state) {
    case FiberState.PENDING: return 'pending'
    case FiberState.LOADING: return 'loading'
    case FiberState.ACTIVE: return 'active'
    case FiberState.FAILED: return 'failed'
    case FiberState.UNLOADING: return 'unloading'
    case FiberState.DISPOSED: return 'disposed'
  }
}
```

`getAppState` 是 monitor/devtools 消费的**唯一**同步查询 API（旧设计三处消费形状不一，见基线 §六）。

### 2.4 与旧状态机图的对照

| 旧文档状态 | 新模型对应 | 说明 |
|-----------|-----------|------|
| Created | （事务开始前） | 无状态，不值得建模 |
| Loading | `app/loading` 事件窗口 | 资源+沙箱+容器准备 |
| Loaded | （不暴露） | 与 ACTIVE 之间无框架动作 |
| Active | `fiber.state === ACTIVE` + 已挂 outlet | |
| Deactivated | **Suspended**（保活，见 §五） | 非 Cordis 状态，lifecycle 层概念 |
| Destroyed | `fiber.state === DISPOSED` | |
| Error | `FAILED` 或恢复策略中（§六） | |

### 2.5 事件方向（修复旧 §9.2 的传播错误）

旧设计在**根 ctx** 上 `serial('lifecycle:after-activate')`、又在 fork ctx 上 `on()` 同名事件监听--按 Cordis 事件经 `Context.filter` 过滤的语义，子上下文监听器收不到根上发出的非 global 事件，两个监听器**永远不会触发**。

统一规则（基线 §2.4）：

- **应用自身关心的生命周期事件**：lifecycle 在**应用 fiber 的 ctx** 上 emit（如 `app/ready`），应用在自己的 `apply(ctx)` 里 `ctx.on('app/ready', ...)` 天然可收到
- **全局旁听**（monitor/devtools/其他应用）：在根 ctx 上 `ctx.on(name, fn, { global: true })` 注册

## 三、卸载与销毁

### 3.1 unmount（导航切换走保活时）

见 §五。非保活切换直接走 §3.2。

### 3.2 destroy（不可逆）

```typescript
async destroy(instanceId: string, reason: string): Promise<void> {
  const instance = this.instances.get(instanceId)
  if (!instance) return

  // 1. 保活中的实例先恢复正常态，保证效应/监听在 dispose 时由 Cordis 统一回收
  if (instance.suspendState) this.resumeInternal(instance, { destroyAfter: true })

  this.ctx.emit('app/disposing', { appId: instance.appId, instanceId, reason })
  try {
    // 2. dispose fiber：Cordis 自动逆序执行全部 effect（DOM 摘除、监听解绑、定时器清理）
    await instance.fiber.dispose()
  } finally {
    // 3. 级联销毁沙箱与容器（与创建对称；旧设计 destroy 从不销毁沙箱 -> 泄漏）
    await this.sandbox.destroyFor(instance).catch(() => {})
    this.removeOutletContainer(instance.outlet, instance.instanceId)
    this.instances.delete(instanceId)
    this.ctx.emit('app/disposed', { appId: instance.appId, instanceId })
  }
}
```

- dispose 抛错**不再吞掉清理**：`finally` 保证沙箱/容器/登记回收；错误上抛给调用方并进 monitor（恢复策略 §六）
- **宿主销毁**：根 fiber dispose 时 Cordis 级联 dispose 全部子 fiber；lifecycle 监听 `internal/plugin` 变化维护 instances 表一致性（无需自建遍历）

### 3.3 切换事务（修复"卸 A 挂 B，B 失败页面悬空"）

```typescript
async switch(outlet: string, next: NavigationTarget, opts: { keepalive?: KeepAliveConfig }) {
  const current = this.getActiveByOutlet(outlet)
  // 1. 先挂载目标（不可见容器/占位），成功后再处置当前应用 -- 消除"悬空窗口"
  const nextInstance = await this.mount(next.appId, outlet, {
    signal: opts.signal,
    mountHidden: true,
  })
  if (current) {
    if (opts.keepalive) await this.suspend(current.instanceId, opts.keepalive)
    else await this.destroy(current.instanceId, 'replaced')
  }
  await this.reveal(nextInstance)   // 挂载完成后再显示，避免闪烁
  return nextInstance
}
```

## 四、与沙箱/容器的所有权（修复旧设计沙箱销毁无主）

| 资源 | 创建时机 | 销毁时机 | 销毁方式 |
|------|---------|---------|---------|
| 沙箱 | mount 阶段 §2.2-3 | destroy §3.2 / mount 失败回滚 | `sandbox.destroyFor(instance)`（lifecycle 显式调用；沙箱 teardown 同时注册在 fiber effect 上双保险） |
| Outlet 容器 | mount 阶段 §2.2-4 | destroy / suspend（摘除缓存） | `removeOutletContainer` |
| 应用 Fiber | mount 阶段 §2.2-5 | destroy | `fiber.dispose()`（唯一销毁入口，级联全部 effect） |
| 保活缓存 | suspend | LRU 淘汰 / 超时 / resume | 淘汰 = 走 destroy §3.2 |

规则：**谁创建谁销毁，且每个资源恰有一个销毁路径**。沙箱内部 additionally 在 fiber 上注册 `ctx.effect(() => () => sandbox.destroy())`--即使 lifecycle 因异常未走到显式销毁，Cordis 也会兜底回收（幂等实现，双调用安全）。

## 五、保活（Suspend / Resume）

### 5.1 语义澄清（修复旧文档三处矛盾）

Cordis 的 dispose 不可逆、`ctx.on` 监听在 dispose 时才清理。因此保活的定义是：

> **Suspended = 应用 fiber 保持 ACTIVE，但 DOM 摘离渲染树、效应预算被冻结、对用户不可见。**

- 监听器/订阅**保留**（挂起期间 bus 为应用排队消息，见 §5.6--与"应用在冻结态直接处理消息"互斥）--与 module-interaction.md "失活即清理监听"的旧表述互斥，以本节为准（该文档已同步修订）
- 定时器/rAF **冻结而非清除**（见 §5.2），恢复时继续
- module-interaction.md 旧版"切换 = unmount + 冻结沙箱"统一修订为：切换走 §3.3 事务 + 本节保活

### 5.1.1 挂起裁决：单点 + 来源分级（ADR-0018/0031/0035）

挂起/恢复的**唯一裁决入口是 lifecycle 服务**。意图经**服务方法**表达（不走全局事件--emit 是 fire-and-forget，无法阻止恶意应用挂起他人）：

```typescript
interface Lifecycle {
  /** 鉴权：调用者只能操作自己的 instanceId（root/系统来源除外，ADR-0035） */
  requestSuspend(instanceId: string, reason: string): Promise<void>
  requestResume(instanceId: string): Promise<void>
}
```

裁决规则：

- **挂起取并集**：任一来源（路由失配 / 系统信号 / 手动命令）请求即挂起
- **恢复分级解除**：来源分级 `路由（用户显式导航意图）> 系统信号 > 手动命令`；高优先级来源的恢复意图可单独解除低优先级来源的挂起（ADR-0031--用户主动切到的页签不能是死的）
- 经路由来源恢复且系统压力仍在的应用，进入"**压力下候选驱逐**"名单--若压力持续，它是下一个 LRU 驱逐对象（§5.4）
- 系统信号（Page Visibility / 内存水位 / 电池）由 lifecycle 自己在 root 上下文监听，不经任何应用

### 5.1.2 默认策略（ADR-0020）

路由失配默认进保活池（微前端典型交互是页签来回切换，默认 dispose 会让每次切换付全量冷启动）；应用可声明 `keepAlive: false` 直接 dispose。

### 5.2 SuspendScope：效应冻结的机制（ADR-0013/0027/0032/0048）

Cordis effect 的 disposer 只在 dispose 时执行，保活需要的是**可暂停的效应**。机制分三层：

1. **沙箱注入包装**：沙箱对 timer / rAF / requestIdleCallback / 三类 observer（IO/MO/RO）/ WebSocket 五类全局注入包装函数（Proxy `get` trap）--库内部经 `window.x` 的调用也拿到包装版
2. **挂起注册表**：包装函数执行前查询 `suspendRegistry.isSuspended(appId)`--挂起则丢弃/延后，否则执行；appId 由沙箱实例**创建期闭包捕获**（ADR-0048，不做 zone.js 式运行时推断）
3. **WebSocket 特殊处理**：挂起即 `close(1000)` 并记录连接描述符（URL/协议），恢复时框架自动重建连接；**订阅状态由应用重建**（框架无法知道频道订阅语义，ADR-0017）

**不冻结项（挂起语义边界，诚实清单）**：

- **fetch 不冻结**：响应回调照常执行（网络栈的诚实语义）；应用需在回调中检查挂起标志--"挂起期间到达的响应可能基于陈旧状态"
- 播放中的媒体、未 settle 的 Promise 链：不冻结、不伪装
- **已知限制**：在沙箱激活前已缓存原生引用的库（如某些 UMD 加载时缓存 `setTimeout`）不受冻结约束--列入"保活不兼容清单"，建议 `keepAlive: false`

（SuspendScope 的定时器冻结实现与旧版一致：`freeze()` 保留剩余时长、`unfreeze()` 续期，此处不重复。）

### 5.3 三种保活模式

| 模式 | DOM | 状态 | 适用 |
|------|-----|------|------|
| `dom` | 容器摘到 DocumentFragment 缓存（含滚动位置） | 原位（fiber 仍 ACTIVE） | 默认；表单/滚动恢复 |
| `state` | 销毁 DOM，仅保留 state 作用域快照 | `state.snapshot(scopeKeys)` | 大 DOM 低频应用 |
| `memory` | 销毁 DOM 与状态，仅保留已加载模块缓存 | deps 服务模块缓存 | 最轻量 |

修复旧设计的硬伤：

- **旧 `evictLowestPriority` 只删 Map 不 destroy** -> 淘汰统一走 §3.2 destroy（真正释放 fiber/DOM/内存）
- **旧 `setTimer` 重设前不清旧定时器（误杀新缓存）** -> 淘汰即 destroy，SuspendScope 随之终结，无定时器残留
- **旧 `'state'` 模式快照全量全局状态（恢复时覆写其它应用）** -> `state.snapshot(scopeKeys)` 只快照应用声明的作用域键（与 state-sharing.md 权限联动）
- **样式节点**：挂起时经 SuspendScope 登记的应用样式节点（head 里的 `<style>`/`<link>`，ADR-0033/0042）随 DOM 一并摘除到同一文档片段缓存，恢复时一并还回--不留"幽灵样式"

### 5.4 LRU 与预算（ADR-0019/0026/0057）

```typescript
interface KeepAliveConfig {
  maxCount: number          // 默认 5；最大同时保活实例数
  ttlMs?: number            // 单实例最长保活
}
```

- **数量上限为主**（默认 5）：超限自动 dispose 最久未用（LRU）的挂起应用，触发 `app/evicted` 事件
- **内存水位辅助**（ADR-0026，Chromium 限定）：`performance.memory.usedJSHeapSize / jsHeapSizeLimit > 0.85` 时按 LRU 顺序驱逐（即便池内未满）并 `monitor.capture` 上报"内存压力驱逐"；Firefox/Safari 无此 API，降级为纯数量上限（优雅退化）
- **水位检查策略**（ADR-0057）：操作触发为主（每次挂起/恢复/挂载/驱逐时顺带检查）+ 30s 低频轮询兜底
- LRU 键 = `lastAccessAt`（resume/message 均刷新）
- 驱逐决策在 `requestIdleCallback` 中执行，避免切换关键路径卡顿
- 后台标签页：`document.hidden` 时暂停 TTL 计时（浏览器节流 setTimeout 不可靠，改记录 `detachedAt`、在可见性恢复事件时补算）

### 5.5 驱逐快照：冷启动 -> 暖启动（ADR-0029/0034/0044/0052）

驱逐是 dispose（状态全丢），但用户切回被驱逐页签不应看到白屏表单丢失：

```typescript
interface Lifecycle {
  /** 驱逐与 HMR 共用的内部能力（ADR-0037） */
  snapshotLocalKeys(appId: string): Snapshot | null      // {version, data}
  hydrateLocalKeys(appId: string, snapshot: Snapshot): void
}
```

- **快照载荷** `{version, data}`：`data` 是 `local:{appId}:` 键空间的序列化（值必须 JSON 可序列化，见 state-sharing §三使用条款）
- **压缩与池化**（ADR-0052）：快照经 lz-string 压缩（JSON 文本 ~70% 压缩率），存 sessionStorage 键 `__tx_snapshot:{appId}`；快照池总量上限 6MB，超限按 LRU 驱逐最旧快照（哪怕对应应用还在保活池--快照丢失仅降级为冷启动）
- **版本迁移**（ADR-0034）：重挂载时版本匹配直接注水；不匹配查应用清单的 `migrate(snapshot, fromVersion)` 纯函数（无副作用、沙箱外执行）--有则迁移后注水，无则丢弃快照冷启动并 `monitor.capture` 上报"快照版本漂移丢弃"
- **注水时机**：`plugin()` **之前**预注水到 state 服务（应用 apply 时 local 键空间已就位）
- **隐私边界**（ADR-0044）：sessionStorage 同 tab 同源共享，快照键前缀防误读不防恶意读取；真正的边界是使用条款--`local:` 键空间禁止存 token/密码/PII
- **HMR 复用**（ADR-0037）：开发态 HMR 触发应用 fiber 重跑前自动快照、重跑后注水

### 5.6 挂起期间的消息与状态（ADR-0008/0015/0021/0023）

挂起不等于失联，但也不能让应用在冻结态处理消息：

- **bus 通道（消息队列）**：挂起期间 bus 为应用排队消息--上限 1000；普通消息 FIFO 丢最旧；溢出投递 `bus/overflow {coalescedKeys, droppedCount}`（同键合并的状态键可列举，普通丢弃只给计数）。恢复时按帧分批（50/帧）回放，**回放期间新消息入队尾保持全序**（最坏追平 ≈333ms）。详见 communication-protocol.md
- **state 通道（拉模型，ADR-0023）**：state 服务不推送 `state/changed`（经监听 `app/suspend`/`app/resume` 感知，不 inject lifecycle）；恢复时按应用 watch 键集合派发一次性 `state/sync {keys}`。详见 state-sharing.md §4.3
- **恢复后的路由同步（ADR-0056）**：恢复后 router 对该槽位重放一次 `outlet/changed:{outlet}`（载荷为当前匹配结果），应用像响应正常导航一样同步--不为恢复发明第二套路由同步机制

### 5.7 服务替换语义（ADR-0007/0011）

- Cordis 响应式 coeffect：被注入服务替换时，inject 它的 fiber **重跑**（旧执行环境的 effect 回滚后重新执行）--对微应用即**整应用重挂载**（HMR 全量重启语义），非原位热替换；适配器 unmount 清理器必须校验容器已清空（防重跑时旧 DOM 残留双挂载）
- 源码验证：重跑只作用于直接 inject 的 fiber，**子 fiber 不级联**；但核心服务（基线 §2.2 八服务）被替换时其 fiber 子树会被连带 dispose
- **核心层不可替换**（ADR-0011）：八个核心服务运行时替换 = 框架级重启事件，必须经框架入口而非散落的 `ctx.set`；第三方插件服务替换按整应用重挂载语义处理

## 六、错误恢复

### 6.1 唯一错误入口与策略

```typescript
interface RecoveryPolicy {
  phase: 'load' | 'activate'
  maxRetries: number        // 默认 2；指数退避（1s/2s）
  fallbackAppId?: string    // 降级应用（如 error-page 应用，由宿主预置）
  degradeUI?: 'error-boundary'   // 无 fallback 应用时渲染内置错误出口
}
```

```typescript
private async recover(appId: string, outlet: string, error: Error, attempt: number) {
  const policy = this.config.recovery?.overrides?.[appId] ?? this.config.recovery?.default
  if (attempt < policy.maxRetries) {
    await sleep(1000 * 2 ** attempt)
    return this.mount(appId, outlet, { recoveryAttempt: attempt + 1 })   // 重试主体明确：重走挂载事务
  }
  if (policy.fallbackAppId) {
    this.monitor.capture(error, { appId, phase: 'activate', alert: 'APP_LOAD_FAILED' })
    return this.mount(policy.fallbackAppId, outlet, { errorContext: { appId, error } })
  }
  this.renderErrorBoundary(outlet, error)   // 内置出口：转义渲染（XSS 基线），提供"重试"按钮 -> 重新 mount
}
```

- 重试**主体** = 重走 §2.2 挂载事务（旧设计 `RecoveryStrategy.retry` 无实现主体的缺口已闭合）
- 渲染期错误（apply 之后）：适配器经框架 errorCaptured/ErrorBoundary 转 `monitor.capture`，phase='runtime'；默认策略**不自动重试**（避免错误风暴），由 ErrorOutlet UI 提供手动重试/回退
- 恢复策略完全由配置驱动（旧 handleError 硬编码 `retry(3,1000)` 的问题修复）

### 6.2 ErrorBoundary 定位修订

旧设计的 `catchSync/catchAsync/wrapHook` 只是 try/catch 包装，接不到渲染错误。修订：

- **框架渲染错误**：各宿主框架适配器负责挂 errorCaptured（Vue）/ ErrorBoundary（React）/ ErrorHandler（Angular），统一转发 `monitor.capture` -- 详见 heterogeneous-loading.md §4.2
- **加载/激活错误**：§2.2 事务的 catch 路径
- ErrorBoundary 本模块只提供**UI 出口**（Outlet 级隔离、转义渲染、重试按钮），不再是错误捕获机制

## 七、应用级依赖（appId 之间的依赖）

Cordis `inject` 解析的是**服务名**，不是应用。跨应用依赖（base-app 先于 business-app）分两层：

```typescript
// 方式一（推荐）：宿主编排 -- 宿主插件的 apply 顺序即依赖顺序
export default function apply(ctx: Context) {
  ctx.plugin(baseApp)          // base 先挂载（其 apply 内 provide 服务）
  ctx.plugin(businessApp)      // business 声明 inject: ['base-service']，未就绪自动 PENDING
}

// 方式二：服务化 -- 被依赖应用把能力注册为服务，依赖方声明 inject
// base-app: ctx.reflect.provide('auth', authService)
// business-app: static inject = ['auth']  -> Cordis 原生等待与重跑，无死锁可能
```

- **循环依赖检测**：方式二下若出现服务构造期循环，应用会停留 PENDING；monitor 提供 `DEADLOCK_SUSPECT` 告警（`fiber.state === PENDING && elapsed > 阈值`）
- 旧文档 `dependencies: [{ appId: 'base-app' }]` 配置声明**废除**，统一为上述两种机制（消除与"废弃拓扑排序"的自相矛盾）

## 八、配置

```typescript
interface LifecycleConfig {
  keepAlive?: KeepAliveConfig & { defaults: Record<string, KeepAliveConfig> }
  recovery?: {
    default: RecoveryPolicy
    overrides?: Record<string, RecoveryPolicy>   // 按 appId
  }
  backgroundEffectsApps?: string[]   // 保活期间效应不冻结的白名单
}
```

## 九、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | 挂载事务（§2.2）+ 状态派生（§2.3）+ destroy 级联（§3.2） |
| P0 | 事件契约接入（基线 §2.4）+ app/loading/ready/error |
| P1 | SuspendScope（五类全局包装）+ 三模式保活 + LRU/内存水位 |
| P1 | 分级挂起裁决（§5.1.1）+ 驱逐快照（§5.5）+ 错误恢复策略 |
| P2 | ~~切换事务 mountHidden 优化~~（F11 已落地）、~~后台标签页 TTL 补算~~（已落地）、DEADLOCK_SUSPECT 告警 |

**切换事务落地形态（F11）**：`MountOptions.mountHidden?` + `lifecycle.reveal(instanceId)`

- `switch()` 三步：目标先 `mountHidden` 挂隐藏容器 → 挂载成功后才 `retireCurrent` →
  末步 `reveal` 显示（消除"卸 A 挂 B"期间的闪烁与中间态，B 失败时 A 仍在原位不悬空）
- `reveal` 置于 `finally`：**retire 失败也照常 reveal**（宁可旧应用残留，不留空白悬空窗口），
  错误照常上抛调用方
- 显隐目标 = shadow 宿主（shadowRoot.host）或容器本身；复位用 `display: ''`
  （置空交还宿主样式表，不覆盖宿主 CSS）；`data-tx-mount-hidden` 标记仅供诊断
- 普通 `mount` 不受影响（缺省 `mountHidden: false`）；宿主显式 `mountHidden: true`
  时需自行 `reveal`（切换事务之外的用法）

**后台标签页 TTL 补算（已落地）**：keepAlive 记录 `hiddenAt` / `hiddenTotal`，
visibilitychange 驱动记账，`ttlElapsed()` 扣除后台隐藏时长（浏览器节流 setTimeout
不可靠，故改记账补算而非计时暂停）。

## 十、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| L1-1 平行状态机与 Fiber 双轨 | 状态全部从 `fiber.state` 派生（§2.3） |
| L1-2 自造 AppContext 手工组装注入 | 应用拿到的就是 fiber.ctx（真 Cordis Context，服务响应式） |
| L1-3 §9.2 事件传播方向错误 | 应用事件发在应用 ctx、旁听用 global（§2.5） |
| L1-4 AppLifecycle 钩子死 API | 废除，扩展点统一为事件契约 |
| L2-1 withLock 竞态 | outlet 级 promise 链（§2.2） |
| L2-2 load 失败 fork 泄漏/重复 fork | 失败级联 dispose（§2.2 catch） |
| L2-4 保活淘汰不 destroy/旧定时器误杀/全量快照 | 淘汰走 destroy；SuspendScope 统一管理；snapshot 限作用域键（§五） |
| L2-7 重试无主体/硬编码 | recover() 明确重走挂载事务、配置驱动（§6.1） |
| X-3 Router↔Lifecycle 依赖环 | 基线 §2.3：router 经事件解耦，不 inject lifecycle |
| X-4 沙箱销毁无主 | 所有权表（§四）+ fiber effect 双保险 |
| X-10 保活 state 模式覆写全局状态 | `state.snapshot(scopeKeys)`（§5.3） |
