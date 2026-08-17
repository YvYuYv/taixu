# Cordis 开发调试工具方案

## 一、问题分析

### 1.1 微前端调试的挑战

| 问题类型 | 具体表现 | 严重性 |
|----------|----------|--------|
| **多应用状态难以追踪** | 多个应用同时运行，状态互相影响 | 高 |
| **通信链路不清晰** | 应用间消息传递难以可视化 | 高 |
| **性能瓶颈定位困难** | 不知道哪个应用导致性能问题 | 中 |
| **错误来源不明确** | 错误发生在哪个应用难以判断 | 高 |
| **热更新复杂** | 多应用同时热更新容易冲突 | 中 |

### 1.2 现有调试工具的局限性

| 工具 | 优点 | 缺点 |
|------|------|------|
| **Vue DevTools** | Vue 组件调试 | 只能调试单一应用 |
| **React DevTools** | React 组件调试 | 只能调试单一应用 |
| **Redux DevTools** | 状态追踪 | 只能调试单一框架 |
| **Chrome DevTools** | 通用调试 | 无微前端特化功能 |

---

## 二、工具架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Cordis DevTools Extension（浏览器扩展）                     │
│  - 可视化界面                                                │
│  - 实时数据展示                                              │
├─────────────────────────────────────────────────────────────┤
│  DevTools Core（核心层）                                     │
│  - 数据采集                                                  │
│  - 数据处理                                                  │
│  - 数据推送                                                  │
├─────────────────────────────────────────────────────────────┤
│  Integration Layer（集成层）                                 │
│  - 生命周期集成                                              │
│  - 通信协议集成                                              │
│  - 状态管理集成                                              │
│  - 路由集成                                                  │
├─────────────────────────────────────────────────────────────┤
│  Runtime Hooks（运行时钩子）                                 │
│  - 应用加载/卸载钩子                                         │
│  - 消息发送/接收钩子                                         │
│  - 状态变更钩子                                              │
│  - 路由变化钩子                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 功能模块

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **应用监控** | 应用状态、生命周期、性能 | P0 |
| **消息追踪** | 消息流可视化、消息历史 | P0 |
| **状态检查** | 全局状态、共享状态、私有状态 | P1 |
| **路由调试** | 路由树、路由变化历史 | P1 |
| **性能分析** | 加载时间、渲染时间、内存占用 | P2 |
| **错误追踪** | 错误列表、错误堆栈、错误来源 | P2 |
| **热更新控制** | 手动/自动热更新、更新日志 | P3 |

---

## 三、核心实现

### 3.1 数据采集器

```typescript
// @cordis/devtools/collector
class DevToolsCollector {
  private collectors: Map<string, DataCollector> = new Map()
  private buffer: DevToolsEvent[] = []
  private maxBufferSize: number = 1000
  
  // 注册数据采集器
  registerCollector(name: string, collector: DataCollector): void {
    this.collectors.set(name, collector)
    collector.start((event) => this.addEvent(event))
  }
  
  // 添加事件
  private addEvent(event: DevToolsEvent): void {
    this.buffer.push(event)
    
    // 限制缓冲区大小
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift()
    }
    
    // 推送到 DevTools
    this.pushToDevTools(event)
  }
  
  // 获取所有事件
  getEvents(filter?: EventFilter): DevToolsEvent[] {
    if (!filter) return this.buffer
    
    return this.buffer.filter(event => {
      if (filter.type && event.type !== filter.type) return false
      if (filter.appId && event.appId !== filter.appId) return false
      if (filter.startTime && event.timestamp < filter.startTime) return false
      if (filter.endTime && event.timestamp > filter.endTime) return false
      return true
    })
  }
  
  // 推送到 DevTools
  private pushToDevTools(event: DevToolsEvent): void {
    if (typeof window !== 'undefined' && (window as any).__CORDIS_DEVTOOLS__) {
      (window as any).__CORDIS_DEVTOOLS__.postMessage({
        type: 'CORDIS_EVENT',
        payload: event
      })
    }
  }
  
  // 清理
  clear(): void {
    this.buffer = []
  }
}

interface DataCollector {
  start(callback: (event: DevToolsEvent) => void): void
  stop(): void
}

interface DevToolsEvent {
  type: string
  appId?: string
  timestamp: number
  data: any
}

interface EventFilter {
  type?: string
  appId?: string
  startTime?: number
  endTime?: number
}
```

