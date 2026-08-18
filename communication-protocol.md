# Cordis 通信协议（Communication Protocol）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> 术语约定（基线 §1.4）：**coeffect** 指组件对 context 的声明式输入依赖。进程内消息传递在 Cordis 中的原生载体是**上下文树事件**（`ctx.on/emit`，监听随插件 dispose 自动回收）与 **`ctx.serial`**（请求-应答语义；`bail` 不 await 异步回调，本框架禁用，ADR-0016）。本协议不再杜撰 "coeffect message" 类术语，而是把这些原生能力组装为微前端通信服务。

## 一、问题分析

### 1.1 微前端中应用间通信的挑战

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| 通信方式不统一 | 全局变量、事件、消息混杂 | 高 |
| 跨框架通信困难 | Vue 的 EventBus 无法被 React 使用 | 高 |
| 通信安全性差 | 消息载荷易被旁听、滥用 | 高 |
| 通信性能问题 | 频繁全量广播导致性能下降 | 中 |
| 调试困难 | 通信链路不清晰，难以定位 | 高 |

### 1.2 Cordis 理论视角（修正旧版术语误用）

| Cordis 原生能力 | 本协议的用法 |
|-----------------|-------------|
| 上下文树事件（`ctx.on(name, fn)`，随插件销毁自动解绑） | 应用订阅挂在自己的 fork ctx 上--**应用卸载自动退订**（旧版订阅挂在总线根 ctx 上永不回收） |
| `ctx.serial`（await 每个回调，非 null/false/undefined 即截断） | 请求-应答的原生语义；bus 的 `request()` 基于它 + 应答包络实现（ADR-0014）。**`bail` 禁用**（不 await 异步回调，ADR-0016）；**发送鉴权走 `bus.send` 服务方法**而非事件冒泡（ADR-0041） |

关键原则：

- **鉴权走服务方法、通知走事件**（全局主线）：`bus.send` 内鉴权（source 从 fiber 派生不可伪造）；`message/receive` 是被动订阅无鉴权需求
- **显式声明**：应用在 manifest 中声明订阅/发布的消息类型（security 权限校验依据）
- **定向优先**：点对点投递不广播载荷；广播是显式选择
- **类型安全**：`MessageTypes` 契约经构建期生成接入 `bus` 的运行时校验
- **可追踪**：W3C traceparent 贯穿消息/路由/fetch（CSPRNG 生成 + 全链传播；挂起回放以 span link 关联，ADR-0030）

## 二、消息模型

```typescript
interface CordisMessage<T = unknown> {
  id: string             // crypto.randomUUID()
  type: string           // 约定 'domain:action'，如 'cart:add'
  payload: T
  source: { appId: string; instanceId?: string; tabId?: string }
  target?: { appId: string; instanceId?: string }   // 定向；缺省 = 广播
  createdAt: number
  metadata: {
    ttl?: number                   // 毫秒；过期消息投递前丢弃（含 retained）
    correlationId?: string         // request/response 关联（uuid）
    traceparent?: string           // W3C Trace Context（见 §七）
    schemaVersion?: number         // 消息契约版本（跨版本兼容，见 §九）
  }
}

/** 全框架唯一类型契约（构建期由 cordis-cli 从各应用 manifest 汇聚生成） */
interface MessageTypes {
  'user:login': { userId: string }
  'cart:add': { skuId: string; qty: number }
  'app1:export:data-ready': { rows: Row[] }
}
```

- **敏感数据不进消息**：`user:login` 载荷不携带 token（令牌经 security 的受控注入通道，见 security.md §六）--旧版 `'user:login': { token }` 随广播泄漏的向量已删除
- `id/correlationId` 一律 `crypto.randomUUID()`（旧版 `Date.now()+Math.random()` 可碰撞，correlationId 碰撞会把 A 的响应 resolve 给 B）

## 三、投递模型：上下文树定向路由（废除全量广播）

### 3.1 总线服务

