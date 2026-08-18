/**
 * 沙箱工厂：双窗口 Proxy 沙箱（first-party）。
 *
 * 定位声明（js-sandbox.md 开篇，全文一致）：Proxy 沙箱提供**污染隔离与效应回收**，
 * **不是安全边界**；安全边界只有 iframe sandbox（无 allow-same-origin，ADR-0049 P1 范围）。
 *
 * 语义源：js-sandbox.md §3.1 逃逸向量表、§3.2 双窗口 trap、§3.5 Document 代理、
 * §3.7 存储命名空间、§四 生命周期接线（创建挂 fiber effect）。
 *
 * 边界声明：网络面记账包装是**过渡实现**--§3.6 规定唯一链路是 bus.network 注入
 * （scopedFetch 由 lifecycle 在 plugin() 前填充注入位），bus 落地（07 号票）后回收本层包装。
 */
import type { Context } from 'cordis'
import { SandboxDisposedError } from './errors'
import { DocumentProxy } from './document-proxy'
import { InjectedNodesTracker } from './inject-tracker'
import { StorageNamespace } from './storage'
import { wrapCustomElements } from './custom-elements'

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
  /** 幂等销毁（js-sandbox §4.2） */
  destroy(): Promise<void>
}

const NATIVE_UNBOUND = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame'])

/** 黑名单全局（基线 §四.3 + js-sandbox §六）：`__CORDIS_*` 前缀整体封禁（非逐字面量） */
function isBlacklisted(key: string): boolean {
  return key.startsWith('__CORDIS_')
}

/** 逃逸向量 #1：eval/Function 记账包装（执行不拦，宿主 CSP 兜底） */
function wrapEvalAccounting(
  raw: (...args: unknown[]) => unknown,
  report: (rule: string, detail: unknown) => void,
) {
  const wrapped = (source: string) => {
    report('sandbox-eval-accounting', { source: source.slice(0, 120) })
    return raw(source)
  }
  hardenFunction(wrapped)
  return wrapped
}

/**
 * 逃逸向量 #2：冻结包装函数的 constructor/__proto__/prototype。
 * 受控 constructor 只做"记账 + 告警"（§3.1：拦截不承诺绝对，承诺记账+告警），
 * **不再转发 raw.apply**（旧实现把字符串透传给原生函数 = 未记账的间接 eval）。
 */
function hardenFunction<T extends Function>(wrapped: T): void {
  const controlled = function (this: unknown, ...args: unknown[]) {
    reportRef?.('sandbox-controlled-constructor', { args: args.map(String).slice(0, 2) })
    return undefined
  } as unknown as Record<PropertyKey, unknown>
  Object.defineProperty(wrapped, 'constructor', {
    get: () => controlled,
    configurable: false,
  })
  Object.defineProperty(wrapped, '__proto__', {
    get: () => null,
    configurable: false,
  })
  const desc = Object.getOwnPropertyDescriptor(wrapped, 'prototype')
  if (desc?.configurable) {
    Object.defineProperty(wrapped, 'prototype', {
      get: () => controlled,
      configurable: false,
    })
  }
  // class 声明的 prototype 不可配置，跳过（class 不经 new 外的路径泄漏真实原型）
}

/** hardenFunction 的告警通道（经 installHardenReport 注入，避免签名膨胀） */
let reportRef: ((rule: string, detail: unknown) => void) | null = null
function installHardenReport(report: (rule: string, detail: unknown) => void) {
  reportRef = report
}

/** 受控 Function 构造器（向量 #1/#2 交叉点）：构造器自身被冻结，构造产物默认可记账 */
function controlledConstructor(report: (rule: string, detail: unknown) => void): unknown {
  const fn = function (this: unknown, ...args: string[]) {
    report('sandbox-eval-accounting', { via: 'Function', args: args.map(String).slice(0, 2) })
    return Function(...args)
  }
  hardenFunction(fn)
  return fn
}

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
  installHardenReport(report)
  const container = options.container ?? null
  const tracker = new InjectedNodesTracker(report)
  const docProxy = new DocumentProxy(container, tracker, () => proxy, report)
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

  const sandbox: Sandbox = {
    injectSlot: {},
    injectedNodes: () => tracker.nodesList(),
    modifiedKeys: () => [...modified],
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
        // 记账转发（SuspendScope 冻结接线在 08 号票，ADR-0032）
        const raw = Reflect.get(globalThis, key, globalThis) as (...a: unknown[]) => unknown
        const wrapped = (...args: unknown[]) => raw(...args)
        hardenFunction(wrapped as unknown as Function)
        return wrapped
      }
      if (key === 'XMLHttpRequest' || key === 'WebSocket' || key === 'EventSource') {
        // 向量 #8 过渡实现：记账包装（§3.6 规定唯一链路是 bus.network 注入，07 号票后回收）
        const raw = Reflect.get(globalThis, key, globalThis) as
          | (new (...a: unknown[]) => object)
          | undefined
        if (typeof raw !== 'function') return undefined // 宿主无此能力则如实缺失
        const Wrapped = class extends raw {
          constructor(...args: unknown[]) {
            report(`sandbox-network-${String(key)}`, { args: args.map(String).slice(0, 2) })
            super(...(args as never[]))
          }
        }
        hardenFunction(Wrapped as unknown as Function)
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
        hardenFunction(Wrapped as unknown as Function)
        return Wrapped
      }
      const value = Reflect.get(globalThis, key, globalThis)
      if (typeof value === 'function' && NATIVE_UNBOUND.has(String(key))) {
        const bound = value.bind(globalThis)
        hardenFunction(bound as unknown as Function)
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