### 3.2 应用监控采集器

```typescript
// @cordis/devtools/lifecycle-collector
class LifecycleCollector implements DataCollector {
  private lifecycleManager: LifecycleManager
  private callback: ((event: DevToolsEvent) => void) | null = null
  
  constructor(lifecycleManager: LifecycleManager) {
    this.lifecycleManager = lifecycleManager
  }
  
  start(callback: (event: DevToolsEvent) => void): void {
    this.callback = callback
    
    // 监听生命周期事件
    this.lifecycleManager.on('*', 'before:load', (context) => {
      this.emit('lifecycle:before:load', context.appId, context)
    })
    
    this.lifecycleManager.on('*', 'after:load', (context) => {
      this.emit('lifecycle:after:load', context.appId, context)
    })
    
    this.lifecycleManager.on('*', 'before:activate', (context) => {
      this.emit('lifecycle:before:activate', context.appId, context)
    })
    
    this.lifecycleManager.on('*', 'after:activate', (context) => {
      this.emit('lifecycle:after:activate', context.appId, context)
    })
    
    this.lifecycleManager.on('*', 'before:deactivate', (context) => {
      this.emit('lifecycle:before:deactivate', context.appId, context)
    })
    
    this.lifecycleManager.on('*', 'after:deactivate', (context) => {
      this.emit('lifecycle:after:deactivate', context.appId, context)
    })
    
    this.lifecycleManager.on('*', 'error', (error, context) => {
      this.emit('lifecycle:error', context.appId, { error: error.message, stack: error.stack })
    })
  }
  
  stop(): void {
    this.callback = null
  }
  
  private emit(type: string, appId: string, data: any): void {
    if (this.callback) {
      this.callback({
        type,
        appId,
        timestamp: Date.now(),
        data
      })
    }
  }
}
```

### 3.3 通信协议采集器

```typescript
// @cordis/devtools/communication-collector
class CommunicationCollector implements DataCollector {
  private eventBus: CordisEventBus
  private callback: ((event: DevToolsEvent) => void) | null = null
  
  constructor(eventBus: CordisEventBus) {
    this.eventBus = eventBus
  }
  
  start(callback: (event: DevToolsEvent) => void): void {
    this.callback = callback
    
    // 监听所有消息
    this.eventBus.subscribe('*', (message) => {
      this.emit('message:sent', message.source, message)
      
      if (message.target) {
        this.emit('message:received', message.target, message)
      }
    })
  }
  
  stop(): void {
    this.callback = null
  }
  
  private emit(type: string, appId: string, data: any): void {
    if (this.callback) {
      this.callback({
        type,
        appId,
        timestamp: Date.now(),
        data
      })
    }
  }
}
```

### 3.4 状态管理采集器

```typescript
// @cordis/devtools/state-collector
class StateCollector implements DataCollector {
  private stateManager: StateManager
  private callback: ((event: DevToolsEvent) => void) | null = null
  
  constructor(stateManager: StateManager) {
    this.stateManager = stateManager
  }
  
  start(callback: (event: DevToolsEvent) => void): void {
    this.callback = callback
    
    // 监听所有状态变化
    this.stateManager.subscribe('*', (newValue, oldValue, key) => {
      this.emit('state:changed', undefined, {
        key,
        oldValue,
        newValue,
        timestamp: Date.now()
      })
    })
  }
  
  stop(): void {
    this.callback = null
  }
  
  private emit(type: string, appId: string | undefined, data: any): void {
    if (this.callback) {
      this.callback({
        type,
        appId,
        timestamp: Date.now(),
        data
      })
    }
  }
}
```

### 3.5 性能监控采集器

> **注意：** 此处的 PerformanceCollector 仅作示例。在实际应用中，DevTools 应直接复用监控模块（Monitoring）的 PerformanceCollector 的数据，避免重复采集造成的性能损耗和代码冗余。

