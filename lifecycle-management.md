# Cordis 生命周期管理方案

## 一、问题分析

### 1.1 微前端中生命周期管理的挑战

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| **应用加载顺序** | 多个子应用同时加载，资源竞争 | 高 |
| **应用切换状态丢失** | 切换应用时，原应用状态未保存 | 高 |
| **资源释放不完整** | 应用卸载时，定时器/事件监听未清理 | 中 |
| **保活机制复杂** | 需要在应用切换时保持某些应用活跃 | 中 |
| **错误恢复困难** | 应用加载失败时，无法优雅降级 | 高 |

### 1.2 Cordis 理论视角

在 Cordis 理论中，生命周期管理是 **effect lifecycle** 的核心：
- **微应用即插件 (App as Plugin)**：每个子应用作为一个完整的 Cordis 插件，通过 `ctx.plugin()` 或 `ctx.fork()` 挂载，产生一个独立的 Fork Context (子上下文)。
- **依赖注入与自动激活 (DI & Fiber)**：应用声明其依赖项（如 `inject: ['router', 'state', 'auth']`），Cordis 原生的 Fiber 引擎会自动处理依赖等待 (PENDING) 和就绪激活 (ACTIVE)。
- **级联清理 (Cascading Cleanup)**：应用卸载时只需调用 `forkCtx.dispose()`，即可自动回收通过该子上下文注册的所有 `ctx.effect()`、事件监听器和定时器。
- **效应可逆性**：每个生命周期阶段（加载、激活）都有对应的逆操作，确保资源安全释放。

---

## 二、生命周期状态机

### 2.1 状态定义

```
┌─────────┐
│ Created │  应用配置已创建，但未加载
└────┬────┘
     │ load()
     ▼
┌─────────┐
│Loading  │  正在加载应用资源
└────┬────┘
     │ loaded
     ▼
┌─────────┐
│ Loaded  │  资源已加载，但未激活
└────┬────┘
     │ activate()
     ▼
┌─────────┐
│ Active  │  应用正在运行
└────┬────┘
     │ deactivate()
     ▼
┌──────────────┐
│ Deactivated  │  应用已停用，但状态保留
└────┬─────────┘
     │ destroy()
     ▼
┌───────────┐
│ Destroyed │  应用已销毁，资源已释放
└───────────┘
```

### 2.2 状态转换规则

| 当前状态 | 允许的操作 | 下一状态 |
|----------|------------|----------|
| Created | load() | Loading |
| Loading | loaded / error | Loaded / Error |
| Loaded | activate() / destroy() | Active / Destroyed |
| Active | deactivate() / destroy() | Deactivated / Destroyed |
| Deactivated | activate() / destroy() | Active / Destroyed |
| Destroyed | - | - |
| Error | retry() / destroy() | Loading / Destroyed |

---

## 三、生命周期管理器

### 3.1 核心 API

```typescript
// @cordis/lifecycle
interface AppLifecycle {
  // 状态查询
  getState(): AppState
  
  // 生命周期钩子
  onCreated?(context: AppContext): void | Promise<void>
  onLoading?(context: AppContext): void | Promise<void>
  onLoaded?(context: AppContext): void | Promise<void>
  onActivated?(context: AppContext): void | Promise<void>
  onDeactivated?(context: AppContext): void | Promise<void>
  onDestroyed?(context: AppContext): void | Promise<void>
  onError?(error: Error, context: AppContext): void | Promise<void>
}

interface LifecycleManager {
  // 加载应用（支持 AbortSignal 控制竞态）
  load(appId: string, config: AppConfig, signal?: AbortSignal): Promise<void>
  
  // 激活应用（支持 AbortSignal 控制竞态）
  activate(appId: string, signal?: AbortSignal): Promise<void>
  
  // 停用应用
  deactivate(appId: string): Promise<void>
  
  // 销毁应用
  destroy(appId: string): Promise<void>
  
  // 获取应用状态
  getAppState(appId: string): AppState
}
```

