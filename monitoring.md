# Cordis 监控方案

## 一、问题分析

### 1.1 微前端监控的挑战

| 挑战类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| **多应用性能难以统一监控** | 各应用独立运行，性能数据分散 | 高 |
| **跨应用错误难以追踪** | 错误链路跨越多个应用，堆栈不完整 | 高 |
| **资源加载监控复杂** | 动态加载的资源难以追踪 | 中 |
| **用户行为难以关联** | 用户操作跨越多个应用，行为链路断裂 | 中 |
| **告警阈值难以设定** | 多应用场景下，单一阈值容易误报 | 中 |

### 1.2 监控目标

1. **可观测性**：全面感知系统运行状态
2. **实时性**：关键指标实时采集和告警
3. **关联性**：跨应用数据关联分析
4. **低开销**：监控本身不影响应用性能

---

## 二、监控架构

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard Layer（展示层）                                   │
│  - 实时大盘                                                  │
│  - 历史报表                                                  │
│  - 告警通知                                                  │
├─────────────────────────────────────────────────────────────┤
│  Analysis Layer（分析层）                                    │
│  - 数据聚合                                                  │
│  - 关联分析                                                  │
│  - 异常检测                                                  │
├─────────────────────────────────────────────────────────────┤
│  Storage Layer（存储层）                                     │
│  - 时序数据库                                                │
│  - 日志存储                                                  │
│  - 链路追踪                                                  │
├─────────────────────────────────────────────────────────────┤
│  Collection Layer（采集层）                                  │
│  - 性能采集                                                  │
│  - 错误采集                                                  │
│  - 行为采集                                                  │
├─────────────────────────────────────────────────────────────┤
│  Runtime Hooks（运行时钩子）                                 │
│  - 生命周期钩子                                              │
│  - 通信钩子                                                  │
│  - 状态钩子                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、监控指标体系

### 3.1 性能指标

| 指标类别 | 指标名称 | 说明 | 采集方式 |
|----------|----------|------|----------|
| **加载性能** | FCP | First Contentful Paint | Performance API |
| **加载性能** | LCP | Largest Contentful Paint | Performance API |
| **加载性能** | TTI | Time to Interactive | Performance API |
| **加载性能** | 应用加载时间 | 从开始加载到激活完成 | 生命周期钩子 |
| **运行时性能** | FPS | 每秒帧数 | requestAnimationFrame |
| **运行时性能** | 内存占用 | JS 堆内存大小 | performance.memory |
| **运行时性能** | CPU 占用 | 主线程阻塞时间 | Long Task API |
| **运行时性能** | 游离 DOM 树 | 卸载后未回收的 DOM 节点 | WeakRef 检测 |
| **通信性能** | 消息延迟 | 消息从发送到接收的时间 | 通信钩子 |
| **通信性能** | 消息吞吐量 | 每秒处理消息数 | 通信钩子 |

### 3.2 错误指标

| 指标类别 | 指标名称 | 说明 | 采集方式 |
|----------|----------|------|----------|
| **JS 错误** | 错误率 | JS 错误/PV | window.onerror |
| **JS 错误** | 错误数 | 每分钟 JS 错误数 | window.onerror |
| **资源错误** | 加载失败率 | 资源加载失败/总加载 | error 事件 |
| **资源错误** | SRI 校验失败 | 完整性校验失败次数 | SRI 检查器 |
| **API 错误** | 接口错误率 | 接口失败/总请求 | fetch 拦截 |
| **API 错误** | 接口超时率 | 超时请求/总请求 | fetch 拦截 |
| **生命周期错误** | 加载失败率 | 应用加载失败/总加载 | 生命周期钩子 |
| **安全事件** | 安全事件数 | XSS、沙箱逃逸等 | 安全审计日志 |

### 3.3 业务指标

| 指标类别 | 指标名称 | 说明 | 采集方式 |
|----------|----------|------|----------|
| **用户行为** | PV | 页面浏览量 | 路由变化 |
| **用户行为** | UV | 独立访客数 | 用户标识 |
| **用户行为** | 应用切换次数 | 应用间切换频率 | 生命周期钩子 |
| **用户行为** | 平均停留时间 | 用户在应用内的停留时间 | 路由变化 |
| **业务转化** | 核心流程完成率 | 关键业务流程完成情况 | 自定义事件 |

---

## 四、数据采集

### 4.1 性能采集器

