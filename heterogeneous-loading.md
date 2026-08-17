# Cordis 异构组件加载方案

## 一、问题分析

### 1.1 异构加载的三层挑战

| 层级 | 异构类型 | 核心冲突 |
|------|----------|----------|
| **同技术栈不同版本** | Vue 2 + Vue 3 | `window.Vue` 全局变量冲突、插件机制不同 |
| **不同技术栈** | Vue + React + Angular + jQuery | Virtual DOM 冲突、事件系统冲突、生命周期不兼容 |
| **Cordis vs 其他框架** | Cordis + qiankun/wujia/micro-app | 上下文协议不同、加载机制不同、沙箱机制不同 |

### 1.2 冲突的根源

所有异构冲突的本质是 **共享全局状态的副作用冲突**：

```
全局变量污染：window.Vue, window.React, window.angular
DOM 冲突：两个框架同时操作同一个 DOM 节点
事件冲突：全局事件监听器互相干扰
CSS 冲突：样式选择器互相覆盖
路由冲突：History API 被多个路由系统同时劫持
```

### 1.3 Cordis 理论视角

在 Cordis 理论中，上述所有冲突都是 **effect 冲突**：

```
全局变量修改 = effect
DOM 修改 = effect
事件监听 = effect（可逆）
CSS 注入 = effect（可逆）
路由变化 = coeffect
```

**解决思路**：通过 **effect isolation**（效应隔离）让每个组件运行在独立的 effect context 中，互不干扰。

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Cordis Runtime（Cordis 运行时）                                  │
│  - 统一的加载入口                                                  │
│  - 统一的生命周期管理                                              │
├──────────────────────────────────────────────────────────────────┤
│  Isolation Layer（隔离层）                                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ JS 沙箱     │ │ DOM 隔离    │ │ 样式隔离   │ │ 事件隔离    │   │
│  │ (Proxy)    │ │ (Shadow/   │ │ (Namespace │ │ (Event      │   │
│  │            │ │  Container)│ │  /Shadow)  │ │  Bus)       │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│  Adapter Layer（适配层）                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ Vue 2      │ │ Vue 3      │ │ React      │ │ Angular    │   │
│  │ Adapter    │ │ Adapter    │ │ Adapter    │ │ Adapter    │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │ jQuery     │ │ qiankun    │ │ wujia      │ │ micro-app  │   │
│  │ Adapter    │ │ Adapter    │ │ Adapter    │ │ Adapter    │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│  Component Layer（组件层）                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │ Vue2   │ │ Vue3   │ │ React  │ │ Angular│ │ jQuery │        │
│  │ Comp A │ │ Comp B │ │ Comp C │ │ Comp D │ │ Comp E │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 三、同技术栈不同版本：Vue 2 + Vue 3 共存

### 3.1 核心冲突

```javascript
// 问题：Vue 2 和 Vue 3 都会挂载到 window.Vue
// Vue 2
window.Vue = function Vue2(options) { /* ... */ }

// Vue 3
window.Vue = function Vue3(options) { /* ... */ }

// 后加载的会覆盖先加载的
```

### 3.2 解决方案：JS 沙箱 + 模块隔离

#### 3.2.1 Proxy 沙箱

```typescript
// @cordis/sandbox
function createSandbox(appId: string): Sandbox {
  const fakeWindow = {}
  
  // 创建 Proxy 拦截全局变量访问
  const proxy = new Proxy(fakeWindow, {
    get(target, key) {
      if (key === 'window' || key === 'self' || key === 'globalThis') {
        return proxy  // 返回沙箱自身
      }
      if (key in target) {
        return target[key]  // 沙箱内的变量
      }
      return window[key]  // 透传到真实 window
    },
    
    set(target, key, value) {
      // 拦截 window.Vue = ... 不污染全局
      target[key] = value
      return true
    },
    
    has(target, key) {
      // 注意：为了支持 with 语句，这里总是返回 true
      return true
    }
  })
  
  return { proxy, window: fakeWindow }
}

> [!WARNING]
> **关于 `has` 拦截器的设计取舍 (Tradeoff)**
> 在 Proxy 沙箱中，`has` trap 总是返回 `true` 是为了确保沙箱内的代码在 `with(window)` 语句块中正确解析变量，避免向上层作用域逃逸。但这也带来了一个副作用：沙箱内执行 `'prop' in window` 检查时也会始终得到 `true`。这是微前端沙箱机制中的典型取舍，开发者在编写需要进行能力检测的代码时，应避免依赖 `in` 运算符（例如改用 `typeof window.prop !== 'undefined'`）。

// 加载 Vue 2 应用
const sandbox1 = createSandbox('app1')
// 在沙箱内执行 Vue 2 代码
runInSandbox(sandbox1, vue2BundleCode)
// sandbox1.window.Vue = Vue 2

// 加载 Vue 3 应用
const sandbox2 = createSandbox('app2')
runInSandbox(sandbox2, vue3BundleCode)
// sandbox2.window.Vue = Vue 3

// 两者互不干扰
```