```typescript
class BusService extends Service {
  static [Context.provide] = 'bus'
  static inject = ['security', 'monitor']

  /** 发送走服务方法（ADR-0041）：emit 是 fire-and-forget，任何应用都能窃听/伪造--鉴权必须有拦截点 */
  send(ctx: Context, message: Omit<CordisMessage, 'source' | 'id' | 'createdAt'>): boolean {
    // 1. 身份不可伪造：source 从调用方 fiber 派生，不接受入参指定
    const source = this.ids(ctx)   // { appId, instanceId } -- 从 ctx.fiber 归属派生
    // 2. 发送权限（execute）：deny-by-default（security.md §五）
    if (!this.security.checkPermission(source.appId, `message:${message.type}`, 'execute')) {
      this.ctx.emit('security/violation', { appId: source.appId, rule: 'message-send', detail: { type: message.type } })
      return false
    }
    return this.dispatch({ ...message, id: crypto.randomUUID(), source, createdAt: Date.now() })
  }

  private dispatch(message: CordisMessage): boolean {
    // TTL
    if (message.metadata.ttl && Date.now() - message.createdAt > message.metadata.ttl) return false
    // 路由：挂起目标进队列（§5.5）；ACTIVE 目标定向投递
    if (message.target) {
      const target = this.lifecycle?.resolveInstance(message.target)
      if (!target) return this.handleUnreachable(message)   // 未加载：未启用 retained 时死信（§5.4）
      if (target.suspended) return this.enqueue(target.instanceId, message)   // 挂起队列（ADR-0008）
      target.ctx.emit('message/receive', { message })        // 定向：仅目标 ctx（及其冒泡路径上的 global 监听者）
      return true
    }
    this.broadcast(message)
    return true
  }

  /** 广播：显式选择；挂起应用进队列而非直接投递（§5.5） */
  broadcast(message: CordisMessage) {
    for (const instance of this.lifecycle.activeInstances()) {
      if (instance.suspended) { this.enqueue(instance.instanceId, message); continue }
      instance.ctx.emit('message/receive', { message })
    }
  }
}
```

> ADR-0055：`bus.send` 默认 fire-and-forget（同步返回，投递即完成）--消息语义本就是"发送即忘"；需要送达确认用 `bus.request`；需要背压的批量场景用显式 `bus.sendAndWait`。

### 3.2 应用侧收发

```typescript
// 应用内：订阅生命周期 = 应用生命周期
export default function apply(ctx: Context) {
  // 发送：服务方法（source 自动从 fiber 派生，不能伪造；内部经 security 鉴权）
  ctx.bus.send({ type: 'cart:add', payload: {...}, target: { appId: 'app-orders' } })

  // 接收：在自己 ctx 上订阅（dispose 自动解绑；旧版挂在总线根 ctx 泄漏）
  ctx.on('message/receive', ({ message }) => {
    if (message.type !== 'cart:add') return
    // ... 处理
  })
}
```

- **旁听（monitor/devtools）**：在根 `ctx.on('message/receive', fn, { global: true })`，且 DevTools 侧载荷脱敏（monitoring/devtools 联动）

### 3.3 请求-应答（serial + 应答包络，ADR-0014/0016）

`bail` 在本框架禁用（源码验证：`bail` 不 await 异步回调，Promise 会被当真值立即截断）；请求-应答统一走 `serial`，结果用**应答包络**：

```typescript
/** 统一应答包络：三态可区分 */
type Reply<T> = { ok: true; value: T } | { ok: false; reason: string }
// 无应答者：bus.request 返回 undefined（serial 全部回调返回 null/undefined 未截断）
// 应答但查无：{ ok: true, value: null }
// 裁决失败（如权限拒绝）：{ ok: false, reason }
// 应答者禁止返回 false（false 不截断但语义含混，ADR-0016）
```

