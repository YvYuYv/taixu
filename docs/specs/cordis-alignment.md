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
- `serial` 顺序派发、**await 每个回调**、返回值非 null/false/undefined 即截断（`isBailed`，events.ts:6）；`bail` 同步版本、**不 await 异步回调**（Promise 会被当真值立即截断）。**请求-应答/守卫管线一律用 `serial`；`bail` 在本框架禁用**（ADR-0016）。应答者返回包络/枚举表示截断，返回 null/undefined 表示不截断，**禁止返回 false**（false 不截断但语义含混）
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
- `Service.[Context.filter]` 基于 `ctx[symbols.isolate][name]` 决定可见性——**这就是"按槽位独立 router 视图"的机制**：`ctx.isolate('router-view', outlet)` 后，子树内 router 视图解析到本槽位的只读实例（isolate 白名单见 §2.2，ADR-0010）
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
| `router` | root 单例 + **按 outlet 隔离视图** | URL↔槽位矩阵、守卫管线 | `isolate('router-view')`（ADR-0010 白名单） |
| `bus` | root 单例 | 跨应用消息（基于事件树 + target 路由）；TraceContext 经 bus 贯通（ADR-0022） | 共享 |
| `state` | root 单例 | 三层状态、权限写入管线 | **键空间前缀隔离，禁止 isolate('state')**（ADR-0003） |
| `sandbox` | root 单例 | JS 沙箱工厂（创建动作挂 effect）；scopedFetch 由 lifecycle 在沙箱创建后注入（ADR-0005） | 每应用实例 |
| `monitor` | root 单例 + **按应用隔离实例** | 采集/告警/追踪 | `isolate('monitor', appId)`（ADR-0010 白名单） |
| `security` | root 单例 | 权限/白名单/审计；**lifecycle 的显式 inject 依赖**（ADR-0009 fail-closed）；**禁止 isolate('security')**（ADR-0010 裁决漂移） | 共享 |
| `deps` | root 单例 | 共享依赖仲裁 | 共享 |

> **核心层不可替换**（ADR-0011）：上表八个服务运行时不可替换；替换其中任何一个被视为框架级重启事件（整树重挂载），必须经框架入口而非散落的 `ctx.set`。第三方插件服务不在保护列，替换按 ADR-0007 整应用重挂载语义处理。
> **isolate 白名单**（ADR-0010）：`ctx.isolate` 仅允许两处——router 按槽位（只读视图，写操作走全局 NavigationController 合并，ADR-0006）、monitor 按应用。新增 isolate 用途必须先改本基线。

**统一写法**：`static [Context.provide] = 'router'`；消费方 `static inject = ['router']`。禁止 `ctx.service.x`、`ctx.require()`、`ctx.dependencies.resolve()` 等自造访问方式。

### 2.3 依赖方向（禁止成环，ADR-0054）

```
monitor ─（无依赖，最先可用）
security ─（无依赖；lifecycle 显式 inject security——ADR-0009 fail-closed）
  ↑
  ├─ bus（inject security——send 鉴权）
  ├─ state（inject security——写管线鉴权；监听 app/* 事件感知挂起，不 inject lifecycle）
  ├─ deps（inject security——共享依赖仲裁的权限校验）
  ├─ sandbox（inject security——沙箱创建的权限校验）
  └─ router（inject security；不 inject lifecycle——导航经事件解耦）
        ↑
        └─ lifecycle（inject security / router / sandbox / bus / state / deps / monitor）
              ── 唯一可 inject 多服务的高层编排者
```

**关键不变量**：
- `monitor` / `security` **不 inject** 任何业务服务（最先可用）
- `router` 不 inject `lifecycle`（导航通过事件解耦：router 发 `router/navigate` serial 事件，lifecycle 监听并执行挂载，结果回写）——**消除旧设计的死锁环**
- `state` 感知挂起靠**监听** `app/suspend`/`app/resume` 事件，不 inject `lifecycle`（ADR-0023）
- 除 `lifecycle` 外，任何服务 inject 的服务数 ≤ 2（防止第二个编排者出现）
- 图中只标出 security 箭头；bus/state/deps/sandbox/router 可另 inject monitor（共 ≤2，用于直接上报；违规上报走 `security/violation` 事件由 monitor 旁听，不构成依赖）