#### 3.2.2 构建时模块隔离

```javascript
// vite-plugin-cordis-isolation
export default function cordisIsolationPlugin() {
  return {
    name: 'cordis-isolation',
    
    configResolved(config) {
      // 将 Vue 等核心库标记为外部依赖
      // 由 Cordis 运行时提供
      config.build.rollupOptions.external = [
        'vue',
        'vue-router',
        'vuex',
        'pinia'
      ]
      
      // 注入 Cordis 模块提供器
      config.build.rollupOptions.output.globals = {
        'vue': '__cordis_require__("vue")',
        'vue-router': '__cordis_require__("vue-router")'
      }
    }
  }
}
```

#### 3.2.3 运行时多版本 Vue 共存

```typescript
// @cordis/runtime
class VueVersionManager {
  private versions: Map<string, typeof Vue> = new Map()
  
  // 注册 Vue 版本
  registerVue(version: string, Vue: typeof Vue) {
    this.versions.set(version, Vue)
  }
  
  // 获取指定版本的 Vue
  getVue(version: string): typeof Vue {
    return this.versions.get(version)
  }
}

// 应用 1 使用 Vue 2
const vue2 = vueManager.getVue('2.6.14')
const app1 = new vue2({ /* ... */ })

// 应用 2 使用 Vue 3
const vue3 = vueManager.getVue('3.2.0')
const app2 = vue3.createApp({ /* ... */ })

// 两者在同一页面共存
```

### 3.3 完整加载流程

```
1. 主应用启动，初始化 Cordis Runtime
2. 注册 Vue 2.6.14 和 Vue 3.2.0 两个版本
3. 加载 app1（Vue 2 应用）：
   a. 创建沙箱 sandbox1
   b. 在 sandbox1 中执行 app1 的代码
   c. app1 的 import vue 解析为 Vue 2.6.14
   d. app1 挂载到 #app1-container
4. 加载 app2（Vue 3 应用）：
   a. 创建沙箱 sandbox2
   b. 在 sandbox2 中执行 app2 的代码
   c. app2 的 import vue 解析为 Vue 3.2.0
   d. app2 挂载到 #app2-container
5. 两个应用在同一页面运行，互不干扰
```

---

## 四、不同技术栈：Vue + React + Angular + jQuery

### 4.1 核心冲突

| 冲突类型 | Vue vs React | Vue vs Angular | React vs jQuery |
|----------|--------------|-----------------|------------------|
| **Virtual DOM** | 两者都操作 DOM | Angular 直接操作 DOM | jQuery 直接操作 DOM |
| **事件系统** | Vue 原生事件 vs React 合成事件 | Angular Zone.js 拦截 | jQuery 事件绑定 |
| **生命周期** | mounted/unmounted | useEffect/ngOnDestroy | ngOnInit/ ngOnDestroy |
| **响应式系统** | Vue 响应式 vs React setState | Angular ChangeDetection | 无 |

### 4.2 解决方案：DOM 隔离 + 适配器模式

#### 4.2.1 DOM 容器隔离

```typescript
// 每个技术栈运行在独立的 DOM 容器中
function createIsolatedContainer(appId: string): HTMLElement {
  const container = document.createElement('div')
  container.setAttribute('data-cordis-app', appId)
  container.style.cssText = 'all: initial'  // 重置继承样式
  
  // 可选：使用 Shadow DOM 强隔离
  if (config.useShadowDOM) {
    const shadow = container.attachShadow({ mode: 'open' })
    return shadow as any
  }
  
  document.body.appendChild(container)
  return container
}
```

#### 4.2.2 统一适配器接口

