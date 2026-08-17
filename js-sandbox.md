# Cordis JS 沙箱方案

## 一、问题分析

### 1.1 微前端中 JS 沙箱的必要性

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| **全局变量污染** | `window.Vue`、`window.React` 互相覆盖 | 高 |
| **全局函数冲突** | `window.$` 被 jQuery 占用，其他库无法使用 | 高 |
| **原型链污染** | `Array.prototype.xxx` 被修改影响所有应用 | 高 |
| **定时器泄漏** | `setInterval` 未在卸载时清理，持续执行 | 中 |
| **事件监听泄漏** | `addEventListener` 未移除，导致内存泄漏 | 中 |
| **eval/Function 污染** | 动态代码执行污染全局作用域 | 中 |

### 1.2 现有沙箱方案的局限性

| 方案 | 优点 | 缺点 |
|------|------|------|
| **iframe 沙箱** | 完全隔离 | 性能差、跨域通信复杂、DOM 操作受限 |
| **Proxy 沙箱** | 性能好、兼容性强 | 无法拦截 `eval`、`with` 语句 |
| **with + eval 沙箱** | 简单直接 | 性能差、无法拦截全局变量 |
| **Web Worker 沙箱** | 完全隔离 | 无法访问 DOM、通信复杂 |

### 1.3 Cordis 理论视角

在 Cordis 理论中，JS 沙箱是 **effect isolation** 的核心机制：
- 全局变量修改 = effect
- 原型链污染 = effect
- 定时器/事件监听 = effect（可逆）

沙箱的目标是让每个应用运行在独立的 **effect context** 中，互不干扰。

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Cordis Runtime（Cordis 运行时）                             │
│  - 统一的沙箱管理入口                                         │
├─────────────────────────────────────────────────────────────┤
│  Sandbox Manager（沙箱管理器）                               │
│  - 沙箱生命周期管理                                           │
│  - 沙箱池化复用                                               │
│  - 沙箱状态追踪                                               │
├─────────────────────────────────────────────────────────────┤
│  Sandbox Layer（沙箱层）                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ Proxy      │ │ Snapshot   │ │ iframe     │              │
│  │ Sandbox    │ │ Sandbox    │ │ Sandbox    │              │
│  │ (推荐)     │ │ (强隔离)   │ │ (完全隔离) │              │
│  └────────────┘ └────────────┘ └────────────┘              │
├─────────────────────────────────────────────────────────────┤
│  Effect Tracker（效应追踪器）                                │
│  - 追踪全局变量修改                                           │
│  - 追踪定时器/事件监听                                        │
│  - 自动清理泄漏                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、Proxy 沙箱（推荐方案）

### 3.1 核心原理

使用 `Proxy` 拦截对 `window` 的访问，将全局变量重定向到沙箱内部的 fakeWindow。

### 3.2 实现代码