```typescript
// @cordis/devtools/performance-collector
class PerformanceCollector implements DataCollector {
  private callback: ((event: DevToolsEvent) => void) | null = null
  private metrics: Map<string, PerformanceMetric> = new Map()
  
  start(callback: (event: DevToolsEvent) => void): void {
    this.callback = callback
    
    // 监听应用加载性能
    this.monitorAppLoad()
    
    // 监听渲染性能
    this.monitorRender()
    
    // 监听内存使用
    this.monitorMemory()
  }
  
  stop(): void {
    this.callback = null
  }
  
  private monitorAppLoad(): void {
    // 使用 Performance API
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name.startsWith('app-')) {
            const appId = entry.name.replace('app-', '')
            
            this.emit('performance:load', appId, {
              duration: entry.duration,
              startTime: entry.startTime,
              name: entry.name
            })
          }
        }
      })
      
      observer.observe({ entryTypes: ['measure'] })
    }
  }
  
  private monitorRender(): void {
    // 使用 requestAnimationFrame 监控帧率
    let lastTime = performance.now()
    let frameCount = 0
    
    const checkFrame = () => {
      const now = performance.now()
      frameCount++
      
      if (now - lastTime >= 1000) {
        const fps = frameCount
        frameCount = 0
        lastTime = now
        
        this.emit('performance:fps', undefined, { fps })
      }
      
      requestAnimationFrame(checkFrame)
    }
    
    requestAnimationFrame(checkFrame)
  }
  
  private monitorMemory(): void {
    // 定期采集内存使用
    setInterval(() => {
      if ((performance as any).memory) {
        const memory = (performance as any).memory
        
        this.emit('performance:memory', undefined, {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit
        })
      }
    }, 5000)
  }
  
  private emit(type: string, appId: string | undefined, data: any): void {
    if (this.callback) {
      this.callback({
        type,
        appId,
        timestamp: Date.now(),
        data
      })
    }
  }
}

interface PerformanceMetric {
  type: string
  value: number
  timestamp: number
}
```

---

## 四、浏览器扩展

### 4.1 扩展架构

```
cordis-devtools-extension/
├── manifest.json
├── content-script/
│   └── content-script.ts
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── devtools/
│   ├── devtools.html
│   ├── devtools.js
│   └── panel/
│       ├── panel.html
│       ├── panel.js
│       └── panel.css
└── background/
    └── background.js
```

### 4.2 manifest.json

```json
{
  "manifest_version": 3,
  "name": "Cordis DevTools",
  "version": "1.0.0",
  "description": "Development tools for Cordis micro-frontend framework",
  "permissions": [
    "activeTab",
    "storage"
  ],
  "devtools_page": "devtools/devtools.html",
  "background": {
    "service_worker": "background/background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-script/content-script.js"]
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 4.3 Content Script

```typescript
// content-script/content-script.ts
// 将页面中的 __CORDIS_DEVTOOLS__ 事件转发到扩展
window.addEventListener('__CORDIS_DEVTOOLS_EVENT__', (e: CustomEvent) => {
  chrome.runtime.sendMessage({
    source: 'cordis-devtools-content',
    payload: e.detail
  });
});

// 将扩展的命令转发到页面
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.source === 'cordis-devtools-panel') {
    window.dispatchEvent(new CustomEvent('__CORDIS_DEVTOOLS_COMMAND__', {
      detail: msg.payload
    }));
  }
});
```

### 4.4 DevTools Panel

```javascript
// devtools/panel/panel.js
class CordisDevToolsPanel {
  constructor() {
    this.events = []
    this.apps = new Map()
    this.messages = []
    
    this.initUI()
    this.initMessageListener()
  }
  
