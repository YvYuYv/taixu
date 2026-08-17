# Taixu 核心模块交互协议

本文档定义了 Taixu 微前端框架中各核心模块之间的依赖关系、交互流程、事件契约以及初始化顺序。

## 1. 模块依赖关系图

Taixu 框架基于 Cordis 构建，各核心模块以插件的形式注册到上下文（Context）中，通过依赖注入（Service）和事件系统（Event）进行解耦交互。

```mermaid
graph TD
    %% 核心模块
    Core[Context Context/Service/Event]
    Router[Router 路由模块]
    Lifecycle[LifecycleManager 生命周期]
    Sandbox[SandboxManager 沙箱模块]
    Loader[LoaderManager 资源加载]
    Adapter[Adapter 框架适配]
    App[MicroApp 应用实例]
    State[StateManager 状态管理]
    Comm[CommunicationBus 通信总线]
    Monitor[MonitoringService 监控服务]

    %% 依赖关系
    Router -->|依赖| Lifecycle
    Lifecycle -->|依赖| Sandbox
    Lifecycle -->|依赖| Loader
    Lifecycle -->|依赖| App
    Lifecycle -->|依赖| Monitor
    Sandbox -->|依赖| Monitor
    Loader -->|依赖| Monitor
    App -->|依赖| Adapter
    App -->|依赖| State
    App -->|依赖| Comm
    App -->|依赖| Monitor
    Comm -->|依赖| Monitor

    %% 全部基于 Core
    Router -.-> Core
    Lifecycle -.-> Core
    Sandbox -.-> Core
    Loader -.-> Core
    Adapter -.-> Core
    App -.-> Core
    State -.-> Core
    Comm -.-> Core
    Monitor -.-> Core
```

## 2. 核心流程时序图

### 2.1 应用首次加载流程

当路由匹配到未加载的子应用时，触发首次加载流程。

```mermaid
sequenceDiagram
    participant R as Router
    participant LM as LifecycleManager
    participant SM as SandboxManager
    participant Loader as LoaderManager
    participant A as Adapter
    participant App as MicroApp
    participant State as StateManager
    participant Mon as MonitoringService

    R->>LM: 触发激活应用 (appId)
    activate LM
    LM->>Mon: 记录加载开始时间
    LM->>Loader: 加载应用资源 (entry)
    activate Loader
    Loader-->>LM: 返回 HTML/JS/CSS 资产
    deactivate Loader

    LM->>SM: 创建/获取沙箱环境 (appId)
    activate SM
    SM-->>LM: 返回沙箱上下文
    deactivate SM

    LM->>App: 实例化 MicroApp
    activate App
    App->>State: 初始化应用独立状态
    App->>LM: 执行沙箱内的代码 (解析导出钩子)

    LM->>A: 包装框架特定生命周期 (React/Vue)
    activate A
    A-->>LM: 返回标准化生命周期钩子
    deactivate A

    LM->>App: 执行 bootstrap()
    LM->>App: 执行 mount()
    App->>Mon: 记录挂载性能指标
    LM-->>R: 加载完成
    deactivate App
    deactivate LM
```

### 2.2 应用切换流程

从一个子应用切换到另一个子应用的过程，包含旧应用的卸载与新应用的加载。

```mermaid
sequenceDiagram
    participant R as Router
    participant LM as LifecycleManager
    participant SM as SandboxManager
    participant OldApp as 旧应用 (App A)
    participant NewApp as 新应用 (App B)

    R->>LM: 路由变化 (B)
    activate LM
    
    %% 卸载旧应用
    LM->>OldApp: 执行 unmount()
    activate OldApp
    OldApp->>OldApp: 卸载 DOM 组件
    OldApp-->>LM: unmount 完毕
    deactivate OldApp

    LM->>SM: 冻结/失活沙箱 (A)
    SM->>SM: 恢复全局环境变动

    %% 激活新应用
    LM->>SM: 激活沙箱 (B)
    SM->>SM: 应用该应用的全局环境变量
    LM->>NewApp: 执行 mount() (若已 bootstrap)
    activate NewApp
    NewApp-->>LM: mount 完毕
    deactivate NewApp

    LM-->>R: 切换完成
    deactivate LM
```

