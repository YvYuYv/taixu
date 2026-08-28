/**
 * 挂起层（lifecycle §5.1.1 / §5.2，ADR-0013/0027/0032/0048）：
 *
 * - `suspendRegistry` —— 全局挂起查询点（Set）。沙箱 wrap 函数、bus 投递、lifecycle 仲裁
 *   都共享此单一布尔查询面，O(1)。appId 键由沙箱实例创建期闭包捕获（ADR-0048，
 *   不做 zone.js 式运行时推断）；写入方唯一：lifecycle 服务（仲裁单点，§5.1.1）。
 *
 * - `SuspendScope` —— 每 AppInstance 一个的资源登记处（lifecycle §5.2）。
 *   5 类注册面（timer / listener / observer / socket / closedDescriptor）+ freeze/unfreeze
 *   仲裁。冻结态：保留定时器剩余时长（unfreeze 续期）、WebSocket close(1000)
 *   并记描述符（unfreeze 按 ADR-0017 重建连接，订阅状态由应用重建）。
 *
 * C1.1 落地：SuspendScope 自 sandbox.ts 抽离至此；sandbox.freeze/unfreeze 仍作
 * thin alias 保留至 C1.2 wiring 票删除。
 */

/**
 * 全局挂起查询点（fire-and-forget 语义；bus.dispatch / gatedListener 都靠它）
 */
const suspended = new Set<string>()

export const suspendRegistry = {
  suspend(appId: string): void {
    suspended.add(appId)
  },
  resume(appId: string): void {
    suspended.delete(appId)
  },
  isSuspended(appId: string): boolean {
    return suspended.has(appId)
  },
}

// ============== SuspendScope 资源登记面（lifecycle §5.2） ==============

/** 注册的定时器类型 */
export type SuspendTimerKind = 'timeout' | 'interval' | 'raf'

/** 定时器账本条目：raw id 持有 + 剩余时长记录 */
export interface SuspendTimerRecord {
  kind: SuspendTimerKind
  rawId: number | ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>
  delay: number
  startedAt: number
  fire: () => void
  frozen: boolean
}

/** 已注册 socket 的接口（断连名单登记用） */
export interface SuspendSocketHandle {
  url: string
  protocols?: string | string[]
  close: (code: number) => void
  readyState: () => number
}

/** 关闭的 socket 描述符（冻结期记录 + 恢复期重建） */
export interface SuspendClosedSocket {
  url: string
  protocols?: string | string[]
}

/** SuspendScope 构造选项（raw timer API；测试可注入假件） */
export interface SuspendScopeOptions {
  rawSetTimeout?: typeof setTimeout
  rawSetInterval?: typeof setInterval
  rawClearTimeout?: typeof clearTimeout
  rawClearInterval?: typeof clearInterval
  /** 重建已 close socket 的工厂（sandbox 注入 wsConstructor()） */
  reconnectSocket?: (desc: SuspendClosedSocket) => unknown
}

const defaultSetTimeout: typeof setTimeout = globalThis.setTimeout.bind(globalThis)
const defaultSetInterval: typeof setInterval = globalThis.setInterval.bind(globalThis)
const defaultClearTimeout: typeof clearTimeout = globalThis.clearTimeout.bind(globalThis)
const defaultClearInterval: typeof clearInterval = globalThis.clearInterval.bind(globalThis)

/**
 * SuspendScope —— 5 类资源登记面 + freeze/unfreeze 仲裁（lifecycle §5.2）。
 * 每 AppInstance 持一个；与 sandbox 关注面对齐，sandbox wrap 函数消费其注册面。
 */
export class SuspendScope {
  private readonly appId: string
  private readonly rawSetTimeout: typeof setTimeout
  private readonly rawSetInterval: typeof setInterval
  private readonly rawClearTimeout: typeof clearTimeout
  private readonly rawClearInterval: typeof clearInterval

  private timerSeq = 0
  private readonly timers = new Map<number, SuspendTimerRecord>()
  /** 事件监听 wrap 缓存：WeakMap 保证 remove 同引用 */
  private readonly listenerWraps = new WeakMap<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>()
  /** 活跃 socket 集合（freeze 时 close(1000)） */
  private readonly sockets = new Set<SuspendSocketHandle>()
  /** 已 close 描述符队列（unfreeze 时按序重建） */
  private readonly closedDescriptors: SuspendClosedSocket[] = []
  private reconnectCursor = 0
  private frozen = false
  /**
   * reconnect 工厂（C1.2 wiring：构造时可能 noop，sandbox 创建后由 lifecycle 二次注入）。
   * 非 readonly——setReconnect() 方法允许替换。
   */
  private reconnectSocket: (desc: SuspendClosedSocket) => unknown

  constructor(appId: string, options: SuspendScopeOptions = {}) {
    this.appId = appId
    this.rawSetTimeout = options.rawSetTimeout ?? defaultSetTimeout
    this.rawSetInterval = options.rawSetInterval ?? defaultSetInterval
    this.rawClearTimeout = options.rawClearTimeout ?? defaultClearTimeout
    this.rawClearInterval = options.rawClearInterval ?? defaultClearInterval
    this.reconnectSocket = options.reconnectSocket ?? (() => undefined)
  }

  /** 5 类注册面之一：定时器（lifecycle §5.2；保留剩余时长、unfreeze 续期） */
  registerTimer(kind: SuspendTimerKind, callback: () => void, ms = 0): number {
    const id = ++this.timerSeq
    const rec: SuspendTimerRecord = { kind, rawId: 0, delay: ms, startedAt: 0, fire: callback, frozen: false }
    this.armTimer(rec, ms)
    this.timers.set(id, rec)
    return id
  }

