# Cordis 微前端框架 - 整体架构概览

> **必读**：[cordis-alignment.md](./cordis-alignment.md) 是全部设计文档的统一基线（Cordis 真实 API 语义、服务清单、事件契约、安全基线、跨文档一致性规则）。各模块文档与基线冲突时以基线为准。

## 一、框架定位

Cordis 是基于 **Cordis IoC 架构**（[@cordisjs/core](https://github.com/cordiverse/cordis)）设计的下一代微前端框架，核心理念是将微应用视为**注册在 Context 上的 Plugin**，利用依赖注入实现真正的松耦合、高内聚的分布式前端架构。

### 1.1 设计哲学（时空可组合性）

- **控制反转（IoC）**：应用的加载、卸载和通信交由底层 Context 管理，在时间和空间维度自由组合
- **时间维（revertible effect）**：微应用的一切副作用经 `ctx.effect()`/`ctx.on()` 注册，dispose 时 runtime 自动逆序回收
- **空间维（reactive coeffect）**：应用以 `static inject` 声明服务依赖，未就绪自动 PENDING、就绪自动激活--无需手动拓扑排序
- **生命周期安全**：应用状态从 Cordis Fiber 状态机（PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING）派生，不存在平行状态机

### 1.2 Cordis 概念在微前端中的映射

- **Context (上下文)**：应用的运行容器（IoC 容器）。主应用对应根 Context，每个子应用运行在 `ctx.plugin()` 挂载时派生的 Fiber Context 中；`ctx.isolate(name)` 用于**服务级隔离**（如多槽位独立 router 视图），不用于创建子应用。
- **Service (服务)**：框架核心能力（router/state/bus/sandbox/monitor 等）以 `static [Context.provide]` 注册，应用经 `static inject` 声明消费；服务直接挂 ctx 属性（`ctx.router`），可见性经 isolate 标签过滤。
- **Plugin (插件)**：子应用本身的唯一形态（`apply(ctx)`）。挂载即 plugin()，销毁即 fiber.dispose()；**不存在 bootstrap/mount/unmount 第二套协议**。
- **Fiber (纤程)**：管理插件生命周期的内部结构，六态状态机 PENDING -> LOADING -> ACTIVE -> UNLOADING -> DISPOSED（含 FAILED）；inject 未满足停留 PENDING，就绪自动激活。
- **ctx.effect() / ctx.on()**：统一管理副作用与事件监听，随插件销毁自动回收（监听器注册内部即挂 fiber.effect）。

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
│  │ qiankun  │  │ wujie    │  │ micro-app│  ...                 │
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

**职责**：挂载编排（可取消事务）、保活（Suspend/Resume）、多实例、错误恢复。应用状态**从 Cordis Fiber 状态机派生**，不维护平行状态机。

**核心能力**：
- 唯一范式：应用 = 插件（`apply(ctx)`），废除 bootstrap/mount/unmount 双轨
- outlet 级挂载事务（promise 链互斥，无唤醒竞态；AbortSignal 全链透传）
- 保活三模式（dom/state/memory）+ SuspendScope 效应冻结 + LRU 预算
- 错误恢复：重试主体明确（重走挂载事务）、fallback 应用、ErrorOutlet

**设计文档**：[lifecycle-management.md](./lifecycle-management.md)

### 3.2 状态管理（State Manager）

**职责**：跨应用状态共享与隔离。

**核心能力**：
- 三层键空间（global:/shared:/local:{appId}:，Local 经 `ctx.isolate('state')` 真实隔离）
- 唯一写入管线：权限（security 接线，读写都校验）-> 版本推进 -> 单次通知
- 观察者经 `ctx.effect` 托管（应用卸载自动退订）；深层代理身份稳定
- 跨标签页同步（版本仲裁 + 回声过滤 + 敏感键排除）

**设计文档**：[state-sharing.md](./state-sharing.md)

### 3.3 通信协议（Communication Protocol）

**职责**：应用间通信。

**核心能力**：
- 上下文树路由：`message/send` 冒泡捕获 -> 目标 ctx 定向投递（不广播载荷）
- 请求-响应基于 `ctx.serial/bail` 原生语义（超时必解绑、可取消）
- 最新值机制（publishLatest）：响应式状态服务替代 MQTT 式 retained 消息
- W3C TraceContext（CSPRNG + trace 延续 + span 上报）；唯一 fetch 拦截链

**设计文档**：[communication-protocol.md](./communication-protocol.md)

### 3.4 JS 沙箱（Sandbox Manager）

**职责**：JS 执行环境隔离。**定位声明：Proxy 沙箱是污染隔离与效应回收，不是安全边界；安全边界只有 iframe sandbox（无 allow-same-origin）**。

**核心能力**：
- 双窗口 Proxy（trap 语义正确、恒返回 true、location 统一重定向 router）
- 逃逸向量清单化缓解（constructor 链/getPrototypeOf/unscopables/Worker/SW/网络面等 10 项）
- Document 代理（scoped 查询 + 全路径注入记账）+ 存储命名空间（真接线）
- ESM 主路线经 importmap + 构建期标识符改写（零 eval，与 CSP 兼容）

**设计文档**：[js-sandbox.md](./js-sandbox.md)
**安全文档**：[security.md](./security.md)

### 3.5 路由管理（Router Manager）

**职责**：跨应用路由协调与隔离。

**核心能力**：
- 多槽位 URL 矩阵（`__tx_` 保留字前缀 + 通道仲裁 + 槽位参数合并不互抹）
- 可取消导航 + 导航序号防竞态；popstate 走完整守卫管线（不逃逸）
- 守卫 = `ctx.serial` 事件（重定向 8 次上限）；router 与 lifecycle 事件解耦（无依赖环）
- Vue Router 4/3 桥接（abstract 模式，不双写 History）

**设计文档**：[route-adaptation.md](./route-adaptation.md)

### 3.6 样式隔离（Style Isolation）

**职责**：防止 CSS 样式冲突和污染。

**核心能力**：
- 命名空间策略（PostCSS：含 html/body 语义等价、@keyframes 重写、@font-face 提升、@layer 隔离）
- Shadow DOM 策略（Constructable Stylesheets + Portal 重定向 + React16/17 事件补丁保真）
- 主题变量经 `--tx-*` 管理通道（不受容器 reset 影响）；样式生命周期与 dispose/保活对齐
- 运行时 CSS-in-JS 补丁；HMR css-only 真热替换

**设计文档**：[style-isolation.md](./style-isolation.md)

### 3.7 异构加载（Heterogeneous Loading）

**职责**：不同技术栈、不同版本的应用同页运行。

**核心能力**：
- importmap 作为共享依赖运行时载体（消除沙箱与 ESM 的根本矛盾，零 eval）
- 依赖仲裁：最高满足版本 + 单例冲突硬失败 + 私有副本白名单（split-brain 防护）
- Vue2/Vue3/React/jQuery 适配器（standalone+AOT 的 Angular 为实验性）
- qiankun/wujie（正确拼写）兼容；版本偏斜恢复与多 CDN 容灾

**设计文档**：[heterogeneous-loading.md](./heterogeneous-loading.md)

### 3.8 开发调试与监控（DevTools & Monitoring）

**职责**：调试、性能监控与全链路追踪。

**核心能力**：
- monitor 为唯一错误入口（appId 归因 + sourcemap 还原）与唯一采集源
- 泄漏探测（FinalizationRegistry + 特性降级，能力边界诚实声明）
- 会话粘性采样 + 批量上报（含错误）+ 持久队列补发
- DevTools 扩展：单一传输通道、XSS 全量防护、复用 monitor 数据、HMR 分级（css 真热替换/js 整重启）

**设计文档**：[devtools.md](./devtools.md) | [monitoring.md](./monitoring.md)

### 3.9 模块交互协议（Module Interaction Protocol）

**职责**：核心模块间的依赖方向、交互时序、统一事件契约。

**核心能力**：
- 无死锁依赖图（monitor/security 无业务依赖；router 经事件解耦 lifecycle）
- 统一事件契约（`app/*`、`router/*`、`message/*`、`state/changed` 等唯一版本）
- 初始化由 Cordis DI 自动解析（无手写顺序表）
- 关键时序：首次加载/切换/消息/错误降级/HMR（含 fiber.dispose）

**设计文档**：[module-interaction.md](./module-interaction.md)

---

## 四、关键特性

### 4.1 约定式近零改动适配

Cordis 通过**构建插件 + 运行时桥接**实现现有应用的低成本接入（承诺诚实化：不做不可靠的全量 AST 魔法转换）：

```javascript
// 子应用入口一行声明（或经构建插件 externals 重定向，零源码改动）
import { defineCordisApp } from '@cordis-mf/core'

export default defineCordisApp({
  rootComponent: App,           // 框架适配器自动选择 mount/unmount 策略
})
```

### 4.2 依赖协商与共享

无需中心化全局注册表。共享依赖经 **importmap + SemVer 仲裁**（最高满足版本、单例冲突硬失败、私有副本白名单防 split-brain）：

```jsonc
// cordis.dependencies.json（进 manifest 签名范围）
{
  "shared": {
    "vue": { "range": "^3.2.0", "singleton": true },
    "lodash": { "range": "^4.17.0", "acceptsDuplicate": true }
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
- **同技术栈不同版本**：Vue 2 和 Vue 3 在同一页面共存（importmap 版本别名）
- **不同技术栈**：Vue + React + jQuery 混合开发（Angular standalone 路线为实验性）
- **外部框架兼容**：无缝集成 qiankun/wujie/micro-app 应用

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

## 八、与现有方案对比（维度对齐基线）

### 8.2 与 qiankun 对比

| 维度 | qiankun | Cordis |
|------|---------|--------|
| **应用模型** | bootstrap/mount/unmount 钩子协议 | Cordis 插件（apply + fiber 状态机，副作用自动回收） |
| **沙箱** | Proxy + Snapshot | Proxy（first-party 污染隔离）/ iframe sandbox（third-party 安全边界） |
| **样式隔离** | Shadow DOM / StrictStyleIsolation | 命名空间（含 keyframes/font-face/layer）/ Shadow DOM / CSS Modules |
| **状态管理** | globalState | 三层键空间 + 唯一写入管线（权限/版本） |
| **通信机制** | globalState / CustomEvent | 上下文树定向路由 + serial/bail 请求响应 |
| **共享依赖** | externals 约定 | importmap + SemVer 仲裁（冲突硬失败） |

### 8.3 与 wujie 对比

| 维度 | wujie | Cordis |
|------|-------|--------|
| **隔离方式** | iframe | first-party 用 Proxy（性能）/ third-party 用 iframe（安全） |
| **性能** | iframe 开销 | Proxy 路线进程内直跑 |
| **通信** | postMessage | 同进程上下文树事件 / 跨源 postMessage 桥（统一协议） |
| **调试** | iframe 隔离难 | 统一 DevTools（复用 monitor 唯一采集源） |

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
- [ ] 外部框架兼容（qiankun/wujie）

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
1. **时空可组合性落地**：副作用可逆化（ctx.effect/dispose 级联回收）+ 依赖声明式响应（inject/PENDING/reactive coeffect），生命周期无平行状态机
2. **无死锁服务图**：monitor/security 零业务依赖、router 与 lifecycle 事件解耦、初始化由 Cordis DI 自动解析
3. **安全叙事一致**：Proxy 沙箱 = 污染隔离、iframe sandbox = 安全边界；权限 deny-by-default 且全链路接线（bus/state/router/deps）
4. **诚实的能力边界**：ESM 零 eval 路线（importmap + 构建期改写）、依赖冲突硬失败、HMR 分级语义、监控泄漏探测能力边界声明

**技术优势**：
- **性能优异**：Proxy 沙箱 + 按需加载 + 模块缓存复用（沙箱不池化，杜绝跨应用泄漏）
- **开发体验好**：约定式近零改动接入 + 统一 DevTools（单一传输通道、复用采集）+ HMR
- **可维护性强**：统一事件契约（基线 §2.4）+ 分层架构 + 每模块文档附"与旧版差异"索引

Cordis 代表了微前端框架的下一代发展方向，为大型复杂前端应用提供了更优雅、更高效的解决方案。