```typescript
// @cordis/sandbox/proxy-sandbox
class ProxySandbox {
  private fakeWindow: Record<string, any> = {}
  private proxy: WindowProxy
  private active: boolean = false
  
  constructor(private appId: string) {
    // 创建 Proxy 拦截 window 访问
    this.proxy = new Proxy(this.fakeWindow, {
      get: (target, key) => {
        // 特殊处理 window/self/globalThis
        if (key === 'window' || key === 'self' || key === 'globalThis') {
          return this.proxy
        }
        
        // 只读属性直接返回真实 window
        if (this.isReadonly(key)) {
          return (window as any)[key]
        }
        
        // 优先从 fakeWindow 获取
        if (key in target) {
          return target[key]
        }
        
        // 透传到真实 window
        return (window as any)[key]
      },
      
      set: (target, key, value) => {
        // 拦截 window.xxx = yyy，不污染全局
        target[key as string] = value
        return true
      },
      
      has: (target, key) => {
        // 让 with 语句生效
        return key in target || key in window
      },
      
      deleteProperty: (target, key) => {
        if (key in target) {
          delete target[key as string]
          return true
        }
        return false
      }
    })
  }
  
  // 激活沙箱
  activate() {
    if (this.active) return
    this.active = true
    
    // 记录当前 window 快照（用于恢复）
    this.snapshot = this.takeSnapshot()
  }
  
  // 停用沙箱
  deactivate() {
    if (!this.active) return
    this.active = false
    
    // 清理 fakeWindow 中的动态属性
    this.cleanup()
  }
  
  // 在沙箱中执行代码
  exec(code: string) {
    // 注意：Proxy 无法拦截直接调用的 eval()
    // 此外，严格模式下禁用 with 语句，以下提供替代方案：
    
    // 非严格模式
    // with(this.proxy) { 
    //   const __eval__ = this.fakeWindow.eval || eval; 
    //   (0, __eval__)(code);
    // }
    
    // 严格模式替代方案
    const fn = new Function('window', 'self', 'globalThis', code);
    fn.call(this.proxy, this.proxy, this.proxy, this.proxy);
  }
  
  // 判断是否为只读属性
  private isReadonly(key: PropertyKey): boolean {
    const readonlyKeys = [
      'location', 'history', 'document', 'navigator',
      'console'
    ]
    return readonlyKeys.includes(key as string)
  }
  
  // 清理沙箱状态
  private cleanup() {
    // 清理所有定时器
    this.trackedTimers.forEach(id => {
      clearTimeout(id)
      clearInterval(id)
    })
    this.trackedTimers.clear()
    
    // 移除所有事件监听
    this.trackedListeners.forEach(({ type, listener, options }) => {
      window.removeEventListener(type, listener, options)
    })
    this.trackedListeners.clear()
    
    // 清空 fakeWindow
    Object.keys(this.fakeWindow).forEach(key => {
      delete this.fakeWindow[key]
    })
  }
  
  // 追踪的定时器
  private trackedTimers: Set<number> = new Set()
  
  // 追踪的事件监听器
  private trackedListeners: Map<string, {
    type: string
    listener: EventListener
    options?: boolean | AddEventListenerOptions
  }> = new Map()
}
```

### 3.3 增强：拦截定时器和事件监听

```typescript
// 拦截 setTimeout/setInterval
const originalSetTimeout = window.setTimeout
const originalSetInterval = window.setInterval

// 在沙箱中重写
this.proxy.setTimeout = (fn: Function, delay: number, ...args: any[]) => {
  const id = originalSetTimeout(fn, delay, ...args)
  this.trackedTimers.add(id as number)
  return id
}

this.proxy.setInterval = (fn: Function, delay: number, ...args: any[]) => {
  const id = originalSetInterval(fn, delay, ...args)
  this.trackedTimers.add(id as number)
  return id
}

// 拦截 addEventListener
const originalAddEventListener = window.addEventListener
const originalRemoveEventListener = window.removeEventListener

this.proxy.addEventListener = (
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
) => {
  originalAddEventListener.call(window, type, listener, options)
  const key = `${type}_${listener.toString()}`
  this.trackedListeners.set(key, { type, listener, options })
}

this.proxy.removeEventListener = (
  type: string,
  listener: EventListener,
  options?: boolean | AddEventListenerOptions
) => {
  originalRemoveEventListener.call(window, type, listener, options)
  const key = `${type}_${listener.toString()}`
  this.trackedListeners.delete(key)
}
```

### 3.4 增强：拦截 eval 和 Function

```typescript
// 拦截 eval
this.proxy.eval = (code: string) => {
  // 在沙箱上下文中执行 eval
  const fn = new Function('window', `with(window) { ${code} }`)
  return fn.call(this.proxy, this.proxy)
}

// 拦截 Function 构造函数
this.proxy.Function = function(...args: string[]) {
  const body = args.pop() || ''
  const params = args.join(',')
  const fn = new Function('window', `with(window) { return function(${params}) { ${body} } }`)
  return fn.call(this.proxy, this.proxy)
}
```

### 3.5 增强：拦截原型链污染