  private armTimer(rec: SuspendTimerRecord, delay: number): void {
    rec.delay = delay
    rec.startedAt = Date.now()
    rec.frozen = false
    if (rec.kind === 'interval') rec.rawId = this.rawSetInterval(rec.fire, delay)
    else rec.rawId = this.rawSetTimeout(rec.fire, delay)
  }

  /** 清除已注册定时器（与 globalThis.clearTimeout/clearInterval 语义一致） */
  clearTimer(id: number, isInterval = false): void {
    const rec = this.timers.get(id)
    if (!rec) return
    this.timers.delete(id)
    if (rec.frozen) return // 已冻结：账本删除即可（资源已不可达）
    if (isInterval || rec.kind === 'interval') this.rawClearInterval(rec.rawId as ReturnType<typeof setInterval>)
    else this.rawClearTimeout(rec.rawId as ReturnType<typeof setTimeout>)
  }

  /** 5 类注册面之一：事件监听 wrap（挂起期不触发回调、监听保留） */
  registerListener(listener: EventListenerOrEventListenerObject): EventListenerOrEventListenerObject {
    let wrapped = this.listenerWraps.get(listener)
    if (wrapped) return wrapped
    const appId = this.appId // 闭包捕获：function 内 this 不稳
    wrapped = function (this: unknown, ev: Event) {
      if (suspendRegistry.isSuspended(appId)) return // 挂起：丢弃
      if (typeof listener === 'function') return Reflect.apply(listener, this, [ev])
      return (listener as { handleEvent: (e: Event) => void }).handleEvent(ev)
    } as EventListenerOrEventListenerObject
    this.listenerWraps.set(listener, wrapped)
    return wrapped
  }

  /** 取已 wrap 的 listener（remove 同引用解绑） */
  getListenerWrap(listener: EventListenerOrEventListenerObject): EventListenerOrEventListenerObject {
    return this.listenerWraps.get(listener) ?? listener
  }

  /** 5 类注册面之一：observer 构造器 wrap（回调门控：挂起期不触发） */
  registerObserver<T extends abstract new (...args: never[]) => object>(Ctor: T): T {
    const appId = this.appId // 闭包捕获
    const Wrapped = class extends (Ctor as unknown as new (cb: (...a: unknown[]) => void) => object) {
      constructor(cb: (...a: unknown[]) => void) {
        super((...a: unknown[]) => {
          if (!suspendRegistry.isSuspended(appId)) cb(...a)
        })
      }
    } as unknown as T
    return Wrapped
  }

  /** 5 类注册面之一：socket 注册（断连名单登记） */
  registerSocket(handle: SuspendSocketHandle): void {
    this.sockets.add(handle)
  }

  /** 关闭 socket 后从活跃集合移除 */
  removeSocket(handle: SuspendSocketHandle): void {
    this.sockets.delete(handle)
  }

  /** 冻结：保留 timer 剩余时长；socket close(1000) 并记录描述符 */
  freeze(): void {
    if (this.frozen) return
    this.frozen = true
    for (const rec of this.timers.values()) {
      const remaining = Math.max(0, rec.delay - (Date.now() - rec.startedAt))
      if (rec.kind === 'interval') this.rawClearInterval(rec.rawId as ReturnType<typeof setInterval>)
      else this.rawClearTimeout(rec.rawId as ReturnType<typeof setTimeout>)
      rec.delay = remaining
      rec.frozen = true
    }
    for (const socket of this.sockets) {
      if (socket.readyState() <= 1) {
        socket.close(1000)
        this.closedDescriptors.push({ url: socket.url, protocols: socket.protocols })
      }
    }
  }

  /** 解冻：续期 timer；重建 WebSocket（按 ADR-0017） */
  unfreeze(): void {
    if (!this.frozen) return
    this.frozen = false
    for (const rec of this.timers.values()) {
      if (!rec.frozen) continue
      this.armTimer(rec, rec.delay || 0)
      rec.frozen = false
    }
    while (this.reconnectCursor < this.closedDescriptors.length) {
      const d = this.closedDescriptors[this.reconnectCursor]!
      this.reconnectCursor++
      try {
        // 由 suspend 调用方（即 sandbox）注入 reconnectSocket；不可解析即保留描述符
        this.reconnectSocket(d)
        // 重建成功：活跃 socket 集合由 wsConstructor() 内部 register 重新填充
      } catch {
        this.reconnectCursor--
        break
      }
    }
  }

  /** 当前 frozen 状态查询 */
  isFrozen(): boolean {
    return this.frozen
  }

  /**
   * 二次注入 reconnect（lifecycle.mountOnce 时序要求）：
   * 构造 forApp(appId) 时 SuspendScope 尚未持有 sandbox.reconnectSocket（sandbox 还未创建）。
   * 在 sandbox 创建后，lifecycle 通过本方法补注入 reconnect；之后 unfreeze 调用即委托至 sandbox.reconnectSocket。
   */
  setReconnect(fn: (d: SuspendClosedSocket) => unknown): void {
    this.reconnectSocket = fn
  }

  /** 已 close 的 socket 描述符只读视图（sandbox.closedSockets 的 seam） */
  closedSockets(): readonly SuspendClosedSocket[] {
    return [...this.closedDescriptors]
  }

  /** 测试 seam：已注册 timer 数 */
  timerCount(): number {
    return this.timers.size
  }

  /** 测试 seam：活跃 socket 数 */
  socketCount(): number {
    return this.sockets.size
  }
}