```typescript
// @cordis/adapter
interface ComponentAdapter {
  // 加载组件
  load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance>
  
  // 卸载组件
  unload(instance: AppInstance): Promise<void>
  
  // 获取组件信息
  getInfo(): { framework: string, version: string }
}

interface AppInstance {
  // 挂载
  mount(container: HTMLElement): void
  // 卸载
  unmount(): void
  // 更新
  update(props: any): void
  // 订阅事件
  on(event: string, callback: Function): void
  // 触发事件
  emit(event: string, data: any): void
}
```

#### 4.2.3 Vue 适配器

```typescript
// @cordis/vue-adapter
class VueAdapter implements ComponentAdapter {
  private version: string
  
  constructor(version: string) {
    this.version = version
  }
  
  async load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    if (this.version.startsWith('2')) {
      return this.loadVue2(module, container, context)
    } else {
      return this.loadVue3(module, container, context)
    }
  }
  
  private async loadVue3(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    const Vue = await context.require('vue', '^3.0.0')
    const { createApp } = Vue
    
    const app = createApp(module.default || module)
    
    // 注入 Cordis 上下文
    app.provide('cordis', context)
    
    app.mount(container)
    
    return {
      mount: (c) => app.mount(c),
      unmount: () => app.unmount(),
      update: (props) => { /* 更新 props */ },
      on: (event, cb) => { /* 事件订阅 */ },
      emit: (event, data) => { /* 事件触发 */ }
    }
  }
  
  private async loadVue2(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    const Vue = await context.require('vue', '^2.0.0')
    
    // 创建 Vue 2 实例
    const app = new Vue({
      ...module.default || module,
      provide: {
        cordis: context
      }
    })
    
    app.$mount(container)
    
    return {
      mount: (c) => app.$mount(c),
      unmount: () => app.$destroy(),
      update: (props) => { /* 更新 props */ },
      on: (event, cb) => app.$on(event, cb),
      emit: (event, data) => app.$emit(event, data)
    }
  }
}
```

#### 4.2.4 React 适配器

```typescript
// @cordis/react-adapter
class ReactAdapter implements ComponentAdapter {
  async load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    const React = await context.require('react', '^17.0.0 || ^18.0.0')
    const ReactDOM = await context.require('react-dom', '^17.0.0 || ^18.0.0')
    
    const Component = module.default || module
    
    // 正确：在 render 函数外部创建 Context，避免每次渲染都重新创建
    const CordisCtx = React.createContext(null)
    
    // 创建 Context Provider 包装
    const CordisContextProvider = ({ children }) => {
      return React.createElement(CordisCtx.Provider, { value: context }, children)
    }
    
    // 渲染
    const root = ReactDOM.createRoot(container)
    root.render(
      React.createElement(CordisContextProvider, null,
        React.createElement(Component)
      )
    )
    
    return {
      mount: (c) => { /* 已经渲染 */ },
      unmount: () => root.unmount(),
      update: (props) => {
        root.render(
          React.createElement(CordisContextProvider, null,
            React.createElement(Component, props)
          )
        )
      },
      on: (event, cb) => { /* 事件订阅 */ },
      emit: (event, data) => { /* 事件触发 */ }
    }
  }
}
```

#### 4.2.5 Angular 适配器

```typescript
// @cordis/angular-adapter
class AngularAdapter implements ComponentAdapter {
  async load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    const { platformBrowserDynamic } = await context.require('@angular/platform-browser-dynamic')
    const { NgModule, Component: NgComponent } = await context.require('@angular/core')
    
    // 包装为 Angular NgModule
    @NgModule({
      declarations: [module.default || module],
      bootstrap: [module.default || module]
    })
    class CordisAppModule {}
    
    // 启动 Angular 应用
    const platform = platformBrowserDynamic()
    const appRef = platform.bootstrapModule(CordisAppModule)
    
    return {
      mount: (c) => { /* 已挂载 */ },
      unmount: () => appRef.destroy(),
      update: (props) => { /* 更新 */ },
      on: (event, cb) => { /* 事件订阅 */ },
      emit: (event, data) => { /* 事件触发 */ }
    }
  }
}
```

#### 4.2.6 jQuery 适配器