### 2.4 统一事件契约（全框架唯一版本）

命名：`域:动作`，kebab-case。载荷一律**单对象**：

```typescript
interface Events {
  // 生命周期（由 lifecycle 服务在应用 fiber 对应 ctx 上派发；旁听用 global:true 在根注册）
  'app/loading': { appId: string; instanceId: string; signal: AbortSignal }
  'app/loaded': { appId: string; instanceId: string }
  'app/ready': { appId: string; instanceId: string }        // fiber ACTIVE（依赖满足、apply 完成）
  'app/error': { appId: string; instanceId: string; phase: 'load' | 'activate' | 'runtime'; error: Error; recoverable: boolean }
  'app/suspend': { instanceId: string; reason: 'keepalive' | 'navigation' | 'system' }   // 保活挂起（非 dispose）
  'app/resume': { instanceId: string }
  'app/evicted': { appId: string; instanceId: string; cause: 'lru' | 'pressure' | 'ttl' }  // LRU/水位驱逐，已 dispose（ADR-0019/0026；cause 判别字段，10 号票）
  'app/disposed': { appId: string; instanceId: string }
  // 路由
  'router/navigate': { from: RouteLocation; to: RouteLocation; outlet: string; signal: AbortSignal }  // serial，可被拦截
  'router/aborted': { outlet: string; reason: 'guard' | 'superseded' | 'unmount' }
  'router/changed': { location: RouteLocation; outlets: Record<string, MatchedApp | null> }  // 全槽位矩阵，仅 root 层 DevTools/monitor 可见（global:true，ADR-0036）
  // 槽位（outlet/* 独立通知族，ADR-0047；隔离视图只订阅本槽位）
  'outlet/changed:{outlet}': { outlet: string; matched: MatchedApp | null }
  // 通信（bus 内部派发，target 路由见 communication-protocol.md）
  'message/send': { message: CordisMessage }                 // 载荷自动携带 traceparent（ADR-0022）
  'message/receive': { message: CordisMessage; targetCtx: Context }
  'bus/overflow': { instanceId: string; coalescedKeys: string[]; droppedCount: number }  // 挂起队列溢出（ADR-0021）
  'message/response': { message: CordisMessage }            // 请求-应答回包（type 前缀 response:，§3.3 correlationId 关联）
  'router/replay': { instanceId: string; outlet: string }   // 恢复时序编排（09 号票：state/sync -> outlet 重放 -> 消息回放，ADR-0056）
  'bus/replay': { instanceId: string }                      // 同上（第三步：挂起队列回放触发，ADR-0015）
  // 状态
  'state/changed': { key: string; value: unknown; old: unknown; path: string; source: string; version: number }
  'state/sync': { instanceId: string; keys: Record<string, { value: unknown; version: number }> }  // 挂起恢复时一次性同步（ADR-0023）
  // 监控（monitor 服务派发；旁听需 global:true）
  'monitor/report': { metric: Metric }       // 单对象，统一形状
  'monitor/alert': { alert: Alert }
  // 安全
  'security/violation': { appId: string; rule: string; detail: unknown }
}
```

- 旧契约 `lifecycle:beforeLoad / beforeMount / mounted / state:change / monitor:report(metric, traceId)` 全部**作废**
- 所有旁听（monitor/devtools）必须 `ctx.on(name, fn, { global: true })` 在根上下文注册（事件默认按 isolate 过滤，见 §1.3）

### 2.4.1 调度结果契约（按事件族，ADR-0012）

| 事件族 | 调度 | 结果契约 |
|--------|------|----------|
| `router/guard:*`（守卫） | `serial` | 守卫枚举 `{type:'proceed'} \| {type:'redirect',to} \| {type:'abort'}`；`undefined` = 不拦截（ADR-0002） |
| 请求-应答族（bus.request、能力调用——多方可能应答的真·管线） | `serial`（**禁用 bail**，ADR-0016） | 应答包络 `{ok:true,value} \| {ok:false,reason}`；`null`/`undefined` = 不应答；**禁止返回 false**（ADR-0014） |
| 单点查询（scopedFetch 权限裁决——只有一个裁决者） | **不经事件调度**，直接服务方法 `await ctx.security.check()`（ADR-0028） | 方法返回值，无包络 |
| 通知族（`app/*`、`state/*`、`message/*`、`monitor/*`、`outlet/*`） | `emit` | 无返回值（fire-and-forget） |

