/**
 * 沙箱工厂：双窗口 Proxy 沙箱（first-party）。
 *
 * 定位声明（js-sandbox.md 开篇，全文一致）：Proxy 沙箱提供**污染隔离与效应回收**，
 * **不是安全边界**；安全边界只有 iframe sandbox（无 allow-same-origin，ADR-0049 P1 范围）。
 *
 * 语义源：js-sandbox.md §3.1 逃逸向量表、§3.2 双窗口 trap、§3.5 Document 代理、
 * §3.7 存储命名空间、§四 生命周期接线（创建挂 fiber effect）。
 *
 * 边界声明：
 * - 网络面记账包装仍是**过渡实现**——§3.6 规定唯一链路是 bus.network 注入
 *   （scopedFetch 由 lifecycle 在 plugin() 前填充注入位），bus 落地（07 号票）后回收本层包装。
 * - **硬硬化已迁出** `services/harden.ts`（C2 wiring）：
 *   `harden` / `wrapEvalAccounting` / `controlledConstructor` / `ESCAPE_VECTOR_MATRIX`
 *   独立模块导出；sandbox 工厂仅 import 与消费。
 *   报告通道 race 修复：sandbox 实例独立 report 闭包，消解原模块单例 `installHardenReport`。
 */
import type { Context } from 'cordis'
import { SandboxDisposedError } from './errors'
import { DocumentProxy } from './document-proxy'
import { InjectedNodesTracker } from './inject-tracker'
import { StorageNamespace } from './storage'
import { wrapCustomElements } from './custom-elements'
import { SuspendScope, suspendRegistry, type SuspendClosedSocket } from './suspend'
import {
  harden,
  controlledConstructor,
  wrapEvalAccounting,
  isBlacklisted,
  NATIVE_UNBOUND,
} from './services/harden'

/** 沙箱配置：路由重定向与销毁回调由 lifecycle 注入（lifecycle 落地在 03 号票） */
export interface SandboxOptions {
  /**
   * 应用容器（Document 代理 scoped 查询的边界）。
   * 容器创建唯一路径是 lifecycle.createOutletContainer()（基线 §五）--本工厂不代建容器；
   * 未提供容器时 document 代理退化为 scoped-to-empty（不可查询），并上报 violation。
   */
  container?: HTMLElement
  /** location 写入 / pushState 重定向（router 受控 API，ADR-0006/0010） */
  onNavigate?: (url: string) => void
  /** destroy 回调（lifecycle 侧记账） */
  onDestroy?: () => void
  /**
   * SuspendScope 实例（lifecycle §5.2；C1.2 wiring 起由 lifecycle 从
   * `ctx.suspendScope.forApp(appId, reconnect)` 注入）。
   *
   * - lifecycle 路径：**必填**（lifecycle.mountOnce 总会先 forApp 再 create）
   * - 测试/独立用法：可选——缺省时 factory 内部 new 一个 noop reconnect 的实例
   *   （仅 lifecycle 路径需真实 reconnect，测试路径不触发也不需要）
   */
  suspendScope?: SuspendScope
}

/** 沙箱实例：proxy 即注入应用执行环境的 globalThis 替身 */
export interface Sandbox {
  readonly proxy: Record<PropertyKey, unknown>
  /** scopedFetch 注入位（由 lifecycle 在 plugin() 前填充，ADR-0005；唯一注入方） */
  readonly injectSlot: { fetch?: typeof fetch }
  /** 记账的注入节点（style/script），供样式生命周期与诊断消费 */
  injectedNodes(): Element[]
  /** 本应用对 fakeWindow 的全部写入键（destroy 时上报 monitor：污染残留诊断，§4.2） */
  modifiedKeys(): string[]
  /**
   * WS 断连描述符（freeze 时记录；恢复重建的依据，ADR-0017：订阅状态由应用重建）。
   * C1.2 wiring：freeze/unfreeze 字段删除——lifecycle 通过 ctx.suspendScope 直访
   */
  closedSockets(): Array<{ url: string; protocols?: string | string[] }>
  /**
   * 框架重建 socket 入口（ADR-0017：连接框架重建，订阅状态由应用重建）。
   * 由 lifecycle.mountOnce 在 sandbox 创建后调 SuspendScope.setReconnect 注入。
   */
  reconnectSocket(d: SuspendClosedSocket): void
  /** 幂等销毁（js-sandbox §4.2） */
  destroy(): Promise<void>
}

const NATIVE_UNBOUND_PLACEHOLDER = null // C2 wiring：删除本地定义，统一从 services/harden 导入

