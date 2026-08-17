# Cordis 微前端框架 - 整体架构概览

## 一、框架定位

Cordis 是基于 **Cordis IoC 架构**设计的下一代微前端框架，核心理念是将微应用视为**注册在 Context 上的 Plugin**，利用依赖注入实现真正的松耦合、高内聚的分布式前端架构。

### 1.1 设计哲学

- **控制反转（IoC）**：应用的加载、卸载和通信交由底层 Context 管理，在时间和空间维度自由组合
- **生命周期安全**：每个应用作为 Plugin 运行，生命周期由 Fiber 严格管理
- **依赖按需注入**：依赖通过 Service 注入和共享，而非全局注册
- **可逆副作用**：微应用产生的所有副作用（如事件监听、定时器）均通过 `ctx.effect()` 注册，并在卸载时自动清理

### 1.2 Cordis 概念在微前端中的映射

- **Context (上下文)**：应用的运行容器（IoC 容器）。主应用对应根 Context，每个子应用运行在通过 `ctx.isolate()` 隔离出的子 Context 中。
- **Service (服务)**：框架核心能力（如路由拦截、状态管理、沙箱机制）。子应用可以声明依赖并消费这些跨应用服务。
- **Plugin (插件)**：子应用本身的模块化载体。子应用的加载和卸载即对应 Plugin 的加载与卸载。
- **Fiber (纤程)**：管理子应用（Plugin）生命周期的内部结构，维护 PENDING → ACTIVE → DISPOSED 状态机的安全流转。
- **ctx.effect() (副作用)**：统一管理微应用生命周期内的 DOM 挂载、全局事件等行为，卸载时通过返回的 disposer 实现状态恢复。

### 1.3 核心优势

| 维度 | 传统微前端 | Cordis |
|------|-----------|--------|
| **依赖管理** | 全局注册表（易冲突） | Service 依赖注入（隔离共享） |
| **应用角色** | 固定（component/portal） | 动态（运行时决定） |
| **异构支持** | 有限（同技术栈） | 完整（跨技术栈、跨版本） |
| **状态共享** | 全局状态（易污染） | 分层状态（隔离+共享） |
| **调试体验** | 单应用调试 | 多应用联合调试 |

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cordis Application Layer                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Vue 2    │  │ Vue 3    │  │ React    │  │ Angular  │       │
│  │ App      │  │ App      │  │ App      │  │ App      │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Cordis Adapter Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Vue 2    │  │ Vue 3    │  │ React    │  │ Angular  │       │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ qiankun  │  │ wujia    │  │ micro-app│  ...                 │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Cordis Runtime Core                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Lifecycle Manager  │  State Manager  │  Router Manager  │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Communication Bus  │  Sandbox Manager  │  Effect Tracker │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Cordis Isolation Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ JS       │  │ DOM      │  │ Style    │  │ Event    │       │
│  │ Sandbox  │  │ Isolation│  │ Isolation│  │ Isolation│       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Cordis Build Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Vite     │  │ Webpack  │  │ Rollup   │  │ esbuild  │       │
│  │ Plugin   │  │ Plugin   │  │ Plugin   │  │ Plugin   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、核心模块

### 3.1 生命周期管理（Lifecycle Manager）

**职责**：管理应用的完整生命周期，基于 Cordis Fork Context 和 Fiber 调度实现。

**核心能力**：
- Cordis 原生 Plugin / Fork Context 模型（挂载即 fork，销毁即 dispose）
- 声明式依赖注入与响应式生命周期流转（PENDING → ACTIVE → DISPOSED）
- 导航竞态消除（基于 AbortController 的可取消生命周期）
- 应用保活机制（Memory/DOM/State 三种模式）
- 错误恢复策略（重试、降级、错误边界）

**设计文档**：[lifecycle-management.md](./lifecycle-management.md)

### 3.2 状态管理（State Manager）

**职责**：提供跨应用的状态共享和隔离机制。

