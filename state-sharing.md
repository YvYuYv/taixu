# Cordis 状态共享方案

## 一、问题分析

### 1.1 微前端中状态共享的挑战

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| **应用间状态隔离** | 各应用使用独立的 Vuex/Redux，无法共享 | 高 |
| **状态同步延迟** | 状态更新后，其他应用响应不及时 | 中 |
| **状态版本冲突** | 同一数据在不同应用中版本不一致 | 高 |
| **全局状态污染** | 全局状态被意外修改，难以追踪 | 中 |
| **跨框架状态共享** | Vue 的响应式状态无法直接被 React 使用 | 高 |

### 1.2 Cordis 理论视角

在 Cordis 理论中，状态共享是 **coeffect context** 的核心：
- 状态 = coeffect（协同效应）
- 状态共享 = coeffect context 的传递
- 状态隔离 = coeffect isolation（协同效应隔离）

关键原则：
- **显式声明**：应用必须显式声明需要哪些共享状态
- **可逆性**：状态修改可以被追踪和回滚
- **汇合性**：无论从哪个应用修改，最终状态一致

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Cordis Runtime（Cordis 运行时）                             │
│  - 统一的状态管理入口                                         │
├─────────────────────────────────────────────────────────────┤
│  State Manager（状态管理器）                                 │
│  - 全局状态存储                                               │
│  - 状态订阅/通知                                              │
│  - 状态版本控制                                               │
├─────────────────────────────────────────────────────────────┤
│  State Layer（状态层）                                       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ Global     │ │ Shared     │ │ Local      │              │
│  │ State      │ │ State      │ │ State      │              │
│  │ (全局)     │ │ (共享)     │ │ (私有)     │              │
│  └────────────┘ └────────────┘ └────────────┘              │
├─────────────────────────────────────────────────────────────┤
│  Effect Tracker（效应追踪器）                                │
│  - 追踪状态修改                                               │
│  - 状态变更日志                                               │
│  - 状态回滚                                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、状态分层模型

### 3.1 三层状态架构

```
┌─────────────────────────────────────────┐
│  Global State（全局状态）                │
│  - 用户信息、权限、主题等                 │
│  - 所有应用可访问                         │
│  - 由主应用管理                           │
├─────────────────────────────────────────┤
│  Shared State（共享状态）                │
│  - 特定应用组共享的状态                   │
│  - 显式声明依赖                           │
│  - 版本控制                               │
├─────────────────────────────────────────┤
│  Local State（私有状态）                 │
│  - 应用内部状态                           │
│  - 其他应用无法访问                       │
│  - 由应用自己管理                         │
└─────────────────────────────────────────┘
```

### 3.2 状态声明

```typescript
// cordis.state.json
{
  "state": {
    "global": ["user", "theme", "permissions"],
    "shared": {
      "cart": ["items", "total"],
      "order": ["currentOrder"]
    },
    "local": ["uiState", "formData"]
  },
  "permissions": {
    "read": ["user", "theme", "cart.*"],
    "write": ["cart.items", "cart.total"]
  }
}
```

---

## 四、状态管理器实现

### 4.1 核心 API