### 3.2 实现代码

```typescript
// @cordis/lifecycle/manager
import { Context, Service, ForkScope } from 'cordis'

interface AppInstance {
  id: string
  state: AppState
  context: Context
  fork?: ForkScope
  module?: any
}

class CordisLifecycleManager extends Service implements LifecycleManager {
  static inject = ['sandbox', 'state', 'router']
  private apps: Map<string, AppInstance> = new Map()
  private transitionLocks = new Map<string, Promise<void>>()
  private abortControllers = new Map<string, AbortController>()
  
  constructor(ctx: Context) {
    super(ctx, 'lifecycle', true)
  }

  private createAbortSignal(appId: string): AbortSignal {
    if (this.abortControllers.has(appId)) {
      this.abortControllers.get(appId)!.abort('Cancelled by new lifecycle request')
    }
    const controller = new AbortController()
    this.abortControllers.set(appId, controller)
    return controller.signal
  }

  private async withLock(appId: string, fn: () => Promise<void>) {
    while (this.transitionLocks.has(appId)) {
      await this.transitionLocks.get(appId)
    }
    const promise = fn()
    this.transitionLocks.set(appId, promise)
    try {
      await promise
    } finally {
      this.transitionLocks.delete(appId)
    }
  }
  
  async load(appId: string, config: AppConfig, externalSignal?: AbortSignal): Promise<void> {
    const signal = externalSignal || this.createAbortSignal(appId)

    return this.withLock(appId, async () => {
      const app = this.getOrCreateApp(appId)
      
      // 状态检查
      if (app.state !== 'created' && app.state !== 'error') {
        throw new Error(`Cannot load app in state: ${app.state}`)
      }
      
      try {
        await this.ctx.serial('lifecycle:before-load', appId, app.context)
        if (signal.aborted) return

        app.state = 'loading'
        
        // 加载应用资源
        const module = await this.loadAppModule(config)
        if (signal.aborted) return

        app.module = module
        
        // 作为 Cordis 插件挂载，产生 Fork Context
        app.fork = this.ctx.plugin(module.default || module, { appId, ...config })
        
        app.state = 'loaded'
        await this.ctx.serial('lifecycle:after-load', appId, app.context)
        
      } catch (error) {
        app.state = 'error'
        this.ctx.emit('lifecycle:error', appId, error as Error, app.context)
        throw error
      }
    })
  }
  
  async activate(appId: string, externalSignal?: AbortSignal): Promise<void> {
    const signal = externalSignal || this.createAbortSignal(appId)

    return this.withLock(appId, async () => {
      const app = this.apps.get(appId)
      if (!app) throw new Error(`App not found: ${appId}`)
      
      // 状态检查
      if (app.state !== 'loaded' && app.state !== 'deactivated') {
        throw new Error(`Cannot activate app in state: ${app.state}`)
      }
      
      try {
        await this.ctx.serial('lifecycle:before-activate', appId, app.context)
        if (signal.aborted) return

        // 先设置为中间状态
        app.state = 'activating'
        
        // 此处微应用逻辑受 Cordis Fiber 引擎管理
        // 在依赖（如 router, state）就绪时，插件状态将自动变为 ACTIVE
        
        app.state = 'active'
        await this.ctx.serial('lifecycle:after-activate', appId, app.context)
        
      } catch (error) {
        app.state = 'error'
        this.ctx.emit('lifecycle:error', appId, error as Error, app.context)
        throw error
      }
    })
  }
  
  async deactivate(appId: string): Promise<void> {
    return this.withLock(appId, async () => {
      const app = this.apps.get(appId)
      if (!app) throw new Error(`App not found: ${appId}`)
      
      // 状态检查
      if (app.state !== 'active') {
        throw new Error(`Cannot deactivate app in state: ${app.state}`)
      }
      
      try {
        await this.ctx.serial('lifecycle:before-deactivate', appId, app.context)
        app.state = 'deactivating'
        
        // 在不卸载插件的情况下通知微应用进入后台
        if (app.fork?.ctx) {
          app.fork.ctx.emit('lifecycle:deactivated', appId, app.context)
        }
        
        app.state = 'deactivated'
        await this.ctx.serial('lifecycle:after-deactivate', appId, app.context)
        
      } catch (error) {
        app.state = 'error'
        this.ctx.emit('lifecycle:error', appId, error as Error, app.context)
        throw error
      }
    })
  }
  
  async destroy(appId: string): Promise<void> {
    // 销毁时终止一切正在进行的加载/激活流程
    if (this.abortControllers.has(appId)) {
      this.abortControllers.get(appId)!.abort('Destroying app')
      this.abortControllers.delete(appId)
    }

    return this.withLock(appId, async () => {
      const app = this.apps.get(appId)
      if (!app) return // 已经销毁或不存在
      
      if (app.state === 'active') {
        await this.ctx.serial('lifecycle:before-deactivate', appId, app.context)
        app.state = 'deactivated'
        await this.ctx.serial('lifecycle:after-deactivate', appId, app.context)
      }
      
      try {
        await this.ctx.serial('lifecycle:before-destroy', appId, app.context)
        
        // 直接利用 Cordis ForkContext 的 dispose()，自动级联清理绑定的各种 effect、事件和定时器
        if (app.fork) {
          app.fork.dispose()
        }
        
        app.state = 'destroyed'
        await this.ctx.serial('lifecycle:after-destroy', appId, app.context)
        
        // 清理资源
        this.apps.delete(appId)
        
      } catch (error) {
        app.state = 'error'
        this.ctx.emit('lifecycle:error', appId, error as Error, app.context)
        throw error
      }
    })
  }
  
  getAppState(appId: string): AppState {
    const app = this.apps.get(appId)
    return app?.state || 'created'
  }
  
  private getOrCreateApp(appId: string): AppInstance {
    if (!this.apps.has(appId)) {
      this.apps.set(appId, {
        id: appId,
        state: 'created',
        context: this.createAppContext(appId)
      })
    }
    return this.apps.get(appId)!
  }
  
  private async loadAppModule(config: AppConfig): Promise<any> {
    // 根据配置加载应用模块
    if (config.url) {
      return import(/* @vite-ignore */ config.url)
    }
    if (config.module) {
      return config.module
    }
    throw new Error('Invalid app config: must provide url or module')
  }
  
  private createAppContext(appId: string): AppContext {
    return {
      appId,
      sandbox: this.ctx.sandbox.createSandbox(appId),
      state: this.ctx.state,
      router: this.ctx.router.getContext(appId)
    }
  }
}
```

