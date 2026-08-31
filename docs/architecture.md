# Cordis 微前端框架 - 整体架构概览

> **必读**：[cordis-alignment.md](./specs/cordis-alignment.md) 是全部设计文档的统一基线（Cordis 真实 API 语义、服务清单、事件契约、安全基线、跨文档一致性规则）。各模块文档与基线冲突时以基线为准。
> **领域语言**：[CONTEXT.md](./CONTEXT.md) 是术语唯一权威来源（Fiber/槽位/容器/保活/键空间/暖启动等，含禁用同义词）。
> **决策档案**：[docs/adr/](./docs/adr/) 收录 60 项架构决策（ADR-0001~0060），每项记录上下文、决策与被否备选；基线 §六 是按文档分组的决策地图。

## 〇、全局设计主线（贯穿全部文档的六条决策背后的决策）

1. **Cordis 原生能力优先，禁止自造轮子**--effect 追踪、事件总线、disposer 栈、等待服务就绪全部用 Cordis 原生；框架只建模微前端领域概念（保活/槽位/键空间/沙箱）
2. **鉴权走服务方法，通知走事件**--需要鉴权的操作（发消息/挂起请求/权限裁决）是服务方法（可拦截可拒绝）；纯通知（状态变更/生命周期事件）是事件（fire-and-forget）；两者不可混用
3. **丢失必须显式**--队列溢出上报 `bus/overflow`、WS 挂起断连由应用重建订阅、快照版本漂移丢弃上报；框架不假装"什么都没丢"
4. **fail-closed**--安全服务未就绪则全部应用无法挂载、裁决超时拒绝、权限规则只本地可判定；安全侧默认值永远是拒绝
5. **隔离是精确工具**--`ctx.isolate` 仅白名单两处（router 按槽位、monitor 按应用）；状态隔离用键前缀不用 isolate；沙箱按信任分级（Proxy vs iframe）
6. **保活是框架层概念**--Cordis 无 deactivated 状态；保活是 lifecycle 在挂载层的建模（SuspendScope + LRU 池 + 分级裁决），dispose 永远不可逆

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
- 保活：挂起裁决单点化（来源分级：路由 > 系统信号 > 命令，ADR-0018/0031/0035）+ SuspendScope 五类全局冻结（ADR-0013/0027）+ 默认挂起（ADR-0020）
- 驱逐：LRU 上限 5 + Chromium 内存水位（ADR-0019/0026）；驱逐前 local 键空间快照、重挂载暖启动（ADR-0029/0034/0052）
- 挂起期间：bus 消息排队有界回放（ADR-0008/0015）+ state 走拉模型（ADR-0023）+ WS 断连框架重连（ADR-0017）
- 错误恢复：重试主体明确（重走挂载事务）、fallback 应用、ErrorOutlet

**设计文档**：[lifecycle-management.md](./specs/lifecycle-management.md)

### 3.2 状态管理（State Manager）

**职责**：跨应用状态共享与隔离。

**核心能力**：
- 三层键空间（global:/shared:/local:{appId}:，Local 经**键前缀 + fiber 归属校验**实现，不用 isolate--ADR-0003）
- 唯一写入管线：权限（security 接线，读写都校验）-> 版本推进 -> 单次通知
- 观察者经 `ctx.on('state/changed')` 订阅（dispose 自动退订，ADR-0001）；深层代理身份稳定
- 挂起走拉模型：恢复时 `state/sync` 一次性同步（ADR-0023）
- `local:` 键使用条款：JSON 可序列化、禁存 token/密码/PII（快照前提，ADR-0029/0044）
- 跨标签页同步（版本仲裁 + 回声过滤 + 敏感键排除）

**设计文档**：[state-sharing.md](./specs/state-sharing.md)

### 3.3 通信协议（Communication Protocol）

**职责**：应用间通信。