```typescript
// @cordis/monitor/performance
class PerformanceCollector {
  private metrics: PerformanceMetrics = {
    loadTimes: [],
    fps: [],
    memoryUsage: [],
    longTasks: [],
    resourceTiming: []
  }
  
  private observer: PerformanceObserver | null = null
  private fpsTimer: number | null = null
  
  // 开始采集
  start(): void {
    this.observePaintTiming()
    this.observeResourceTiming()
    this.observeLongTask()
    this.startFPSMonitoring()
    this.startMemoryMonitoring()
  }
  
  // 停止采集
  stop(): void {
    this.observer?.disconnect()
    if (this.fpsTimer) cancelAnimationFrame(this.fpsTimer)
  }
  
  // 监控 Paint 指标
  private observePaintTiming(): void {
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          this.metrics.fcp = entry.startTime
        }
        if (entry.name === 'largest-contentful-paint') {
          this.metrics.lcp = entry.startTime
        }
      }
    })
    this.observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] })
  }
  
  // 监控资源加载
  private observeResourceTiming(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.metrics.resourceTiming.push({
          name: entry.name,
          duration: entry.duration,
          transferSize: entry.transferSize,
          initiatorType: entry.initiatorType
        })
        
        // 限制资源记录数量上限
        if (this.metrics.resourceTiming.length > 500) {
          this.metrics.resourceTiming.shift()
        }
      }
    })
    observer.observe({ entryTypes: ['resource'] })
  }
  
  // 监控长任务
  private observeLongTask(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.metrics.longTasks.push({
          duration: entry.duration,
          startTime: entry.startTime
        })
        
        // 长任务超过 50ms 告警（Web 标准 Long Task 阈值为 50ms）
        if (entry.duration > 50) {
          monitorAlert.trigger('LONG_TASK', {
            duration: entry.duration,
            startTime: entry.startTime
          })
        }
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  }
  
  // FPS 监控
  private startFPSMonitoring(): void {
    let lastTime = performance.now()
    let frames = 0
    
    const measureFPS = () => {
      frames++
      const now = performance.now()
      
      if (now - lastTime >= 1000) {
        const fps = frames
        this.metrics.fps.push({ fps, timestamp: Date.now() })
        
        // FPS 低于 30 告警
        if (fps < 30) {
          monitorAlert.trigger('LOW_FPS', { fps })
        }
        
        frames = 0
        lastTime = now
      }
      
      this.fpsTimer = requestAnimationFrame(measureFPS)
    }
    
    this.fpsTimer = requestAnimationFrame(measureFPS)
  }
  
  // 内在监控
  private memoryInterval: number | null = null
  
  private startMemoryMonitoring(): void {
    this.memoryInterval = window.setInterval(() => {
      // Chrome only - 需要特性检测
      if ('memory' in performance) {
        const memory = (performance as any).memory
        this.metrics.memoryUsage.push({
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
          timestamp: Date.now()
        })
        
        // 内存使用超过 80% 告警
        const usage = memory.usedJSHeapSize / memory.jsHeapSizeLimit
        if (usage > 0.8) {
          monitorAlert.trigger('HIGH_MEMORY', {
            used: memory.usedJSHeapSize,
            limit: memory.jsHeapSizeLimit,
            usage
          })
        }
      } else {
        // 降级方案：使用 Performance Observer 监控资源占用
        // 或使用 navigator.deviceMemory 获取设备内存信息
      }
    }, 5000)
  }
  
  // 记录应用加载时间
  recordAppLoadTime(appId: string, duration: number): void {
    this.metrics.loadTimes.push({
      appId,
      duration,
      timestamp: Date.now()
    })
    
    // 加载时间超过 3s 告警
    if (duration > 3000) {
      monitorAlert.trigger('SLOW_LOAD', { appId, duration })
    }
  }
  
  // 获取指标
  getMetrics(): PerformanceMetrics {
    return this.metrics
  }
  
  // 获取聚合数据
  getAggregatedMetrics(): AggregatedMetrics {
    return {
      averageFPS: this.calculateAverage(this.metrics.fps.map(f => f.fps)),
      averageLoadTime: this.calculateAverage(this.metrics.loadTimes.map(l => l.duration)),
      memoryTrend: this.calculateMemoryTrend(this.metrics.memoryUsage),
      longTaskCount: this.metrics.longTasks.length
    }
  }
  
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, val) => sum + val, 0) / values.length
  }
  
  private calculateMemoryTrend(usage: Array<{ used: number }>): 'increasing' | 'stable' | 'decreasing' {
    if (usage.length < 2) return 'stable'
    const recent = usage.slice(-10)
    const first = recent[0].used
    const last = recent[recent.length - 1].used
    const diff = (last - first) / first
    
    if (diff > 0.1) return 'increasing'
    if (diff < -0.1) return 'decreasing'
    return 'stable'
  }
}

interface PerformanceMetrics {
  fcp?: number
  lcp?: number
  loadTimes: Array<{ appId: string, duration: number, timestamp: number }>
  fps: Array<{ fps: number, timestamp: number }>
  memoryUsage: Array<{ used: number, total: number, limit: number, timestamp: number }>
  longTasks: Array<{ duration: number, startTime: number }>
  resourceTiming: Array<{ name: string, duration: number, transferSize: number, initiatorType: string }>
}

interface AggregatedMetrics {
  averageFPS: number
  averageLoadTime: number
  memoryTrend: 'increasing' | 'stable' | 'decreasing'
  longTaskCount: number
}
```

### 4.2 错误采集器