```typescript
// @cordis/state
interface StateManager {
  // 获取状态
  get<T>(key: string): T | undefined
  
  // 设置状态
  set<T>(key: string, value: T, appId?: string): void
  
  // 订阅状态变化
  subscribe(key: string, callback: (newValue: any, oldValue: any, key?: string) => void): () => void
  
  // 批量更新
  batch(updates: Record<string, any>, appId?: string): void
  
  // 静默更新
  setSilent<T>(key: string, value: T): void
  
  // 获取状态快照
  snapshot(): Record<string, any>
  
  // 恢复状态
  restore(snapshot: Record<string, any>): void
}

class CordisStateManager implements StateManager {
  private state: Map<string, any> = new Map()
  private subscribers: Map<string, Set<(newValue: any, oldValue: any, key?: string) => void>> = new Map()
  private history: Array<{ key: string, oldValue: any, newValue: any, timestamp: number }> = []
  private appPermissions: Map<string, { read: string[], write: string[] }> = new Map()
  
  constructor(private maxHistory: number = 1000) {}

  private matchPattern(pattern: string, key: string): boolean {
    if (pattern === '*') return true
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2)
      return key === prefix || key.startsWith(prefix + '.')
    }
    return pattern === key
  }

  private checkPermission(appId: string, key: string, action: 'read' | 'write'): boolean {
    const permissions = this.appPermissions.get(appId)
    if (!permissions) return false
    const patterns = action === 'read' ? permissions.read : permissions.write
    return patterns.some(pattern => this.matchPattern(pattern, key))
  }
  
  get<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined
  }
  
  set<T>(key: string, value: T, appId?: string): void {
    if (appId && !this.checkPermission(appId, key, 'write')) {
      throw new Error(`[CordisState] App '${appId}' has no write permission for key '${key}'`)
    }

    const oldValue = this.state.get(key)
    this.state.set(key, value)
    
    // 记录历史
    this.history.push({
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    })
    
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }
    
    // 通知订阅者
    this.notify(key, value, oldValue)
  }
  
  setSilent<T>(key: string, value: T): void {
    this.state.set(key, value)
  }
  
  subscribe(key: string, callback: (newValue: any, oldValue: any, key?: string) => void): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }
    this.subscribers.get(key)!.add(callback)
    
    // 返回取消订阅函数
    return () => {
      this.subscribers.get(key)?.delete(callback)
    }
  }
  
  batch(updates: Record<string, any>, appId?: string): void {
    const snapshot = this.snapshot()
    const pendingNotifications: Array<() => void> = []
    
    try {
      for (const [key, value] of Object.entries(updates)) {
        if (appId && !this.checkPermission(appId, key, 'write')) {
          throw new Error(`[CordisState] App '${appId}' has no write permission for key '${key}'`)
        }
        const oldValue = this.state.get(key)
        this.state.set(key, value)
        
        this.history.push({ key, oldValue, newValue: value, timestamp: Date.now() })
        if (this.history.length > this.maxHistory) this.history.shift()

        pendingNotifications.push(() => this.notify(key, value, oldValue))
      }
      
      // 所有写操作成功，触发通知
      for (const notify of pendingNotifications) {
        notify()
      }
    } catch (error) {
      this.restore(snapshot)
      throw error
    }
  }
  
  snapshot(): Record<string, any> {
    const result: Record<string, any> = {}
    this.state.forEach((value, key) => {
      result[key] = structuredClone(value)
    })
    return result
  }
  
  restore(snapshot: Record<string, any>): void {
    Object.entries(snapshot).forEach(([key, value]) => {
      this.set(key, value)
    })
  }
  
  private notify(key: string, newValue: any, oldValue: any): void {
    const trigger = (subs?: Set<(newValue: any, oldValue: any, k?: string) => void>) => {
      if (subs) {
        subs.forEach(callback => {
          try {
            callback(newValue, oldValue, key)
          } catch (error) {
            console.error('[Cordis State] Subscriber error:', error)
          }
        })
      }
    }
    
    trigger(this.subscribers.get(key))
    if (key !== '*') {
      trigger(this.subscribers.get('*'))
    }
  }
}
```

### 4.2 深层响应式代理与变更拦截 (Deep Reactive Proxy)

为了支持开发者更自然地直接修改嵌套状态（例如 `state.get('cart').items.push(item)` 或 `state.get('user').profile.name = 'Bob'`），而无需手动调用 `set()`，`CordisStateManager` 引入了深层响应式代理。

#### 原理与实现

当通过 `get(key)` 获取状态时，状态管理器会返回一个基于 `Proxy` 的深度代理对象。该代理会递归拦截对嵌套属性的赋值操作，自动追踪变更路径，记录历史，并派发更新通知。