族边界以事件名前缀划分，可写 lint 规则机器校验。

### 2.5 通信路由模型

- 发送方调 `ctx.bus.send(msg)` **服务方法**（不走 emit——emit 是 fire-and-forget，任何应用都能窃听/伪造，ADR-0041）；方法内鉴权（只能以真实 appId 发送，不能伪造 source）
- 接收方 `ctx.on('message/receive')`（被动订阅无鉴权需求），bus 按 `target` 解析目标应用 fiber 的 ctx 后 `targetCtx.emit('message/receive', ...)` 完成**定向投递**（不广播载荷）
- 请求-响应：`ctx.serial` 调度 + 统一应答包络 `{ok:true, value} | {ok:false, reason}`（ADR-0014）；`bail` 因不 await 异步回调而禁用（ADR-0016）。bus 的 `request()` API 内部用 correlationId=uuid，超时必解绑
- 广播：`bus.broadcast(type, payload)` → bus 对每个 ACTIVE 应用 ctx emit `message/receive`（`global: true`）
- TraceContext：bus 在 `message/send` 与请求-应答包络上自动注入/携带 `traceparent`（ADR-0022）；挂起回放以原 traceparent 为 span link 开新 span（ADR-0030）

### 2.6 保活（Keep-Alive）语义

Cordis dispose 不可逆，保活**不是**插件状态，而是 lifecycle 服务的**挂载层**概念：

```
Active（渲染中）⇄ Suspended（DOM 摘除缓存、副作用冻结）→ Destroyed
```

- Suspended 态：lifecycle 将容器 DOM 摘到文档片段缓存，通过 `ctx[SuspendScope]` 冻结该 fiber 的副作用（效应已注册的不重复清理，见 lifecycle-management.md §五）
- **挂起裁决单点化**（ADR-0018/0031/0035）：唯一裁决入口是 lifecycle；意图**经服务方法调用** `ctx.lifecycle.requestSuspend(instanceId, reason)` / `requestResume(instanceId)`（不走全局事件——emit 无法阻止恶意应用挂起他人），方法内经 security 鉴权（只能操作自己的 instanceId，root/系统来源除外）。任一来源请求即挂起（并集）；恢复**分级解除**——路由（用户意图）> 系统信号 > 手动命令，高优先级恢复意图可单独解除低优先级挂起，但恢复后进入"压力下候选驱逐"名单
- **默认挂起**（ADR-0020）：路由失配默认进保活池，应用可声明 `keepAlive:false` 直接 dispose
- **LRU 上限 5 + 内存水位**（ADR-0019/0026）：超限驱逐最久未用挂起应用为 dispose，触发 `app/evicted`；`performance.memory` 水位 > 0.85 时辅助触发驱逐（Chromium 限定，其余浏览器降级为纯数量上限）
- **挂起域登记五类**（ADR-0013/0027）：timer、rAF、requestIdleCallback、三类 observer（IO/MO/RO）、WebSocket（挂起即 close(1000)，恢复时框架自动重建连接、应用自行重建订阅，ADR-0017）；经沙箱 Proxy `get` trap 包装五个全局，库内部走 `window.x` 的调用也被拦截；**已知限制**：沙箱激活前已缓存原生引用的库不受冻结约束，列入"保活不兼容清单"并建议 `keepAlive:false`；**fetch 不冻结**——响应回调照常执行，应用在回调中检查挂起标志
- **挂起消息队列**（ADR-0008/0015/0021）：bus 通道上限 1000，普通消息 FIFO 丢最旧，溢出投递 `bus/overflow {coalescedKeys, droppedCount}`；恢复时按帧分批（50/帧）回放，**回放期间新消息入队尾保持全序**（最坏追平 ≈333ms）
- **state 通道走拉模型**（ADR-0023）：挂起期间 state 服务不推送 `state/changed`（state 通过监听 `app/suspend`/`app/resume` 感知，不 inject lifecycle——避免环）；恢复时按应用 watch 键集合一次性同步 `state/sync {keys: Record<key, {value, version}>}`
- **驱逐快照**（ADR-0029/0034）：驱逐前框架对 `local:{appId}:` 键空间序列化快照（`{version, data}`）存 sessionStorage（>2MB 放弃），重挂载时版本匹配直接注水、不匹配查应用清单的 `migrate(snapshot, fromVersion)` 纯函数（无则丢弃冷启动并上报）；**约束：local 键空间的值必须 JSON 可序列化**。快照能力抽象为 lifecycle 内部 `snapshotLocalKeys/hydrateLocalKeys`，驱逐与 HMR 两个调用方复用（ADR-0037）
- 样式/监听等 effect **保留**（与 dispose 区分），样式隔离模块按此语义定义样式生命周期