```typescript
// @cordis/monitor/error
class ErrorCollector {
  private errors: CordisErrorEvent[] = []
  private maxErrors: number = 1000
  
  // 开始采集
  start(fetchInterceptorChain?: any): void {
    this.captureJSErrors()
    this.captureResourceErrors()
    this.capturePromiseRejections()
    if (fetchInterceptorChain) {
      this.captureAPIErrors(fetchInterceptorChain)
    }
  }
  
  // 捕获 JS 错误
  private captureJSErrors(): void {
    window.addEventListener('error', (event) => {
      this.recordError({
        type: 'JS_ERROR',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        timestamp: Date.now()
      })
    })
  }
  
  // 捕获资源加载错误
  private captureResourceErrors(): void {
    window.addEventListener('error', (event) => {
      const target = event.target as HTMLElement
      
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK' || target.tagName === 'IMG')) {
        this.recordError({
          type: 'RESOURCE_ERROR',
          message: `Failed to load resource: ${target.getAttribute('src') || target.getAttribute('href')}`,
          resourceType: target.tagName,
          url: target.getAttribute('src') || target.getAttribute('href'),
          timestamp: Date.now()
        })
      }
    }, true)  // 使用捕获阶段
  }
  
  // 捕获 Promise 错误
  private capturePromiseRejections(): void {
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError({
        type: 'PROMISE_REJECTION',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        timestamp: Date.now()
      })
    })
  }
  
  // 捕获 API 错误
  // 注：使用 communication-protocol.md 中统一的 FetchInterceptorChain，避免直接覆盖 window.fetch 导致冲突
  private captureAPIErrors(fetchInterceptorChain: any): void {
    fetchInterceptorChain.use(async (config: any, next: any) => {
      const startTime = performance.now()
      const url = typeof config.url === 'string' ? config.url : ''
      
      try {
        const response = await next(config)
        const duration = performance.now() - startTime
        
        // 记录 API 调用
        this.recordAPIRequest({
          url,
          method: config.method || 'GET',
          status: response.status,
          duration,
          success: response.ok,
          timestamp: Date.now()
        })
        
        // 非 2xx 状态码记录错误
        if (!response.ok) {
          this.recordError({
            type: 'API_ERROR',
            message: `API request failed: ${response.status}`,
            url,
            status: response.status,
            duration,
            timestamp: Date.now()
          })
        }
        
        return response
      } catch (error: any) {
        const duration = performance.now() - startTime
        
        this.recordError({
          type: 'API_ERROR',
          message: error.message,
          url,
          duration,
          timestamp: Date.now()
        })
        
        throw error
      }
    })
  }
  
  // 记录错误
  private recordError(error: CordisErrorEvent): void {
    this.errors.push(error)
    
    // 限制错误数量
    if (this.errors.length > this.maxErrors) {
      this.errors.shift()
    }
    
    // 上报错误
    this.reportError(error)
    
    // 触发告警
    if (error.type === 'JS_ERROR') {
      monitorAlert.trigger('JS_ERROR', error)
    }
  }
  
  // 记录 API 请求
  private apiRequests: APIRequest[] = []
  
  private recordAPIRequest(request: APIRequest): void {
    this.apiRequests.push(request)
    
    if (this.apiRequests.length > 1000) {
      this.apiRequests.shift()
    }
  }
  
  // 上报错误
  private async reportError(error: CordisErrorEvent): Promise<void> {
    // 批量上报
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(error)], { type: 'application/json' })
      navigator.sendBeacon('/api/monitor/errors', blob)
    }
  }
  
  // 获取错误列表
  getErrors(filter?: ErrorFilter): CordisErrorEvent[] {
    if (!filter) return this.errors
    
    return this.errors.filter(error => {
      if (filter.type && error.type !== filter.type) return false
      if (filter.startTime && error.timestamp < filter.startTime) return false
      if (filter.endTime && error.timestamp > filter.endTime) return false
      return true
    })
  }
  
  // 获取错误统计
  getErrorStats(): ErrorStats {
    const stats: ErrorStats = {
      total: this.errors.length,
      byType: {},
      byApp: {}
    }
    
    this.errors.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1
      if (error.appId) {
        stats.byApp[error.appId] = (stats.byApp[error.appId] || 0) + 1
      }
    })
    
    return stats
  }
}

interface CordisErrorEvent {
  type: string
  message: string
  filename?: string
  lineno?: number
  colno?: number
  stack?: string
  appId?: string
  url?: string
  status?: number
  duration?: number
  resourceType?: string
  timestamp: number
}

interface APIRequest {
  url: string
  method: string
  status: number
  duration: number
  success: boolean
  timestamp: number
}

interface ErrorFilter {
  type?: string
  startTime?: number
  endTime?: number
}

interface ErrorStats {
  total: number
  byType: Record<string, number>
  byApp: Record<string, number>
}
```

### 4.3 生命周期监控

