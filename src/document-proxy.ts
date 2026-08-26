/**
 * Document 代理（js-sandbox §3.5）：
 * - DOM 查询 scoped 到应用容器（容器外不可见；无容器时查询面为空并已告警）
 * - head/body 缓存单例**代理**（身份稳定；绝不变异真实节点--多应用共享 head，
 *   直接 defineProperty 会互相踩踏且不可恢复）
 * - currentScript/defaultView 受控（向量 #5）
 * - document.write 禁用
 * - 注入路径全记账（appendChild/insertBefore/append/prepend/replaceChildren/innerHTML/insertAdjacentHTML）
 *   记账在**代理层**完成，真实 DOM 不被改写
 */
import type { InjectedNodesTracker } from './inject-tracker'

type ReportFn = (rule: string, detail: unknown) => void

/** head/body 代理拦截的注入方法集（记账语义在 get trap 内联） */
const INJECT_METHODS = new Set([
  'appendChild',
  'insertBefore',
  'append',
  'prepend',
  'replaceChildren',
])

export class DocumentProxy {
  private _proxy: Document | null = null
  private stableViews = new Map<string, unknown>()

  constructor(
    private container: HTMLElement | null,
    private tracker: InjectedNodesTracker,
    private getSandboxProxy: () => unknown,
    private report: ReportFn,
    /** HTML 净化钩子（security §3.3 真 sanitize）：应用经沙箱 document 的 HTML 写点全过净化 */
    private sanitizeHTML: (html: string) => string = (html) => html.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string),
  ) {}

  get proxy(): Document {
    this._proxy ??= new Proxy(document, {
      get: (target, key, receiver) => {
        switch (key) {
          case 'head':
            return this.stableView('head', target.head)
          case 'body':
            return this.stableView('body', target.body)
          case 'currentScript':
            return this.tracker.currentScript ?? null
          case 'defaultView':
            return this.getSandboxProxy() // 向量 #5：不泄漏真实 window
          case 'write':
          case 'writeln':
            return () => {
              this.report('sandbox-document-write', {})
              throw new Error('document.write is disabled in sandbox')
            }
          case 'createElement':
            return (...args: unknown[]) => {
              const raw = Reflect.get(target, 'createElement', target) as (...a: unknown[]) => HTMLElement
              const el = raw.apply(target, args)
              const sanitize = this.sanitizeHTML
              return new Proxy(el, {
                get(t, prop) {
                  const v = Reflect.get(t, prop, t)
                  return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v
                },
                set(t, prop, value) {
                  if (prop === 'innerHTML' || prop === 'outerHTML') {
                    const desc = Object.getOwnPropertyDescriptor(Element.prototype, prop)!
                    desc.set!.call(t, sanitize(String(value)))
                    return true
                  }
                  return Reflect.set(t, prop, value)
                },
              })
            }
          default:
            break
        }
        if (typeof key === 'string' && DOM_QUERY_KEYS.has(key)) {
          return this.scoped(key)
        }
        return Reflect.get(target, key, receiver)
      },
    })
    return this._proxy
  }

  /**
   * head/body 的稳定单例**代理**（§3.5）：拦截注入路径做记账，其余透传真实节点。
   * 真实节点零改写（destroy 自然干净，无需恢复；多应用互不踩踏）。
   */
  private stableView(
    key: 'head' | 'body',
    real: HTMLHeadElement | HTMLBodyElement,
  ): unknown {
    if (!this.stableViews.has(key)) {
      const tracker = this.tracker
      const lockContainer = this.container as HTMLElement | null // 滚动锁重定向目标（§4.2）
      let bodyStyleView: unknown = null // body.style 缓存单例（身份稳定）
      const record = (nodes: unknown[]) => {
        for (const n of nodes) if (n instanceof Node) tracker.maybeRecord(n)
      }
      const sanitize = this.sanitizeHTML
      const node: unknown = new Proxy(real, {
        get(target, prop, receiver) {
          if (typeof prop === 'string' && INJECT_METHODS.has(prop)) {
            const raw = Reflect.get(target, prop, target) as (...n: unknown[]) => unknown
            return (...args: unknown[]) => {
              record(args)
              return raw.apply(target, args)
            }
          }
          if (prop === 'insertAdjacentHTML') {
            const raw = Reflect.get(target, prop, target) as (pos: never, html: string) => unknown
            return (pos: string, html: string) => {
              const result = raw.call(target, pos as never, sanitize(html))
              tracker.harvest(target as unknown as HTMLElement)
              return result
            }
          }
          if (key === 'body' && prop === 'style') {
            // 滚动锁重定向（style-isolation §4.2）：body.style.overflow 写（属性赋值
            // 与 setProperty 双路径）改容器级（不泄漏到主应用 body）；读镜像容器值
            //（锁检查代码可见真实生效值）；其余读写透传真实节点。视图缓存单例
            //（stableView 语义：document.body.style 身份稳定）
            if (!bodyStyleView) {
              const realStyle = Reflect.get(target, prop, target) as CSSStyleDeclaration
              bodyStyleView = new Proxy(realStyle, {
                get(t, p, r) {
                  if (p === 'overflow' && lockContainer?.style.overflow) return lockContainer.style.overflow
                  if (p === 'setProperty' && lockContainer) {
                    const raw = t.setProperty.bind(t)
                    return (prop2: string, value: string, priority?: string) => {
                      if (prop2 === 'overflow') lockContainer!.style.setProperty('overflow', value, priority)
                      else raw(prop2, value, priority)
                    }
                  }
                  const v = Reflect.get(t, p, r)
                  return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v
                },
                set(t, p, value, r) {
                  if (p === 'overflow' && lockContainer) {
                    lockContainer.style.setProperty('overflow', String(value))
                    return true
                  }
                  return Reflect.set(t, p, value, r)
                },
              })
            }
            return bodyStyleView
          }
          return Reflect.get(target, prop, receiver)
        },
        // innerHTML 赋值语义必须在 set trap 表达（get trap 返回 {get,set} 对象会变成字符串赋值）
        set(target, prop, value, receiver) {
          if (prop === 'innerHTML' || prop === 'outerHTML') {
            const desc = Object.getOwnPropertyDescriptor(Element.prototype, prop)!
            desc.set!.call(target, sanitize(String(value)))
            tracker.harvest(target as unknown as HTMLElement)
            return true
          }
          return Reflect.set(target, prop, value, receiver)
        },
      })
      this.stableViews.set(key, node)
    }
    return this.stableViews.get(key)
  }

  /** scoped 查询：只暴露容器内结果（无容器 = 空查询面） */
  private scoped(key: string): (...args: never[]) => unknown {
    const container = this.container
    switch (key) {
      case 'getElementById':
        return (id: string) => (container ? container.querySelector(`[id="${cssEscape(id)}"]`) : null)
      case 'querySelector':
        return (sel: string) => (container ? container.querySelector(sel) : null)
      case 'querySelectorAll':
        return (sel: string) =>
          container ? container.querySelectorAll(sel) : [].values() as never
      case 'getElementsByClassName':
        return (names: string) => (container ? container.getElementsByClassName(names) : [].values() as never)
      case 'getElementsByTagName':
        return (tag: string) => (container ? container.getElementsByTagName(tag) : [].values() as never)
      default:
        return Reflect.get(document, key, document) as (...args: never[]) => unknown
    }
  }
}

/** DOM 查询键（scoped 语义适用集；与 scoped() 分支一一对应） */
const DOM_QUERY_KEYS = new Set([
  'getElementById',
  'querySelector',
  'querySelectorAll',
  'getElementsByClassName',
  'getElementsByTagName',
])

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"')
}