```typescript
// 增强 CordisStateManager
class CordisStateManager implements StateManager {
  // ... 已有代码 ...

  // 1. 增强的 get 方法，返回深层响应式代理
  get<T>(key: string): T | undefined {
    const value = this.state.get(key)
    if (value !== null && typeof value === 'object') {
      return this.createDeepProxy(key, value)
    }
    return value as T | undefined
  }
  
  // 2. 深层响应式代理工厂
  private createDeepProxy(rootKey: string, target: any, path: string[] = []): any {
    if (typeof target !== 'object' || target === null) return target
    
    return new Proxy(target, {
      get: (obj, prop: string | symbol) => {
        const value = Reflect.get(obj, prop)
        // 递归代理嵌套对象
        return typeof value === 'object' && value !== null 
          ? this.createDeepProxy(rootKey, value, [...path, prop as string]) 
          : value
      },
      set: (obj, prop: string | symbol, value: any) => {
        const oldValue = Reflect.get(obj, prop)
        if (oldValue === value) return true
        
        Reflect.set(obj, prop, value)
        
        // 自动追踪深层路径，如 cart.items.0
        const currentPath = [...path, prop as string].join('.')
        const fullPath = `${rootKey}.${currentPath}`
        
        // 自动记录精确路径的变更历史
        this.history.push({
          key: fullPath,
          oldValue,
          newValue: value,
          timestamp: Date.now()
        })
        
        if (this.history.length > this.maxHistory) {
          this.history.shift()
        }
        
        // 触发多级通知：通知精确路径、根路径及通配符 (*) 订阅者
        this.notify(fullPath, value, oldValue)
        this.notify(rootKey, this.state.get(rootKey), undefined)
        
        return true
      }
    })
  }

  // 3. 支持对深层状态树的原子化批量更新与快照
  batchDeepMutations(rootKey: string, mutator: (draft: any) => void): void {
    const rootState = this.state.get(rootKey)
    if (!rootState) return
    
    // 生成快照用于原子化回滚
    const snapshot = structuredClone(rootState)
    
    try {
      // 在暂存区（代理）上执行变更操作
      const draft = this.createDeepProxy(rootKey, rootState)
      mutator(draft)
    } catch (error) {
      // 发生异常时，原子化回滚状态树
      this.state.set(rootKey, snapshot)
      this.notify(rootKey, snapshot, rootState)
      throw error
    }
  }
}
```

通过这一机制：
- **自动路径追踪**：深层修改（如 `cart.items[0] = newItem`）会自动生成精确路径的变更日志。
- **透明的响应式更新**：无需手动调用 `set()`，框架即可捕获更新并通知具体的字段监听器与通配符 (`*`) 订阅者。
- **原子性变更与快照**：借助于 `batchDeepMutations`，业务不仅可以进行多步深层变更，还能在异常时自动回滚到初始快照。

### 4.3 响应式状态（Vue 集成）