```typescript
// @cordis/monitor/lifecycle
class LifecycleMonitor {
  private events: LifecycleEvent[] = []
  private appStates: Map<string, string> = new Map()
  
  constructor(lifecycleManager: LifecycleManager) {
    this.setupHooks(lifecycleManager)
  }
  
  private setupHooks(lifecycleManager: LifecycleManager): void {
    // 监听所有生命周期事件
    const events = [
      'before:load', 'after:load',
      'before:activate', 'after:activate',
      'before:deactivate', 'after:deactivate',
      'before:destroy', 'after:destroy',
      'error'
    ]
    
    events.forEach(event => {
      lifecycleManager.on('*', event as any, (context: AppContext) => {
        this.recordEvent({
          type: event,
          appId: context.appId,
          timestamp: Date.now(),
          fromState: this.appStates.get(context.appId),
          toState: this.getNextState(event)
        })
        
        // 更新应用状态
        this.appStates.set(context.appId, this.getNextState(event))
      })
    })
  }
  
  private getNextState(event: string): string {
    const stateMap: Record<string, string> = {
      'before:load': 'loading',
      'after:load': 'loaded',
      'before:activate': 'activating',
      'after:activate': 'active',
      'before:deactivate': 'deactivating',
      'after:deactivate': 'deactivated',
      'before:destroy': 'destroying',
      'after:destroy': 'destroyed',
      'error': 'error'
    }
    return stateMap[event] || 'unknown'
  }
  
  private recordEvent(event: LifecycleEvent): void {
    this.events.push(event)
    
    // 状态转换异常告警
    if (event.fromState === 'active' && event.toState === 'destroyed') {
      monitorAlert.trigger('UNEXPECTED_DESTROY', event)
    }
  }
  
  // 获取应用状态统计
  getAppStateStats(): Record<string, number> {
    const stats: Record<string, number> = {}
    this.appStates.forEach(state => {
      stats[state] = (stats[state] || 0) + 1
    })
    return stats
  }
  
  // 获取应用切换频率
  getSwitchFrequency(appId: string): number {
    const appEvents = this.events.filter(e => e.appId === appId)
    let switches = 0
    
    for (let i = 1; i < appEvents.length; i++) {
      if (appEvents[i].toState === 'active' && appEvents[i - 1].toState !== 'active') {
        switches++
      }
    }
    
    return switches
  }
}

interface LifecycleEvent {
  type: string
  appId: string
  timestamp: number
  fromState?: string
  toState?: string
}
```

### 4.4 通信监控

```typescript
// @cordis/monitor/communication
class CommunicationMonitor {
  private messages: MessageRecord[] = []
  private latencyRecords: Map<string, number[]> = new Map()
  
  constructor(eventBus: CordisEventBus) {
    // 监听所有消息
    eventBus.subscribe('*', (message) => {
      this.recordMessage(message)
    })
  }
  
  private recordMessage(message: CordisMessage): void {
    const record: MessageRecord = {
      id: message.id,
      type: message.type,
      source: message.source,
      target: message.target,
      timestamp: message.timestamp,
      size: JSON.stringify(message.payload).length
    }
    
    this.messages.push(record)
    
    // 限制记录数量
    if (this.messages.length > 5000) {
      this.messages.shift()
    }
    
    // 消息频率告警
    const recentMessages = this.messages.filter(
      m => Date.now() - m.timestamp < 1000
    )
    if (recentMessages.length > 100) {
      monitorAlert.trigger('HIGH_MESSAGE_RATE', {
        count: recentMessages.length,
        timeWindow: 1000
      })
    }
  }
  
  // 记录消息延迟
  recordLatency(messageType: string, duration: number): void {
    if (!this.latencyRecords.has(messageType)) {
      this.latencyRecords.set(messageType, [])
    }
    
    const records = this.latencyRecords.get(messageType)!
    records.push(duration)
    
    // 保留最近 100 条
    if (records.length > 100) {
      records.shift()
    }
    
    // 延迟超过 500ms 告警
    if (duration > 500) {
      monitorAlert.trigger('HIGH_LATENCY', {
        messageType,
        duration
      })
    }
  }
  
  // 获取通信统计
  getCommunicationStats(): CommunicationStats {
    const stats: CommunicationStats = {
      totalMessages: this.messages.length,
      byType: {},
      bySource: {},
      byTarget: {},
      averageLatency: {}
    }
    
    this.messages.forEach(msg => {
      stats.byType[msg.type] = (stats.byType[msg.type] || 0) + 1
      stats.bySource[msg.source] = (stats.bySource[msg.source] || 0) + 1
      if (msg.target) {
        stats.byTarget[msg.target] = (stats.byTarget[msg.target] || 0) + 1
      }
    })
    
    // 计算平均延迟
    this.latencyRecords.forEach((records, type) => {
      stats.averageLatency[type] = 
        records.reduce((sum, val) => sum + val, 0) / records.length
    })
    
    return stats
  }
}

interface MessageRecord {
  id: string
  type: string
  source: string
  target?: string
  timestamp: number
  size: number
}

interface CommunicationStats {
  totalMessages: number
  byType: Record<string, number>
  bySource: Record<string, number>
  byTarget: Record<string, number>
  averageLatency: Record<string, number>
}
```

### 4.5 用户行为采集