---

## 四、应用保活机制

### 4.1 保活策略

```typescript
// @cordis/lifecycle/keep-alive
interface KeepAliveConfig {
  // 保活模式
  mode: 'memory' | 'dom' | 'state'
  
  // 最大保活数量
  maxCount?: number
  
  // 保活超时时间（毫秒）
  timeout?: number
  
  // 保活优先级
  priority?: number
}

class KeepAliveManager {
  private activeApps: Set<string> = new Set()       // 正在运行的活跃应用
  private cachedApps: Map<string, CachedApp> = new Map()  // 后台保活的缓存应用
  private timers: Map<string, number> = new Map()
  
  // 激活应用（标记为正在运行）
  activate(appId: string): void {
    this.activeApps.add(appId)
  }
  
  // 停用应用（从活跃池移除）
  deactivate(appId: string): void {
    this.activeApps.delete(appId)
  }
  
  // 恢复应用（从保活池恢复）
  async restore(appId: string): Promise<void> {
    const cached = this.cachedApps.get(appId)
    if (!cached) {
      throw new Error(`App not cached: ${appId}`)
    }
    
    // 根据保活模式恢复
    switch (cached.config.mode) {
      case 'memory':
        await this.restoreFromMemory(cached)
        break
      case 'dom':
        await this.restoreFromDom(cached)
        break
      case 'state':
        await this.restoreFromState(cached)
        break
    }
    
    this.cachedApps.delete(appId)
    this.activeApps.add(appId)
  }
  
  // 缓存应用（进入保活池）
  async cache(appId: string, config: KeepAliveConfig): Promise<void> {
    const app = lifecycleManager.getAppState(appId)
    
    const cached: CachedApp = {
      id: appId,
      config,
      timestamp: Date.now(),
      state: app
    }
    
    // 根据保活模式缓存
    switch (config.mode) {
      case 'memory':
        cached.memory = await this.captureMemoryState(appId)
        break
      case 'dom':
        cached.dom = await this.captureDomState(appId)
        break
      case 'state':
        cached.stateSnapshot = stateManager.snapshot()
        break
    }
    
    this.cachedApps.set(appId, cached)
    
    // 如果超过最大保活数量，淘汰优先级最低的缓存应用
    if (config.maxCount && this.cachedApps.size > config.maxCount) {
      this.evictLowestPriority()
    }
    
    // 设置超时淘汰
    if (config.timeout) {
      this.setTimer(appId, config.timeout)
    }
  }
  
  // 淘汰最低优先级
  private evictLowestPriority(): void {
    let lowestAppId: string | null = null
    let lowestPriority = Infinity
    
    this.cachedApps.forEach((cached, appId) => {
      const priority = cached.config.priority || 0
      if (priority < lowestPriority) {
        lowestPriority = priority
        lowestAppId = appId
      }
    })
    
    if (lowestAppId) {
      this.cachedApps.delete(lowestAppId)
      // activeApps 此时不应该有这个 ID，但为了保险可以清理
      this.activeApps.delete(lowestAppId)
    }
  }
  
  // 设置超时淘汰定时器
  private setTimer(appId: string, timeout: number): void {
    const timerId = window.setTimeout(() => {
      this.cachedApps.delete(appId)
      this.timers.delete(appId)
    }, timeout)
    
    this.timers.set(appId, timerId)
  }
  
  // 清除超时定时器
  private clearTimer(appId: string): void {
    const timerId = this.timers.get(appId)
    if (timerId) {
      clearTimeout(timerId)
      this.timers.delete(appId)
    }
  }
}
```

