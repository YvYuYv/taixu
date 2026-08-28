/**
 * 总线服务（communication-protocol.md §二/§三/§七）：
 * - send = 服务方法（ADR-0041）：emit 是 fire-and-forget 可被窃听/伪造，鉴权必须有拦截点；
 *   source 从调用方 fiber 派生、不接受入参指定（不可伪造）
 * - 定向投递（§3.1）：按 target 解析目标 fiber ctx 后 emit `message/receive`（载荷不广播）；
 *   目标未注册（未加载/已卸载）= 投递失败显式错误（挂起入队在 08 号票）
 * - 请求-应答（§3.3，ADR-0014/0016）：serial 语义 + 统一包络 {ok:true,value}|{ok:false,reason}；
 *   null/undefined = 不应答；应答者禁止返回 false（运行时告警）；bail 全局禁用
 * - 超时必解绑、迟到响应按 correlationId 自然丢弃；correlationId 用 crypto.randomUUID
 * - traceparent（§七，ADR-0022）：CSPRNG trace-id（禁止全零，W3C），应答同 traceId 续链
 * - 广播 broadcast：对每个已注册（ACTIVE）应用定向 emit
 *
 * 目标解析：实例登记表由 lifecycle 注入（lifecycle -> bus 单向，基线 §2.3；
 * bus 不 inject lifecycle）。
 */
import { Service, Context, type Context as Ctx } from 'cordis'
import '../events'
import type { CordisMessage, Reply } from '../events'
import { suspendRegistry } from '../suspend'
import {
  generateTraceId,
  generateSpanId,
  formatTraceparent,
  parseTraceparent,
  linkSpan,
  nextFrame,
} from './tracing'
import { createQueueLedger, type QueueLedgerHandle } from './bus/queue'
import { createDlqLedger, type DlqLedgerHandle, type DeadLetterRecord } from './bus/dlq'
import { createNetworkChain, type NetworkChainHandle } from './bus/networkChain'

export type { Reply }
export type { SuspendSource, SuspendReason } from '../events'
export { parseTraceparent } from './tracing' // C6-A：原 bus.ts 重复定义，tracing.ts 为唯一 source of truth
export type { DeadLetterRecord }

/** bus 配置：队列上限与回放批大小（测试注小值；生产默认 1000 / 每帧 50，§5.5） */
export interface BusConfig {
  queueLimit?: number
  replayBatch?: number
  /** DLQ 容量（默认 100，§5.2 有界；溢出丢最旧） */
  dlqLimit?: number
}

/** 应用实例登记（lifecycle 挂载成功后注入；销毁时注销） */
export interface BusInstance {
  appId: string
  instanceId: string
  ctx: Context
  /** LRU 键刷新回调（§5.4：resume/message 均刷新；lifecycle 注入，驱逐在 10 号票） */
  touch?: () => void
}

/** 仅 global 监听者可见的哨兵 thisArg（message/send 通知族：monitor/DevTools 旁听，应用不可窃听） */
const GLOBAL_ONLY: Ctx = {
  [Context.filter]: () => false,
} as unknown as Ctx

/** listenerCtx 是否位于 ancestorCtx 的子树内（含自身；fiber 父链上溯，root 自环即止） */
function isWithin(listenerCtx: Ctx, ancestorCtx: Ctx): boolean {
  let fiber = listenerCtx.fiber
  const ancestorFiber = ancestorCtx.fiber
  while (fiber) {
    if (fiber === ancestorFiber) return true
    const parent = fiber.parent?.fiber ?? null
    if (parent === fiber) return false // root 自环（v4：root fiber 的 parent 即自身）
    fiber = parent
  }
  return false
}

/** traceparent 解析（§七：版本字段解析而非字面量匹配；不合法返回 null）—— C6-A：实现迁出至 ./tracing */

export interface SendMessageInput {
  type: string
  payload: unknown
  /** 定向目标 appId；缺省 = 广播（broadcast 显式调用） */
  target?: string
  /** 生存期 ms；过期消息投递前丢弃（§3.1） */
  ttl?: number
  /** 同键合并元数据（挂起队列替换同键旧值，§5.5） */
  metadata?: { coalesceKey?: string }
  /** 请求-应答关联（request 内部注入；应用不应手工指定） */
  correlationId?: string
}