**核心能力**：
- 三层状态模型（Global/Shared/Local）
- 深层响应式代理（Deep Reactive Proxy，自动捕获深层变更）
- 跨标签页状态同步（基于 BroadcastChannel）
- 权限受控状态修改（Read/Write 规则校验）
- 状态版本控制与原子化事务更新（batch 机制）

**设计文档**：[state-sharing.md](./state-sharing.md)

### 3.3 通信协议（Communication Protocol）

**职责**：提供标准化的应用间通信机制。

**核心能力**：
- 消息协议定义（CordisMessage 格式与 W3C TraceContext 贯穿）
- 粘性/保留事件机制（Sticky/Retained Messages，解决未加载应用消息丢失）
- 多种传输模式（EventBus、Request-Response、Message Queue）
- 统一网络拦截链（FetchInterceptorChain）

**设计文档**：[communication-protocol.md](./communication-protocol.md)

### 3.4 JS 沙箱（Sandbox Manager）

**职责**：提供 JS 执行环境隔离，防止全局变量污染，并基于分级信任模型提供安全保障。

**核心能力**：
- Proxy 沙箱（原生方法 Illegal Invocation 自动修复与缓存）
- Document 代理（Scoped DOM 查询、样式/脚本生命周期追踪）
- 异步作用域追踪器（AsyncScopeTracker，自动清理 Observers/rAF 防止 DOM 泄漏）
- 存储命名空间隔离（StorageProxy 隔离 localStorage/sessionStorage）
- iframe 沙箱（适用于第三方不可信应用，提供物理级安全隔离）

**设计文档**：[js-sandbox.md](./js-sandbox.md)
**安全文档**：[security.md](./security.md)

### 3.5 路由管理（Router Manager）

**职责**：提供跨应用的路由协调和隔离。

**核心能力**：
- 多槽位/同屏多实例矩阵路由（Multi-Outlet，支持主页面与多 Widget 并存）
- 可取消路由导航（Cancellable Navigation，解决快速点击竞态）
- 深度链接保留（Deep Linking）与跨应用 Query/Hash 状态无损传递
- 构建时零侵入转换与多版本路由桥接（Vue Router 2/3/4）

**设计文档**：[route-adaptation.md](./route-adaptation.md)

### 3.6 样式隔离（Style Isolation）

**职责**：防止 CSS 样式冲突和污染。

**核心能力**：
- 命名空间策略（PostCSS 构建时前缀，推荐）
- Shadow DOM 策略（包含 React 16/17 事件 Retargeting 修复与 Portal 容器重定向）
- CSS Modules / Scoped 策略
- 主题变量动态共享与基于 ctx.effect() 的样式自动清理

**设计文档**：[style-isolation.md](./style-isolation.md)

### 3.7 异构加载（Heterogeneous Loading）

**职责**：支持不同技术栈、不同版本的应用在同一页面运行。

**核心能力**：
- 动态 Public Path 自动注入（CDN 独立部署资源相对寻址）
- 共享依赖仲裁矩阵（Dependency Negotiation Matrix，SemVer 匹配与 Fallback）
- 同技术栈多版本（Vue 2 + Vue 3）与跨技术栈（Vue + React + Angular + jQuery）
- 外部框架兼容（qiankun/wujia/micro-app）

**设计文档**：[heterogeneous-loading.md](./heterogeneous-loading.md)

### 3.8 开发调试与监控（DevTools & Monitoring）

**职责**：提供微前端专用的调试、性能监控与全链路追踪工具。

**核心能力**：
- W3C TraceContext 全链路追踪（串联跨应用消息与后端 API）
- 分离 DOM 树与内存泄漏主动探测（WeakRef + Detached DOM Monitor）
- DevTools 浏览器扩展（增量 DOM 渲染、安全防 XSS、Vite HMR 实时热更）

**设计文档**：[devtools.md](./devtools.md) | [monitoring.md](./monitoring.md)

### 3.9 模块交互协议（Module Interaction Protocol）

**职责**：定义核心模块间的交互时序、数据流向和错误传播路径。

