# Cordis 通信协议方案

## 一、问题分析

### 1.1 微前端中应用间通信的挑战

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| **通信方式不统一** | 各应用使用不同的通信机制（全局变量、事件、消息） | 高 |
| **跨框架通信困难** | Vue 的 EventBus 无法直接被 React 使用 | 高 |
| **通信安全性差** | 全局事件容易被滥用，难以追踪 | 中 |
| **通信性能问题** | 频繁的状态同步导致性能下降 | 中 |
| **调试困难** | 通信链路不清晰，难以定位问题 | 高 |

### 1.2 Cordis 理论视角

在 Cordis 理论中，应用间通信是 **coeffect interaction** 的体现：
- 通信 = coeffect context 的交互
- 消息 = coeffect message
- 协议 = coeffect protocol

关键原则：
- **显式声明**：应用必须显式声明需要接收哪些消息
- **类型安全**：消息格式必须有明确的类型定义
- **可追踪性**：每条消息都可以被追踪和调试
- **异步安全**：通信不会导致竞态条件

---

## 二、通信架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Application Layer（应用层）                                 │
│  - 业务逻辑                                                  │
│  - 业务消息                                                  │
├─────────────────────────────────────────────────────────────┤
│  Protocol Layer（协议层）                                    │
│  - 消息格式定义                                               │
│  - 消息路由                                                   │
│  - 消息验证                                                   │
├─────────────────────────────────────────────────────────────┤
│  Transport Layer（传输层）                                   │
│  - 事件总线（EventBus）                                      │
│  - 消息队列（MessageQueue）                                  │
│  - 远程通信（RPC）                                           │
├─────────────────────────────────────────────────────────────┤
│  Adapter Layer（适配层）                                     │
│  - Vue EventEmitter 适配                                     │
│  - React Context 适配                                        │
│  - Angular Service 适配                                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 通信模式

| 模式 | 适用场景 | 特点 |
|------|----------|------|
| **发布-订阅** | 一对多广播 | 解耦，但难以追踪 |
| **请求-响应** | 一对一通信 | 同步，有明确的结果 |
| **消息队列** | 异步通信 | 可靠，但延迟较高 |
| **共享状态** | 状态同步 | 实时，但需要冲突解决 |

---

## 三、消息协议定义

### 3.1 消息格式

```typescript
// @cordis/protocol/message
interface CordisMessage<T = any> {
  // 消息头
  id: string              // 消息唯一ID
  type: string            // 消息类型
  source: string          // 发送方应用ID
  target?: string         // 接收方应用ID（可选，为空表示广播）
  timestamp: number       // 发送时间戳
  
  // 消息体
  payload: T              // 消息内容
  
  // 元数据
  metadata?: {
    priority?: 'low' | 'normal' | 'high'
    ttl?: number          // 消息存活时间（毫秒）
    correlationId?: string // 关联ID（用于请求-响应）
    traceId?: string      // 追踪ID（用于调试）
  }
}

// 消息类型定义
interface MessageTypes {
  // 系统消息
  'app:activated': { appId: string }
  'app:deactivated': { appId: string }
  'state:changed': { key: string, value: any }
  
  // 业务消息（示例）
  'user:login': { userId: string, token: string }
  'user:logout': {}
  'cart:add': { itemId: string, quantity: number }
  'order:create': { orderId: string, items: any[] }
}
```

### 3.2 消息构建器

```typescript
// @cordis/protocol/builder
class MessageBuilder<T = any> {
  private message: Partial<CordisMessage<T>>
  
  constructor(type: string) {
    this.message = {
      id: this.generateId(),
      type,
      timestamp: Date.now()
    }
  }
  
  from(source: string): this {
    this.message.source = source
    return this
  }
  
  to(target: string): this {
    this.message.target = target
    return this
  }
  
  withPayload(payload: T): this {
    this.message.payload = payload
    return this
  }
  
  withPriority(priority: 'low' | 'normal' | 'high'): this {
    this.message.metadata = {
      ...this.message.metadata,
      priority
    }
    return this
  }
  
  withTTL(ttl: number): this {
    this.message.metadata = {
      ...this.message.metadata,
      ttl
    }
    return this
  }
  
  withCorrelationId(correlationId: string): this {
    this.message.metadata = {
      ...this.message.metadata,
      correlationId
    }
    return this
  }
  
  build(): CordisMessage<T> {
    if (!this.message.source) {
      throw new Error('Message source is required')
    }
    if (!this.message.payload) {
      throw new Error('Message payload is required')
    }
    
    return this.message as CordisMessage<T>
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// 使用示例
const message = new MessageBuilder('cart:add')
  .from('product-app')
  .to('cart-app')
  .withPayload({ itemId: '123', quantity: 2 })
  .withPriority('high')
  .build()
```