```typescript
// @cordis/vue-state
import { reactive, watch } from 'vue'

class VueStateAdapter {
  private stateManager: StateManager
  private reactiveState: Record<string, any>
  
  private disposables: Array<() => void> = []

  constructor(stateManager: StateManager, keys: string[], ctx?: any) {
    this.stateManager = stateManager
    
    // 创建响应式状态
    const initialState: Record<string, any> = {}
    keys.forEach(key => {
      initialState[key] = stateManager.get(key)
    })
    this.reactiveState = reactive(initialState)
    
    // 订阅状态变化，同步到响应式状态
    keys.forEach(key => {
      const unsubscribe = stateManager.subscribe(key, (newValue) => {
        this.reactiveState[key] = newValue
      })
      this.disposables.push(unsubscribe)
      
      // 如果传入了 cordis context，使用 ctx.effect 自动清理
      if (ctx && ctx.effect) {
        ctx.effect(() => unsubscribe)
      }
    })
  }

  destroy() {
    this.disposables.forEach(dispose => dispose())
    this.disposables = []
  }
  
  // 在 Vue 组件中使用
  useSharedState<T>(key: string): T {
    return this.reactiveState[key] as T
  }
  
  // 更新状态
  setSharedState<T>(key: string, value: T): void {
    this.stateManager.set(key, value)
  }
}

// Vue 插件
export function createCordisStatePlugin(stateManager: StateManager) {
  return {
    install(app: any) {
      const adapter = new VueStateAdapter(stateManager, ['user', 'theme', 'cart'])
      
      // 注入到全局
      app.provide('cordisState', adapter)
      
      // 提供组合式 API
      app.config.globalProperties.$cordisState = adapter
    }
  }
}

// 在 Vue 组件中使用
export default {
  setup() {
    const cordisState = inject('cordisState') as VueStateAdapter
    
    const user = cordisState.useSharedState<User>('user')
    const theme = cordisState.useSharedState<Theme>('theme')
    
    const updateTheme = (newTheme: Theme) => {
      cordisState.setSharedState('theme', newTheme)
    }
    
    return { user, theme, updateTheme }
  }
}
```

### 4.4 响应式状态（React 集成）

```typescript
// @cordis/react-state
import { useState, useEffect } from 'react'

class ReactStateAdapter {
  private stateManager: StateManager
  
  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }
  
  // React Hook
  useSharedState<T>(key: string): [T, (value: T) => void] {
    const [value, setValue] = useState<T>(this.stateManager.get(key))
    
    useEffect(() => {
      const unsubscribe = this.stateManager.subscribe(key, (newValue) => {
        setValue(newValue)
      })
      
      return unsubscribe
    }, [key])
    
    const setSharedState = (newValue: T) => {
      this.stateManager.set(key, newValue)
    }
    
    return [value, setSharedState]
  }
}

// React Context
const CordisStateContext = createContext<ReactStateAdapter | null>(null)

export function CordisStateProvider({ children, stateManager }: any) {
  const adapter = new ReactStateAdapter(stateManager)
  
  return (
    <CordisStateContext.Provider value={adapter}>
      {children}
    </CordisStateContext.Provider>
  )
}

export function useSharedState<T>(key: string): [T, (value: T) => void] {
  const adapter = useContext(CordisStateContext)
  if (!adapter) {
    throw new Error('useSharedState must be used within CordisStateProvider')
  }
  return adapter.useSharedState<T>(key)
}

// 在 React 组件中使用
function CartComponent() {
  const [cart, setCart] = useSharedState<Cart>('cart')
  
  const addItem = (item: Item) => {
    setCart({ ...cart, items: [...cart.items, item] })
  }
  
  return (
    <div>
      {cart.items.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
      <button onClick={() => addItem(newItem)}>Add Item</button>
    </div>
  )
}
```

---

## 五、跨框架状态同步

### 5.1 统一事件系统

由于 Cordis 自身提供了基于 `Context` 的统一事件系统，我们可以直接废弃独立的事件总线，转而使用 `ctx.emit` 和 `ctx.on` 来实现状态跨应用的同步通知。

```typescript
// @cordis/state-protocol
interface StateUpdate {
  key: string
  value: any
  version: number
  timestamp: number
  sourceAppId: string
}

// Cordis 事件类型声明扩展
declare module 'cordis' {
  interface Events {
    'state:changed'(update: StateUpdate): void
  }
}
```

### 5.2 Vue 和 React 状态同步示例

