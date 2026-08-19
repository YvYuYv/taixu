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

export type { Reply }

/** 应用实例登记（lifecycle 挂载成功后注入；销毁时注销） */
export interface BusInstance {
  appId: string
  instanceId: string
  ctx: Context
}

/** 仅 global 监听者可见的哨兵 thisArg（message/send 通知族：monitor/DevTools 旁听，应用不可窃听） */
const GLOBAL_ONLY: Ctx = {
  [Context.filter]: () => false,
} as unknown as Ctx

/** CSPRNG hex 字节串（n 字节；禁止全零——W3C 对 trace-id/span-id 的要求，§七） */
function randomHex(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  if (bytes.every((b) => b === 0)) return randomHex(n)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** CSPRNG trace-id（16 字节 hex，禁止全零——W3C 要求；§七） */
function generateTraceId(): string {
  return randomHex(16)
}

/** CSPRNG span-id（8 字节 hex；禁止全零） */
function generateSpanId(): string {
  return randomHex(8)
}

/** W3C Trace Context 格式化（版本 00；采样标志 01） */
function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`
}

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

/** traceparent 解析（§七：版本字段解析而非字面量匹配；不合法返回 null） */
export function parseTraceparent(traceparent: string): { traceId: string; spanId: string } | null {
  const m = traceparent.match(/^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/)
  return m ? { traceId: m[1] as string, spanId: m[2] as string } : null
}

export interface SendMessageInput {
  type: string
  payload: unknown
  /** 定向目标 appId；缺省 = 广播（broadcast 显式调用） */
  target?: string
  /** 生存期 ms；过期消息投递前丢弃（§3.1） */
  ttl?: number
  /** 请求-应答关联（request 内部注入；应用不应手工指定） */
  correlationId?: string
}

export interface RequestOptions {
  target?: string
  /** 超时 ms（默认 5000；超时 = 无应答者，resolve undefined） */
  timeout?: number
  signal?: AbortSignal
}

export class BusService extends Service<Record<never, never>> {
  static provide = 'bus'
  // 基线 §2.3：bus inject security（发送裁决）+ monitor；不 inject lifecycle
  static inject = ['security', 'monitor']

  constructor(ctx: Ctx, _config: Record<never, never> = {}) {
    super(ctx, 'bus')
  }

  /** 已注册实例（appId -> 多实例；同 appId 取最新） */
  private instances = new Map<string, BusInstance[]>()

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

  /** 定向投递：仅目标 ctx 子树（scoped filter）与 global 监听者（载荷不广播） */
  private dispatch(message: CordisMessage): boolean {
    // TTL（§3.1 dispatch 第一步）：过期消息投递前丢弃
    if (message.ttl !== undefined && Date.now() - message.createdAt > message.ttl) return false
    const targets = this.instances.get(message.target)
    const target = targets?.[targets.length - 1] // 同 appId 多实例取最新（instance 定向在 08 号票）
    if (!target) {
      // 投递失败显式错误（挂起目标入队在 08 号票验收）
      throw new Error(`bus: unreachable target "${message.target}" (not mounted)`)
    }
    target.ctx.events.emit(target.ctx, 'message/receive', { message, targetCtx: target.ctx })
    return true
  }

  /**
   * 广播（§3.1）：对每个已注册（ACTIVE）应用定向 emit（与 send 同一裁决——广播不是免检旁路）。
   * 基线 §2.5"对每个 ACTIVE 应用 ctx emit（global: true）"的语义 = 目标子树 + global 旁听可见，
   * 与本实现的 scoped emit 等价（载荷不广播是票面硬性要求）。
   */
  broadcast(ctx: Context, message: SendMessageInput): boolean {
    return this.send(ctx, { ...message, target: undefined })
  }

  /** 广播投递（send 已完成裁决与 message/send 通知；此处仅逐实例定向 emit） */
  private deliverBroadcast(full: CordisMessage): void {
    for (const list of this.instances.values()) {
      const instance = list[list.length - 1] as BusInstance
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
