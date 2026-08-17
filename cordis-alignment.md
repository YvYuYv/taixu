# Cordis 对齐基线（Cordis Alignment Baseline）

> 本文档是所有模块设计文档的**唯一权威基准**。任何模块文档与本基线冲突时，以本基线为准。
> 基于对 `@cordisjs/core` 源码（context.ts / fiber.ts / registry.ts / events.ts / service.ts）的逐行核验。

## 一、Cordis 核心事实（源码核验结论）

以下是经源码验证的 Cordis 真实语义，所有设计文档**必须**严格遵守：

### 1.1 Fiber 状态机（`fiber.ts`）

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                ↘ FAILED ↙
```

- `FiberState` 共 **6 个状态**：`PENDING / LOADING / ACTIVE / FAILED / DISPOSED / UNLOADING`
- `PENDING`：`inject` 声明的服务未全部就绪，插件**不执行** `apply`，等待依赖（这是 Cordis 的 reactive coeffect）
- `ACTIVE`：`apply` 已执行且全部依赖满足；`FAILED`：初始化抛错；`DISPOSED`：终态，**不可逆**
- **不存在 "deactivated/失活" 状态**。微前端的"保活"必须显式建模为框架层概念（见 §4）

### 1.2 副作用与事件（`fiber.ts` / `events.ts`）

```typescript
ctx.effect(fn)           // fn 返回 disposer；插件 dispose 时自动逆序执行
ctx.on(name, listener, options?)   // 内部经 fiber.effect 注册 → 随插件销毁自动解绑
ctx.once(name, listener)           // 原生 once 语义
ctx.emit / ctx.parallel / ctx.serial / ctx.bail / ctx.waterfall   // 5 种分发模式
EventOptions { prepend?: boolean; global?: boolean }
```

- **禁止**自建 effect 追踪器、事件总线、disposer 栈——这些是 Cordis 原生能力
- `serial` 顺序派发且**返回值非空即截断**（isBailed）；`bail` 同步版本。请求-响应/守卫管线**优先用 `serial`/`bail` 建模**
- 事件默认经 `Context.filter` 过滤（基于 isolate 标签的可见性）；`global: true` 跨隔离域广播

### 1.3 上下文树与服务（`context.ts` / `service.ts` / `registry.ts`）

```typescript
ctx.plugin(plugin, config)     // 挂载插件 → 派生 fiber + 子 context（fork 的正式 API）
ctx.isolate(name, label?)      // 返回"对 name 服务隔离"的新 ctx（不创建插件！）
ctx.intercept(name, config)    // 对 name 服务在本子树内注入配置
class MyService extends Service {
  static [Context.provide] = 'my-service'   // 服务名；服务直接挂 ctx 属性：ctx['my-service']
  static inject = ['deps']                  // 服务自身依赖
}
```

- **服务访问是 `ctx.router` / `ctx.state`（直接属性），不是 `ctx.service.xxx`**
- `Service.[Context.filter]` 基于 `ctx[symbols.isolate][name]` 决定可见性——**这就是"每应用独立 router 实例"的机制**：`ctx.isolate('router')` 后，子树内 `ctx.router` 解析到独立的 router 服务实例
- 插件 `{ inject: ['router'], apply(ctx) {} }`：router 未提供时 fiber 停留 PENDING，就绪时自动重跑——**应用依赖服务的时序问题由 Cordis 解决，禁止各模块自造"等待服务就绪"机制**

### 1.4 论文术语（cordiverse/paper）

- **effect**：可逆副作用，每个 context 变换携带逆操作由 runtime 追踪（revertible effects）
- **coeffect**：组件对 context 的声明式输入依赖；依赖变更时 runtime 通知组件重跑（reactive coeffects）
- 时空可组合性 = 时间维（副作用完全可逆）+ 空间维（依赖声明与响应式管理）
- 文档中引用这两个词时**必须**指上述语义，禁止杜撰（如"状态 = coeffect"属于错误用法）

## 二、框架级统一建模（微前端 → Cordis 映射）

### 2.1 子应用 = Cordis 插件（唯一范式，废除双轨）

```
微应用 ─→ plugin { inject, apply(ctx) }
  ├─ apply 内完成：容器创建、框架 mount（Vue createApp / React createRoot…）
  ├─ 所有副作用经 ctx.effect / ctx.on 注册 → 卸载即自动清理
  └─ 应用状态从 fiber.state 派生，禁止平行状态机