```typescript
// @cordis/monitor/behavior
class BehaviorCollector {
  private behaviors: BehaviorEvent[] = []
  private sessionStart: number = Date.now()
  private currentApp: string | null = null
  private appEnterTime: Map<string, number> = new Map()
  
  constructor(routerManager: RouterManager) {
    this.trackRouteChanges(routerManager)
    this.trackUserInteractions()
  }
  
  // 追踪路由变化
  private trackRouteChanges(routerManager: RouterManager): void {
    routerManager.onChange((route) => {
      // 记录应用切换
      if (this.currentApp && this.currentApp !== route.appId) {
        const enterTime = this.appEnterTime.get(this.currentApp)
        if (enterTime) {
          const duration = Date.now() - enterTime
          this.recordBehavior({
            type: 'APP_EXIT',
            appId: this.currentApp,
            duration,
            timestamp: Date.now()
          })
        }
      }
      
      this.currentApp = route.appId
      this.appEnterTime.set(route.appId, Date.now())
      
      this.recordBehavior({
        type: 'APP_ENTER',
        appId: route.appId,
        path: route.path,
        timestamp: Date.now()
      })
    })
  }
  
  // 追踪用户交互
  private trackUserInteractions(): void {
    // 点击事件
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      this.recordBehavior({
        type: 'CLICK',
        appId: this.currentApp || 'unknown',
        element: target.tagName,
        text: target.textContent?.slice(0, 50),
        timestamp: Date.now()
      })
    }, { passive: true })
    
    // 表单提交
    document.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement
      this.recordBehavior({
        type: 'FORM_SUBMIT',
        appId: this.currentApp || 'unknown',
        formId: form.id,
        formAction: form.action,
        timestamp: Date.now()
      })
    }, { passive: true })
  }
  
  private recordBehavior(behavior: BehaviorEvent): void {
    this.behaviors.push(behavior)
    
    // 限制记录数量
    if (this.behaviors.length > 2000) {
      this.behaviors.shift()
    }
  }
  
  // 获取会话信息
  getSessionInfo(): SessionInfo {
    return {
      sessionId: this.generateSessionId(),
      startTime: this.sessionStart,
      duration: Date.now() - this.sessionStart,
      appVisits: this.getAppVisits(),
      interactionCount: this.behaviors.filter(b => b.type === 'CLICK').length
    }
  }
  
  private getAppVisits(): Record<string, number> {
    const visits: Record<string, number> = {}
    this.behaviors
      .filter(b => b.type === 'APP_ENTER')
      .forEach(b => {
        visits[b.appId] = (visits[b.appId] || 0) + 1
      })
    return visits
  }
  
  private generateSessionId(): string {
    return `${this.sessionStart}-${Math.random().toString(36).substr(2, 9)}`
  }
}

interface BehaviorEvent {
  type: 'CLICK' | 'FORM_SUBMIT' | 'APP_ENTER' | 'APP_EXIT'
  appId: string
  timestamp: number
  element?: string
  text?: string
  path?: string
  formId?: string
  formAction?: string
  duration?: number
}

interface SessionInfo {
  sessionId: string
  startTime: number
  duration: number
  appVisits: Record<string, number>
  interactionCount: number
}
```

### 4.6 分布式链路追踪 (W3C TraceContext)

微前端架构下，一个完整的业务请求可能跨越宿主、多个子应用以及后端 API。我们采用 W3C TraceContext 标准（`traceparent` 和 `tracestate`）来实现全链路追踪，以便在发生错误或性能瓶颈时能完整回溯跨应用调用链。

```typescript
// @cordis/monitor/tracing
import { Context, Service } from 'cordis'

export class TracingService extends Service {
  static [Service.provide] = 'tracing'
  
  private currentTraceId: string | null = null

  constructor(ctx: Context) {
    super(ctx)
  }

  // 生成符合 W3C 标准的 traceparent
  private generateTraceparent(): string {
    const version = '00'
    const traceId = this.currentTraceId || this.generateId(32)
    const spanId = this.generateId(16)
    const traceFlags = '01' // sampled
    
    return `${version}-${traceId}-${spanId}-${traceFlags}`
  }

  private generateId(length: number): string {
    return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }

  // 跨应用消息传递中注入 traceContext
  injectTraceContext(message: any): any {
    return {
      ...message,
      meta: {
        ...message.meta,
        traceparent: this.generateTraceparent()
      }
    }
  }

  // 从消息中提取 traceContext
  extractTraceContext(message: any): void {
    if (message.meta?.traceparent) {
      const [, traceId] = message.meta.traceparent.split('-')
      this.currentTraceId = traceId
    }
  }
}

// 在网络请求中自动注入 traceparent
export function TracingPlugin(ctx: Context) {
  ctx.plugin(TracingService)
  
  // 使用 ctx.effect 注册副作用，确保在插件卸载时恢复原状
  ctx.effect(() => {
    const originalFetch = window.fetch
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const traceparent = ctx.tracing.generateTraceparent()
      
      const headers = new Headers(init?.headers)
      headers.set('traceparent', traceparent)
      
      return originalFetch(input, { ...init, headers })
    }
    
    // 返回 disposer，在 ctx 销毁时恢复全局 fetch
    return () => {
      window.fetch = originalFetch
    }
  })
}
```