```typescript
// @cordis/jquery-adapter
class jQueryAdapter implements ComponentAdapter {
  async load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    const $ = await context.require('jquery', '^3.0.0')
    
    // jQuery 插件通常是 $.fn.xxx 格式
    const plugin = module.default || module
    
    // 在容器内执行 jQuery 代码
    const $container = $(container)
    
    // 清空容器
    $container.empty()
    
    // 调用插件
    if (typeof plugin === 'function') {
      plugin.call($container, context)
    } else if (typeof plugin === 'object' && plugin.init) {
      plugin.init($container, context)
    }
    
    // 存储事件处理器
    const handlers: Map<string, Function[]> = new Map()
    
    return {
      mount: (c) => { /* 已挂载 */ },
      unmount: () => {
        $container.empty()
        // 移除所有事件
        $container.off()
      },
      update: (props) => {
        // jQuery 通常通过重新渲染更新
        $container.empty()
        if (typeof plugin === 'function') {
          plugin.call($container, { ...context, ...props })
        }
      },
      on: (event, cb) => {
        if (!handlers.has(event)) {
          handlers.set(event, [])
        }
        handlers.get(event).push(cb)
      },
      emit: (event, data) => {
        const cbs = handlers.get(event) || []
        cbs.forEach(cb => cb(data))
      }
    }
  }
}
```

#### 4.2.7 适配器错误处理与降级

在实际生产环境中，适配器的 `load` 方法需要具备完善的错误捕获与降级机制，以避免单个组件加载失败导致整个应用崩溃：

```typescript
abstract class BaseAdapter implements ComponentAdapter {
  appId: string;
  entry: string;

  async load(container: HTMLElement, props: any) {
    try {
      const module = await import(this.entry);
      // ... 具体挂载逻辑
    } catch (error) {
      console.error(`[Cordis] 应用 ${this.appId} 加载失败:`, error);
      this.renderErrorFallback(container, error);
      throw new AppLoadError(this.appId, error);
    }
  }

  protected renderErrorFallback(container: HTMLElement, error: any) {
    container.innerHTML = `<div class="cordis-error-fallback">
      <h3>组件加载失败</h3>
      <p>${error.message}</p>
    </div>`;
  }
}
```

### 4.3 事件系统桥接

```typescript
// @cordis/event-bus
class CordisEventBus {
  private handlers: Map<string, Map<string, Function[]>> = new Map()
  // 结构：eventName -> appId -> handlers[]
  
  on(appId: string, event: string, callback: Function) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Map())
    }
    if (!this.handlers.get(event).has(appId)) {
      this.handlers.get(event).set(appId, [])
    }
    this.handlers.get(event).get(appId).push(callback)
  }
  
  emit(event: string, data: any, sourceAppId?: string) {
    const appHandlers = this.handlers.get(event)
    if (!appHandlers) return
    
    appHandlers.forEach((handlers, appId) => {
      // 不向源应用回传事件
      if (appId === sourceAppId) return
      
      handlers.forEach(cb => cb(data))
    })
  }
}

// Vue 组件触发事件
vueApp.emit('itemSelected', { id: 123 })

// React 组件监听事件
reactApp.on('itemSelected', (data) => {
  console.log('React 收到 Vue 的事件', data)
})
```

---

## 五、Cordis 打包 vs 其他微前端框架打包

### 5.1 核心冲突

| 框架 | 加载机制 | 沙箱机制 | 生命周期 | 通信方式 |
|------|----------|----------|----------|----------|
| **Cordis** | Cordis Runtime | Effect Isolation | activate/deactivate | Context |
| **qiankun** | import-html-entry | Proxy 沙箱 | bootstrap/mount/unmount | GlobalState |
| **wujia** | iframe | iframe 隔离 | 无 | postMessage |
| **micro-app** | Web Components | Shadow DOM | created/connected/disconnected | DataStore |

### 5.2 解决方案：外部适配器模式

#### 5.2.1 统一外部组件接口

```typescript
// @cordis/external-adapter
interface ExternalComponent {
  // 加载
  mount(container: HTMLElement, context: ExternalContext): Promise<void>
  // 卸载
  unmount(container: HTMLElement): Promise<void>
  // 更新
  update(props: any): void
}

interface ExternalContext {
  // 原始 Cordis 上下文
  cordis: CordisContext
  // 全局状态（兼容 qiankun）
  globalState: any
  // 事件总线（兼容 wujia）
  eventBus: EventBus
  // 路由上下文（兼容 micro-app）
  router: RouteContext
}
```

#### 5.2.2 qiankun 适配器