```typescript
class RequestResponse {
  async request<T>(ctx: Context, type: string, payload: unknown, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<Reply<T> | undefined> {
    const correlationId = crypto.randomUUID()
    const message: CordisMessage = {
      id: crypto.randomUUID(), type, payload,
      source: this.ids(ctx), target: options.target,
      createdAt: Date.now(),
      metadata: { correlationId, traceparent: ctx.tracing.current()?.outgoing() },
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { dispose(); resolve(undefined) }, options.timeout ?? 5000)   // 超时=无应答者
      const dispose = ctx.on('message/response', (e) => {
        const m = e.message
        if (m.metadata.correlationId !== correlationId) return
        clearTimeout(timer); dispose()               // 超时/成功都必解绑（旧版超时泄漏监听器）
        resolve(m.payload as Reply<T>)
      }, { global: true })
      options.signal?.addEventListener('abort', () => { clearTimeout(timer); dispose(); reject(new DOMException('aborted', 'AbortError')) }, { once: true })
      this.bus.send(ctx, message)   // 经鉴权发送（§3.1）
    })
  }

  /** 应答方：返回包络或 null/undefined（不截断）；绝不返回 false */
  respond(ctx: Context, type: string, handler: (payload: unknown, msg: CordisMessage) => Promise<Reply<unknown>> | Reply<unknown> | null) {
    ctx.on('message/receive', async (e) => {
      const m = e.message
      if (m.type !== type || !m.metadata.correlationId) return
      try {
        const reply = await handler(m.payload, m)   // 先完成内部 await 再返回（serial 语义）
        if (reply == null) return                   // 不应答，让给后续应答者
        ctx.emit('message/response', { message: { ...m, type: `response:${type}`, payload: reply, target: m.source } })
      } catch (error) {
        ctx.emit('message/response', { message: { ...m, type: `response:${type}`, payload: { ok: false, reason: String(error) }, target: m.source } })
      }
    })
  }
}
```

- 超时**必解绑**；AbortSignal 可取消；迟到响应按 correlationId 自然丢弃且无监听残留
- 多应答者按 serial 截断语义：**首个非 null/false/undefined 返回值胜出**（应答者只用包络/null 两种，false 禁用）
- **能力调用 vs 单点查询**（ADR-0028）：多方可应答的真·管线（能力调用）走本节 serial + 包络；单裁决者（如 scopedFetch 权限裁决）绕过事件调度走 `await ctx.security.check()` 服务方法--避免 serial 顺序 await 把高频并发请求串行化

## 四、传输模式

| 模式 | API | 语义 |
|------|-----|------|
| 事件（默认） | `bus.send / bus.on` | fire-and-forget，定向或广播 |
| 请求-响应 | `bus.request / bus.respond` | §3.3，5s 默认超时可配 |
| 队列 | `bus.queue(name)` | 削峰/离线暂存，见 §5 |

## 五、可靠投递

### 5.1 有序性

同一 `(source -> target)` 的消息按 dispatch 顺序串行投递（bus 内 per-pair FIFO）；跨 pair 无顺序保证（声明式契约要求业务不依赖跨应用全局顺序）。

### 5.2 队列（修复无界重试死循环）

```typescript
class MessageQueue {
  private consumers = new Map<string, Consumer>()   // 同名队列重复注册：显式错误（旧版静默覆盖）
  private dlq: DeadLetterRecord[] = []

  async pump(name: string) {
    const { messages, consumer } = this.queueOf(name)
    let message: QueuedMessage | undefined
    while ((message = messages.shift())) {
      for (let attempt = 0; ; attempt++) {
        try {
          await consumer.handle(message)             // 与 dispatch 相同的权限/TTL 校验
          break
        } catch (error) {
          if (attempt >= consumer.maxRetries) {      // 上限 + 指数退避（旧版 unshift 回队头无限热循环）
            this.dlq.push({ queue: name, message, error: String(error), at: Date.now() })
            this.ctx.emit('monitor/alert', { alert: { type: 'QUEUE_DEAD_LETTER', appId: message.source.appId, detail: { queue: name, type: message.type } } })
            break
          }
          await sleep(Math.min(30000, 500 * 2 ** attempt))
        }
      }
    }
  }
}
```

- 溢出策略：`drop-oldest` 丢弃时**同步 emit 告警事件**（旧版 console.warn 静默丢失）
- DLQ 有界（默认 100 条），devtools 可查看/重放

### 5.3 Retained（粘性）消息：改为响应式状态服务（修复回放乱序/僵尸回调/永不过期）

后加载应用错过初始消息（`env:config_ready` 等）的正确解法**不是** MQTT 式 retained 消息（旧版回放经 setTimeout 异步、新消息反而先到、TTL 过期仍占内存、退订后僵尸回调），而是把"最新值"建模为**状态**：