### 4.2 保活模式对比

| 模式 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **memory** | 恢复最快，状态完整 | 内存占用大 | 小型应用，频繁切换 |
| **dom** | 恢复快，视觉连续 | DOM 占用大 | 复杂 UI，需要保持滚动位置 |
| **state** | 内存占用小 | 恢复慢，需要重新渲染 | 大型应用，切换不频繁 |

---

## 五、错误恢复机制

### 5.1 错误分类

```typescript
// @cordis/lifecycle/error
enum ErrorType {
  // 加载错误
  LOAD_ERROR = 'LOAD_ERROR',
  
  // 激活错误
  ACTIVATE_ERROR = 'ACTIVATE_ERROR',
  
  // 运行时错误
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  
  // 资源错误
  RESOURCE_ERROR = 'RESOURCE_ERROR'
}

interface AppError {
  type: ErrorType
  message: string
  stack?: string
  appId: string
  timestamp: number
}
```

### 5.2 错误恢复策略

```typescript
// @cordis/lifecycle/recovery
interface RecoveryStrategy {
  // 重试
  retry(maxRetries: number, delay: number): Promise<void>
  
  // 降级
  fallback(fallbackAppId: string): Promise<void>
  
  // 忽略
  ignore(): void
  
  // 自定义恢复
  custom(handler: (error: AppError) => Promise<void>): Promise<void>
}

class ErrorRecoveryManager {
  private strategies: Map<ErrorType, RecoveryStrategy> = new Map()
  
  // 注册恢复策略
  registerStrategy(type: ErrorType, strategy: RecoveryStrategy): void {
    this.strategies.set(type, strategy)
  }
  
  // 处理错误
  async handleError(error: AppError): Promise<void> {
    const strategy = this.strategies.get(error.type)
    if (!strategy) {
      console.error('[Cordis Lifecycle] No recovery strategy for error:', error)
      return
    }
    
    try {
      await strategy.retry(3, 1000)
    } catch (retryError) {
      console.error('[Cordis Lifecycle] Recovery failed:', retryError)
      // 触发降级
      await strategy.fallback('error-page')
    }
  }
}
```