export interface RequestOptions {
  target?: string
  /** 超时 ms（默认 5000；超时 = 无应答者，resolve undefined） */
  timeout?: number
  signal?: AbortSignal
}

/**
 * 网络中间件（security §6.2 NetworkGateway 挂 bus 链）：宿主/DevTools 经
 * `bus.network.intercept(appId, mw)` 注册；链序 = 内建（tracing 外包裹 ->
 * 自定义按注册序 -> monitor 计时 -> 原生 fetch 终端）。不猴补全局 fetch——
 * 链只在 scopedFetch 唯一链路（ADR-0005）内执行。
 */
export interface NetworkMiddleware {
  (input: RequestInfo | URL, init: RequestInit | undefined, next: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): Promise<Response>
}

export class BusService extends Service<BusConfig> {
  static provide = 'bus'
  // 基线 §2.3：bus inject security（发送裁决）+ monitor；不 inject lifecycle
  static inject = ['security', 'monitor']

  private queueLimit: number
  private replayBatchSize: number
  private dlqLimit: number

  constructor(ctx: Ctx, config: BusConfig = {}) {
    super(ctx, 'bus')
    this.queueLimit = config.queueLimit ?? 1000
    this.replayBatchSize = config.replayBatch ?? 50
    this.dlqLimit = config.dlqLimit ?? 100
    // C14-C：挂起队列 + DLQ 抽离到 bus/queue.ts + bus/dlq.ts；bus 改持两个 ledger 引用
    this.queueLedger = createQueueLedger()
    this.dlqLedger = createDlqLedger()
    // C15-A：网络拦截链抽离到 bus/networkChain.ts；tracing 懒取（bus 不 inject tracing，
    // ADR-0054 依赖方向）；monitor 懒取（构造时 ctx.monitor 尚未就绪）
    this.networkChain = createNetworkChain(null, {
      count: (name, value, tags) => this.ctx.monitor.count(name, value, tags),
      capture: (error, meta) => this.ctx.monitor.capture(error, { ...meta, phase: 'runtime' as const }),
    })
    // 挂起队列联动（§5.5，09 号票统一时序）：lifecycle 在 app/resume（state/sync）与
    // router/replay 之后派发 bus/replay 触发回放；dispose 清队列（root + global，不 inject lifecycle）
    ctx.on('bus/replay', (e) => {
      void this.replay(e.instanceId)
    }, { global: true })
    ctx.on('app/disposed', (e) => {
      this.queueLedger.delete(e.instanceId)
      this.networkChain.clear(e.appId) // 拦截链随应用销毁清理（§6.2 disposer 生命周期语义）
    }, { global: true })
  }

  /** 已注册实例（appId -> 多实例；同 appId 取最新） */
  private instances = new Map<string, BusInstance[]>()

  /** 挂起队列账本（C14-C）：queues Map + replaying Set + enqueue 状态机已抽离到 bus/queue.ts；
   *   bus 改持 queueLedger 引用。 */
  private queueLedger: QueueLedgerHandle

  /** DLQ 死信账本（C14-C）：dlq Array + deadLetter + deadLetters 账本已抽离到 bus/dlq.ts；
   *   bus 改持 dlqLedger 引用。 */
  private dlqLedger: DlqLedgerHandle

  /** 网络拦截链（C15-A）：runNetwork 链执行逻辑（中间件循环 + tracing span + monitor 计时）
   *   已抽离到 bus/networkChain.ts；bus 改持 networkChain 引用。tracing 懒取（run 时从
   *   this.ctx 反射取——与原实现一致）。 */
  private networkChain: NetworkChainHandle

  /** 中间件注册面（宿主/DevTools）：返回 disposer；随注册序执行——
   * C15-A：thin delegate 到 networkChain.intercept。 */
  get network(): { intercept(appId: string, middleware: NetworkMiddleware): () => void } {
    return {
      intercept: (appId, middleware) => this.networkChain.intercept(appId, middleware),
    }
  }