```typescript
// @cordis/qiankun-adapter
class QiankunAdapter implements ComponentAdapter {
  async load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    // 检测是否为 qiankun 格式的模块
    if (!module.bootstrap || !module.mount || !module.unmount) {
      throw new Error('Not a qiankun module')
    }
    
    // 调用 qiankun 生命周期
    await module.bootstrap({
      // 提供 qiankun 兼容的上下文
      props: {
        container,
        basePath: context.basePath,
        cordisContext: context
      }
    })
    
    await module.mount({
      container,
      props: {
        basePath: context.basePath,
        cordisContext: context
      }
    })
    
    return {
      mount: (c) => module.mount({ container: c }),
      unmount: () => module.unmount({ container }),
      update: (props) => {
        // qiankun 不支持 update，需要重新 mount
        module.unmount({ container })
        module.mount({ container, props })
      },
      on: (event, cb) => {
        // 监听 qiankun 的全局状态
        context.onGlobalStateChange((state) => {
          if (state[event]) cb(state[event])
        })
      },
      emit: (event, data) => {
        // 通过 qiankun 的 setGlobalState 通信
        context.setGlobalState({ [event]: data })
      }
    }
  }
}
```

#### 5.2.3 wujia（iframe）适配器

```typescript
// @cordis/wujia-adapter
class WujiaAdapter implements ComponentAdapter {
  private iframes: Map<string, HTMLIFrameElement> = new Map()
  
  async load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    // wujia 使用 iframe 隔离
    const iframe = document.createElement('iframe')
    iframe.setAttribute('data-cordis-app', context.appId)
    iframe.style.border = 'none'
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    
    container.appendChild(iframe)
    
    // 加载 wujia 应用
    const url = module.url || module.default
    iframe.src = url
    
    // 存储引用
    this.iframes.set(context.appId, iframe)
    
    // 等待 iframe 加载完成
    await new Promise((resolve) => {
      iframe.onload = resolve
    })
    
    // 注入 Cordis 上下文到 iframe
    iframe.contentWindow.__cordis_context__ = context
    
    return {
      mount: (c) => {
        c.appendChild(iframe)
      },
      unmount: () => {
        container.removeChild(iframe)
        this.iframes.delete(context.appId)
      },
      update: (props) => {
        // 通过 postMessage 更新
        const targetOrigin = new URL(iframe.src).origin
        iframe.contentWindow.postMessage({
          type: 'cordis-update',
          props
        }, targetOrigin)
      },
      on: (event, cb) => {
        window.addEventListener('message', (e) => {
          if (e.data.type === event && e.source === iframe.contentWindow) {
            cb(e.data.payload)
          }
        })
      },
      emit: (event, data) => {
        const targetOrigin = new URL(iframe.src).origin
        iframe.contentWindow.postMessage({
          type: event,
          payload: data
        }, targetOrigin)
      }
    }
  }
}
```

#### 5.2.4 micro-app 适配器

```typescript
// @cordis/micro-app-adapter
class MicroAppAdapter implements ComponentAdapter {
  async load(module: any, container: HTMLElement, context: CordisContext): Promise<AppInstance> {
    // micro-app 使用 Web Components
    const microApp = document.createElement('micro-app')
    microApp.setAttribute('name', context.appId)
    microApp.setAttribute('url', module.url || module.default)
    
    // 设置数据
    microApp.setData({
      cordisContext: context
    })
    
    container.appendChild(microApp)
    
    return {
      mount: (c) => c.appendChild(microApp),
      unmount: () => container.removeChild(microApp),
      update: (props) => microApp.setData(props),
      on: (event, cb) => {
        microApp.addEventListener(event, (e: any) => cb(e.detail))
      },
      emit: (event, data) => {
        microApp.dispatchEvent(new CustomEvent(event, { detail: data }))
      }
    }
  }
}
```

### 5.3 混合加载示例

```javascript
// 主应用使用 Cordis，同时加载各种类型的子应用
import { createCordisApp } from '@cordis/runtime'
import { VueAdapter } from '@cordis/vue-adapter'
import { ReactAdapter } from '@cordis/react-adapter'
import { QiankunAdapter } from '@cordis/qiankun-adapter'
import { WujiaAdapter } from '@cordis/wujia-adapter'

const app = createCordisApp()

// 加载 Vue 3 应用
app.load({
  id: 'vue3-app',
  url: 'https://cdn.example.com/vue3-app.js',
  adapter: new VueAdapter('3.2.0'),
  container: '#vue3-container'
})

// 加载 React 应用
app.load({
  id: 'react-app',
  url: 'https://cdn.example.com/react-app.js',
  adapter: new ReactAdapter(),
  container: '#react-container'
})

// 加载 qiankun 格式的应用
app.load({
  id: 'qiankun-app',
  url: 'https://cdn.example.com/qiankun-app.js',
  adapter: new QiankunAdapter(),
  container: '#qiankun-container'
})

// 加载 wujia 格式的应用
app.load({
  id: 'wujia-app',
  url: 'https://cdn.example.com/wujia-app.html',
  adapter: new WujiaAdapter(),
  container: '#wujia-container'
})

// 所有应用在同一页面运行，互不干扰
// 并且可以通过 Cordis 事件总线互相通信
```