```typescript
class BusService extends Service {
  /** 最新值登记：bus 将其写入 state 服务的 shared 键，晚到应用经 ctx.state.watch 读当前值 */
  publishLatest(type: string, payload: unknown, options: { appId: string; ttl?: number }) {
    const key = `shared:_latest:${type}`
    this.ctx.state.set(key, { payload, at: Date.now(), ttl: options.ttl ?? Infinity }, { appId: options.appId })
    this.send(type, payload, { appId: options.appId })   // 同时即时通知已加载应用
  }

  /** 订阅"最新值"：同步拿到当前值（无乱序），变更即时通知，TTL 过期由 state 层淘汰 */
  onLatest(ctx: Context, type: string, handler: (payload: unknown) => void) {
    ctx.state.watch(ctx, `shared:_latest:${type}`, (entry) => {
      if (!entry || (entry.ttl !== Infinity && Date.now() - entry.at > entry.ttl)) return
      handler(entry.payload)
    })
  }
}
```

- 首次回调**同步**（修复旧版"注释说立即、实为 setTimeout 异步导致新消息先于回放到达"的乱序）
- 订阅托管 ctx.effect（无僵尸回调）；TTL 语义交给状态层（无永不过期缓存）
- 旧的 `sticky/retainedMessages Map` 机制废除

### 5.4 死信与不可达

- 定向消息目标不存在且未声明 retained 语义 -> 进 DLQ + `QUEUE_DEAD_LETTER` 告警（旧版静默丢弃）
- 目标应用存在但 PENDING -> 排队至其 ACTIVE（上限等待 30s，超时进 DLQ）

### 5.5 挂起应用的消息队列（ADR-0008/0015/0021）

挂起应用的事件订阅仍在（effect 未回收），但应用处于冻结态--直接投递会让应用在"冻结"状态下处理消息、产生与 UI 脱节的状态变更：

```typescript
class SuspendedQueue {
  private queues = new Map<string, Q>()   // instanceId -> 队列

  enqueue(instanceId: string, message: CordisMessage): void {
    const q = this.queues.get(instanceId) ?? { items: [], coalesced: new Set<string>(), dropped: 0 }
    if (q.items.length >= 1000) {          // 上限 1000
      q.dropped++                          // FIFO 丢最旧在 dequeue 时执行（保留计数）
      q.items.shift()
    }
    // 状态类同键合并（bus 通道内的状态快照消息；state 服务本身的变更走拉模型，见 state-sharing §4.3）
    if (message.metadata.coalesceKey) {
      const prev = q.items.findLastIndex(m => m.metadata.coalesceKey === message.metadata.coalesceKey)
      if (prev >= 0) { q.items.splice(prev, 1); q.coalesced.add(message.metadata.coalesceKey) }
    }
    q.items.push(message)
    this.queues.set(instanceId, q)
  }

  /** 恢复时按帧分批回放（每帧 50 条，避免长任务）；期间新消息入队尾保持全序（ADR-0015） */
  async replay(instanceId: string): Promise<void> {
    const q = this.queues.get(instanceId)
    if (q?.dropped || q?.coalesced.size) {
      // 溢出显式上报（ADR-0021）：合并键可列举，普通丢弃只给计数
      this.targetCtx(instanceId).emit('message/receive', {
        message: { type: 'bus/overflow', payload: { coalescedKeys: [...q.coalesced], droppedCount: q.dropped } },
      })
    }
    while (q.items.length) {
      const batch = q.items.splice(0, 50)
      for (const m of batch) this.deliver(instanceId, m)
      await nextFrame()
    }
    this.queues.delete(instanceId)
  }
}
```

- **全序保证**：回放期间新到的消息**入队尾**而非立即投递--否则应用先见新状态、再见旧状态（时间倒流）；最坏追平 1000÷50=20 帧 ≈333ms
- **应用契约**：收到 `bus/overflow` 后，对 `coalescedKeys` 中自己关心的键主动重拉；普通消息语义上不可重放，只做告警上报
- 队列随应用 dispose 一并销毁（lifecycle 通知 bus 清理）

## 六、网络拦截链（唯一 fetch 链路）

```typescript
class NetworkLayer {
  /** 唯一注册口：monitor（埋点）、security（网关策略）、tracing（traceparent 注入）全部挂这里 */
  intercept(appId: string, fn: FetchInterceptor): () => void {
    const chain = this.chains.get(appId) ?? new InterceptorChain()
    this.chains.set(appId, chain)
    chain.add(fn)
    return () => chain.remove(fn)
  }

  /** 沙箱内的 fetch 全部经此：顺序 = tracing -> security -> monitor -> 原生 fetch */
  scopedFetch(appId: string): typeof fetch {
    return (input, init) => {
      const ctxInfo = { appId, traceparent: this.tracing.current()?.outgoing() }
      return this.chains.get(appId)?.run(input, init, ctxInfo) ?? fetch(input, init)
    }
  }
}
```