  /**
   * 链执行（§6.2 链序）：tracing span（外包裹）-> 自定义中间件（注册序）->
   * monitor net_ms 计时 -> 终端 fetch。security 裁决由调用方（scopedFetch）
   * 前置完成——拒绝路径不进链（fail-closed 第一闸）。
   *
   * C15-A：thin delegate 到 networkChain.run；tracing 懒取（从 this.ctx 反射——
   * 与原实现一致，bus 不 inject tracing 保持 ADR-0054 依赖方向）。
   */
  async runNetwork(
    appId: string,
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    terminal: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  ): Promise<Response> {
    const tracing = (this.ctx as Ctx & { tracing?: import('./tracing').TracingService }).tracing ?? null
    return this.networkChain.runWithTracing(appId, tracing, input, init, terminal)
  }

  /** 死信入队：有界（默认 100，溢出丢最旧）+ QUEUE_DEAD_LETTER 告警（monitor 旁听）——
   * C14-C：thin delegate 到 dlqLedger.push。 */
  private deadLetter(message: CordisMessage, error: string): void {
    this.dlqLedger.push(message, error, this.dlqLimit)
    this.ctx.emit('monitor/alert', {
      alert: { level: 'error', message: 'QUEUE_DEAD_LETTER', appId: message.source },
    })
  }

  /** DLQ 只读视图（devtools/宿主审计用）——C14-C：thin delegate 到 dlqLedger.entries。 */
  deadLetters(): readonly DeadLetterRecord[] {
    return this.dlqLedger.entries()
  }

  /**
   * 死信重放（§5.2 "devtools 可查看/重放"）：重走 send 管线（裁决/TTL/定向全复用）；
   * 目标仍不可达会再进 DLQ（新记录）——重放不绕过任何校验。成功投递则从 DLQ 移除原记录。
   * C14-C：dlqLedger.at / dlqLedger.removeAt 消费账本；dispatch 保留在 bus。
   */
  replayDeadLetter(index: number): boolean {
    const record = this.dlqLedger.at(index)
    if (!record) return false
    const delivered = this.dispatch(record.message)
    if (delivered) this.dlqLedger.removeAt(index)
    return delivered
  }

  /** lifecycle -> bus 单向登记（挂载成功后调用；§3.1 目标解析数据源） */
  register(instance: BusInstance): void {
    const list = this.instances.get(instance.appId) ?? []
    list.push(instance)
    this.instances.set(instance.appId, list)
    this.installScopedFilter(instance.ctx)
  }

  /**
   * 定向事件语义（§3.1"仅目标 ctx 及其冒泡路径上的 global 监听者"）：
   * cordis v4 的 plain ctx 无 [Context.filter]（仅 Service 有），ctx.emit 默认触达
   * 全部非 global 监听器--为应用 ctx 安装 scoped filter 后，从该 ctx emit 的事件
   * 只有本 ctx 子树（非 global）与 global 监听者（monitor/DevTools）可见。
   */
  private installScopedFilter(appCtx: Ctx): void {
    const holder = appCtx as unknown as Record<symbol, unknown>
    const key = Context.filter as unknown as symbol
    if (key in holder) return
    Object.defineProperty(holder, key, {
      value: (listenerCtx: Ctx) => isWithin(listenerCtx, appCtx),
      configurable: true,
    })
  }

  unregister(instanceId: string): void {
    for (const [appId, list] of this.instances) {
      const next = list.filter((i) => i.instanceId !== instanceId)
      if (next.length === 0) this.instances.delete(appId)
      else this.instances.set(appId, next)
    }
  }