---

## 六、统一通信机制

### 6.1 跨框架事件总线

```typescript
// @cordis/event-bus
class UniversalEventBus {
  private adapters: Map<string, ComponentAdapter> = new Map()
  private handlers: Map<string, Map<string, Function[]>> = new Map()
  
  // 注册应用
  registerApp(appId: string, adapter: ComponentAdapter, instance: AppInstance) {
    this.adapters.set(appId, adapter)
    
    // 桥接应用的事件到统一总线
    instance.on('*', (event, data) => {
      this.emit(event, data, appId)
    })
  }
  
  // 统一的事件发射
  emit(event: string, data: any, sourceAppId?: string) {
    const appHandlers = this.handlers.get(event)
    if (!appHandlers) return
    
    appHandlers.forEach((handlers, appId) => {
      if (appId === sourceAppId) return  // 不回传
      
      const adapter = this.adapters.get(appId)
      handlers.forEach(cb => cb(data))
    })
  }
}
```

### 6.2 统一的状态共享

```typescript
// @cordis/state
class SharedState {
  private state: Map<string, any> = new Map()
  private subscribers: Map<string, Map<string, Function>> = new Map()
  
  // 设置共享状态
  set(key: string, value: any, appId: string) {
    this.state.set(key, value)
    this.notify(key, value, appId)
  }
  
  // 获取共享状态
  get(key: string): any {
    return this.state.get(key)
  }
  
  // 订阅状态变化
  subscribe(key: string, appId: string, callback: Function) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Map())
    }
    this.subscribers.get(key).set(appId, callback)
  }
  
  // 通知订阅者
  private notify(key: string, value: any, sourceAppId: string) {
    const subs = this.subscribers.get(key)
    if (!subs) return
    
    subs.forEach((cb, appId) => {
      if (appId !== sourceAppId) {
        cb(value)
      }
    })
  }
}
```

---

## 七、路由协调

### 7.1 异构路由统一管理

```typescript
// @cordis/router
class HeterogeneousRouter {
  private routeContexts: Map<string, RouteContext> = new Map()
  
  // 注册应用的路由上下文
  registerRouteContext(appId: string, context: RouteContext) {
    this.routeContexts.set(appId, context)
  }
  
  // 统一的路由导航
  navigate(path: string) {
    // 匹配应用
    const appId = this.matchApp(path)
    const context = this.routeContexts.get(appId)
    
    if (context) {
      // 委托给对应应用的路由系统
      context.navigate(path)
    }
  }
  
  // 路由守卫（跨应用）
  beforeEach(guard: (to: Route, from: Route) => boolean) {
    // 所有应用的路由变化都会经过这个守卫
  }
}
```

### 7.2 Vue Router + React Router 共存

```typescript
// Vue 应用使用 Vue Router
const vueRouter = new VueAdapter('3.0.0').createRouter({
  routes: [...]
})

// React 应用使用 React Router
const reactRouter = new ReactAdapter().createRouter({
  routes: [...]
})

// Cordis 统一管理
heterogeneousRouter.registerRouteContext('vue-app', vueRouter)
heterogeneousRouter.registerRouteContext('react-app', reactRouter)

// 用户访问 /vue-app/home
// Cordis 匹配到 vue-app，委托给 Vue Router
// 用户访问 /react-app/about
// Cordis 匹配到 react-app，委托给 React Router
```

---

## 八、性能优化

### 8.1 按需加载

```typescript
// 只加载当前可见的应用
class LazyLoader {
  private loaded: Set<string> = new Set()
  
  async loadOnVisible(appId: string, container: HTMLElement) {
    const observer = new IntersectionObserver(async (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !this.loaded.has(appId)) {
          this.loaded.add(appId)
          await this.loadApp(appId, container)
        }
      }
    })
    
    observer.observe(container)
  }
}
```