**核心能力**：
- 发送走 `ctx.bus.send` 服务方法（鉴权、source 从 fiber 派生不可伪造，ADR-0041/0055）；接收 `ctx.on('message/receive')` 定向投递（不广播载荷）
- 请求-应答：`serial` + 统一包络 `{ok,value,reason}`（`bail` 禁用--不 await 异步回调，ADR-0014/0016）；单点查询走服务方法（ADR-0028）
- 最新值机制（publishLatest）：响应式状态服务替代 MQTT 式 retained 消息
- W3C TraceContext（CSPRNG + trace 延续 + span 上报）；唯一 fetch 拦截链

**设计文档**：[communication-protocol.md](./specs/communication-protocol.md)

### 3.4 JS 沙箱（Sandbox Manager）

**职责**：JS 执行环境隔离。**定位声明：Proxy 沙箱是污染隔离与效应回收，不是安全边界；安全边界只有 iframe sandbox（无 allow-same-origin）**。

**核心能力**：
- 双窗口 Proxy（trap 语义正确、恒返回 true、location 统一重定向 router）
- 逃逸向量清单化缓解（constructor 链/getPrototypeOf/unscopables/Worker/SW/网络面等 10 项）
- Document 代理（scoped 查询 + 全路径注入记账，样式 appendChild 自动登记 ADR-0042）+ 存储命名空间（真接线）
- ESM 主路线经 importmap + 构建期标识符改写（零 eval，与 CSP 兼容）
- 挂起冻结经包装函数内查挂起注册表（appId 创建期闭包捕获，ADR-0032/0048）；scopedFetch 由 lifecycle 在沙箱创建后、plugin() 前注入（ADR-0005）

**设计文档**：[js-sandbox.md](./specs/js-sandbox.md)
**安全文档**：[security.md](./specs/security.md)

### 3.5 路由管理（Router Manager）

**职责**：跨应用路由协调与隔离。

**核心能力**：
- 多槽位 URL 矩阵（`__tx_` 保留字前缀 + 通道仲裁 + 槽位参数合并不互抹）
- 可取消导航 + 导航序号防竞态；popstate 走完整守卫管线（不逃逸）
- 守卫 = `ctx.serial` 事件，结果为显式枚举 `{proceed|redirect|abort}`（ADR-0002）；router 与 lifecycle 事件解耦（无依赖环）
- 视图隔离只读：`isolate('router-view', outlet)` 读本槽位，写经全局 NavigationController 合并（ADR-0006/0010）；槽位事件 `outlet/changed:{outlet}` 独立族（ADR-0047/0050），挂起恢复重放（ADR-0056）
- Vue Router 4/3 桥接（abstract 模式，不双写 History）

**设计文档**：[route-adaptation.md](./specs/route-adaptation.md)

### 3.6 样式隔离（Style Isolation）

**职责**：防止 CSS 样式冲突和污染。

**核心能力**：
- 命名空间策略（PostCSS：含 html/body 语义等价、@keyframes 重写、@font-face 提升、@layer 隔离）
- Shadow DOM 策略（Constructable Stylesheets + Portal 重定向 + React16/17 事件补丁保真）
- 主题变量经 `--tx-*` 管理通道（不受容器 reset 影响）；挂起时 shadow 内与 head 内样式节点一并摘除缓存、恢复还回（ADR-0033/0042）
- 运行时 CSS-in-JS 补丁；HMR css-only 真热替换

**设计文档**：[style-isolation.md](./specs/style-isolation.md)

### 3.7 异构加载（Heterogeneous Loading）

**职责**：不同技术栈、不同版本的应用同页运行。

**核心能力**：
- importmap 作为共享依赖运行时载体（消除沙箱与 ESM 的根本矛盾，零 eval）
- 依赖仲裁：最高满足版本 + 单例冲突硬失败 + 私有副本白名单（split-brain 防护）；版本分裂强制 iframe 隔离（ADR-0038）
- iframe 沙箱 = 精简运行时 + 代理 ctx 经 postMessage 桥接；崩溃经 heartbeat 感知按 appId 批量清理（ADR-0043/0049）
- Vue2/Vue3/React/jQuery 适配器（standalone+AOT 的 Angular 为实验性）
- qiankun/wujie（正确拼写）兼容；版本偏斜恢复与多 CDN 容灾