  initUI() {
    // 创建标签页
    const tabs = document.createElement('div')
    tabs.className = 'tabs'
    tabs.innerHTML = `
      <button class="tab active" data-tab="apps">应用</button>
      <button class="tab" data-tab="messages">消息</button>
      <button class="tab" data-tab="state">状态</button>
      <button class="tab" data-tab="performance">性能</button>
      <button class="tab" data-tab="errors">错误</button>
    `
    
    document.body.appendChild(tabs)
    
    // 创建内容区域
    const content = document.createElement('div')
    content.className = 'content'
    content.innerHTML = `
      <div id="apps-panel" class="panel active"></div>
      <div id="messages-panel" class="panel"></div>
      <div id="state-panel" class="panel"></div>
      <div id="performance-panel" class="panel"></div>
      <div id="errors-panel" class="panel"></div>
    `
    
    document.body.appendChild(content)
    
    // 绑定标签页切换
    tabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        const tabName = e.target.dataset.tab
        
        // 更新标签页状态
        tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
        e.target.classList.add('active')
        
        // 更新面板状态
        content.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
        document.getElementById(`${tabName}-panel`).classList.add('active')
      }
    })
  }
  
  initMessageListener() {
    // 监听来自页面的消息
    window.addEventListener('message', (event) => {
      if (event.data.type === 'CORDIS_EVENT') {
        this.handleEvent(event.data.payload)
      }
    })
  }
  
  handleEvent(event) {
    this.events.push(event)
    
    // 根据事件类型更新对应的面板
    if (event.type.startsWith('lifecycle:')) {
      this.updateAppsPanel(event)
    } else if (event.type.startsWith('message:')) {
      this.updateMessagesPanel(event)
    } else if (event.type.startsWith('state:')) {
      this.updateStatePanel(event)
    } else if (event.type.startsWith('performance:')) {
      this.updatePerformancePanel(event)
    } else if (event.type.startsWith('error:')) {
      this.updateErrorsPanel(event)
    }
  }
  
  updateAppsPanel(event) {
    const panel = document.getElementById('apps-panel')
    
    // 更新应用列表
    if (!this.apps.has(event.appId)) {
      this.apps.set(event.appId, {
        id: event.appId,
        state: 'unknown',
        events: []
      })
    }
    
    const app = this.apps.get(event.appId)
    app.events.push(event)
    
    // 更新应用状态
    if (event.type.includes('load')) {
      app.state = 'loaded'
    } else if (event.type.includes('activate')) {
      app.state = 'active'
    } else if (event.type.includes('deactivate')) {
      app.state = 'deactivated'
    }
    
    // 渲染应用列表
    this.renderAppsList(panel)
  }
  
  renderAppsList(panel) {
    let container = panel.querySelector('.apps-list');
    if (!container) {
      container = document.createElement('div');
      container.className = 'apps-list';
      panel.appendChild(container);
    }
    
    const appsList = Array.from(this.apps.values());
    appsList.forEach(app => {
      let existing = container.querySelector(`[data-app-id="${app.id}"]`);
      if (existing) {
        // 更新已有元素，避免全量重绘
        this.updateAppElement(existing, app);
      } else {
        // 添加新元素
        container.appendChild(this.createAppElement(app));
      }
    });
    // 移除已不存在的应用
    this.removeStaleElements(container, appsList);
  }

  createAppElement(app) {
    const el = document.createElement('div');
    el.className = 'app-item';
    el.setAttribute('data-app-id', app.id);
    this.updateAppElement(el, app);
    return el;
  }

  updateAppElement(el, app) {
    el.innerHTML = `
      <div class="app-header">
        <span class="app-name">${app.id}</span>
        <span class="app-state state-${app.state}">${app.state}</span>
      </div>
      <div class="app-events">
        ${app.events.slice(-5).map(e => `
          <div class="event-item">
            <span class="event-type">${e.type}</span>
            <span class="event-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  removeStaleElements(container, apps) {
    const currentIds = new Set(apps.map(a => a.id));
    Array.from(container.children).forEach(child => {
      if (!currentIds.has(child.getAttribute('data-app-id'))) {
        child.remove();
      }
    });
  }
  
  updateMessagesPanel(event) {
    const panel = document.getElementById('messages-panel')
    
    this.messages.push(event.data)
    
    // 限制消息数量
    if (this.messages.length > 100) {
      this.messages.shift()
    }
    
    this.renderMessagesList(panel)
  }
  
  renderMessagesList(panel) {
    // 安全渲染，防止 XSS，并使用增量方式
    let container = panel.querySelector('.messages-list');
    if (!container) {
      container = document.createElement('div');
      container.className = 'messages-list';
      panel.appendChild(container);
    }
    
    // 为简单起见，这里先清空后安全重建，在实际项目中也应类似 apps 的增量更新
    container.innerHTML = '';
    
    this.messages.forEach(msg => {
      const item = document.createElement('div');
      item.className = 'message-item';
      
      const header = document.createElement('div');
      header.className = 'message-header';
      header.innerHTML = `
        <span class="message-type">${msg.type}</span>
        <span class="message-source">${msg.source}</span>
        <span class="message-arrow">→</span>
        <span class="message-target">${msg.target || '*'}</span>
        <span class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
      `;
      
      const payloadContainer = document.createElement('div');
      payloadContainer.className = 'message-payload';
      const pre = document.createElement('pre');
      // 使用 textContent 避免直接 stringify 到 innerHTML 导致的 XSS 风险
      pre.textContent = JSON.stringify(msg.payload, null, 2);
      payloadContainer.appendChild(pre);
      
      item.appendChild(header);
      item.appendChild(payloadContainer);
      container.appendChild(item);
    });
  }
  
  updateStatePanel(event) {
    const panel = document.getElementById('state-panel')
    
    // 渲染状态变化
    panel.innerHTML = `
      <div class="state-changes">
        <div class="state-item">
          <div class="state-key">${event.data.key}</div>
          <div class="state-change">
            <div class="state-old">
              <span class="label">旧值:</span>
              <pre>${JSON.stringify(event.data.oldValue, null, 2)}</pre>
            </div>
            <div class="state-new">
              <span class="label">新值:</span>
              <pre>${JSON.stringify(event.data.newValue, null, 2)}</pre>
            </div>
          </div>
          <div class="state-time">${new Date(event.timestamp).toLocaleTimeString()}</div>
        </div>
      </div>
    `
  }
  
  updatePerformancePanel(event) {
    const panel = document.getElementById('performance-panel')
    
    // 渲染性能指标
    panel.innerHTML = `
      <div class="performance-metrics">
        <div class="metric-item">
          <div class="metric-label">FPS</div>
          <div class="metric-value">${event.data.fps || 'N/A'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">内存使用</div>
          <div class="metric-value">${this.formatBytes(event.data.usedJSHeapSize)}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">应用加载时间</div>
          <div class="metric-value">${event.data.duration?.toFixed(2) || 'N/A'}ms</div>
        </div>
      </div>
    `
  }
  
  updateErrorsPanel(event) {
    const panel = document.getElementById('errors-panel')
    
    // 渲染错误列表
    panel.innerHTML = `
      <div class="errors-list">
        <div class="error-item">
          <div class="error-header">
            <span class="error-app">${event.appId}</span>
            <span class="error-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="error-message">${event.data.error}</div>
          <div class="error-stack">
            <pre>${event.data.stack || 'No stack trace'}</pre>
          </div>
        </div>
      </div>
    `
  }
  
  formatBytes(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
  }
}