```typescript
// 拦截对 prototype 的修改
const originalObjectDefineProperty = Object.defineProperty

this.proxy.Object = {
  ...Object,
  defineProperty: (obj: any, key: string, descriptor: PropertyDescriptor) => {
    // 检测是否在修改全局对象的 prototype
    if (obj === Array.prototype || obj === Object.prototype || obj === String.prototype) {
      console.warn(`[Cordis Sandbox] 检测到原型链污染: ${obj.constructor.name}.prototype.${key}`)
      // 可以选择阻止或记录
    }
    return originalObjectDefineProperty(obj, key, descriptor)
  }
}
```

### 3.6 Dynamic Import 拦截

`import()` 是语言级别的特性，`Proxy` 无法直接拦截对它的调用，这会导致沙箱逃逸。
当前的解决方案是在构建时通过插件进行代码转换：

```typescript
// 构建时转换 dynamic import
// import('./module.js') → __cordis_import__('./module.js', appId)
```

---

## 四、Snapshot 沙箱（强隔离方案）

### 4.1 核心原理

在沙箱激活前记录 window 快照，激活后允许修改，停用后恢复快照。

### 4.2 实现代码

```typescript
// @cordis/sandbox/snapshot-sandbox
class SnapshotSandbox {
  private windowSnapshot: Record<string, any> = {}
  private modifiedProps: Set<string> = new Set()
  private active: boolean = false
  
  constructor(private appId: string) {}
  
  // 激活沙箱
  activate() {
    if (this.active) return
    this.active = true
    
    // 记录当前 window 快照
    this.windowSnapshot = {}
    for (const key in window) {
      if (window.hasOwnProperty(key)) {
        this.windowSnapshot[key] = (window as any)[key]
      }
    }
  }
  
  // 停用沙箱
  deactivate() {
    if (!this.active) return
    this.active = false
    
    // 恢复快照
    for (const key in this.windowSnapshot) {
      if ((window as any)[key] !== this.windowSnapshot[key]) {
        // 记录被修改的属性
        this.modifiedProps.add(key)
        // 恢复原值
        (window as any)[key] = this.windowSnapshot[key]
      }
    }
    
    // 删除新增的属性
    for (const key in window) {
      if (!this.windowSnapshot.hasOwnProperty(key)) {
        delete (window as any)[key]
      }
    }
  }
  
  // 获取被修改的属性列表
  getModifiedProps(): string[] {
    return Array.from(this.modifiedProps)
  }
}
```

### 4.3 优缺点

| 优点 | 缺点 |
|------|------|
| 实现简单 | 性能较差（需要遍历所有 window 属性） |
| 兼容性强（不支持 Proxy 的环境） | 无法拦截动态添加的属性 |
| 强隔离 | 多实例并存时会互相影响 |

---

## 五、iframe 沙箱（完全隔离方案）

### 5.1 核心原理

使用 iframe 创建完全隔离的 JS 执行环境。

### 5.2 实现代码

```typescript
// @cordis/sandbox/iframe-sandbox
class IframeSandbox {
  private iframe: HTMLIFrameElement
  private iframeWindow: Window
  private iframeDocument: Document
  
  constructor(private appId: string) {
    // 创建 iframe
    this.iframe = document.createElement('iframe')
    this.iframe.style.display = 'none'
    this.iframe.setAttribute('data-cordis-sandbox', appId)
    
    // 设置 srcdoc 避免跨域问题
    this.iframe.srcdoc = '<html><body></body></html>'
    
    document.body.appendChild(this.iframe)
    
    this.iframeWindow = this.iframe.contentWindow!
    this.iframeDocument = this.iframe.contentDocument!
  }
  
  // 在 iframe 中执行代码
  exec(code: string) {
    const script = this.iframeDocument.createElement('script')
    script.textContent = code
    this.iframeDocument.body.appendChild(script)
    script.remove()
  }
  
  // 在 iframe 中创建 DOM 元素
  createElement(tag: string): HTMLElement {
    return this.iframeDocument.createElement(tag)
  }
  
  // 销毁沙箱
  destroy() {
    this.iframe.remove()
  }
}
```