### 2.3 应用间通信流程

应用 A 向应用 B 发送消息时的拦截与路由机制。

```mermaid
sequenceDiagram
    participant AppA as App A
    participant Comm as CommunicationBus
    participant AppB as App B

    AppA->>Comm: 发送消息 (target: B, type: 'action', payload)
    activate Comm
    Comm->>Comm: 权限检查 (A 是否允许发送)
    Comm->>Comm: 序列化处理 (剥离对象引用)
    Comm->>Comm: 查找目标应用 (B) 的订阅
    Comm->>AppB: 触发消息事件接收 (type: 'action', payload)
    deactivate Comm
    activate AppB
    AppB-->>Comm: 返回处理结果 (可选)
    deactivate AppB
    Comm-->>AppA: 传递确认/结果
```

### 2.4 错误恢复流程

应用运行期间发生异常时的隔离与降级处理。

```mermaid
sequenceDiagram
    participant App as MicroApp
    participant LM as LifecycleManager
    participant Mon as MonitoringService
    participant Host as 主应用 UI

    App--xApp: 发生未捕获异常 / 渲染错误
    App->>LM: ErrorBoundary 抛出错误事件
    activate LM
    LM->>Mon: 上报错误堆栈与环境信息
    LM->>LM: 判断重试策略 (超过次数阈值)
    LM->>App: 强制执行 unmount() 清理资源
    LM->>Host: 触发降级渲染 (Fallback UI)
    deactivate LM
```

### 2.5 热更新流程 (Dev)

开发模式下文件变动触发的热重载。

```mermaid
sequenceDiagram
    participant DevTool as DevTools (HMR)
    participant LM as LifecycleManager
    participant SM as SandboxManager
    participant App as MicroApp

    DevTool->>LM: 接收热更新通知 (appId, changedFiles)
    activate LM
    LM->>App: 执行 unmount() (失活)
    LM->>SM: 销毁旧沙箱实例
    LM->>LM: 清除该应用的资源缓存
    LM->>LM: 重新拉取新资源并解析
    LM->>SM: 创建新沙箱并初始化
    LM->>App: 重新执行 bootstrap() & mount()
    deactivate LM
```

## 3. 模块间事件契约

Taixu 使用 Cordis 统一事件总线，事件名称采用命名空间格式以避免冲突。