**核心能力**：
- 统一事件系统（基于 cordis ctx.on()/ctx.emit()）
- 模块初始化顺序与依赖图谱
- 关键流程时序图（首次加载、应用切换、多槽位并发、错误降级、热更新）

**设计文档**：[module-interaction.md](./module-interaction.md)

---

## 四、关键特性

### 4.1 零改动适配

Cordis 通过**构建时转换**实现现有应用的零改动接入：

```javascript
// 原始代码（不改动）
import _ from 'lodash'
import { createRouter } from 'vue-router'

export default {
  data() {
    return { items: _.compact([1, 2, 3]) }
  }
}
```

```javascript
// 构建后（自动转换）
const _ = __cordis_require__('lodash')
const router = __cordis_create_router__({ ... })

export default {
  data() {
    return { items: _.compact([1, 2, 3]) }
  }
}
```

### 4.2 依赖协商与共享

无需中心化全局注册表。Cordis 基于 **Dependency Negotiation Matrix 与 Service 注入** 实现依赖按需共享与版本仲裁：

```json
// cordis.dependencies.json
{
  "shared": {
    "vue": {
      "version": "^3.2.0",
      "singleton": true,
      "fallback": "bundle"
    },
    "lodash": {
      "version": "^4.17.0"
    }
  }
}
```

### 4.3 动态应用角色与同屏多实例

应用角色**运行时动态决定**，既能独立单页运行，也能作为子应用或 Widget 插入主应用的多槽位中：

```javascript
// 无论是独立运行还是作为插件挂载，均享受统一的 Context 生态
export default function apply(ctx) {
  ctx.effect(() => {
    // 挂载
    return () => {
      // 卸载清理
    }
  })
}
```

### 4.4 完整的异构与多版本共存

Cordis 原生支持：
- **同技术栈不同版本**：Vue 2 和 Vue 3 在同一页面共存
- **不同技术栈**：Vue + React + Angular + jQuery 混合开发
- **外部框架兼容**：无缝集成 qiankun/wujia/micro-app 应用

### 4.5 服务端渲染支持

Cordis 支持分阶段 SSR 策略：
- **基础模式**：主应用 SSR + 子应用 CSR fallback
- **同构模式**：Node.js 可运行的子应用支持 SSR
- **边缘渲染**：ESI (Edge Side Includes) 方式在 CDN 层组装

---

## 五、技术栈

### 5.1 核心运行时

- **语言**：TypeScript
- **构建工具**：Vite / Webpack / Rollup
- **包管理**：npm / yarn / pnpm
- **测试框架**：Vitest / Jest

### 5.2 浏览器支持

- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 16+

### 5.3 框架支持

- Vue 2.6+ / Vue 3.0+
- React 16.8+ / React 17+ / React 18+
- Angular 9+
- jQuery 3.0+
- 原生 JavaScript

---

## 六、部署架构

### 6.1 主应用

```
main-app/
├── src/
│   ├── main.ts           # 入口文件
│   ├── App.vue           # 根组件
│   └── cordis.config.ts  # Cordis 配置
├── public/
│   └── index.html
└── package.json
```

### 6.2 子应用

```
sub-app/
├── src/
│   ├── main.ts           # 入口文件
│   ├── App.vue           # 根组件
│   └── cordis.config.ts  # Cordis 配置
├── cordis.dependencies.json  # 依赖声明
├── cordis.routes.json        # 路由声明
├── cordis.styles.json        # 样式声明
└── package.json
```

### 6.3 CDN 部署

```
cdn.example.com/
├── cordis/
│   ├── runtime/
│   │   └── cordis-runtime.js
│   ├── adapters/
│   │   ├── vue2-adapter.js
│   │   ├── vue3-adapter.js
│   │   └── react-adapter.js
│   └── devtools/
│       └── cordis-devtools.js
└── apps/
    ├── main-app/
    │   └── main.js
    ├── sub-app-1/
    │   └── main.js
    └── sub-app-2/
        └── main.js
```