**设计文档**：[heterogeneous-loading.md](./specs/heterogeneous-loading.md)

### 3.8 开发调试与监控（DevTools & Monitoring）

**职责**：调试、性能监控与全链路追踪。

**核心能力**：
- monitor 为唯一错误入口（appId 归因 + sourcemap 还原）与唯一采集源；按应用隔离实例只做主动上报归因，聚合汇于 root sink（ADR-0010/0025/0045）
- TraceContext 经 bus 贯通隔离边界（ADR-0022）；挂起回放以 span link 关联（ADR-0030）
- 泄漏探测（FinalizationRegistry + 特性降级，能力边界诚实声明）
- 会话粘性采样 + 批量上报（含错误）+ 持久队列补发
- DevTools 扩展：单一传输通道、XSS 全量防护、复用 monitor 数据、HMR 分级（css 真热替换/js 整重启且经快照保状态 ADR-0037）

**设计文档**：[devtools.md](./specs/devtools.md) | [monitoring.md](./specs/monitoring.md)

### 3.9 模块交互协议（Module Interaction Protocol）

**职责**：核心模块间的依赖方向、交互时序、统一事件契约。

**核心能力**：
- 依赖方向重画：lifecycle 是唯一多注入编排者（scopedFetch 注入、挂起协调），其余服务 ≤2 注入（ADR-0054）；monitor/security 无业务依赖，router 经事件解耦 lifecycle
- 统一事件契约（基线 §2.4）：生命周期 `app/*`、槽位 `outlet/changed:{outlet}`（模板字面量类型，ADR-0050）、状态 `state/changed`/`state/sync`、溢出 `bus/overflow`、驱逐 `app/evicted`；`app/intent:*` 已删除（挂起意图走服务方法，ADR-0035）
- 分发结果契约按事件族区分（基线 §2.4.1）：守卫族显式枚举 / 管线族统一包络 / 点对点直接方法返回 / 通知族忽略返回值
- 初始化由 Cordis DI 自动解析（无手写顺序表）
- 关键时序：首次加载/切换/消息/错误降级/HMR（含 fiber.dispose）

**设计文档**：[module-interaction.md](./specs/module-interaction.md)

---

## 四、关键特性

### 4.1 约定式近零改动适配

Cordis 通过**构建插件 + 运行时桥接**实现现有应用的低成本接入（承诺诚实化：不做不可靠的全量 AST 魔法转换）：

```javascript
// 子应用入口一行声明（或经构建插件 externals 重定向，零源码改动）
import { defineCordisApp } from '@taixu/adapter-vue3'

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
| **通信机制** | globalState / CustomEvent | 上下文树定向路由 + serial 统一包络（bail 全局禁用） |
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

---

## P0 核心运行时 · 验证与裁决声明（12 号票收口）

- **验证链**：`npm run verify` = typecheck + 全量测试（137 例）。其中 `tests/contract.test.ts` 是事件契约机器验证 + 静态扫描 lint（`npm run lint:contract` 单独可跑）：
  - 基线 §2.4 全部事件在集成场景中断言形状（载荷单对象、必填字段类型机器可读契约表）
  - 结果契约：守卫族只允许枚举三值 + `undefined`（违规形状按中止 + monitor 上报，ADR-0002）；请求-应答族只允许包络/null/undefined（false 运行时拒绝，ADR-0014）
  - 静态扫描：零 `ctx.bail`（ADR-0016）、`app/intent:*` 不存在（ADR-0035）、已删除旧契约事件名零引用、禁 `ctx.service.x` 自造访问
  - 核心层守卫：八核心服务运行时替换（散落 `ctx.set`）被拒并上报（ADR-0011）
- **演示终验**：`npm run dev`（demo/）串起挂载 → 请求-应答 → 切换保活 → 消息回放 → 驱逐暖启动 → 守卫拦截 → fail-closed 全链路。
- **文档冲突裁决**：任何模块文档与 **cordis-alignment.md** 冲突时，以 cordis-alignment.md 为准（AGENTS.md 约定；CI 注释同此声明）。