```

**废除**：`bootstrap/mount/unmount` 三段钩子协议（qiankun 式）。适配器只负责"把宿主框架的 mount/unmount 包成一次 effect"，不构成第二套生命周期。
外部框架应用（qiankun/wujie 产物）经兼容适配器包成插件。

### 2.2 服务清单与归属（全部为 Cordis Service）

| 服务名 | provide | 职责 | 默认隔离性 |
|--------|---------|------|-----------|
| `lifecycle` | root 单例 | Fiber 树管理、保活、错误恢复 | 共享 |
| `router` | root 单例 + **按 outlet 隔离视图** | URL↔槽位矩阵、守卫管线 | `isolate('router-view')` |
| `bus` | root 单例 | 跨应用消息（基于事件树 + target 路由） | 共享 |
| `state` | root 单例 | 三层状态、权限写入管线 | 键空间按权限隔离 |
| `sandbox` | root 单例 | JS 沙箱工厂（创建动作挂 effect） | 每应用实例 |
| `monitor` | root 单例 | 采集/告警/追踪 | 共享 |
| `security` | root 单例 | 权限/白名单/审计（其他服务 inject 它） | 共享 |
| `deps` | root 单例 | 共享依赖仲裁 | 共享 |

**统一写法**：`static [Context.provide] = 'router'`；消费方 `static inject = ['router']`。禁止 `ctx.service.x`、`ctx.require()`、`ctx.dependencies.resolve()` 等自造访问方式。

### 2.3 依赖方向（禁止成环）

```
monitor ←─ security ←─ (bus / state / deps)
    ↑                        ↑
    └────── lifecycle / router / sandbox ──┘
```

- `lifecycle / router / sandbox` 可 inject `monitor / bus / state / deps`
- `monitor / security` **不依赖**任何业务服务（最先可用）
- `router` 不 inject `lifecycle`（导航通过事件解耦：router 发 `router:navigate` serial 事件，lifecycle 监听并执行挂载，结果回写）——**消除旧设计的死锁环**

### 2.4 统一事件契约（全框架唯一版本）

命名：`域:动作`，kebab-case。载荷一律**单对象**：

```typescript
interface Events {
  // 生命周期（由 lifecycle 服务在应用 fiber 对应 ctx 上派发；旁听用 global:true 在根注册）
  'app/loading': { appId: string; instanceId: string; signal: AbortSignal }
  'app/loaded': { appId: string; instanceId: string }
  'app/ready': { appId: string; instanceId: string }        // fiber ACTIVE（依赖满足、apply 完成）
  'app/error': { appId: string; instanceId: string; phase: 'load' | 'activate' | 'runtime'; error: Error; recoverable: boolean }
  'app/suspend': { instanceId: string; reason: 'keepalive' | 'navigation' }   // 保活挂起（非 dispose）
  'app/resume': { instanceId: string }
  'app/disposed': { appId: string; instanceId: string }
  // 路由
  'router/navigate': { from: RouteLocation; to: RouteLocation; outlet: string; signal: AbortSignal }  // serial，可被拦截
  'router/aborted': { outlet: string; reason: 'guard' | 'superseded' | 'unmount' }
  'router/changed': { location: RouteLocation; outlets: Record<string, MatchedApp | null> }
  // 通信（bus 内部派发，target 路由见 communication-protocol.md）
  'message/send': { message: CordisMessage }
  'message/receive': { message: CordisMessage; targetCtx: Context }
  // 状态
  'state/changed': { key: string; value: unknown; old: unknown; path: string; source: string; version: number }
  // 监控（monitor 服务派发；旁听需 global:true）
  'monitor/report': { metric: Metric }       // 单对象，统一形状
  'monitor/alert': { alert: Alert }
  // 安全
  'security/violation': { appId: string; rule: string; detail: unknown }
}
```

- 旧契约 `lifecycle:beforeLoad / beforeMount / mounted / state:change / monitor:report(metric, traceId)` 全部**作废**
- 所有旁听（monitor/devtools）必须 `ctx.on(name, fn, { global: true })` 在根上下文注册（事件默认按 isolate 过滤，见 §1.3）

### 2.5 通信路由模型

- 发送方在自己的 fork ctx 上 `ctx.emit('message/send', msg)` → 事件沿上下文树**冒泡**至根
- bus 服务在根上以 `global: true` 监听 `message/send`，按 `target` 解析目标应用 fiber 的 ctx，调用 `targetCtx.emit('message/receive', ...)` 完成**定向投递**（不广播载荷，见 §五安全）
- 请求-响应：`ctx.bail / ctx.serial` 原生语义 + bus 的 `request()` API（内部用 correlationId=uuid，超时必解绑）
- 广播：`bus.broadcast(type, payload)` → bus 对每个 ACTIVE 应用 ctx emit `message/receive`（`global: true`）

### 2.6 保活（Keep-Alive）语义

Cordis dispose 不可逆，保活**不是**插件状态，而是 lifecycle 服务的**挂载层**概念：

```
Active（渲染中）⇄ Suspended（DOM 摘除缓存、副作用冻结）→ Destroyed
```

- Suspended 态：lifecycle 将容器 DOM 摘到文档片段缓存，通过 `ctx[SuspendScope]` 冻结该 fiber 的 rAF/定时器配额（效应已注册的不重复清理，见 lifecycle-management.md §五）
- 恢复 = 重挂 DOM + 解冻；淘汰（LRU/超时）= 真正 `fiber.dispose()`
- 样式/监听等 effect **保留**（与 dispose 区分），样式隔离模块按此语义定义样式生命周期

## 三、错误处理统一模型

```
错误源 ─→ monitor.capture(error, { appId, phase })  ─→ 归因(appId) + 采样 + 告警
                    │
                    ├─ 可恢复（load/activate 失败）→ lifecycle 错误恢复策略（重试/降级/fallback 应用）
                    └─ 不可恢复（运行时）→ app/error 事件 + ErrorOutlet UI 边界