### 3.3 消息验证

```typescript
// @cordis/protocol/validator
class MessageValidator {
  private schemas: Map<string, any> = new Map()
  
  // 注册消息类型 Schema
  registerSchema(type: string, schema: any): void {
    this.schemas.set(type, schema)
  }
  
  // 验证消息
  validate(message: CordisMessage): ValidationResult {
    const schema = this.schemas.get(message.type)
    if (!schema) {
      return { valid: true }  // 未注册的类型默认通过
    }
    
    const ajv = new Ajv()
    const validate = ajv.compile(schema)
    const valid = validate(message.payload)
    
    if (!valid) {
      return {
        valid: false,
        errors: validate.errors || []
      }
    }
    
    return { valid: true }
  }
}

interface ValidationResult {
  valid: boolean
  errors?: any[]
}
```

---

## 四、传输层实现

### 4.1 事件总线（基于 Cordis Context）

> **注意**：独立的 `CordisEventBus` 实现应替换为基于 Cordis 原生事件系统 (`ctx.on()` / `ctx.emit()`) 的封装。这样可以统一生命周期管理，并利用 Fiber 的状态与作用域隔离 (`ctx.isolate()`)。事件总线作为 Service 注册，仅作为提供额外功能（中间件、历史、去重）的轻量级包装。

```typescript
// @cordis/transport/event-bus
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    eventBus: CordisEventBus
  }
  interface Events {
    'cordis/message'(message: CordisMessage): void
  }
}

class CordisEventBus extends Service {
  private middleware: MessageMiddleware[] = []
  private messageHistory: CordisMessage[] = []
  private maxHistorySize: number = 1000
  private processedMessageIds: Set<string> = new Set() // 去重缓存
  
  constructor(ctx: Context) {
    super(ctx, 'eventBus')
  }
  
  // 发布消息
  publish(message: CordisMessage): void {
    // 消息去重
    if (this.processedMessageIds.has(message.id)) return
    this.processedMessageIds.add(message.id)
    if (this.processedMessageIds.size > this.maxHistorySize) {
      const first = this.processedMessageIds.values().next().value
      this.processedMessageIds.delete(first)
    }

    this.addToHistory(message)
    
    // 执行 beforeSend 中间件
    let processedMessage = message
    for (const mw of this.middleware) {
      processedMessage = mw.beforeSend(processedMessage)
      if (!processedMessage) return
    }
    
    this.ctx.emit('cordis/message', processedMessage)
  }
  
  // 订阅消息
  subscribe(type: string, handler: MessageHandler): () => void {
    return this.ctx.on('cordis/message', (message) => {
      // 路由匹配：支持精确匹配和简单的通配符
      if (type === '*' || message.type === type || (type.endsWith('*') && message.type.startsWith(type.slice(0, -1)))) {
        // 目标应用过滤
        if (message.target && handler.targetAppId && handler.targetAppId !== message.target) return
        this.invokeHandler(handler, message)
      }
    })
  }
  
  // 订阅一次
  subscribeOnce(type: string, handler: MessageHandler): () => void {
    const dispose = this.subscribe(type, (message) => {
      handler(message)
      dispose()
    })
    return dispose
  }
  
  use(middleware: MessageMiddleware): void {
    this.middleware.push(middleware)
  }
  
  private invokeHandler(handler: MessageHandler, message: CordisMessage): void {
    try {
      if (message.metadata?.ttl) {
        const age = Date.now() - message.timestamp
        if (age > message.metadata.ttl) {
          console.warn(`[Cordis EventBus] Message expired: ${message.id}`)
          return
        }
      }
      
      handler(message)
      
      // 执行 afterReceive 中间件
      for (const mw of this.middleware) {
        if (mw.afterReceive) {
          mw.afterReceive(message)
        }
      }
    } catch (error) {
      console.error('[Cordis EventBus] Handler error:', error)
    }
  }
  
  private addToHistory(message: CordisMessage): void {
    this.messageHistory.push(message)
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift()
    }
  }
}

interface MessageHandler {
  (message: CordisMessage): void
  targetAppId?: string
}

interface MessageMiddleware {
  beforeSend(message: CordisMessage): CordisMessage | null
  afterReceive?(message: CordisMessage): void
}
```