```typescript
// Vue 应用修改状态
const vueApp = {
  setup() {
    const [cart, setCart] = useSharedState<Cart>('cart')
    // 假设通过某种方式注入了当前应用的 ctx
    const ctx = inject('cordisContext') 
    
    const addItem = (item: Item) => {
      setCart({ ...cart, items: [...cart.items, item] })
      // 触发状态同步
      ctx.emit('state:changed', {
        key: 'cart',
        value: cart,
        version: cart.version + 1,
        timestamp: Date.now(),
        sourceAppId: 'vue-app'
      })
    }
    
    return { cart, addItem }
  }
}

// React 应用接收状态更新
const reactApp = ({ ctx }) => {
  const [cart, setCart] = useSharedState<Cart>('cart')
  
  useEffect(() => {
    // 使用 cordis 原生事件，并使用 ctx.effect 管理其生命周期
    const dispose = ctx.on('state:changed', (update) => {
      if (update.sourceAppId !== 'react-app') {
        setCart(update.value)
      }
    })
    
    return dispose
  }, [])
  
  return <div>Cart items: {cart.items.length}</div>
}
```

### 5.3 跨标签页状态同步

在多标签页（跨窗口）场景下，同一主应用的多个实例可以通过 `BroadcastChannel` 保持状态同步。

```typescript
class CrossTabStateSync {
  private channel: BroadcastChannel;
  
  constructor(private stateManager: CordisStateManager) {
    this.channel = new BroadcastChannel('cordis-state-sync');
    this.channel.onmessage = (event) => {
      const { key, value, source } = event.data;
      // 静默更新，不触发再次广播
      this.stateManager.setSilent(key, value);
    };
    
    // 监听本地变更并广播
    this.stateManager.subscribe('*', (newValue, oldValue, key) => {
      this.channel.postMessage({
        key,
        value: newValue,
        source: 'local'
      });
    });
  }
  
  destroy() {
    this.channel.close();
  }
}
```

---

## 六、状态版本控制

### 6.1 乐观锁机制

```typescript
// @cordis/state-version
class VersionedStateManager {
  private stateManager: StateManager
  private versions: Map<string, number> = new Map()
  
  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }
  
  // 获取带版本的状态
  getWithVersion<T>(key: string): { value: T, version: number } | undefined {
    const value = this.stateManager.get<T>(key)
    const version = this.versions.get(key) || 0
    
    if (value === undefined) return undefined
    
    return { value, version }
  }
  
  // 带版本检查的更新
  setWithVersion<T>(key: string, value: T, expectedVersion: number): boolean {
    const currentVersion = this.versions.get(key) || 0
    
    if (currentVersion !== expectedVersion) {
      console.warn(`[Cordis State] Version conflict: expected ${expectedVersion}, got ${currentVersion}`)
      return false  // 版本冲突
    }
    
    this.stateManager.set(key, value)
    this.versions.set(key, currentVersion + 1)
    return true
  }
  
  // 强制更新（忽略版本）
  forceSet<T>(key: string, value: T): void {
    this.stateManager.set(key, value)
    const currentVersion = this.versions.get(key) || 0
    this.versions.set(key, currentVersion + 1)
  }
}
```

### 6.2 冲突解决策略

```typescript
// 冲突解决策略
type ConflictResolutionStrategy = 
  | 'last-write-wins'      // 最后写入者胜
  | 'first-write-wins'     // 最先写入者胜
  | 'merge'                // 合并
  | 'reject'               // 拒绝

class ConflictResolver {
  private strategy: ConflictResolutionStrategy
  
  constructor(strategy: ConflictResolutionStrategy = 'last-write-wins') {
    this.strategy = strategy
  }
  
  resolve(
    key: string,
    currentValue: any,
    newValue: any,
    currentVersion: number,
    newVersion: number
  ): any {
    switch (this.strategy) {
      case 'last-write-wins':
        return newValue
      
      case 'first-write-wins':
        return currentValue
      
      case 'merge':
        // 自定义合并逻辑
        if (Array.isArray(currentValue) && Array.isArray(newValue)) {
          return [...new Set([...currentValue, ...newValue])]
        }
        return { ...currentValue, ...newValue }
      
      case 'reject':
        throw new Error(`State conflict on key: ${key}`)
      
      default:
        return newValue
    }
  }
}
```

---

## 七、状态持久化

### 7.1 本地存储