### 8.2 预加载

```typescript
// 预加载即将访问的应用
class Preloader {
  preload(appId: string) {
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'script'
    link.href = `https://cdn.example.com/${appId}.js`
    document.head.appendChild(link)
  }
}
```

### 8.3 沙箱复用

```typescript
// 沙箱实现（带状态重置功能）
class ProxySandbox {
  private fakeWindow: any = {}
  private modifiedKeys = new Set<string>()
  private effectTracker: any // 假设存在 EffectTracker
  
  // ... 其他沙箱初始化逻辑 ...

  reset() {
    // 清除 fakeWindow 上的所有修改
    this.modifiedKeys.forEach(key => {
      delete this.fakeWindow[key];
    });
    this.modifiedKeys.clear();
    // 重置效应追踪器
    if (this.effectTracker) {
      this.effectTracker.reset();
    }
  }
}

// 相同技术栈的应用复用沙箱
class SandboxPool {
  private pool: Map<string, ProxySandbox[]> = new Map()
  
  acquire(tech: string): ProxySandbox {
    const pool = this.pool.get(tech) || []
    if (pool.length > 0) {
      return pool.pop()  // 复用
    }
    return new ProxySandbox()  // 新建
  }
  
  release(tech: string, sandbox: ProxySandbox) {
    // 清理沙箱状态
    sandbox.reset()
    this.pool.get(tech).push(sandbox)
  }
}
```

### 8.4 适配器懒加载

为了避免加载未使用的框架适配器代码（如应用中只使用了 Vue3 组件，却加载了 React 适配器），应当采用适配器懒加载策略：

```typescript
// 适配器懒加载配置
const adapterLoaders: Record<string, () => Promise<ComponentAdapter>> = {
  'vue2': () => import('./adapters/vue2').then(m => m.Vue2Adapter),
  'vue3': () => import('./adapters/vue3').then(m => m.Vue3Adapter),
  'react': () => import('./adapters/react').then(m => m.ReactAdapter),
};

async function getAdapter(framework: string): Promise<ComponentAdapter> {
  const loader = adapterLoaders[framework];
  if (!loader) throw new Error(`不支持的框架: ${framework}`);
  return loader();
}
```

### 8.5 SSR 与同构渲染支持

在异构组件加载场景中支持服务端渲染（SSR）需要考虑以下关键点：

1. **环境探测与分支逻辑**：在加载适配器前探测当前环境（如 `typeof window === 'undefined'`），在服务端跳过 DOM 挂载和全局沙箱的初始化，仅进行 HTML 字符串渲染。
2. **SSR 兼容的适配器模式**：适配器需提供专用的服务端渲染方法（如 React 的 `renderToString` 或 Vue 的 `renderToString`）。
3. **分发 Hydration 策略**：客户端接管（Hydration）时，框架间的水合机制不同（例如 React 的 `hydrateRoot` vs Vue 的 `createSSRApp`），适配器需要准确识别并调用对应的水合 API。

---

## 九、与现有方案对比

| 维度 | qiankun | wujia | micro-app | Cordis |
|------|---------|-------|-----------|--------|
| **同技术栈多版本** | 不支持 | 支持（iframe） | 不支持 | 支持 |
| **不同技术栈** | 部分支持 | 支持 | 部分支持 | 支持 |
| **外部框架兼容** | 不支持 | 不支持 | 不支持 | 支持 |
| **通信机制** | globalState | postMessage | DataStore | 统一事件总线 |
| **路由协调** | 主应用统一 | iframe 隔离 | Web Components | 统一路由上下文 |
| **性能** | 中 | 低（iframe） | 中 | 优 |
| **开发体验** | 中 | 低 | 中 | 优 |

---

## 十、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | Vue 2/3 适配器 | 最常见场景 |
| P0 | JS 沙箱 | 隔离基础 |
| P0 | DOM 容器隔离 | 隔离基础 |
| P1 | React 适配器 | 常见技术栈 |
| P1 | 事件总线 | 跨框架通信 |
| P2 | Angular 适配器 | 企业场景 |
| P2 | qiankun 适配器 | 迁移场景 |
| P3 | wujia 适配器 | 兼容场景 |
| P3 | micro-app 适配器 | 兼容场景 |
| P3 | jQuery 适配器 | 遗留系统 |