  /**
   * 发送（§3.1，ADR-0041）：source 从调用方 fiber 派生（'root' = 宿主/系统，受信层）；
   * 未授权发送不投递 + violation 上报；返回是否已投递。
   */
  send(ctx: Context, message: SendMessageInput): boolean {
    const source = ctx.fiber.name !== 'root' ? ctx.fiber.name : 'system'
    if (source !== 'system' && !this.adjudicateSend(source, message.type)) return false
    const full: CordisMessage = {
      id: crypto.randomUUID(),
      type: message.type,
      source, // 覆写：入参伪造无效（不可伪造）
      target: message.target ?? '',
      payload: message.payload,
      createdAt: Date.now(),
      correlationId: message.correlationId,
      ttl: message.ttl,
      metadata: message.metadata, // 同键合并元数据（挂起队列 §5.5）
      traceparent: formatTraceparent(generateTraceId(), generateSpanId()), // 自动注入（ADR-0022）
    }
    this.ctx.events.emit(GLOBAL_ONLY, 'message/send', { message: full }) // 通知族：仅 global 旁听（monitor/DevTools）
    if (!message.target) {
      this.deliverBroadcast(full)
      return true
    }
    return this.dispatch(full)
  }

  /** 发送裁决（deny-by-default，send 与 broadcast 共用——广播无免检旁路） */
  private adjudicateSend(source: string, type: string): boolean {
    const verdict = this.ctx.security.check(source, `message:${type}`)
    if (!verdict.allowed) {
      this.ctx.security.reportViolation(source, 'message-send', { type })
      return false
    }
    return true
  }

  /** instanceId 查实例（登记表以 appId 为键；回放/投递路径统一走此助手） */
  private findByInstanceId(instanceId: string): BusInstance | undefined {    for (const list of this.instances.values()) {
      const hit = list.find((i) => i.instanceId === instanceId)
      if (hit) return hit
    }
    return undefined
  }

  /** 定向投递：仅目标 ctx 子树（scoped filter）与 global 监听者（载荷不广播）；挂起/回放中入队（§5.5） */
  private dispatch(message: CordisMessage): boolean {
    // TTL（§3.1 dispatch 第一步）：过期消息投递前丢弃
    if (message.ttl !== undefined && Date.now() - message.createdAt > message.ttl) return false
    const targets = this.instances.get(message.target)
    const target = targets?.[targets.length - 1] // 同 appId 多实例取最新（instance 定向在 08 号票）
    if (!target) {
      // 死信（§5.4）：目标不存在（未挂载/已卸载）不静默丢弃——进 DLQ + 告警，
      // devtools 可查看/重放；send 显式返回 false。挂起目标的入队路径见下。
      //（"目标存在但 PENDING 排队至 ACTIVE"在本实现不可达：bus 登记发生在 fiber
      //  ACTIVE 之后（lifecycle mountOnce），注册即激活，无需等待窗口）
      this.deadLetter(message, `unreachable target "${message.target}" (not mounted)`)
      return false
    }
    if (suspendRegistry.isSuspended(target.appId) || this.queueLedger.isReplaying(target.instanceId)) {
      this.enqueue(target.instanceId, message) // 挂起队列（ADR-0008）：冻结态不处理消息
      return true
    }
    target.touch?.() // LRU 键刷新（§5.4：message 刷新）
    target.ctx.events.emit(target.ctx, 'message/receive', { message, targetCtx: target.ctx })
    return true
  }

  /** 入队（§5.5）：上限 FIFO 丢最旧 + 同键合并（旧值移除、最新值入队尾）——
   * C14-C：thin delegate 到 queueLedger.enqueue。 */
  private enqueue(instanceId: string, message: CordisMessage): void {
    this.queueLedger.enqueue(instanceId, message, this.queueLimit)
  }