---

## 七、性能指标

### 7.1 目标性能

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **首屏加载时间** | < 1.5s | 包含主应用和首个子应用 |
| **应用切换时间** | < 300ms | 从点击到渲染完成 |
| **内存占用** | < 100MB | 10 个并发应用 |
| **CPU 占用** | < 10% | 空闲状态 |

### 7.2 优化策略

- **按需加载**：只加载可见应用
- **预加载**：预加载即将访问的应用
- **沙箱复用**：相同技术栈的应用复用沙箱
- **状态缓存**：保活应用的状态缓存
- **资源压缩**：Gzip/Brotli 压缩

---

## 八、与现有方案对比

### 8.1 与 LinkJS 对比

| 维度 | LinkJS | Cordis |
|------|--------|--------|
| **依赖管理** | 注册表（易冲突） | Service 依赖注入（隔离共享） |
| **应用角色** | 固定（component/portal） | 动态（运行时决定） |
| **异构支持** | 有限 | 完整 |
| **状态共享** | 全局状态 | 分层状态 |
| **调试工具** | 基础 | 完整 |

### 8.2 与 qiankun 对比

| 维度 | qiankun | Cordis |
|------|---------|--------|
| **沙箱** | Proxy + Snapshot | Proxy（推荐） |
| **样式隔离** | Shadow DOM / StrictStyleIsolation | 命名空间 / Shadow DOM / CSS Modules |
| **状态管理** | globalState | 三层状态模型 |
| **通信机制** | globalState / CustomEvent | 消息协议 + EventBus |
| **异构支持** | 有限 | 完整 |

### 8.3 与 wujia 对比

| 维度 | wujia | Cordis |
|------|-------|--------|
| **隔离方式** | iframe | Proxy / Shadow DOM |
| **性能** | 低（iframe 开销） | 高 |
| **通信** | postMessage | EventBus / Request-Response |
| **调试** | 困难（iframe 隔离） | 容易（统一调试） |

---

## 九、实施路线图

### Phase 1: 核心运行时（2-3 个月）

- [ ] 生命周期管理器
- [ ] JS 沙箱（Proxy 沙箱）
- [ ] 基础状态管理
- [ ] 基础通信协议

### Phase 2: 适配器层（2-3 个月）

- [ ] Vue 2/3 适配器
- [ ] React 适配器
- [ ] 路由适配
- [ ] 样式隔离

### Phase 3: 异构支持（2-3 个月）

- [ ] 多版本 Vue 共存
- [ ] Angular 适配器
- [ ] jQuery 适配器
- [ ] 外部框架兼容（qiankun/wujia）

### Phase 4: 工具链（2-3 个月）

- [ ] Vite/Webpack 插件
- [ ] DevTools 浏览器扩展
- [ ] CLI 工具
- [ ] 文档和示例

### Phase 5: 生产就绪（1-2 个月）

- [ ] 性能优化
- [ ] 安全加固
- [ ] 监控和告警
- [ ] 灰度发布

---

## 十、总结

Cordis 微前端框架基于 **Cordis IoC 架构**，通过 **Context 隔离** 和 **Service 依赖注入**，实现了真正的松耦合、高内聚的分布式前端架构。

**核心创新**：
1. **无需注册表**：利用 Context 和 Service 机制实现依赖的按需注入与共享
2. **动态应用角色**：应用角色运行时动态决定，无需预先定义
3. **完整异构支持**：原生支持跨技术栈、跨版本的应用共存
4. **零改动适配**：通过构建时转换实现现有应用的零改动接入

**技术优势**：
- **性能优异**：Proxy 沙箱 + 按需加载 + 沙箱复用
- **开发体验好**：零改动适配 + 完整 DevTools + 热更新
- **可维护性强**：分层架构 + 标准化协议 + 完整文档

Cordis 代表了微前端框架的下一代发展方向，为大型复杂前端应用提供了更优雅、更高效的解决方案。