### 4.7 内存泄漏与游离 DOM 检测

微应用在卸载 (unmount) 后，可能因为未清理的事件监听器、观察者或闭包引用导致 DOM 树无法被垃圾回收，形成“游离 DOM” (Detached DOM Tree)，进而引发严重的内存泄漏。通过结合 Cordis 插件的生命周期和 `WeakRef`，我们可以主动检测此类问题。

```typescript
// @cordis/monitor/memory-leak
import { Context } from 'cordis'

export function MemoryLeakDetectionPlugin(ctx: Context) {
  const detachedNodes = new Set<WeakRef<Element>>()

  // 假设子应用挂载时会触发此事件
  ctx.on('app:unmounted', (appCtx: Context, rootElement: Element) => {
    // 1. 将应用根节点包装为 WeakRef
    const weakRef = new WeakRef(rootElement)
    detachedNodes.add(weakRef)

    // 2. 在应用卸载后，延时检测游离 DOM（给 GC 留出时间）
    setTimeout(() => {
      const el = weakRef.deref()
      if (el) {
        // 如果元素依然能被 deref() 获取，说明被其他地方（如未销毁的 Fiber 或未解除的事件绑定）强引用了
        console.warn(`[Memory Leak] Detached DOM Tree detected for app: ${appCtx.name}`)
        
        ctx.emit('monitor:alert', {
          type: 'MEMORY_LEAK',
          message: 'Detached DOM Tree detected after micro-app unmount',
          appId: appCtx.name
        })
      } else {
        // 正常被垃圾回收
        detachedNodes.delete(weakRef)
      }
    }, 10000)
  })
}
```

---

## 五、告警系统

### 5.1 告警规则引擎

```typescript
// @cordis/monitor/alert
class AlertEngine {
  private rules: Map<string, AlertRule> = new Map()
  private callbacks: Map<string, Set<(alert: MonitorAlert) => void>> = new Map()
  private alertHistory: MonitorAlert[] = []
  private cooldowns: Map<string, number> = new Map()
  
  // 注册告警规则
  registerRule(name: string, rule: AlertRule): void {
    this.rules.set(name, rule)
  }
  
  // 触发告警
  trigger(alertType: string, data: any): void {
    // 检查冷却时间
    if (this.isInCooldown(alertType)) {
      return
    }
    
    const rule = this.rules.get(alertType)
    const severity = rule?.severity || 'medium'
    
    const alert: MonitorAlert = {
      id: this.generateId(),
      type: alertType,
      severity,
      data,
      timestamp: Date.now()
    }
    
    // 记录告警
    this.alertHistory.push(alert)
    if (this.alertHistory.length > 1000) {
      this.alertHistory.shift()
    }
    
    // 设置冷却
    this.setCooldown(alertType, rule?.cooldown || 60000)
    
    // 通知订阅者
    const callbacks = this.callbacks.get(alertType)
    if (callbacks) {
      callbacks.forEach(cb => cb(alert))
    }
    
    // 全局订阅者
    const globalCallbacks = this.callbacks.get('*')
    if (globalCallbacks) {
      globalCallbacks.forEach(cb => cb(alert))
    }
    
    // 上报告警
    this.reportAlert(alert)
    
    // 严重告警立即通知
    if (severity === 'critical') {
      this.notifyCritical(alert)
    }
  }
  
  // 订阅告警
  onAlert(alertType: string, callback: (alert: MonitorAlert) => void): () => void {
    if (!this.callbacks.has(alertType)) {
      this.callbacks.set(alertType, new Set())
    }
    this.callbacks.get(alertType)!.add(callback)
    
    return () => {
      this.callbacks.get(alertType)?.delete(callback)
    }
  }
  
  // 检查冷却
  private isInCooldown(alertType: string): boolean {
    const cooldownEnd = this.cooldowns.get(alertType)
    if (!cooldownEnd) return false
    return Date.now() < cooldownEnd
  }
  
  // 设置冷却
  private setCooldown(alertType: string, duration: number): void {
    this.cooldowns.set(alertType, Date.now() + duration)
  }
  
  // 上报告警
  private async reportAlert(alert: MonitorAlert): Promise<void> {
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(alert)], { type: 'application/json' })
      navigator.sendBeacon('/api/monitor/alerts', blob)
    }
  }
  
  // 通知严重告警
  private async notifyCritical(alert: MonitorAlert): Promise<void> {
    // 发送邮件/短信/钉钉等通知
    await fetch('/api/monitor/alerts/critical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert)
    })
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
  
  // 获取告警历史
  getAlertHistory(filter?: AlertFilter): MonitorAlert[] {
    if (!filter) return this.alertHistory
    
    return this.alertHistory.filter(alert => {
      if (filter.type && alert.type !== filter.type) return false
      if (filter.severity && alert.severity !== filter.severity) return false
      if (filter.startTime && alert.timestamp < filter.startTime) return false
      if (filter.endTime && alert.timestamp > filter.endTime) return false
      return true
    })
  }
}

interface AlertRule {
  condition: (data: any) => boolean
  severity: 'low' | 'medium' | 'high' | 'critical'
  cooldown: number  // 冷却时间（毫秒）
}

interface MonitorAlert {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  data: any
  timestamp: number
}

interface AlertFilter {
  type?: string
  severity?: string
  startTime?: number
  endTime?: number
}
```