```typescript
// @cordis/state-persist
class StatePersister {
  private stateManager: StateManager
  private storageKey: string
  
  constructor(stateManager: StateManager, storageKey: string = 'cordis-state') {
    this.stateManager = stateManager
    this.storageKey = storageKey
  }
  
  // 保存到 localStorage
  saveToLocalStorage(): void {
    const snapshot = this.stateManager.snapshot()
    localStorage.setItem(this.storageKey, JSON.stringify(snapshot))
  }
  
  // 从 localStorage 恢复
  restoreFromLocalStorage(): void {
    const data = localStorage.getItem(this.storageKey)
    if (data) {
      const snapshot = JSON.parse(data)
      this.stateManager.restore(snapshot)
    }
  }
  
  // 自动保存（防抖）
  autoSave(debounceMs: number = 1000): () => void {
    let timeoutId: number | null = null
    
    const unsubscribe = this.stateManager.subscribe('*', () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(() => {
        this.saveToLocalStorage()
      }, debounceMs)
    })
    
    return unsubscribe
  }
}
```

### 7.2 服务端同步

```typescript
// @cordis/state-sync-server
class ServerStateSync {
  private stateManager: StateManager
  private syncEndpoint: string
  
  constructor(stateManager: StateManager, syncEndpoint: string) {
    this.stateManager = stateManager
    this.syncEndpoint = syncEndpoint
  }
  
  // 同步到服务端
  async syncToServer(keys: string[]): Promise<void> {
    const snapshot = this.stateManager.snapshot()
    const data: Record<string, any> = {}
    
    keys.forEach(key => {
      if (snapshot[key] !== undefined) {
        data[key] = snapshot[key]
      }
    })
    
    await fetch(this.syncEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }
  
  // 从服务端拉取
  async pullFromServer(keys: string[]): Promise<void> {
    const response = await fetch(this.syncEndpoint)
    const data = await response.json()
    
    keys.forEach(key => {
      if (data[key] !== undefined) {
        this.stateManager.set(key, data[key])
      }
    })
  }
}
```

---

## 八、与现有方案对比

| 维度 | Vuex/Redux | qiankun globalState | wujia postMessage | Cordis |
|------|------------|---------------------|-------------------|--------|
| **跨框架支持** | 单一框架 | 框架无关 | 框架无关 | 框架无关 |
| **响应式集成** | 原生支持 | 无 | 无 | 适配器模式 |
| **状态版本控制** | 无 | 无 | 无 | 有 |
| **冲突解决** | 无 | 无 | 无 | 有 |
| **持久化** | 插件支持 | 无 | 无 | 内置 |
| **类型安全** | 有 | 无 | 无 | 有 |
| **调试工具** | DevTools | 无 | 无 | 有 |

---

## 九、配置示例

### 9.1 主应用配置

```typescript
// main-app/src/main.ts
import { createCordisApp } from '@cordis/runtime'
import { CordisStateManager } from '@cordis/state'
import { createCordisStatePlugin } from '@cordis/vue-state'

const stateManager = new CordisStateManager()

// 初始化全局状态
stateManager.set('user', { id: 1, name: 'John' })
stateManager.set('theme', 'dark')

const app = createCordisApp()
app.use(createCordisStatePlugin(stateManager))
```

### 9.2 子应用配置

```typescript
// sub-app/cordis.state.json
{
  "state": {
    "shared": ["user", "theme", "cart"]
  },
  "permissions": {
    "read": ["user", "theme", "cart.*"],
    "write": ["cart.items"]
  }
}
```

---

## 十、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 基础状态管理器 | get/set/subscribe |
| P0 | Vue 响应式集成 | useSharedState |
| P1 | React 集成 | useSharedState Hook |
| P1 | 跨框架状态同步 | StateSyncBus |
| P2 | 状态版本控制 | 乐观锁 |
| P2 | 冲突解决策略 | last-write-wins 等 |
| P3 | 状态持久化 | localStorage |
| P3 | 服务端同步 | REST API |