### 4.2 请求-响应模式

```typescript
// @cordis/transport/request-response
class RequestResponseTransport {
  private eventBus: CordisEventBus
  
  constructor(eventBus: CordisEventBus) {
    this.eventBus = eventBus
  }
  
  // 发送请求
  async request<TRequest, TResponse>(
    type: string,
    payload: TRequest,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    const correlationId = this.generateId()
    const timeout = options.timeout || 5000
    const responseType = `response:${correlationId}`
    
    const message = new MessageBuilder(type)
      .from(options.source || 'unknown')
      .to(options.target)
      .withPayload(payload)
      .withCorrelationId(correlationId)
      .withTTL(timeout)
      .build()
    
    return new Promise<TResponse>((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout: ${type}`))
      }, timeout)
      
      // 订阅特定请求的响应
      const unsubscribe = this.eventBus.subscribe(responseType, (msg) => {
        clearTimeout(timeoutId)
        unsubscribe()
        if (msg.payload.success) {
          resolve(msg.payload.data)
        } else {
          reject(new Error(msg.payload.error))
        }
      })
      
      // 发送消息
      this.eventBus.publish(message)
    })
  }
  
  // 响应请求
  respond<TRequest, TResponse>(
    type: string,
    handler: (payload: TRequest) => Promise<TResponse> | TResponse
  ): () => void {
    return this.eventBus.subscribe(type, async (message) => {
      const correlationId = message.metadata?.correlationId
      if (!correlationId) return
      
      const responseType = `response:${correlationId}`
      try {
        const result = await handler(message.payload)
        
        // 发送响应
        const response = new MessageBuilder(responseType)
          .from(message.target || 'unknown')
          .to(message.source)
          .withPayload({ success: true, data: result })
          .withCorrelationId(correlationId)
          .build()
        
        this.eventBus.publish(response)
      } catch (error) {
        // 发送错误响应
        const response = new MessageBuilder(responseType)
          .from(message.target || 'unknown')
          .to(message.source)
          .withPayload({ success: false, error: error.message })
          .withCorrelationId(correlationId)
          .build()
        
        this.eventBus.publish(response)
      }
    })
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

interface RequestOptions {
  source?: string
  target?: string
  timeout?: number
}
```

### 4.3 消息队列

```typescript
// @cordis/transport/message-queue
interface QueueOptions {
  maxSize?: number
  overflowStrategy?: 'drop-oldest' | 'reject-new' | 'drop-newest'
}

class CordisMessageQueue {
  private queues: Map<string, CordisMessage[]> = new Map()
  private consumers: Map<string, MessageConsumer> = new Map()
  private processing: Map<string, boolean> = new Map()
  private options: Map<string, QueueOptions> = new Map()
  
  // 配置队列
  configureQueue(queueName: string, options: QueueOptions): void {
    this.options.set(queueName, options)
  }

  // 发送消息到队列
  enqueue(queueName: string, message: CordisMessage): void {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, [])
    }
    
    const queue = this.queues.get(queueName)!
    const options = this.options.get(queueName) || { maxSize: 1000, overflowStrategy: 'drop-oldest' }
    
    if (options.maxSize && queue.length >= options.maxSize) {
      switch (options.overflowStrategy) {
        case 'reject-new':
          console.warn(`[Cordis Queue] Queue ${queueName} is full, rejecting new message`)
          return
        case 'drop-newest':
          queue.pop()
          queue.push(message)
          break
        case 'drop-oldest':
        default:
          queue.shift()
          queue.push(message)
          break
      }
    } else {
      queue.push(message)
    }
    
    // 触发消费
    this.processQueue(queueName)
  }
  
  // 注册消费者
  registerConsumer(queueName: string, consumer: MessageConsumer): void {
    this.consumers.set(queueName, consumer)
    this.processQueue(queueName)
  }
  
  // 处理队列
  private async processQueue(queueName: string): Promise<void> {
    if (this.processing.get(queueName)) return
    
    const consumer = this.consumers.get(queueName)
    if (!consumer) return
    
    const queue = this.queues.get(queueName)
    if (!queue || queue.length === 0) return
    
    this.processing.set(queueName, true)
    
    try {
      while (queue.length > 0) {
        const message = queue.shift()!
        
        try {
          await consumer(message)
        } catch (error) {
          console.error(`[Cordis Queue] Consumer error for ${queueName}:`, error)
          // 重新入队（可选）
          if (consumer.retryOnError) {
            queue.unshift(message) // 更安全的重试，放回头部
          }
        }
      }
    } finally {
      this.processing.set(queueName, false)
    }
  }
}