### 5.2 内置告警规则

```typescript
// @cordis/monitor/rules
class BuiltinAlertRules {
  static registerAll(alertEngine: AlertEngine): void {
    // JS 错误告警
    alertEngine.registerRule('JS_ERROR', {
      condition: (data) => true,
      severity: 'high',
      cooldown: 30000
    })
    
    // 低 FPS 告警
    alertEngine.registerRule('LOW_FPS', {
      condition: (data) => data.fps < 30,
      severity: 'medium',
      cooldown: 60000
    })
    
    // 高内存告警
    alertEngine.registerRule('HIGH_MEMORY', {
      condition: (data) => data.usage > 0.8,
      severity: 'high',
      cooldown: 60000
    })
    
    // 慢加载告警
    alertEngine.registerRule('SLOW_LOAD', {
      condition: (data) => data.duration > 3000,
      severity: 'medium',
      cooldown: 120000
    })
    
    // 长任务告警
    alertEngine.registerRule('LONG_TASK', {
      condition: (data) => data.duration > 50,
      severity: 'low',
      cooldown: 30000
    })
    
    // API 错误告警
    alertEngine.registerRule('API_ERROR', {
      condition: (data) => data.status >= 500,
      severity: 'high',
      cooldown: 60000
    })
    
    // 消息频率告警
    alertEngine.registerRule('HIGH_MESSAGE_RATE', {
      condition: (data) => data.count > 100,
      severity: 'medium',
      cooldown: 60000
    })
    
    // 通信延迟告警
    alertEngine.registerRule('HIGH_LATENCY', {
      condition: (data) => data.duration > 500,
      severity: 'medium',
      cooldown: 60000
    })
    
    // 意外销毁告警
    alertEngine.registerRule('UNEXPECTED_DESTROY', {
      condition: () => true,
      severity: 'critical',
      cooldown: 0
    })
  }
}
```

---

## 六、数据上报

### 6.1 批量上报器

```typescript
// @cordis/monitor/reporter
class PersistentEventQueue {
  private dbName = 'cordis-monitor-events';
  
  async persist(events: MonitorEvent[]) {
    const db = await this.openDB();
    const tx = db.transaction('events', 'readwrite');
    events.forEach(e => tx.objectStore('events').add(e));
    await tx.done;
  }
  
  async recover(): Promise<MonitorEvent[]> {
    const db = await this.openDB();
    return db.getAll('events');
  }

  private async openDB(): Promise<any> {
    // 简化的 IndexedDB 打开逻辑，实际需要使用 idb 库
    return {} as any;
  }
}

class BatchReporter {
  private queue: MonitorEvent[] = []
  private persistentQueue = new PersistentEventQueue()
  private flushInterval: number = 10000  // 10秒
  private batchSize: number = 50
  private timer: number | null = null
  
  constructor(private endpoint: string) {
    this.startTimer()
    
    // 页面关闭时上报
    window.addEventListener('beforeunload', () => {
      this.flush()
    })
    
    // 页面隐藏时上报
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.flush()
      }
    })
  }
  
  // 添加事件到队列
  enqueue(event: MonitorEvent): void {
    this.queue.push({
      ...event,
      timestamp: event.timestamp || Date.now()
    })
    
    // 达到批量大小立即上报
    if (this.queue.length >= this.batchSize) {
      this.flush()
    }
  }
  
  // 上报
  async flush(): Promise<void> {
    if (this.queue.length === 0) return
    
    const events = [...this.queue]
    this.queue = []
    
    try {
      // 使用 sendBeacon 上报
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ events })], { type: 'application/json' })
        const success = navigator.sendBeacon(this.endpoint, blob)
        
        if (!success) {
          // 失败则重新入队并持久化
          this.queue.unshift(...events)
          await this.persistentQueue.persist(events)
        }
      } else {
        // 降级到 fetch
        await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
          keepalive: true
        })
      }
    } catch (error) {
      // 失败则重新入队并持久化
      this.queue.unshift(...events)
      await this.persistentQueue.persist(events)
    }
  }
  
  // 启动定时器
  private startTimer(): void {
    this.timer = window.setInterval(() => {
      this.flush()
    }, this.flushInterval)
  }
  
  // 停止
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.flush()
  }
}

interface MonitorEvent {
  type: string
  timestamp?: number
  [key: string]: any
}
```

### 6.2 采样控制

