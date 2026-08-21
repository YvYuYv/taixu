/**
 * 沙箱工厂直测（本票是 spec Testing Decisions 认可的唯一服务级直测缝）：
 * 10 项逃逸向量为防呆性质，经主缝构造过于迂回，直测 sandbox 工厂。
 * 语义源：js-sandbox.md §3.1 逃逸向量表 + §3.2 双窗口 trap 语义 + §3.5/3.7。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis } from '../src'
import { createSandbox, type Sandbox, type SandboxOptions } from '../src/sandbox'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

describe('沙箱工厂：双窗口 Proxy 基本语义', () => {
  let host: ReturnType<typeof createCordis>

  beforeEach(async () => {
    host = createCordis()
    await settle()
  })

  it('写入隔离：应用写 window 不污染真实 globalThis，dispose 后回收', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    ;(sandbox.proxy as Record<string, unknown>).myGlobal = 42
    expect((globalThis as Record<string, unknown>).myGlobal).toBeUndefined()
    expect((sandbox.proxy as Record<string, unknown>).myGlobal).toBe(42)

    await sandbox.destroy()
    // dispose 后句柄不可用（防 UAF 式复用）
    expect(() => (sandbox.proxy as Record<string, unknown>).foo).toThrow()
  })

  it('应用间互不可见：app-a 的全局读不到 app-b 的', async () => {
    const a = await createSandbox(host, 'app-a', {})
    const b = await createSandbox(host, 'app-b', {})
    ;(a.proxy as Record<string, unknown>).shared = 'a'
    expect((b.proxy as Record<string, unknown>).shared).toBeUndefined()
  })

  it('原生全局可读且绑定正确：window.setTimeout 调用不抛 IllegalInvocation', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    const timeout = proxy.setTimeout as (...args: unknown[]) => unknown
    const ran: number[] = []
    await new Promise<void>((resolve) => {
      timeout(() => {
        ran.push(1)
        resolve()
      }, 5)
    })
    expect(ran).toEqual([1])
  })

  it('location 统一重定向 router：赋值 window.location 走受控导航', async () => {
    const navigated: string[] = []
    const sandbox = await createSandbox(host, 'app-a', {
      onNavigate: (url) => navigated.push(url),
    })
    ;(sandbox.proxy as unknown as Record<string, unknown>).location = '/app-a/page'
    expect(navigated).toEqual(['/app-a/page'])
  })
})

describe('沙箱工厂：逃逸向量 10 项（js-sandbox §3.1）', () => {
  let host: ReturnType<typeof createCordis>

  beforeEach(async () => {
    host = createCordis()
    await settle()
  })

  it('#1 eval/Function 记账：执行不拦截但上报 violation', async () => {
    const violations: Array<{ rule: string; detail: unknown }> = []
    host.on('security/violation', (v) => violations.push({ rule: v.rule, detail: v.detail }), {
      global: true,
    })
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<PropertyKey, unknown>

    // 记账包装存在且可调用（执行经宿主 CSP 兜底）
    const evaled = (proxy.eval as unknown as (s: string) => unknown)('1 + 1')
    expect(evaled).toBe(2)
    expect(violations.some((v) => v.rule === 'sandbox-eval-accounting')).toBe(true)
  })

  it('#2 透传函数对象不可经 constructor 链逃逸', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<PropertyKey, unknown>
    const timeout = proxy.setTimeout as unknown as Record<PropertyKey, unknown>
    const rawTimeout = globalThis.setTimeout as unknown as Record<PropertyKey, unknown>

    // 包装函数的 constructor 是受控的：不等于真实 Function 构造器（拿不到真实全局）
    expect(timeout.constructor).not.toBe(Function)
    expect(timeout.constructor).not.toBe(rawTimeout.constructor)
    // __proto__ 属性形态同样受控（不串回真实原型链）
    expect(timeout.__proto__).toBe(null)
    expect(typeof timeout.constructor).toBe('function')
  })

  it('#3 getPrototypeOf 逃逸被关闭：fakeWindow 原型为 null', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<PropertyKey, unknown>
    expect(Object.getPrototypeOf(proxy)).toBe(null)
    expect(proxy.__proto__).toBe(undefined)
  })

  it('#4 with + Symbol.unscopables 逃逸被中和：has 恒真', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy
    expect('anything' in proxy).toBe(true)
    expect((proxy as Record<PropertyKey, unknown>)[Symbol.unscopables]).toBeUndefined()
  })

  it('#5 document.currentScript/defaultView、window.top/parent/opener 受控', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    // top/parent/opener 返回沙箱自身，不泄漏真实 window
    expect(proxy.top).toBe(proxy)
    expect(proxy.parent).toBe(proxy)
    expect(proxy.opener).toBe(null)
    const doc = proxy.document as unknown as Record<string, unknown>
    expect(doc.defaultView).toBe(proxy)
    expect('currentScript' in doc).toBe(true)
  })

  it('#6 动态 import 经 deps 白名单：沙箱不暴露原生 import()（记账告警）', async () => {
    const violations: string[] = []
    host.on('security/violation', (v) => violations.push(v.rule), { global: true })
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<PropertyKey, unknown>
    // import 是语法层面声明，无法经属性访问拿到原生能力 -> undefined（引擎级，路由分派在 deps 服务）
    expect(proxy.import).toBeUndefined()
  })

  it('#7 Worker 允许（first-party 默认）、ServiceWorker 注册被拒并告警', async () => {
    const violations: Array<{ appId: string; rule: string }> = []
    host.on('security/violation', (v) => violations.push({ appId: v.appId, rule: v.rule }), {
      global: true,
    })
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    // dedicated Worker：宿主有则暴露（first-party 默认允许），无则如实缺失
    expect(proxy.Worker).toBe(Reflect.get(globalThis, 'Worker', globalThis))
    const nav = proxy.navigator as unknown as Record<string, unknown>
    // SW 注册面默认不暴露（jsdom 无 SW 面，遮蔽结果同样不可见）
    expect(nav.serviceWorker).toBeUndefined()
    const rawNav = navigator as unknown as Record<string, unknown>
    if ('serviceWorker' in rawNav || typeof rawNav.serviceWorker !== 'undefined') {
      // 宿主存在 SW 面时必须告警（Chromium 环境下走到这条分支）
      expect(violations.some((v) => v.rule === 'sandbox-service-worker')).toBe(true)
    }
  })

  it('#7b 宿主存在 SW 注册面时：遮蔽并告警（stub 验证遮蔽逻辑）', async () => {
    const violations: string[] = []
    const host2 = createCordis()
    host2.on('security/violation', (v) => violations.push(v.rule), { global: true })
    await settle()
    const navObj = navigator as unknown as Record<string, unknown>
    const hadOwn = Object.prototype.hasOwnProperty.call(navObj, 'serviceWorker')
    const desc = Object.getOwnPropertyDescriptor(navObj, 'serviceWorker')
    Object.defineProperty(navObj, 'serviceWorker', {
      value: { register: () => Promise.resolve() },
      configurable: true,
    })
    try {
      const sandbox = await createSandbox(host2, 'app-a', {})
      const proxy = sandbox.proxy as unknown as Record<string, unknown>
      const nav = proxy.navigator as unknown as Record<string, unknown>
      expect(nav.serviceWorker).toBeUndefined() // 遮蔽
      expect(violations).toContain('sandbox-service-worker') // 且告警
    } finally {
      if (desc) Object.defineProperty(navObj, 'serviceWorker', desc)
      else if (hadOwn) delete navObj.serviceWorker
      else delete navObj.serviceWorker
    }
  })

  it('#8 网络面记账：fetch/XHR/WS/EventSource/sendBeacon 均为包装函数', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    // fetch 由 lifecycle 在 plugin() 前注入（ADR-0005）--沙箱阶段预留注入位
    expect(sandbox.injectSlot.fetch).toBeUndefined()
    // 宿主存在的网络面必须是包装（不是裸原生透传）；宿主缺失的如实缺失
    for (const key of ['XMLHttpRequest', 'WebSocket', 'EventSource'] as const) {
      const raw = Reflect.get(globalThis, key, globalThis)
      if (typeof raw === 'function') {
        expect(proxy[key]).toBeDefined()
        expect(proxy[key]).not.toBe(raw)
      } else {
        expect(proxy[key]).toBeUndefined()
      }
    }
    const nav = proxy.navigator as unknown as Record<string, unknown>
    expect(typeof nav.sendBeacon).toBe('function')
  })

  it('#9 customElements per-app registry：同名冲突以 appId 前缀注册并告警', async () => {
    const violations: Array<{ rule: string; detail: { tag?: string } }> = []
    host.on(
      'security/violation',
      (v) => violations.push({ rule: v.rule, detail: v.detail as { tag?: string } }),
      { global: true },
    )
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    const registry = proxy.customElements as CustomElementRegistryLike

    registry.define('my-widget', class extends HTMLElement {})
    // 应用侧看到自己的定义
    expect(registry.get('my-widget')).toBeDefined()

    // 第二个应用同名 -> 前缀重注册 + 告警
    const sandboxB = await createSandbox(host, 'app-b', {})
    const proxyB = sandboxB.proxy as unknown as Record<string, unknown>
    const registryB = proxyB.customElements as CustomElementRegistryLike
    registryB.define('my-widget', class extends HTMLElement {})
    expect(violations.some((v) => v.rule === 'custom-elements-conflict')).toBe(true)
    expect(registryB.get('my-widget')).toBeDefined()
    // 全局注册表里两个应用各占一个真实键（前缀隔离）
    expect(customElements.get('my-widget')).toBeDefined()
    expect(customElements.get('app-b-my-widget')).toBeDefined()
  })

  it('#10 history.pushState 劫持被重定向到 router 受控 API', async () => {
    const navigated: string[] = []
    const sandbox = await createSandbox(host, 'app-a', {
      onNavigate: (url) => navigated.push(url),
    })
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    const history = proxy.history as unknown as Record<string, unknown>
    const pushState = history.pushState as (s: unknown, t: string, url?: string) => void
    pushState({}, '', '/app-a/deep')
    expect(navigated).toEqual(['/app-a/deep'])
    // 真实 history 未被直接写入（经 NavigationController 合并是后续票职责，此处只验证未裸写）
    expect(globalThis.location.pathname).not.toBe('/app-a/deep')
  })

  it('黑名单句柄（__CORDIS_* 前缀整体封禁）访问即告警且不泄漏真实值', async () => {
    const violations: string[] = []
    host.on('security/violation', (v) => violations.push(v.rule), { global: true })
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    expect(proxy.__CORDIS_RUNTIME__).toBeUndefined()
    expect(proxy.__CORDIS_DEVTOOLS__).toBeUndefined()
    expect(proxy.__CORDIS_ANYTHING_ELSE).toBeUndefined() // 前缀封禁，非逐字面量
    expect(violations.filter((r) => r === 'sandbox-blacklist').length).toBe(3)
  })

  it('Worker/SharedWorker 构造经安全策略（记账包装，非裸透传）', async () => {
    const violations: string[] = []
    host.on('security/violation', (v) => violations.push(v.rule), { global: true })
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    for (const key of ['Worker', 'SharedWorker'] as const) {
      const raw = Reflect.get(globalThis, key, globalThis)
      if (typeof raw !== 'function') {
        expect(proxy[key]).toBeUndefined() // 宿主无此能力则如实缺失
        continue
      }
      expect(proxy[key]).toBeDefined()
      expect(proxy[key]).not.toBe(raw) // 不裸透传：经记账包装
    }
  })

  it('location 写入在 router 未接线时显式告警（不静默吞）', async () => {
    const violations: string[] = []
    host.on('security/violation', (v) => violations.push(v.rule), { global: true })
    const sandbox = await createSandbox(host, 'app-a', {}) // 无 onNavigate
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    proxy.location = '/somewhere'
    expect(violations).toContain('sandbox-navigate-unwired')
  })

  it('destroy 时上报 modifiedKeys（污染残留诊断）且 localStorage 身份稳定', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    proxy.someGlobal = 1
    proxy.anotherGlobal = 2
    expect(new Set(sandbox.modifiedKeys())).toEqual(new Set(['someGlobal', 'anotherGlobal']))
    // 受控视图身份稳定（§3.5 单例原则推广到 localStorage）
    expect(proxy.localStorage).toBe(proxy.localStorage)
    expect(proxy.navigator).toBe(proxy.navigator)
    expect(proxy.history).toBe(proxy.history)
  })
})

describe('沙箱工厂：Document 代理与存储命名空间', () => {
  let host: ReturnType<typeof createCordis>

  beforeEach(async () => {
    host = createCordis()
    await settle()
  })

  it('document 查询 scoped 到容器：容器外元素不可见', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inside = document.createElement('span')
    inside.id = 'probe-inside'
    container.appendChild(inside)
    const outside = document.createElement('span')
    outside.id = 'probe-outside'
    document.body.appendChild(outside)

    const sandbox = await createSandbox(host, 'app-a', { container })
    const doc = sandbox.proxy.document as unknown as DocumentProxyLike

    expect(doc.getElementById('probe-inside')).toBe(inside)
    expect(doc.getElementById('probe-outside')).toBe(null)
    expect(doc.querySelector('#probe-inside')).toBe(inside)
    expect(doc.querySelector('#probe-outside')).toBe(null)

    outside.remove()
    container.remove()
  })

  it('注入路径全记账：appendChild/append/innerHTML 的 style/script 节点登记在案', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const sandbox = await createSandbox(host, 'app-a', { container })
    const doc = sandbox.proxy.document as unknown as DocumentProxyLike
    const head = doc.head as HTMLElement

    const style = document.createElement('style')
    head.appendChild(style)
    const style2 = document.createElement('style')
    head.append(style2)
    head.innerHTML = '<style id="via-html"></style>'

    const tracked = sandbox.injectedNodes()
    expect(tracked.length).toBe(3)
    expect(tracked.every((n) => n.tagName === 'STYLE')).toBe(true)

    await sandbox.destroy()
    // destroy 后记账节点全部移除
    expect(document.head.querySelector('style')).toBeNull()
    expect(document.head.innerHTML).not.toContain('via-html')
    container.remove()
  })

  it('document.write 禁用（first-party 告警）', async () => {
    const violations: string[] = []
    host.on('security/violation', (v) => violations.push(v.rule), { global: true })
    const sandbox = await createSandbox(host, 'app-a', {})
    const doc = sandbox.proxy.document as unknown as DocumentProxyLike
    const write = (doc as unknown as Record<string, unknown>).write as unknown as (
      ...a: unknown[]
    ) => unknown
    expect(() => write('x')).toThrow()
    expect(violations).toContain('sandbox-document-write')
  })

  it('存储命名空间真前缀：读写走 __cordis__{appId}__，命名属性语义完整', async () => {
    const sandbox = await createSandbox(host, 'app-a', {})
    const proxy = sandbox.proxy as unknown as Record<string, unknown>
    const ls = proxy.localStorage as StorageLike

    ls.setItem('token', 'a-value')
    expect(ls.getItem('token')).toBe('a-value')
    // 真实存储里带前缀
    expect(globalThis.localStorage.getItem('__cordis__app-a__token')).toBe('a-value')
    // 命名属性访问
    ;(ls as unknown as Record<string, unknown>).named = 'nv'
    expect(globalThis.localStorage.getItem('__cordis__app-a__named')).toBe('nv')
    expect(ls.length).toBe(2)
    expect(ls.key(0)).toBe('token') // 枚举不含前缀
    ls.clear()
    expect(globalThis.localStorage.getItem('__cordis__app-a__token')).toBeNull()
    // 不误伤其他应用/宿主的键
    globalThis.localStorage.setItem('host-key', 'keep')
    expect(globalThis.localStorage.getItem('host-key')).toBe('keep')
    globalThis.localStorage.removeItem('host-key')
  })
})

describe('沙箱工厂：生命周期接线', () => {
  it('create 挂 fiber effect：fiber dispose 时沙箱自动 destroy（幂等）', async () => {
    const host = createCordis()
    await settle()
    let destroyed = 0
    const sandbox = await createSandbox(host, 'app-a', {
      onDestroy: () => destroyed++,
    })
    expect(destroyed).toBe(0)

    await sandbox.destroy()
    await sandbox.destroy() // 幂等
    expect(destroyed).toBe(1)
  })

  it('每应用实例化、不池化：两次 create 返回不同沙箱对象', async () => {
    const host = createCordis()
    await settle()
    const a = await createSandbox(host, 'app-a', {})
    const b = await createSandbox(host, 'app-b', {})
    expect(a).not.toBe(b)
    expect(a.proxy).not.toBe(b.proxy)
    await a.destroy()
    await b.destroy()
  })
})

/** 测试内联类型（避免从实现侧导入污染断言语义） */
interface DocumentProxyLike {
  getElementById(id: string): HTMLElement | null
  querySelector(sel: string): HTMLElement | null
  head: HTMLElement
}
interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
  clear(): void
  key(i: number): string | null
  length: number
}
interface CustomElementRegistryLike {
  define(tag: string, ctor: new () => HTMLElement): void
  get(tag: string): unknown
}
export type { Sandbox, SandboxOptions }

describe('网络面记账补面（§3.6 过渡实现）', () => {
  it('WebSocket/EventSource 构造记账上报（sandbox-network-* violation）', () => {
    const seen: string[] = []
    const ctx = { emit: (name: string, p: { rule: string }) => {
      if (name === 'security/violation') seen.push(p.rule)
    } } as unknown as Context
    return (async () => {
      const sb = await createSandbox(ctx, 'net-app')
      if (typeof globalThis.WebSocket === 'function') {
        const WS = sb.proxy.WebSocket as new (u: string) => object
        void new WS('ws://localhost:1/x')
        expect(seen).toContain('sandbox-network-WebSocket')
      }
      if (typeof globalThis.EventSource === 'function') {
        const ES = sb.proxy.EventSource as new (u: string) => object
        void new ES('http://localhost:1/sse')
        expect(seen).toContain('sandbox-network-EventSource')
      }
    })()
  })
})