### 5.3 错误边界

```typescript
// @cordis/lifecycle/error-boundary
class ErrorBoundary {
  private errorHandler: (error: Error) => void
  
  constructor(errorHandler: (error: Error) => void) {
    this.errorHandler = errorHandler
  }
  
  // 捕获同步错误
  catchSync<T>(fn: () => T): T | undefined {
    try {
      return fn()
    } catch (error) {
      this.errorHandler(error as Error)
      return undefined
    }
  }
  
  // 捕获异步错误
  async catchAsync<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (error) {
      this.errorHandler(error as Error)
      return undefined
    }
  }
  
  // 包装生命周期钩子
  wrapHook<T extends (...args: any[]) => any>(hook: T): T {
    return ((...args: any[]) => {
      return this.catchAsync(() => hook(...args))
    }) as T
  }
}
```

---

## 六、统一事件系统

### 6.1 事件定义

我们使用 Cordis 原生的事件系统 (`ctx.on` / `ctx.emit`) 来统一管理生命周期事件：

```typescript
// @cordis/lifecycle/events
export interface LifecycleEvents {
  'lifecycle:before-load'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:after-load'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:before-activate'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:after-activate'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:before-deactivate'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:after-deactivate'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:before-destroy'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:after-destroy'(appId: string, context: AppContext): void | Promise<void>
  'lifecycle:error'(appId: string, error: Error, context?: AppContext): void
}

declare module 'cordis' {
  interface Events extends LifecycleEvents {}
}
```

### 6.2 使用原生事件系统

利用 Cordis 的上下文，可以非常方便地订阅和处理事件，并且在插件卸载时会自动清理监听器：

```typescript
// 在插件中直接使用 ctx.on，无需手动解绑
export function apply(ctx: Context) {
  ctx.on('lifecycle:after-activate', (appId, context) => {
    console.log(`App ${appId} activated`)
  })
}
```

---

## 七、应用间生命周期协调

### 7.1 运行时服务依赖 (Cordis Native DI)

传统的微前端框架需要手动实现拓扑排序来管理应用加载和激活顺序。但在基于 Cordis 的架构中，我们**废弃了冗余的手动拓扑排序**，转而利用 Cordis 原生的依赖注入 (DI) 和 Fiber 引擎。

当微应用作为插件被加载时，只需声明其依赖的运行时服务，Cordis 会自动完成 PENDING 等待与状态激活：

```typescript
// sub-app/src/index.ts
export const inject = ['router', 'state', 'auth']

export function apply(ctx: Context) {
  // 只要代码执行到这里，说明 router, state, auth 均已就绪
  // Cordis Fiber 引擎自动将插件状态由 PENDING 转换为 ACTIVE
  
  ctx.router.registerRoute('/app', { component: App })
  
  // 使用 ctx.effect 注册的副作用
  // 当应用被卸载 (forkCtx.dispose) 时会自动触发这里的返回函数，无需手动在 destroy 生命周期中清理
  ctx.effect(() => {
    const timer = setInterval(() => console.log('sub-app running'), 1000)
    return () => clearInterval(timer)
  })
}
```

### 7.2 静态资产依赖加载