  /** 回放（§5.5）：溢出先上报（bus/overflow：契约事件 global + 应用消息双路），每帧 batch 条分批投递——
   * C14-C：queueLedger 消费账本；replay 状态机保留在 bus（依赖 findByInstanceId / target.touch /
   * target.ctx.events.emit）。 */
  private async replay(instanceId: string): Promise<void> {
    if (this.queueLedger.isReplaying(instanceId)) return
    const q = this.queueLedger.get(instanceId)
    if (!q) return
    this.queueLedger.markReplaying(instanceId) // 回放期间新消息入队尾保持全序（ADR-0015）
    try {
      if (q.dropped || q.coalesced.size) {
        // 溢出显式上报（ADR-0021）：合并键可列举，普通丢弃只给计数
        const coalescedKeys = [...q.coalesced]
        const droppedCount = q.dropped
        const target = this.findByInstanceId(instanceId)
        this.ctx.emit('bus/overflow', { instanceId, coalescedKeys, droppedCount })
        if (target) {
          target.ctx.events.emit(target.ctx, 'message/receive', {
            message: {
              id: crypto.randomUUID(),
              type: 'bus/overflow',
              source: 'system',
              target: target.appId,
              payload: { coalescedKeys, droppedCount },
              createdAt: Date.now(),
            },
            targetCtx: target.ctx,
          })
        }
        q.dropped = 0
        q.coalesced.clear()
      }
      while (q.items.length) {
        const batch = q.items.splice(0, this.replayBatchSize) // 50/帧（默认）避免长任务
        const target = this.findByInstanceId(instanceId)
        if (!target) break // 回放中应用被销毁：队列随 app/disposed 清理
        for (const m of batch) {
          target.touch?.() // LRU 键刷新（§5.4）
          // span link（ADR-0030，§七-5）：以原 traceparent 的 traceId 开新 span——
          // traceId 关联保持（挂起前后链路可关联），span 时长只计真实处理时间
          const linked = { ...m, ...linkSpan(m) }
          target.ctx.events.emit(target.ctx, 'message/receive', {
            message: linked,
            targetCtx: target.ctx,
          })
        }
        await nextFrame()
      }
    } finally {
      this.queueLedger.unmarkReplaying(instanceId)
      if (q.items.length === 0) this.queueLedger.delete(instanceId)
    }
  }

  /**
   * 广播（§3.1）：对每个已注册（ACTIVE）应用定向 emit（与 send 同一裁决——广播不是免检旁路）。
   * 基线 §2.5"对每个 ACTIVE 应用 ctx emit（global: true）"的语义 = 目标子树 + global 旁听可见，
   * 与本实现的 scoped emit 等价（载荷不广播是票面硬性要求）。
   */
  /**
   * 最新值登记（§5.3 响应式 retained，修复"后加载应用错过初始消息"）：
   * 写入 state 服务的 shared 键（晚到应用经 watch/onLatest 同步取当前值——不是 MQTT 式
   * retained 回放，无乱序/僵尸回调问题）；同时 send 即时通知已加载应用。
   * 发布者需 `state:write:shared:_latest:{type}` 写权限（deny-by-default）。
   */
  publishLatest(ctx: Context, type: string, payload: unknown, options: { ttl?: number } = {}): boolean {
    const appId = ctx.fiber.name !== 'root' ? ctx.fiber.name : 'system'
    const key = `shared:_latest:${type}`
    this.ctx.state.set(key, { payload, at: Date.now(), ttl: options.ttl ?? Infinity }, {
      appId: appId === 'system' ? undefined : appId,
    })
    return this.send(ctx, { type, payload }) // 广播即时通知（载荷不进 retained 语义——最新值在 state）
  }

  /**
   * 订阅"最新值"（§5.3）：watch 首跑同步拿到当前值（无乱序），变更即时通知；
   * TTL 过期条目不回调（消费侧裁决——"最新值"建模为状态而非消息，TTL 语义交给状态层）。
   * 订阅者需 `state:read:shared:_latest:{type}` 读权限（fail-closed）。
   */
  onLatest(ctx: Context, type: string, handler: (payload: unknown, meta: { at: number; ttl: number }) => void): void {
    ctx.state.watch(ctx, `shared:_latest:${type}`, (entry) => {
      const e = entry as { payload: unknown; at: number; ttl: number } | undefined
      if (!e || typeof e.at !== 'number') return
      if (e.ttl !== Infinity && Date.now() - e.at > e.ttl) return // 过期：不回调（状态仍可拉，由应用自行裁决）
      handler(e.payload, { at: e.at, ttl: e.ttl })
    })
  }

  broadcast(ctx: Context, message: SendMessageInput): boolean {
    return this.send(ctx, { ...message, target: undefined })
  }