### 2.7 monitor 按应用隔离的落地形状（ADR-0010/0025/0022）

§2.2 表中 `isolate('monitor', appId)` 的落地细则：

- **isolate 发生在 lifecycle 挂载事务内**（应用透明，无需自己调 isolate）：应用 fiber 挂在 `root.isolate('monitor', Symbol(appId))` ctx 上，事务内 `reflect.provide('monitor', forApp(appId))` 注册隔离 impl——注入解析到**自动归因 appId 的门面**（capture/count 自动带 appId、startSpan 带 traceparent 时续接同 traceId 子 span）；实例销毁（destroy/级联清理）即注销隔离 impl。
- **label 用 `Symbol(appId)` 而非字符串 appId**：isolate 的 label 是 registry store 的键，字符串 appId 在同 appId 重挂载时会撞 "already registered"；Symbol 保证每次挂载唯一且描述保留归因。
- **隔离边界**：门面只暴露主动上报三件套（capture/count/startSpan）；trigger/metricsSnapshot 等聚合面与 `app/*`、`security/violation` 等被动事件入口留在 root 单例（global 监听不隔离），聚合数据汇于 root sink（monitoring §2.1）。

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
| HMR | devtools 统一入口 `ctx.hmr.reload(appId)`；CSS 真热替换、JS 整应用重启；重跑前自动快照 `local:` 键空间、重跑后注水（复用 ADR-0029 机制，ADR-0037） |
| 版本分裂 | deps 仲裁失败默认提示升级（monitor 上报）；必须双实例共存时**强制 iframe 沙箱**（ADR-0038） |
| 样式注册 | 应用样式必须经 `ctx.style.inject` 注册，禁止直接 `document.head.appendChild`——挂起时 lifecycle 一并摘除/还回 head 样式节点（ADR-0033） |
| 部署偏斜 | loader 校验 manifest 版本 + chunk 404 时重取 manifest 提示刷新（唯一恢复策略，monitor 上报） |

## 六、决策地图（ADR 按文档分组索引，ADR-0059）

各方案文档是与本基线对齐的展开；影响每个文档的决策以 ADR 编号索引（ADR 是权威，见 `docs/adr/`）。新增 ADR 时同步更新本表。

| 文档 | 相关 ADR |
|------|----------|
| lifecycle-management | 0004, 0005, 0007, 0009, 0011, 0013, 0017, 0018, 0019, 0020, 0021, 0023, 0026, 0027, 0028, 0029, 0031, 0032, 0033, 0034, 0035, 0037, 0040, 0048, 0052, 0056, 0057 |
| communication-protocol | 0001, 0004, 0008, 0012, 0014, 0015, 0016, 0021, 0022, 0023, 0028, 0030, 0041, 0055 |
| state-sharing | 0001, 0003, 0023, 0029, 0034, 0044, 0052 |
| route-adaptation | 0002, 0006, 0010, 0012, 0018, 0020, 0031, 0036, 0047, 0050, 0056 |
| js-sandbox | 0005, 0027, 0032, 0042, 0048 |
| security | 0009, 0024, 0028, 0039, 0051 |
| heterogeneous-loading | 0034, 0038, 0040, 0043, 0049 |
| monitoring | 0010, 0022, 0024, 0025, 0030, 0045 |
| style-isolation | 0033, 0042 |
| devtools | 0010, 0036, 0050 |
| module-interaction | （无独立决策点——事件契约/DI 自动解析已在 §2.3/§2.4 固化，ADR-0060） |