- **修复三套 fetch 猴补并存**：security 的 NetworkGateway、monitor 的埋点、comm 旧版 FetchInterceptorChain 全部改为本链的 interceptor（基线 §五），**不直接替换 `window.fetch`**
- **注入时序**（ADR-0005）：scopedFetch 由 **lifecycle 在沙箱创建之后、`ctx.plugin()` 之前**注入--sandbox 服务不持有 bus 依赖（避免 deps->sandbox->bus 服务环）；lifecycle 本就按序持有 deps/sandbox/bus 三个依赖
- **权限裁决走单点查询**（ADR-0024/0028）：`await ctx.security.check()` 服务方法（不走 serial 事件调度）；内置默认 5s 超时，超时 fail-closed（`{ok:false, reason:'adjudication-timeout'}`）并 `monitor.capture` 上报裁决超时
- CSRF：HTTP 头由服务端协议下发/校验（security.md §七），本层只负责附加

## 七、W3C Trace Context（CSPRNG + 全链传播）

```typescript
class TracingService extends Service {
  static [Context.provide] = 'tracing'

  /** CSPRNG 且禁止全零（W3C 要求）--修复旧版 Math.random 可预测/可伪造 */
  static generateTraceId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    if (bytes.every(b => b === 0)) return TracingService.generateTraceId()   // 全零重生成
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  }

  static parse(traceparent: string): { version: string; traceId: string; spanId: string; flags: string } | null {
    // 版本字段解析而非字面量 '00' 匹配（未来版本兼容）；格式不合法返回 null 并透传原值
    const m = traceparent.match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/)
    return m ? { version: m[1], traceId: m[2], spanId: m[3], flags: m[4] } : null
  }

  /** 跨异步边界携带当前 span：微任务/宏任务包装（浏览器无 AsyncLocalStorage 的替代） */
  current(): TraceContext | undefined { return this._current }
  run<T>(trace: TraceContext, fn: () => T): T { const prev = this._current; this._current = trace; try { return fn() } finally { this._current = prev } }

  /** 延续既有 trace（修复旧版每请求新建 traceId，链路永不断开） */
  child(): TraceContext {
    const parent = this.current()
    const traceId = parent?.traceId ?? TracingService.generateTraceId()
    return { traceId, spanId: TracingService.generateSpanId(), flags: parent?.flags ?? '01' }   // 采样标志传播
  }
}
```

传播路径（bus 是不隔离的公共层--TraceContext 贯通隔离边界的唯一合法位置，ADR-0022）：

1. 应用发起消息：`bus.send` 在**构建消息时**（dispatch 之前）注入 `metadata.traceparent = tracing.child().outgoing()`
2. 跨应用：目标应用 receive 后，bus 以 `tracing.run(...)` 包裹 handler 调用；**按应用隔离的 monitor 实例**遇到带 traceparent 的消息**续接为子 span**（同 traceId 贯通）
3. fetch：NetworkLayer §六 的 tracing interceptor 注入 header
4. 路由：`router/navigate` 事件载荷可携带 traceparent（与消息同源）
5. **挂起回放**（ADR-0030）：队列滞留的消息回放时以原 traceparent 为 **span link**（OpenTelemetry 语义）开新 span--traceId 关联保持，但 span 时长只计真实处理时间、不计队列滞留；追踪后端非 OTel 兼容时降级为如实长 span

## 八、iframe / 跨 origin 应用

iframe 沙箱内应用（third-party，js-sandbox.md §五）无法共享进程内事件树：

```typescript
class IframeBridge {
  constructor(private bus: BusService, private frame: HTMLIFrameElement, private appId: string) {
    ctx.effect(() => {
      const onMessage = (e: MessageEvent) => {
        if (e.source !== frame.contentWindow) return                 // 来源校验（防伪造）
        if (e.origin !== this.expectedOrigin) return                 // origin 白名单
        const msg = this.validateEnvelope(e.data)                    // 信封校验：schema/nonce/时间窗
        if (!msg) return
        this.bus.dispatch(msg.message)                               // 进入同一 dispatch 管线
      }
      globalThis.addEventListener('message', onMessage)
      return () => globalThis.removeEventListener('message', onMessage)
    })
  }
  post(message: CordisMessage) {
    // targetOrigin 显式指定（不用 '*'）；信封含 nonce 防重放
    frame.contentWindow?.postMessage({ kind: 'cordis-message', v: 1, nonce: this.nextNonce(), message }, this.expectedOrigin)
  }
}
```