  /** 广播投递（send 已完成裁决与 message/send 通知；挂起实例入队--广播不绕过队列 §5.5） */
  private deliverBroadcast(full: CordisMessage): void {
    for (const list of this.instances.values()) {
      const instance = list[list.length - 1] as BusInstance
      if (suspendRegistry.isSuspended(instance.appId) || this.queueLedger.isReplaying(instance.instanceId)) {
        this.enqueue(instance.instanceId, full) // 挂起队列（ADR-0008）
        continue
      }
      instance.ctx.events.emit(instance.ctx, 'message/receive', { message: full, targetCtx: instance.ctx })
    }
  }

  /**
   * 请求-应答（§3.3）：serial 语义 + 统一包络；超时 = 无应答者（resolve undefined）；
   * AbortSignal 取消 reject AbortError；超时/成功/取消均必解绑，迟到响应按 correlationId 自然丢弃。
   */
  request<T = unknown>(
    ctx: Context,
    type: string,
    payload: unknown,
    options: RequestOptions = {},
  ): Promise<Reply<T> | undefined> {
    const correlationId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let onAbort: (() => void) | undefined
      const finish = (fn: () => void) => {
        clearTimeout(timer)
        dispose() // 成功/超时/取消均必解绑（监听无残留）
        if (onAbort) options.signal?.removeEventListener('abort', onAbort)
        fn()
      }
      const dispose = ctx.on(
        'message/response',
        (e) => {
          if (e.message.correlationId !== correlationId) return // 迟到/他人响应丢弃
          finish(() => resolve(e.message.payload as Reply<T>))
        },
        { global: true },
      )
      timer = setTimeout(() => finish(() => resolve(undefined)), options.timeout ?? 5000) // 超时 = 无应答者
      if (options.signal) {
        onAbort = () => finish(() => reject(new DOMException('aborted', 'AbortError')))
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
      this.send(ctx, { type, payload, target: options.target, correlationId })
    })
  }

  /**
   * 应答方（§3.3）：返回包络或 null/undefined（不应答，让给后续应答者）；
   * **绝不返回 false**（ADR-0016：false 语义含混，运行时告警并按不应答处理）。
   */
  respond(ctx: Context, type: string, handler: (payload: unknown, message: CordisMessage) => Promise<Reply | null> | Reply | null): void {
    // 类型层面即拒绝 false（返回类型不含 false；运行时守卫兜底旧代码/JS 应用，ADR-0016）
    ctx.on('message/receive', (e) => {
      const m = e.message
      if (m.type !== type || !m.correlationId) return
      void (async () => {
        let reply: Reply | null | false | undefined
        try {
          reply = await handler(m.payload, m) // 先完成内部 await 再返回（serial 语义）
        } catch (error) {
          // 应答方抛错自动包络为裁决失败
          ctx.events.emit(ctx, 'message/response', {
            message: {
              ...m,
              type: `response:${type}`,
              payload: { ok: false, reason: String(error) } satisfies Reply,
              target: m.source,
            },
          })
          return
        }
        // 运行时守卫：false 无语义（ADR-0016）——类型层已禁，兜底 JS 应用/旧代码
        if ((reply as unknown) === false) {
          // ADR-0016：false 无语义，告警并按不应答处理
          this.ctx.monitor.capture(new Error(`bus-reply-false: responder for "${type}" returned false (use the reply envelope or null)`), {
            appId: m.source,
            phase: 'runtime',
          })
          return
        }
        if (reply == null) return // 不应答
        // 应答同 traceId 续链（新 spanId；§七）
        const trace = m.traceparent ? parseTraceparent(m.traceparent) : null
        const traceparent = trace
          ? formatTraceparent(trace.traceId, generateSpanId())
          : formatTraceparent(generateTraceId(), generateSpanId())
        ctx.events.emit(ctx, 'message/response', {
          message: { ...m, type: `response:${type}`, payload: reply, target: m.source, traceparent },
        })
      })()
    })
  }
}

declare module 'cordis' {
  interface Context {
    bus: BusService
  }
}