### 5.3 优缺点

| 优点 | 缺点 |
|------|------|
| 完全隔离 | 性能差（需要创建 iframe） |
| 无兼容性问题 | 跨 iframe 通信复杂 |
| 可以隔离 DOM | 无法直接操作主页面 DOM |

---

## 六、沙箱管理器

### 6.1 统一管理入口

```typescript
// @cordis/sandbox/manager
class SandboxManager {
  private sandboxes: Map<string, Sandbox> = new Map()
  private pool: Map<string, Sandbox[]> = new Map()
  
  // 创建沙箱
  createSandbox(appId: string, type: 'proxy' | 'snapshot' | 'iframe' = 'proxy'): Sandbox {
    let sandbox: Sandbox
    
    switch (type) {
      case 'proxy':
        sandbox = new ProxySandbox(appId)
        break
      case 'snapshot':
        sandbox = new SnapshotSandbox(appId)
        break
      case 'iframe':
        sandbox = new IframeSandbox(appId)
        break
      default:
        throw new Error(`Unknown sandbox type: ${type}`)
    }
    
    this.sandboxes.set(appId, sandbox)
    return sandbox
  }
  
  // 获取沙箱
  getSandbox(appId: string): Sandbox | undefined {
    return this.sandboxes.get(appId)
  }
  
  // 销毁沙箱
  destroySandbox(appId: string) {
    const sandbox = this.sandboxes.get(appId)
    if (sandbox) {
      sandbox.deactivate()
      sandbox.destroy?.()
      this.sandboxes.delete(appId)
    }
  }
  
  // 沙箱池化（复用相同技术栈的沙箱）
  acquireFromPool(tech: string, appId: string): Sandbox {
    const pool = this.pool.get(tech) || []
    
    if (pool.length > 0) {
      // 复用现有沙箱
      const sandbox = pool.pop()!
      sandbox.appId = appId
      this.sandboxes.set(appId, sandbox)
      return sandbox
    }
    
    // 创建新沙箱
    const sandbox = this.createSandbox(appId)
    return sandbox
  }
  
  // 归还沙箱到池
  releaseToPool(tech: string, appId: string) {
    const sandbox = this.sandboxes.get(appId)
    if (sandbox) {
      sandbox.deactivate()
      sandbox.cleanup?.()
      
      if (!this.pool.has(tech)) {
        this.pool.set(tech, [])
      }
      this.pool.get(tech)!.push(sandbox)
      this.sandboxes.delete(appId)
    }
  }
}
```

### 6.2 自动选择沙箱类型

```typescript
// 根据场景自动选择沙箱类型
function chooseSandboxType(config: {
  needFullIsolation: boolean
  supportProxy: boolean
  performance: 'high' | 'medium' | 'low'
}): 'proxy' | 'snapshot' | 'iframe' {
  if (config.needFullIsolation) {
    return 'iframe'  // 需要完全隔离
  }
  
  if (!config.supportProxy) {
    return 'snapshot'  // 不支持 Proxy，使用快照沙箱
  }
  
  if (config.performance === 'high') {
    return 'proxy'  // 高性能场景使用 Proxy 沙箱
  }
  
  return 'proxy'  // 默认使用 Proxy 沙箱
}
```

---

## 七、效应追踪器（Effect Tracker）

### 7.1 追踪全局变量修改