- **handshake**：iframe 加载完成后先发 `handshake hello`（携带能力清单与协议版本），主侧校验后才建立桥
- 跨 origin 状态同步（state-sharing.md §7.2）经 `bus.channel('state')` 复用本桥

## 九、消息契约版本管理（新增，修复跨版本兼容缺失）

- 每个消息类型可声明 `schemaVersion`；发送方写入 metadata，接收方在 manifest 中声明可接受版本区间
- 不兼容（接收方不认识版本）：定向消息进 DLQ 并告警 `MESSAGE_SCHEMA_MISMATCH`；应用升级灰度期（A 新 B 旧）由宿主配置兼容映射（payload 降级函数）
- `cordis-cli` 构建期从各应用 manifest 汇聚 `MessageTypes` 契约，类型不匹配在 CI 阶段暴露

## 十、中间件与扩展

```typescript
bus.use((message, next) => { /* 日志/脱敏/采样 */; return next() })
```

- 中间件在 **dispatch 管线内**执行（权限校验之后、TTL 之后、路由之前）
- 顺序：注册顺序；`bus.use(fn, { prepend: true })` 支持前置（对齐 Cordis `ctx.on` 的 prepend 选项）
- 旧版"中间件在去重判定之后注册即终身"的问题消除：中间件无全局状态，bus dispose 随宿主销毁

## 十一、DevTools 联动

- 消息流：devtools 经根 ctx `global:true` 订阅 `message/send` + `message/receive`，仅记录 `id/type/source/target/size`，**不落载荷**（敏感防泄漏；需要载荷的开发模式经显式开关 + 脱敏管道）
- 旧版 `messageHistory`（保留 1000 条完整 payload 且无消费方）废除
- 请求-响应面板：按 correlationId 配对展示时序

## 十二、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | BusService（上下文树路由 + 权限接线 + TTL）+ 事件模式 + 类型化门面 |
| P0 | request/respond（超时解绑 + abort）+ 唯一 fetch 链 |
| P1 | 队列（退避重试 + DLQ）、publishLatest 响应式 retained |
| P1 | TracingService（CSPRNG + 传播）+ iframe 桥（handshake + origin 校验） |
| P2 | 契约版本管理/CI 聚聚、devtools 消息面板 |

## 十三、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| 1.1 单一事件 + 手工路由树绕开上下文传播 | §3.1 `bus.send` 服务方法（source 从 fiber 派生）+ 目标 ctx 定向投递（ADR-0041） |
| 1.2 手写 correlationId 重造请求-应答 | §3.3 基于 serial 语义 + 统一包络（bail 禁用，ADR-0016） |
| 1.3 订阅挂总线根 ctx 不回收 | §3.2 挂 fork ctx，dispose 自动解绑 |
| 1.4 手写 subscribeOnce | 使用 `ctx.once`（门面内） |
| 1.5/2.8 retained 回放乱序/僵尸回调/永不过期 | §5.3 响应式状态服务 |
| 2.1 Date.now+Math.random 碰撞 | crypto.randomUUID |
| 2.4 定向实为全量广播（token 泄漏） | §三 定向不广播 + 敏感数据禁入消息 |
| 2.5 超时泄漏监听器/迟到响应/多响应者 | §3.3 超时必解绑 + serial 截断 |
| 2.6 队列无界热循环/无 DLQ/静默覆盖 | §5.2 退避 + DLQ + 显式错误 |
| 2.7 路由正则未转义/通配 async 乱序 | 路由按上下文树定位（无正则）；广播为同步 per-ctx emit |
| 2.9 traceparent Math.random/每请求新 traceId/版本硬编码 | §七 CSPRNG、child 延续、版本解析 |
| 2.10 历史全量驻留/DevTools 全局句柄 | §十一 元数据-only 记录 |
| 2.11 校验器默认放行不接线 | §三 dispatch 前强制校验（构建期契约 + 运行时抽检） |