/**
 * 创建沙箱（每应用实例化、不池化，js-sandbox §4.4）。
 * 创建动作挂 fiber effect 由 lifecycle 在挂载事务内接线（§4.1，03 号票）；
 * 本票提供 destroy 幂等原语与 onDestroy 回调双保险。
 */
export async function createSandbox(
  ctx: Context,
  appId: string,
  options: SandboxOptions = {},
): Promise<Sandbox> {
  const fakeWindow: Record<PropertyKey, unknown> = Object.create(null) // 向量 #3：null 原型基座
  const modified = new Set<string>()
  const report = (rule: string, detail: unknown) => {
    ctx.emit('security/violation', { appId, rule, detail })
  }
  // C2 wiring：report channel 走闭包（不再经 installHardenReport 模块单例 — race 修复）
  const container = options.container ?? null
  const tracker = new InjectedNodesTracker(report)
    const sanitizeHTML = (html: string): string => {
    // 真 sanitize（security §3.3）：security 就绪走 DOMPurify；未就绪 fail-closed 全量转义（默认参数兜底）
    const security = (ctx as unknown as { security?: { sanitizeHTML?: (h: string) => string } }).security
    return security?.sanitizeHTML ? security.sanitizeHTML(html) : html.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
  }
  const docProxy = new DocumentProxy(container, tracker, () => proxy, report, sanitizeHTML)
  // 受控视图缓存：保证 document/head/body/localStorage 等访问的身份稳定（§3.5 单例原则）
  const stableViews = new Map<string, unknown>()
  const stable = (key: string, make: () => unknown): unknown => {
    if (!stableViews.has(key)) stableViews.set(key, make())
    return stableViews.get(key)
  }
  let disposed = false

  const navigate = (url: string) => {
    if (options.onNavigate) {
      options.onNavigate(url)
    } else {
      // §3.2 "不静默吞"：router 未接线时显式告警，不假装导航成功
      report('sandbox-navigate-unwired', { url })
    }
  }

  // ---- SuspendScope（lifecycle §5.2，ADR-0013/0027/0032/0048）----
  // C1.2 wiring：SuspendScope 由 lifecycle 注入（ctx.suspendScope.forApp）。SandboxOptions 可选；
  // 缺省时 factory 内部 new 一个 noop reconnect 的实例（仅生命周期路径需要真实 reconnect）。
  const suspendScope: SuspendScope = options.suspendScope ?? new SuspendScope(appId, {
    reconnectSocket: () => undefined, // 测试/独立用法：reconnect 不参与；lifecycle 路径会在 forApp 二次注入
  })

  /** 定时器包装（薄壳 — 内部走 SuspendScope.registerTimer 注册面） */
  const wrapTimer = (kind: 'timeout' | 'interval' | 'raf') => {
    const wrapped = (cb: () => void, ms = 0): number => suspendScope.registerTimer(kind, cb, ms)
    harden(wrapped, report)
    return wrapped
  }

  /** 事件监听门控（薄壳 — SuspendScope.registerListener 注册面） */
  const gatedListener = (listener: EventListenerOrEventListenerObject): EventListenerOrEventListenerObject =>
    suspendScope.registerListener(listener)

  /** 观测类构造器包装（薄壳 — SuspendScope.registerObserver 注册面） */
  const gatedObserver = <T extends abstract new (...args: never[]) => object>(raw: T): T =>
    suspendScope.registerObserver(raw)

  /** WebSocket 包装构造器（记账 + SuspendScope.registerSocket 登记） */
  const wsConstructor = (): new (...args: unknown[]) => object => {
    const raw = Reflect.get(globalThis, 'WebSocket', globalThis) as
      | (new (...a: unknown[]) => object)
      | undefined
    if (typeof raw !== 'function') throw new Error('WebSocket unavailable')
    const Wrapped = class extends raw {
      constructor(...args: unknown[]) {
        report('sandbox-network-WebSocket', { args: args.map(String).slice(0, 2) })
        super(...(args as never[]))
        const sock = this as unknown as { url: string; readyState: number; close: (code?: number) => void }
        suspendScope.registerSocket({
          url: sock.url ?? String(args[0] ?? ''),
          protocols: args[1] as string | string[] | undefined,
          close: (code) => sock.close(code),
          readyState: () => sock.readyState,
        })
      }
    }
    harden(Wrapped as unknown as Function, report)
    return Wrapped
  }

  const sandbox: Sandbox = {
    injectSlot: {},
    injectedNodes: () => tracker.nodesList(),
    modifiedKeys: () => [...modified],
    // C1.2 wiring：freeze/unfreeze 字段删除——lifecycle 通过 ctx.suspendScope 直访
    closedSockets: () => [...suspendScope.closedSockets()],
    reconnectSocket(d: SuspendClosedSocket): void {
      // ADR-0017：框架重建连接；订阅状态由应用重建
      const Ctor = wsConstructor()
      const proto = d.protocols === undefined ? [] : [d.protocols]
      void new Ctor(d.url, ...proto)
    },
    proxy: {} as Record<PropertyKey, unknown>,
    async destroy() {
      if (disposed) return
      disposed = true
      tracker.removeAll()
      options.onDestroy?.()
    },
  }

  const proxy = new Proxy(fakeWindow, {
    get(target, key, receiver) {
      if (disposed) throw new SandboxDisposedError(appId)
      if (key === Symbol.unscopables) return undefined // 向量 #4
      if (typeof key === 'string') {
        if (key === '__proto__') return undefined // 向量 #3（属性形态）
        if (isBlacklisted(key)) {
          report('sandbox-blacklist', { key })
          return undefined
        }
      }
      if (key === 'top' || key === 'parent') return proxy // 向量 #5
      if (key === 'opener') return null
      if (key in target) return Reflect.get(target, key, receiver)
      if (key === 'document') return docProxy.proxy
      if (key === 'location') {
        return stable('location', () => ({
          get href() {
            return globalThis.location.href
          },
          set href(url: string) {
            navigate(url)
          },
          toString() {
            return globalThis.location.href
          },
        }))
      }
      if (key === 'history') {
        return stable('history', () => ({
          pushState(_state: unknown, _title: string, url?: string) {
            navigate(String(url ?? globalThis.location.href))
          },
          replaceState(_state: unknown, _title: string, url?: string) {
            navigate(String(url ?? globalThis.location.href))
          },
        }))
      }
      if (key === 'navigator') {
        return stable('navigator', () => {
          const rawNav = Reflect.get(globalThis, 'navigator', globalThis) as unknown as Record<
            string,
            unknown
          >
          const nav: Record<string, unknown> = { ...rawNav }
          // 向量 #7：SW 注册面默认不暴露（first-party 禁止 SW 注册，策略可配）。
          // 宿主存在该面（含 getter 形态）即告警，无论展开是否捕获到
          if ('serviceWorker' in rawNav || typeof rawNav.serviceWorker !== 'undefined') {
            report('sandbox-service-worker', { appId })
          }
          delete nav.serviceWorker
          nav.sendBeacon = (url: string, data?: unknown) => {
            report('sandbox-send-beacon', { url })
            return typeof rawNav.sendBeacon === 'function'
              ? (rawNav.sendBeacon as (u: string, d?: unknown) => boolean)(url, data)
              : false
          }
          return nav
        })
      }
      if (key === 'customElements') return stable('customElements', () => wrapCustomElements(appId, report))
      if (key === 'eval') return wrapEvalAccounting((x: unknown) => globalThis.eval(String(x)), report)
      if (key === 'Function') return controlledConstructor(report)
      if (key === 'localStorage') {
        return stable('localStorage', () =>
          StorageNamespace.wrap(globalThis.localStorage, storagePrefix(appId)),
        )
      }
      if (key === 'sessionStorage') {
        return stable('sessionStorage', () =>
          StorageNamespace.wrap(globalThis.sessionStorage, storagePrefix(appId)),
        )
      }
      if (key === 'setTimeout' || key === 'setInterval' || key === 'requestAnimationFrame') {
        // SuspendScope 可冻结定时器（§5.2，ADR-0027/0032）：挂起保留剩余时长、恢复续期；
        // 应用拿到的是包装版（含库内部经 window.x 的调用）
        return wrapTimer(key === 'setInterval' ? 'interval' : key === 'setTimeout' ? 'timeout' : 'raf')
      }
      if (key === 'clearTimeout' || key === 'clearInterval') {
        const isInterval = key === 'clearInterval'
        const wrapped = (id?: number): void => {
          if (id == null) return
          // C1.1：thru SuspendScope 实例化后内部统一处理（账本已冻/未冻 / 间隔 vs 一次性）
          suspendScope.clearTimer(id, isInterval)
        }
        harden(wrapped as unknown as Function, report)
        return wrapped
      }
      if (key === 'addEventListener' || key === 'removeEventListener') {
        // SuspendScope 事件监听门控（§5.2 五类注册之二）：挂起期不触发、监听保留
        const raw = Reflect.get(globalThis, key, globalThis) as (...a: unknown[]) => unknown
        const isAdd = key === 'addEventListener'
        const wrapped = function (this: unknown, ...args: unknown[]) {
          const l = args[1] as EventListenerOrEventListenerObject | null
          if (l && (typeof l === 'function' || typeof l.handleEvent === 'function')) {
            args[1] = isAdd ? gatedListener(l) : suspendScope.getListenerWrap(l) // 同引用解绑
          }
          return Reflect.apply(raw, this ?? globalThis, args)
        }
        harden(wrapped as unknown as Function, report)
        return wrapped
      }
      if (key === 'MutationObserver' || key === 'IntersectionObserver' || key === 'ResizeObserver') {
        // SuspendScope observers 门控（§5.2 五类注册之三）；宿主无此能力则如实缺失
        const raw = Reflect.get(globalThis, key, globalThis) as
          | (new (cb: (...a: unknown[]) => void) => object)
          | undefined
        if (typeof raw !== 'function') return undefined
        return gatedObserver(raw)
      }
      if (key === 'requestIdleCallback') {
        const raw = Reflect.get(globalThis, key, globalThis) as ((cb: () => void) => number) | undefined
        if (typeof raw !== 'function') return undefined
        const wrapped = (cb: () => void): number => {
          if (suspendRegistry.isSuspended(appId)) return -1 // 挂起：丢弃（§5.2 五类注册之四）
          return raw(cb)
        }
        harden(wrapped as unknown as Function, report)
        return wrapped
      }
      if (key === 'XMLHttpRequest' || key === 'WebSocket' || key === 'EventSource') {
        // 向量 #8 过渡实现：记账包装（§3.6 规定唯一链路是 bus.network 注入，07 号票后回收）。
        // WebSocket additionally 进 SuspendScope 断连名单（§5.2 五类注册之五：挂起 close(1000) 记录描述符、恢复重建）
        if (typeof Reflect.get(globalThis, key, globalThis) !== 'function') return undefined // 宿主无此能力则如实缺失
        if (key === 'WebSocket') return wsConstructor()
        const raw = Reflect.get(globalThis, key, globalThis) as new (...a: unknown[]) => object
        const Wrapped = class extends raw {
          constructor(...args: unknown[]) {
            report(`sandbox-network-${String(key)}`, { args: args.map(String).slice(0, 2) })
            super(...(args as never[]))
          }
        }
        harden(Wrapped as unknown as Function, report)
        return Wrapped
      }
      if (key === 'Worker' || key === 'SharedWorker') {
        // 向量 #7：Worker 构造经安全策略（记账包装；dedicated 默认允许、SharedWorker 告警）
        const raw = Reflect.get(globalThis, key, globalThis) as
          | (new (...a: unknown[]) => object)
          | undefined
        if (typeof raw !== 'function') return undefined
        const Wrapped = class extends raw {
          constructor(...args: unknown[]) {
            report(`sandbox-worker-${String(key)}`, { args: args.map(String).slice(0, 1) })
            super(...(args as never[]))
          }
        }
        harden(Wrapped as unknown as Function, report)
        return Wrapped
      }
      const value = Reflect.get(globalThis, key, globalThis)
      if (typeof value === 'function' && NATIVE_UNBOUND.has(String(key))) {
        const bound = value.bind(globalThis)
        harden(bound as unknown as Function, report)
        return bound
      }
      return value
    },
    set(target, key, value) {
      if (disposed) throw new SandboxDisposedError(appId)
      if (key === 'location') {
        navigate(String(value)) // §3.2：统一重定向，不静默吞
        return true
      }
      target[key] = value
      if (typeof key === 'string') modified.add(key)
      return true
    },
    deleteProperty(target, key) {
      if (disposed) throw new SandboxDisposedError(appId)
      delete target[key]
      return true // 恒 true（strict mode 下 false 会抛 TypeError）
    },
    has() {
      return true // 向量 #4：with 绑定全部走 traps
    },
    getPrototypeOf() {
      return null // 向量 #3
    },
  })

  if (!container) {
    report('sandbox-missing-container', { appId })
  }

  ;(sandbox as { proxy: Record<PropertyKey, unknown> }).proxy = proxy
  return sandbox
}

/** 存储前缀统一（js-sandbox §3.7：`__cordis__${appId}__`） */
export function storagePrefix(appId: string): string {
  return `__cordis__${appId}__`
}