```

- **唯一入口** `monitor.capture()`；禁止各模块自建 onerror 链、自定重试
- 渲染错误：适配器在 effect 内挂框架级 errorCaptured / ErrorBoundary，统一转 `monitor.capture`
- sourcemap 还原在 monitor 内完成（devtools 复用）

## 四、安全基线

1. **信任分级**：first-party → Proxy 沙箱（性能隔离）；third-party → iframe `sandbox`（无 `allow-same-origin`）+ postMessage 协议
2. **Proxy 沙箱不是安全边界**——文档叙事必须一致；逃逸向量（constructor 链/Symbol.unscopables/getPrototypeOf/Worker/SW/网络面）在 js-sandbox.md 显式列出与缓解
3. **全局魔法句柄禁止**：`window.__CORDIS_RUNTIME__` / `__CORDIS_DEVTOOLS__` 列入沙箱黑名单；能力一律经 ctx 服务注入
4. **token/敏感数据**：不进广播消息、不进 DevTools 明文、持久化排除清单
5. **CSP**：宿主 HTTP 头下发；框架动态注入脚本携带 nonce；默认策略不含 `unsafe-inline`
6. **权限唯一实现**：security 服务的 `PermissionManager`；bus/state/router 的写入/发送/导航路径**强制调用**（deny-by-default，`action: '*'` 必须被显式实现）

## 五、跨文档一致性规则

| 规则 | 内容 |
|------|------|
| 命名 | 框架名 Cordis；外部框架 wujie（无界）不是 "wujia"；包名 `@cordis-mf/*` |
| AbortSignal | 加载/激活/导航全链路透传 `signal`（loader→adapter→fetch） |
| React 渲染 | 统一 `createRoot`（React 18+）；17 以下 legacy 走适配器显式分支 |
| 容器创建 | 唯一路径 `lifecycle.createOutletContainer()`（style/heterogeneous 引用它） |
| XSS | 任何 innerHTML 注入必须转义；错误页/DevTools 面板同标准 |
| 状态快照 | `state.snapshot(keys?)` 支持按 key 子集；保活只用应用声明的作用域键 |
| fetch 拦截 | **唯一链路** `bus.network.intercept()`（FetchInterceptorChain）；monitor/security/tracing 全部挂在这条链上，禁止直接 monkeypatch window.fetch |
| HMR | devtools 统一入口 `ctx.hmr.reload(appId)`；CSS 真热替换、JS 整应用重启，粒度在 HMR 服务声明 |
| 部署偏斜 | loader 校验 manifest 版本 + chunk 404 时重取 manifest 提示刷新（唯一恢复策略，monitor 上报） |

## 六、各文档修正要点索引

| 文档 | 必须修复的最高优先级问题 |
|------|--------------------------|
| lifecycle-management | 废除平行状态机/双生命周期；应用状态=fiber.state；保活三模式落地；load 失败 fork 泄漏；9.2 事件方向 |
| module-interaction | 统一 §2.4 事件契约；init 顺序改为 Cordis DI 自动解析；HMR 补 dispose |
| state-sharing | 删自研 pub/sub → observer+ctx.effect；权限接线（写管线唯一入口）；跨 tab 双通道修复；batch 真原子性 |
| communication-protocol | 消息路由改上下文树定向投递；request 用 bail/serial；traceparent CSPRNG+传播；粘性消息改响应式服务 |
| js-sandbox | exec 逃逸（with+非严格产物限定）；document.getElementById bug；trap 语义；Worker/SW/网络面；iframe sandbox 属性 |
| security | iframe 去掉 allow-same-origin；CSP unsafe-inline；action:'*' 实现；单例全部改 Service+ctx.effect；CSRF 改服务端协议 |
| route-adaptation | ctx.isolate 误用纠正；多槽位 URL 文法（保留字+通道仲裁）；popstate 过守卫；导航序号防竞态；守卫用 serial |
| style-isolation | keyframes/@font-face/@import 前缀化；all:initial 与主题冲突修复；React 事件补丁细化；HMR 目标节点修复 |
| heterogeneous-loading | ESM 与 Proxy 沙箱矛盾（importmap 方案）；semver 最高版本仲裁；fallback 双实例风险；Angular/qiankun 适配器可行性 |
| monitoring | 采集器改 Service+effect；错误 appId 归因+sourcemap；采样接线；WeakRef 特性检测+FinalizationRegistry；fetch 挂唯一链 |
| devtools | 传输链路统一单通道；XSS 全量修复；复用 monitor 采集；HMR 保状态策略 |