虽然运行时服务交由 Cordis 管理，但对于纯静态资产（如共享的 JS/CSS 模块库），我们依然保留轻量级的并发加载器，支持基于 URL 的并发获取：

```typescript
// @cordis/lifecycle/parallel-loader
class ParallelLoader {
  private concurrency: number
  
  constructor(concurrency: number = 3) {
    this.concurrency = concurrency
  }
  
  // 并行加载多个应用
  async loadApps(configs: AppConfig[]): Promise<void> {
    const queue = [...configs]
    const loading = new Set<Promise<void>>()
    
    while (queue.length > 0 || loading.size > 0) {
      // 填充加载池
      while (loading.size < this.concurrency && queue.length > 0) {
        const config = queue.shift()!
        const promise = lifecycleManager.load(config.id, config)
          .then(() => {
            loading.delete(promise)
          })
          .catch(error => {
            loading.delete(promise)
            console.error(`[Cordis Lifecycle] Failed to load app ${config.id}:`, error)
          })
        
        loading.add(promise)
      }
      
      // 等待任意一个完成
      if (loading.size > 0) {
        await Promise.race(loading)
      }
    }
  }
}
```

---

## 八、与现有方案对比

| 维度 | qiankun | wujia | micro-app | Cordis |
|------|---------|-------|-----------|--------|
| **状态机模型** | 简单 | 无 | 简单 | 完整状态机 |
| **保活机制** | 无 | iframe 保活 | 无 | 三种模式 |
| **错误恢复** | 无 | 无 | 无 | 策略模式 |
| **依赖管理** | 无 | 无 | 无 | 拓扑排序 |
| **并行加载** | 无 | 无 | 无 | 并发控制 |
| **事件总线** | 简单 | postMessage | DataStore | 完整事件系统 |

---

## 九、配置示例

### 9.1 应用生命周期配置

```json
// cordis.lifecycle.json
{
  "lifecycle": {
    "keepAlive": {
      "enabled": true,
      "mode": "memory",
      "maxCount": 3,
      "timeout": 300000
    },
    "errorRecovery": {
      "maxRetries": 3,
      "retryDelay": 1000,
      "fallbackApp": "error-page"
    },
    "dependencies": [
      { "appId": "base-app", "required": true },
      { "appId": "auth-app", "required": true }
    ]
  }
}
```

### 9.2 应用入口文件 (Cordis 插件模式)

```typescript
// sub-app/src/main.ts
import { Context } from 'cordis'
import { createApp } from 'vue'
import App from './App.vue'

// 声明应用所需依赖
export const inject = ['router', 'state']

export function apply(ctx: Context) {
  // 挂载应用
  const app = createApp(App)
  app.provide('cordis', ctx)
  
  // 监听激活状态 (如从后台恢复)
  ctx.on('lifecycle:after-activate', (appId) => {
    console.log(`${appId} Activated`)
  })
  
  // 监听后台停用状态
  ctx.on('lifecycle:deactivated', (appId) => {
    console.log(`${appId} Deactivated`)
  })
  
  // 注册副作用（DOM挂载），当 ctx.dispose() 触发时自动执行清理
  ctx.effect(() => {
    const container = document.getElementById('sub-app-container')
    if (container) {
      app.mount(container)
    }
    
    // 返回逆操作，destroy 时自动调用
    return () => {
      app.unmount()
    }
  })
}
```

---

## 十、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 基础状态机 | created/loading/loaded/active/deactivated/destroyed |
| P0 | 生命周期钩子 | onLoading/onLoaded/onActivated 等 |
| P1 | 错误恢复 | 重试、降级、错误边界 |
| P1 | 事件总线 | 生命周期事件发布/订阅 |
| P2 | 保活机制 | memory/dom/state 三种模式 |
| P2 | 依赖管理 | 拓扑排序、依赖检查 |
| P3 | 并行加载 | 并发控制、加载优化 |
| P3 | 调试工具 | 生命周期可视化 |