### 核心事件类型定义 (TypeScript)

    // 路由与多槽位事件
    'router:change': (from: string, to: string, options?: { outlet?: string, signal?: AbortSignal }) => void;
    'router:matched': (appId: string, path: string, outlet?: string) => void;
    'router:aborted': (path: string, reason: string) => void;

    // 生命周期事件 (依托 Cordis Fork / Plugin)
    'lifecycle:beforeLoad': (appId: string, signal?: AbortSignal) => void;
    'lifecycle:loaded': (appId: string) => void;
    'lifecycle:beforeMount': (appId: string, container: HTMLElement) => void;
    'lifecycle:mounted': (appId: string) => void;
    'lifecycle:beforeUnmount': (appId: string) => void;
    'lifecycle:unmounted': (appId: string) => void;
    'lifecycle:error': (appId: string, error: Error) => void;

    // 沙箱与 DOM 隔离事件
    'sandbox:created': (appId: string, sandboxCtx: any) => void;
    'sandbox:destroyed': (appId: string) => void;
    'sandbox:activated': (appId: string) => void;
    'sandbox:deactivated': (appId: string) => void;

    // 通信与状态 (支持 Sticky 粘性消息与 Deep Reactive State)
    'comm:message': (sender: string, receiver: string, payload: any, metadata?: { sticky?: boolean, traceId?: string }) => void;
    'state:change': (appId: string, key: string, value: any, oldValue: any, path?: string) => void;

    // 监控与全链路追踪事件 (W3C TraceContext)
    'monitor:report': (metric: MetricPayload, traceId?: string) => void;
    'monitor:error': (errorPayload: ErrorPayload, traceId?: string) => void;
}
```

任何插件均可通过 `ctx.on` 订阅这些事件：

```typescript
ctx.on('lifecycle:mounted', (appId) => {
    ctx.logger.info(`应用 ${appId} 已挂载完成`);
});
```

## 4. 模块初始化顺序

由于模块之间存在依赖，Taixu 在 Cordis Context 中的初始化顺序需满足以下规则：

1. **基础能力层**
   - **MonitoringService**: 最先初始化，以便记录其他模块初始化过程中的性能与异常。
   - **CommunicationBus**: 初始化跨应用通信基座。
   - **StateManager**: 初始化全局状态容器。

2. **核心机制层**
   - **SandboxManager**: 准备沙箱生成器。
   - **LoaderManager**: 准备资源加载器和缓存机制。
   - **Adapter**: 准备前端框架适配器。

3. **调度层**
   - **LifecycleManager**: 依赖沙箱、加载器和适配器，负责子应用的创建和流转调度。

4. **路由层**
   - **Router**: 依赖生命周期管理器，接管浏览器 History，根据 URL 触发 LifecycleManager 的动作。作为启动流程的最后一步，初始化完毕后会执行首次路由匹配。

## 5. 错误传播路径

1. **子应用代码错误 (运行时)** -> 触发沙箱的 `window.onerror/onunhandledrejection` 拦截 -> 发送给 SandboxManager -> 通过 `ctx.emit('monitor:error')` 上报。
2. **生命周期错误 (加载/解析/挂载)** -> 生命周期 Promise 捕获 -> LifecycleManager 派发 `lifecycle:error` -> 执行重试或 Fallback 渲染 -> MonitoringService 收集。
3. **资源加载失败** -> LoaderManager 捕获网络异常 -> 抛出至 LifecycleManager -> 进行错误降级处理。

所有的错误都汇聚到 Cordis 的全局错误处理和 `MonitoringService` 中。

## 6. 统一事件系统设计

传统微前端框架往往会各自维护一套 EventBus 机制。在 Taixu 中，由于基于 **Cordis** 构建，所有的核心模块以及每个子应用的上下文（可通过 `ctx.isolate()` 隔离生成）都共享底层统一架构。

### 无缝的事件注册与清理

所有模块**必须**使用 `ctx.on()` 与 `ctx.emit()` 进行事件通信，抛弃独立的 EventEmitter 实例。

```typescript
// 错误示例：独立 EventBus
const bus = new EventEmitter();
bus.on('xxx', handler); 
// 卸载时容易忘记 removeListener 导致内存泄漏

// Taixu 推荐规范
export function apply(ctx: Context) {
    // 注册监听器
    ctx.on('router:change', (from, to) => {
        // do something
    });

    // 触发事件
    ctx.emit('monitor:report', { type: 'route_time', value: 120 });
}
```

### 自动垃圾回收机制

依赖于 Cordis 的 Fiber 和 Effect 管理机制，当一个插件（或者一个被包装为插件形式运行的子应用）被注销 / 失活时：

1. 子应用的卸载对应着调用其对应 Context / Fork 的 `dispose()` 方法。
2. **所有在这个 Context 上通过 `ctx.on` 绑定的事件监听器会自动被清理**。
3. 所有在这个 Context 内通过 `ctx.effect` 注册的副作用会自动反向执行撤销。

这种设计确保了极其纯净的沙箱隔离特性，从架构底层根除了微前端场景中常见的内存泄漏与事件幽灵订阅问题。