interface MessageConsumer {
  (message: CordisMessage): Promise<void>
  retryOnError?: boolean
}
```

---

## 五、适配层实现

### 5.1 Vue 适配器

```typescript
// @cordis/adapter/vue
import { inject, provide, onMounted, onUnmounted } from 'vue'

class VueCommunicationAdapter {
  private eventBus: CordisEventBus
  private appId: string
  
  constructor(eventBus: CordisEventBus, appId: string) {
    this.eventBus = eventBus
    this.appId = appId
  }
  
  // 发送消息
  send<T>(type: string, payload: T, target?: string): void {
    const message = new MessageBuilder(type)
      .from(this.appId)
      .to(target)
      .withPayload(payload)
      .build()
    
    this.eventBus.publish(message)
  }
  
  // 订阅消息
  on<T>(type: string, handler: (payload: T, message: CordisMessage) => void): () => void {
    return this.eventBus.subscribe(type, (message) => {
      handler(message.payload, message)
    })
  }
  
  // 请求-响应
  async request<TRequest, TResponse>(
    type: string,
    payload: TRequest,
    target?: string
  ): Promise<TResponse> {
    const transport = new RequestResponseTransport(this.eventBus)
    return transport.request(type, payload, {
      source: this.appId,
      target
    })
  }
  
  // 响应请求
  respond<TRequest, TResponse>(
    type: string,
    handler: (payload: TRequest) => Promise<TResponse> | TResponse
  ): () => void {
    const transport = new RequestResponseTransport(this.eventBus)
    return transport.respond(type, handler)
  }
}

// Vue 组合式 API
const CORDIS_COMM_KEY = Symbol('cordis-comm')

export function provideCordisComm(eventBus: CordisEventBus, appId: string): void {
  const adapter = new VueCommunicationAdapter(eventBus, appId)
  provide(CORDIS_COMM_KEY, adapter)
}

export function useCordisComm(): VueCommunicationAdapter {
  const adapter = inject(CORDIS_COMM_KEY) as VueCommunicationAdapter
  if (!adapter) {
    throw new Error('Cordis communication not provided')
  }
  return adapter
}

// 自动清理订阅
export function useCordisSubscription<T>(
  type: string,
  handler: (payload: T, message: CordisMessage) => void
): void {
  const comm = useCordisComm()
  let unsubscribe: (() => void) | null = null
  
  onMounted(() => {
    unsubscribe = comm.on(type, handler)
  })
  
  onUnmounted(() => {
    unsubscribe?.()
  })
}