```typescript
// @cordis/sandbox/effect-tracker
class EffectTracker {
  private modifications: Map<string, { oldValue: any, newValue: any }> = new Map()
  
  // 记录变量修改（应直接在 Proxy 的 set trap 中被调用）
  track(key: string, oldValue: any, newValue: any) {
    this.modifications.set(key, { oldValue, newValue })
  }

  /* 
   注意：EffectTracker 不应该使用 Object.defineProperty，
   因为那只能拦截特定属性名。正确的姿势是在 ProxySandbox 的 set 拦截器中集成：
   
   set: (target, key, value) => {
     if (this.tracker) {
       this.tracker.track(key as string, target[key as string], value)
     }
     target[key as string] = value
     return true
   }
  */
  
  // 获取所有修改
  getModifications(): Map<string, { oldValue: any, newValue: any }> {
    return this.modifications
  }
  
  // 生成修改报告
  generateReport(): string {
    const lines = ['=== Effect Tracker Report ===']
    
    this.modifications.forEach(({ oldValue, newValue }, key) => {
      lines.push(`${key}: ${oldValue} -> ${newValue}`)
    })
    
    return lines.join('\n')
  }
}
```

### 7.2 自动清理泄漏

```typescript
// 自动清理未移除的事件监听器
class LeakDetector {
  private trackedListeners: Map<string, Set<EventListener>> = new Map()
  
  trackListener(appId: string, type: string, listener: EventListener) {
    if (!this.trackedListeners.has(appId)) {
      this.trackedListeners.set(appId, new Set())
    }
    this.trackedListeners.get(appId)!.add(listener)
  }
  
  untrackListener(appId: string, listener: EventListener) {
    const listeners = this.trackedListeners.get(appId)
    if (listeners) {
      listeners.delete(listener)
    }
  }
  
  // 检测泄漏
  detectLeaks(): Map<string, number> {
    const leaks = new Map<string, number>()
    
    this.trackedListeners.forEach((listeners, appId) => {
      if (listeners.size > 0) {
        leaks.set(appId, listeners.size)
      }
    })
    
    return leaks
  }
  
  // 自动清理
  autoCleanup(appId: string) {
    const listeners = this.trackedListeners.get(appId)
    if (listeners) {
      listeners.forEach(listener => {
        window.removeEventListener('*', listener)  // 清理所有事件
      })
      listeners.clear()
    }
  }
}
```

---

## 八、沙箱配置

### 8.1 配置文件

```json
// cordis.sandbox.json
{
  "sandbox": {
    "type": "proxy",
    "strict": true,
    "trackEffects": true,
    "autoCleanup": true
  },
  "whitelist": [
    "console",
    "setTimeout",
    "setInterval"
  ],
  "blacklist": [
    "eval",
    "Function"
  ]
}
```

### 8.2 配置说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'proxy' \| 'snapshot' \| 'iframe'` | 沙箱类型 |
| `strict` | boolean | 是否启用严格模式（拦截 eval/Function） |
| `trackEffects` | boolean | 是否追踪效应（全局变量修改） |
| `autoCleanup` | boolean | 是否自动清理泄漏 |
| `whitelist` | string[] | 允许透传到真实 window 的属性 |
| `blacklist` | string[] | 禁止访问的属性 |

---

## 九、与现有方案对比

| 维度 | qiankun | wujia | micro-app | Cordis |
|------|---------|-------|-----------|--------|
| **沙箱类型** | Proxy + Snapshot | iframe | Shadow DOM | Proxy（推荐） |
| **隔离强度** | 中 | 强 | 中 | 中 |
| **性能** | 优 | 低 | 中 | 优 |
| **兼容性** | 优 | 优 | 优 | 优 |
| **效应追踪** | 无 | 无 | 无 | 有 |
| **自动清理** | 无 | 有（iframe 销毁） | 无 | 有 |
| **沙箱池化** | 无 | 无 | 无 | 有 |

---

## 十、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | Proxy 沙箱 | 基础功能，覆盖大多数场景 |
| P0 | 定时器/事件监听追踪 | 防止泄漏 |
| P1 | Snapshot 沙箱 | 兼容不支持 Proxy 的环境 |
| P1 | 效应追踪器 | 调试和优化 |
| P2 | iframe 沙箱 | 完全隔离场景 |
| P2 | 沙箱池化 | 性能优化 |
| P3 | 自动清理泄漏 | 长期运行场景 |
| P3 | 原型链污染检测 | 强隔离场景 |