// 初始化面板
new CordisDevToolsPanel()
```

### 4.5 样式文件

```css
/* devtools/panel/panel.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  font-size: 13px;
  color: #333;
  background: #fff;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #ddd;
  background: #f5f5f5;
}

.tab {
  padding: 8px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #666;
}

.tab:hover {
  background: #e8e8e8;
}

.tab.active {
  background: #fff;
  color: #333;
  border-bottom: 2px solid #1890ff;
}

.content {
  padding: 16px;
}

.panel {
  display: none;
}

.panel.active {
  display: block;
}

/* 应用列表 */
.apps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-item {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.app-name {
  font-weight: 600;
  font-size: 14px;
}

.app-state {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
}

.state-loaded {
  background: #e6f7ff;
  color: #1890ff;
}

.state-active {
  background: #f6ffed;
  color: #52c41a;
}

.state-deactivated {
  background: #fff7e6;
  color: #fa8c16;
}

.app-events {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  background: #f9f9f9;
  border-radius: 3px;
  font-size: 12px;
}

/* 消息列表 */
.messages-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-item {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.message-type {
  font-weight: 600;
  color: #1890ff;
}

.message-source,
.message-target {
  padding: 2px 6px;
  background: #f0f0f0;
  border-radius: 3px;
}

.message-arrow {
  color: #999;
}

.message-time {
  margin-left: auto;
  color: #999;
}

.message-payload pre {
  background: #f9f9f9;
  padding: 8px;
  border-radius: 3px;
  font-size: 12px;
  overflow-x: auto;
}

/* 状态变化 */
.state-changes {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state-item {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
}

.state-key {
  font-weight: 600;
  margin-bottom: 8px;
  color: #1890ff;
}

.state-change {
  display: flex;
  gap: 16px;
}

.state-old,
.state-new {
  flex: 1;
}

.state-old .label,
.state-new .label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.state-old pre,
.state-new pre {
  background: #f9f9f9;
  padding: 8px;
  border-radius: 3px;
  font-size: 12px;
}

.state-time {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}

/* 性能指标 */
.performance-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.metric-item {
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 16px;
  text-align: center;
}

.metric-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: 600;
  color: #1890ff;
}

/* 错误列表 */
.errors-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.error-item {
  border: 1px solid #ff4d4f;
  border-radius: 4px;
  padding: 12px;
  background: #fff2f0;
}

.error-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.error-app {
  font-weight: 600;
  color: #ff4d4f;
}

.error-time {
  font-size: 12px;
  color: #999;
}

.error-message {
  margin-bottom: 8px;
  color: #333;
}

.error-stack pre {
  background: #fff;
  padding: 8px;
  border-radius: 3px;
  font-size: 12px;
  overflow-x: auto;
  color: #666;
}
```

---

## 五、热更新支持

### 5.1 热更新管理器

```typescript
// @cordis/devtools/hot-reload
class HotReloadManager {
  private reloadQueue: string[] = []
  private isReloading: boolean = false
  
  // 暴露重载方法供 HMR 客户端调用
  reload(appId: string): void {
    console.log(`[Cordis HMR] Update received for app: ${appId}`)
    this.scheduleReload(appId)
  }
  
  // 调度重载
  private scheduleReload(appId: string): void {
    if (!this.reloadQueue.includes(appId)) {
      this.reloadQueue.push(appId)
    }
    
    this.processReloadQueue()
  }
  
  // 处理重载队列
  private async processReloadQueue(): Promise<void> {
    if (this.isReloading) return
    
    this.isReloading = true
    
    while (this.reloadQueue.length > 0) {
      const appId = this.reloadQueue.shift()!
      
      try {
        await this.reloadApp(appId)
      } catch (error) {
        console.error(`[Cordis HMR] Failed to reload app ${appId}:`, error)
      }
    }
    
    this.isReloading = false
  }
  
  // 重载应用
  private async reloadApp(appId: string): Promise<void> {
    console.log(`[Cordis HMR] Reloading app: ${appId}`)
    
    // 获取当前应用状态
    const currentState = lifecycleManager.getAppState(appId)
    
    // 如果应用正在运行，先停用
    if (currentState === 'active') {
      await lifecycleManager.deactivate(appId)
    }
    
    // 销毁应用
    await lifecycleManager.destroy(appId)
    
    // 重新加载
    const config = this.getAppConfig(appId)
    await lifecycleManager.load(appId, config)
    
    // 如果之前是激活状态，重新激活
    if (currentState === 'active') {
      await lifecycleManager.activate(appId)
    }
    
    console.log(`[Cordis HMR] App reloaded: ${appId}`)
  }
}

// 集成 Vite HMR
class ViteHMRIntegration {
  constructor(private hmrManager: HotReloadManager) {}
  
  connect(viteWsUrl: string = 'ws://localhost:5173') {
    const ws = new WebSocket(viteWsUrl);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        // 匹配变更的文件到微应用
        const affectedApps = this.matchFilesToApps(data.updates);
        affectedApps.forEach(appId => this.hmrManager.reload(appId));
      }
    };
  }

  private matchFilesToApps(updates: any[]): string[] {
    // 解析文件变更映射到微应用的逻辑
    return [];
  }
}
```

---

## 六、生产环境 DevTools 安全

在生产环境中，需要禁用 DevTools 的运行时钩子，以避免潜在的性能损耗和安全隐患。可在应用初始化或网关层进行处理：

```typescript
// 生产环境禁用 DevTools 钩子
if (process.env.NODE_ENV === 'production' && !config.forceDevTools) {
  delete window.__CORDIS_DEVTOOLS__;
}
```

---

## 七、与现有方案对比

| 维度 | Vue DevTools | React DevTools | Cordis DevTools |
|------|--------------|----------------|-----------------|
| **多应用支持** | 单应用 | 单应用 | 多应用 |
| **跨框架支持** | Vue only | React only | 框架无关 |
| **应用间通信追踪** | 无 | 无 | 有 |
| **状态可视化** | Vuex/Redux | Redux | 统一状态 |
| **性能监控** | 基础 | 基础 | 全面 |
| **热更新控制** | 有 | 有 | 有 |
| **错误追踪** | 基础 | 基础 | 全面 |

---

## 八、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 数据采集器 | 基础数据采集 |
| P0 | 应用监控 | 应用状态、生命周期 |
| P1 | 消息追踪 | 消息流可视化 |
| P1 | 状态检查 | 状态变化追踪 |
| P2 | 性能分析 | FPS、内存、加载时间 |
| P2 | 错误追踪 | 错误列表、堆栈 |
| P3 | 热更新控制 | 文件监听、自动重载 |
| P3 | DevTools 扩展 | 浏览器扩展界面 |