// 在 Vue 组件中使用
export default {
  setup() {
    const comm = useCordisComm()
    
    // 发送消息
    const addToCart = (itemId: string) => {
      comm.send('cart:add', { itemId, quantity: 1 })
    }
    
    // 订阅消息
    useCordisSubscription('user:login', (payload) => {
      console.log('User logged in:', payload.userId)
    })
    
    // 请求-响应
    const fetchUserData = async (userId: string) => {
      const userData = await comm.request('user:get', { userId })
      return userData
    }
    
    return { addToCart, fetchUserData }
  }
}
```

### 5.2 React 适配器

```typescript
// @cordis/adapter/react
import { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react'

class ReactCommunicationAdapter {
  private eventBus: CordisEventBus
  private appId: string
  private transport: RequestResponseTransport
  
  constructor(eventBus: CordisEventBus, appId: string) {
    this.eventBus = eventBus
    this.appId = appId
    this.transport = new RequestResponseTransport(eventBus)
  }
  
  // 发送消息
  send<T>(type: string, payload: T, target?: string): void {
    const message = new MessageBuilder(type)
      .from(this.appId)
      .to(target)
      .withPayload(payload)
      .build()
    
    this.eventBus.publish(message)
  }
  
  // 订阅消息
  on<T>(type: string, handler: (payload: T, message: CordisMessage) => void): () => void {
    return this.eventBus.subscribe(type, (message) => {
      handler(message.payload, message)
    })
  }
  
  // 请求-响应
  async request<TRequest, TResponse>(
    type: string,
    payload: TRequest,
    target?: string
  ): Promise<TResponse> {
    return this.transport.request(type, payload, {
      source: this.appId,
      target
    })
  }
}

// React Context
const CordisCommContext = createContext<ReactCommunicationAdapter | null>(null)

export function CordisCommProvider({ 
  children, 
  eventBus, 
  appId 
}: { 
  children: React.ReactNode
  eventBus: CordisEventBus
  appId: string 
}) {
  // 复用 Transport 和 Adapter，防止每次渲染创建新对象
  const adapter = useMemo(() => new ReactCommunicationAdapter(eventBus, appId), [eventBus, appId])
  
  return (
    <CordisCommContext.Provider value={adapter}>
      {children}
    </CordisCommContext.Provider>
  )
}

export function useCordisComm(): ReactCommunicationAdapter {
  const adapter = useContext(CordisCommContext)
  if (!adapter) {
    throw new Error('Cordis communication not provided')
  }
  return adapter
}

// 自定义 Hook：订阅消息
export function useCordisSubscription<T>(
  type: string,
  handler: (payload: T, message: CordisMessage) => void
): void {
  const comm = useCordisComm()
  
  useEffect(() => {
    const unsubscribe = comm.on(type, handler)
    return unsubscribe
  }, [type, handler])
}

// 自定义 Hook：请求-响应
export function useCordisRequest<TRequest, TResponse>(
  type: string
): [(payload: TRequest, target?: string) => Promise<TResponse>, boolean] {
  const comm = useCordisComm()
  const [loading, setLoading] = useState(false)
  
  const request = async (payload: TRequest, target?: string): Promise<TResponse> => {
    setLoading(true)
    try {
      return await comm.request<TRequest, TResponse>(type, payload, target)
    } finally {
      setLoading(false)
    }
  }
  
  return [request, loading]
}

// 在 React 组件中使用
function CartComponent() {
  const comm = useCordisComm()
  
  const addToCart = (itemId: string) => {
    comm.send('cart:add', { itemId, quantity: 1 })
  }
  
  useCordisSubscription('user:login', (payload) => {
    console.log('User logged in:', payload.userId)
  })
  
  const [fetchUserData, loading] = useCordisRequest<{ userId: string }, UserData>('user:get')
  
  const handleFetchUser = async (userId: string) => {
    const userData = await fetchUserData({ userId })
    console.log('User data:', userData)
  }
  
  return (
    <div>
      <button onClick={() => addToCart('123')}>Add to Cart</button>
      <button onClick={() => handleFetchUser('456')} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch User'}
      </button>
    </div>
  )
}
```

---

## 六、消息路由

### 6.1 路由规则

```typescript
// @cordis/protocol/router
class MessageRouter {
  private routes: Map<string, RouteHandler[]> = new Map()
  private eventBus: CordisEventBus
  
  constructor(eventBus: CordisEventBus) {
    this.eventBus = eventBus
    
    // 监听所有消息
    this.eventBus.subscribe('*', (message) => {
      this.route(message)
    })
  }
  
  // 添加路由规则
  addRoute(pattern: string, handler: RouteHandler): void {
    if (!this.routes.has(pattern)) {
      this.routes.set(pattern, [])
    }
    this.routes.get(pattern)!.push(handler)
  }
  
  // 路由消息
  private async route(message: CordisMessage): Promise<void> {
    // 精确匹配
    const exactHandlers = this.routes.get(message.type)
    if (exactHandlers) {
      for (const handler of exactHandlers) {
        await this.invokeHandler(handler, message)
      }
    }
    
    // 通配符匹配
    this.routes.forEach((handlers, pattern) => {
      if (pattern.includes('*') && this.matchPattern(pattern, message.type)) {
        handlers.forEach(async (handler) => {
          await this.invokeHandler(handler, message)
        })
      }
    })
  }
  
  // 模式匹配
  private matchPattern(pattern: string, type: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return regex.test(type)
  }
  
  // 调用处理器
  private async invokeHandler(handler: RouteHandler, message: CordisMessage): Promise<void> {
    try {
      // 检查条件
      if (handler.condition && !handler.condition(message)) {
        return
      }
      
      await handler.handler(message)
    } catch (error) {
      console.error('[Cordis Router] Handler error:', error)
    }
  }
}

interface RouteHandler {
  pattern: string
  condition?: (message: CordisMessage) => boolean
  handler: (message: CordisMessage) => Promise<void> | void
}

// 使用示例
const router = new MessageRouter(eventBus)

// 精确匹配
router.addRoute('cart:add', {
  pattern: 'cart:add',
  handler: async (message) => {
    console.log('Cart add:', message.payload)
  }
})

// 通配符匹配
router.addRoute('cart:*', {
  pattern: 'cart:*',
  handler: async (message) => {
    console.log('Cart operation:', message.type, message.payload)
  }
})

// 条件路由
router.addRoute('order:create', {
  pattern: 'order:create',
  condition: (message) => message.payload.amount > 1000,
  handler: async (message) => {
    console.log('Large order:', message.payload)
  }
})
```

---

## 七、消息追踪与调试

### 7.1 消息追踪器

```typescript
// @cordis/protocol/tracer
class MessageTracer {
  private traces: Map<string, MessageTrace> = new Map()
  private eventBus: CordisEventBus
  
  constructor(eventBus: CordisEventBus) {
    this.eventBus = eventBus
    
    // 监听所有消息
    this.eventBus.subscribe('*', (message) => {
      this.recordTrace(message)
    })
  }
  
  // 记录追踪
  private recordTrace(message: CordisMessage): void {
    const trace: MessageTrace = {
      id: message.id,
      type: message.type,
      source: message.source,
      target: message.target,
      timestamp: message.timestamp,
      payload: message.payload,
      handlers: []
    }
    
    this.traces.set(message.id, trace)
  }
  
  // 记录处理器执行
  recordHandlerExecution(messageId: string, handlerName: string, duration: number): void {
    const trace = this.traces.get(messageId)
    if (!trace) return
    
    trace.handlers.push({
      name: handlerName,
      duration,
      timestamp: Date.now()
    })
  }
  
  // 获取追踪信息
  getTrace(messageId: string): MessageTrace | undefined {
    return this.traces.get(messageId)
  }
  
  // 获取所有追踪
  getAllTraces(): MessageTrace[] {
    return Array.from(this.traces.values())
  }
  
  // 清理旧追踪
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now()
    this.traces.forEach((trace, id) => {
      if (now - trace.timestamp > maxAge) {
        this.traces.delete(id)
      }
    })
  }
}