```typescript
// @cordis/monitor/sampler
class EventSampler {
  private sampleRates: Map<string, number> = new Map()
  
  // 设置采样率
  setSampleRate(eventType: string, rate: number): void {
    this.sampleRates.set(eventType, rate)
  }
  
  // 判断是否采样
  shouldSample(eventType: string): boolean {
    const rate = this.sampleRates.get(eventType) ?? 1.0
    return Math.random() < rate
  }
  
  // 采样事件
  sample(event: MonitorEvent): MonitorEvent | null {
    if (this.shouldSample(event.type)) {
      return event
    }
    return null
  }
}
```

---

## 七、监控仪表盘

### 7.1 实时大盘

```typescript
// @cordis/monitor/dashboard
class MonitorDashboard {
  private collectors: Map<string, any> = new Map()
  
  constructor() {
    this.collectors.set('performance', new PerformanceCollector())
    this.collectors.set('error', new ErrorCollector())
    this.collectors.set('lifecycle', new LifecycleMonitor(lifecycleManager))
    this.collectors.set('communication', new CommunicationMonitor(eventBus))
    this.collectors.set('behavior', new BehaviorCollector(routerManager))
  }
  
  // 获取实时数据
  getRealtimeData(): RealtimeData {
    const performance = this.collectors.get('performance') as PerformanceCollector
    const error = this.collectors.get('error') as ErrorCollector
    const lifecycle = this.collectors.get('lifecycle') as LifecycleMonitor
    const communication = this.collectors.get('communication') as CommunicationMonitor
    
    return {
      timestamp: Date.now(),
      performance: performance.getAggregatedMetrics(),
      errors: error.getErrorStats(),
      appStates: lifecycle.getAppStateStats(),
      communication: communication.getCommunicationStats()
    }
  }
  
  // 生成报告
  generateReport(timeRange: TimeRange): MonitorReport {
    return {
      timeRange,
      summary: this.generateSummary(timeRange),
      performance: this.generatePerformanceReport(timeRange),
      errors: this.generateErrorReport(timeRange),
      usage: this.generateUsageReport(timeRange)
    }
  }
  
  private generateSummary(timeRange: TimeRange): ReportSummary {
    // 生成摘要
    return {
      totalApps: this.getAppCount(),
      totalErrors: this.getErrorCount(timeRange),
      averageLoadTime: this.getAverageLoadTime(timeRange),
      uptimePercentage: this.getUptimePercentage(timeRange)
    }
  }
  
  // ... 其他报告生成方法
}

interface RealtimeData {
  timestamp: number
  performance: AggregatedMetrics
  errors: ErrorStats
  appStates: Record<string, number>
  communication: CommunicationStats
}

interface TimeRange {
  start: number
  end: number
}

interface MonitorReport {
  timeRange: TimeRange
  summary: ReportSummary
  performance: any
  errors: any
  usage: any
}

interface ReportSummary {
  totalApps: number
  totalErrors: number
  averageLoadTime: number
  uptimePercentage: number
}
```

---

## 八、配置

### 8.1 监控配置

```json
// cordis.monitor.json
{
  "monitor": {
    "enabled": true,
    "endpoint": "/api/monitor",
    "sampling": {
      "performance": 1.0,
      "errors": 1.0,
      "behavior": 0.1,
      "communication": 0.5
    },
    "alerts": {
      "enabled": true,
      "endpoint": "/api/monitor/alerts",
      "rules": {
        "JS_ERROR": { "severity": "high", "cooldown": 30000 },
        "LOW_FPS": { "severity": "medium", "cooldown": 60000 },
        "HIGH_MEMORY": { "severity": "high", "cooldown": 60000 },
        "SLOW_LOAD": { "severity": "medium", "cooldown": 120000 }
      }
    },
    "reporting": {
      "batchSize": 50,
      "flushInterval": 10000
    }
  }
}
```

---

## 九、与现有方案对比

| 维度 | Sentry | 阿里 ARMS | Firebase | Cordis 监控 |
|------|--------|-----------|---------|-------------|
| **多应用支持** | 单应用 | 单应用 | 单应用 | 多应用 |
| **微前端特化** | 无 | 无 | 无 | 有 |
| **生命周期监控** | 无 | 无 | 无 | 有 |
| **通信监控** | 无 | 无 | 无 | 有 |
| **应用切换追踪** | 无 | 无 | 无 | 有 |
| **告警系统** | 有 | 有 | 有 | 有 |
| **实时大盘** | 有 | 有 | 有 | 有 |

---

## 十、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 错误采集 | JS 错误、资源错误、API 错误 |
| P0 | 性能采集 | FCP、LCP、FPS、内存 |
| P0 | 告警系统 | 规则引擎、通知 |
| P1 | 生命周期监控 | 应用状态、切换频率 |
| P1 | 通信监控 | 消息频率、延迟 |
| P1 | 批量上报 | sendBeacon、采样 |
| P1 | 链路追踪 | W3C TraceContext 跨应用/API 追踪 |
| P2 | 用户行为采集 | 点击、表单、应用切换 |
| P2 | 内存泄漏检测 | 子应用卸载后的游离 DOM 检测 |
| P2 | 实时大盘 | 可视化展示 |
| P3 | 报告生成 | 历史报告、趋势分析 |