interface MessageTrace {
  id: string
  type: string
  source: string
  target?: string
  timestamp: number
  payload: any
  handlers: Array<{
    name: string
    duration: number
    timestamp: number
  }>
}
```

### 7.2 调试工具集成

```typescript
// @cordis/protocol/devtools
class CommunicationDevTools {
  private eventBus: CordisEventBus
  private tracer: MessageTracer
  
  constructor(eventBus: CordisEventBus, tracer: MessageTracer) {
    this.eventBus = eventBus
    this.tracer = tracer
    
    this.setupDevToolsHook()
  }
  
  private setupDevToolsHook(): void {
    // 监听所有消息
    this.eventBus.subscribe('*', (message) => {
      // 发送到 Chrome DevTools
      if (typeof window !== 'undefined' && (window as any).__CORDIS_DEVTOOLS__) {
        (window as any).__CORDIS_DEVTOOLS__.postMessage({
          type: 'CORDIS_MESSAGE',
          payload: message
        })
      }
    })
  }
  
  // 导出追踪数据
  exportTraces(): string {
    const traces = this.tracer.getAllTraces()
    return JSON.stringify(traces, null, 2)
  }
  
  // 生成消息流图
  generateMessageFlow(): string {
    const traces = this.tracer.getAllTraces()
    
    // 使用 Mermaid 语法生成流程图
    let mermaid = 'graph TD\n'
    
    traces.forEach(trace => {
      mermaid += `  ${trace.source} -->|${trace.type}| ${trace.target || '*'}\n`
    })
    
    return mermaid
  }
}
```

---

## 八、与现有方案对比

| 维度 | 全局变量 | EventBus | Redux | Cordis 通信协议 |
|------|----------|----------|-------|-----------------|
| **跨框架支持** | 无 | 框架相关 | 单一框架 | 框架无关 |
| **类型安全** | 无 | 无 | 有 | 有 |
| **消息追踪** | 无 | 无 | 有 | 有 |
| **请求-响应** | 无 | 无 | 无 | 有 |
| **消息队列** | 无 | 无 | 无 | 有 |
| **路由规则** | 无 | 无 | 无 | 有 |
| **调试工具** | 无 | 无 | DevTools | 有 |
| **中间件** | 无 | 无 | 有 | 有 |

---

## 九、配置示例

### 9.1 通信配置

```json
// cordis.communication.json
{
  "communication": {
    "transport": {
      "type": "event-bus",
      "maxHistorySize": 1000
    },
    "protocol": {
      "validation": true,
      "tracing": true
    },
    "routing": {
      "enabled": true,
      "rules": [
        {
          "pattern": "cart:*",
          "target": "cart-app"
        },
        {
          "pattern": "order:*",
          "target": "order-app"
        }
      ]
    }
  }
}
```

---

## 十、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 消息格式定义 | CordisMessage 类型 |
| P0 | 事件总线 | 发布-订阅模式 |
| P0 | Vue/React 适配器 | 框架集成 |
| P1 | 请求-响应模式 | 同步通信 |
| P1 | 消息验证 | Schema 验证 |
| P2 | 消息路由 | 模式匹配 |
| P2 | 消息追踪 | 调试支持 |
| P3 | 消息队列 | 异步通信 |
| P3 | DevTools 集成 | 可视化调试 |

---

## 十一、网络请求拦截与统一（扩展）

为了解决微前端架构下多个应用对 `window.fetch` 等底层 API 独立拦截带来的冲突问题，我们可以在 Cordis 层面实现统一的网络请求拦截器链。

### 11.1 Fetch 拦截器链模式

```typescript
// @cordis/transport/fetch-interceptor
export interface FetchInterceptor {
  onRequest?: (request: { input: RequestInfo | URL; init?: RequestInit }) => Promise<{ input: RequestInfo | URL; init?: RequestInit }> | { input: RequestInfo | URL; init?: RequestInit };
  onResponse?: (response: Response, request: { input: RequestInfo | URL; init?: RequestInit }) => Promise<Response> | Response;
  onError?: (error: any, request: { input: RequestInfo | URL; init?: RequestInit }) => Promise<void> | void;
}

export class FetchInterceptorChain {
  private interceptors: FetchInterceptor[] = [];
  
  use(interceptor: FetchInterceptor) {
    this.interceptors.push(interceptor);
  }
  
  install() {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let request = { input, init };
      
      // 执行所有请求拦截器
      for (const interceptor of this.interceptors) {
        if (interceptor.onRequest) {
          request = await interceptor.onRequest(request);
        }
      }
      
      try {
        let response = await originalFetch(request.input, request.init);
        
        // 执行所有响应拦截器
        for (const interceptor of this.interceptors) {
          if (interceptor.onResponse) {
            response = await interceptor.onResponse(response.clone(), request);
          }
        }
        
        return response;
      } catch (error) {
        // 执行所有错误拦截器
        for (const interceptor of this.interceptors) {
          if (interceptor.onError) {
            await interceptor.onError(error, request);
          }
        }
        throw error;
      }
    };
  }
}
```
