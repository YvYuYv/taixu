# 太虚（Taixu）微前端框架

基于 Cordis 插件运行时构建的微前端框架。本文件是领域语言的唯一权威来源：设计与讨论中所有术语以此为准，不得混用同义词。

## Language

### 运行时与生命周期

**Fiber（纤程）**:
Cordis 为每次 `ctx.plugin()` 调用创建的运行实例，具有六态状态机（PENDING → LOADING → ACTIVE / FAILED → UNLOADING → DISPOSED）。Dispose 不可逆。
_Avoid_: 实例、应用实例、runtime instance

**微应用（Micro-app）**:
注册在框架中的应用包 + 其加载配置，由一个 Fiber 承载运行。"应用状态"一词永远指该 Fiber 的 FiberState，不另行定义状态机。
_Avoid_: 子应用、子系统、app instance

**适配器（Adapter）**:
把宿主框架（Vue/React/Angular）的 mount/unmount 包成一次 Cordis effect 的薄层，不构成第二套生命周期（基线 §2.1"废除三段钩子"的执行者）。
_Avoid_: 包装器、桥接器、loader（那是资源加载）

**保活（Keep-alive）**:
微应用 UI 被挂起但 Fiber 保持 ACTIVE 的驻留模式。挂起裁决单点化于生命周期服务（来源分级：路由 > 系统信号 > 手动命令，任一请求即挂起、高优先级可单独解除低优先级挂起）；保活池 LRU 上限 5 + Chromium 内存水位辅助触发，超限驱逐为 dispose 并对 local 键空间做快照供暖启动。
**C5 抽离**：保活账本/探测/仲裁/快照已迁出 lifecycle，归 KeepAliveService（services/keepAlive.ts）——lifecycle 仅编排 mount/destroy 并通过 `ctx.keepAlive` 委托（Q4/Q5/Q8 决策）。探测心跳（轮询/visibility）由 KeepAliveService 自持（Q18）。
_Avoid_: 缓存、休眠、deactivated（Cordis 不存在此状态）

**挂起域（SuspendScope）**:
生命周期服务在挂载时建立的资源登记处，记录微应用的定时器、rAF 与其他副作用，供挂起时批量冻结、恢复时批量解冻。

SuspendScope 是 Cordis Service（`static provide = 'suspendScope'`），由 lifecycle 注入消费；当前 5 类注册面：

| 资源类型 | 注册 API | 冻结行为 | 恢复行为 |
|---|---|---|---|
| timer / interval / rAF | `forApp(appId).registerTimer(kind, cb, ms?)` | `rawClearTimeout/Interval` + 记账剩余时长 | 续期（以冻结时剩余时长重排） |
| event listener | `registerListener(listener)` | 挂起期回调门控、监听保留（非清理） | 解门控 |
| observer | `registerObserver(Ctor)` | 挂起期 callback 不透传 | 解门控 |
| socket | `registerSocket(handle)` | `close(1000)` 并入 `closedDescriptors` 队列 | 重建连接（ADR-0017）；订阅状态由应用重建 |
| socket descriptor（`closedSockets()`） | 仅只读视图（devtools/审计） | — | — |

lifecycle 调 `ctx.suspendScope.freeze/unfreeze(appId)` 直访（不再经 sandbox 中转）；`sandbox.freeze/unfreeze` 字段已删除（C1.2 wiring）。

_Avoid_: 快照、检查点

**卸载（Dispose）**:
对微应用 Fiber 调用 dispose 的不可逆终止操作；所有经 effect 登记的清理器在此刻按序回滚。
_Avoid_: 销毁、退出、close

### 视图与路由

**槽位（Outlet）**:
页面中可独立承载一个微应用视图的命名挂载点——**路由/逻辑概念**（URL ↔ 命名挂载点的映射，由 router 解析）。路由解析以槽位为单位，多个微应用可同时挂载在不同槽位。挂起时槽位仍在（匹配状态不变），只有容器被摘除。
_Avoid_: 容器、挂载点、container

**容器（Container）**:
槽位物化后的实际 DOM 节点——**DOM/物理概念**，由 `lifecycle.createOutletContainer()` 创建，是适配器 mount 的目标。一个槽位任意时刻至多对应一个容器；挂起时容器被摘除到文档片段缓存，槽位逻辑保留。与"槽位"不可互换：路由文档只说槽位，加载/样式文档只说容器。
_Avoid_: 槽位、挂载点（那是逻辑层）

**导航守卫（Navigation Guard）**:
经 `serial` 调度的导航拦截回调，其结果为显式枚举：放行 `{type:'proceed'}`、重定向 `{type:'redirect', to}` 或中止 `{type:'abort'}`；返回 `undefined` 视为不拦截。绝不用真值判断。
_Avoid_: 钩子、middleware、beforeEach（返回值语义不同）

**导航控制器（NavigationController）**:
路由服务的全局写入方，负责把各槽位的导航意图合并为单一路径写入地址栏。任何代码不得绕过它直接写 URL。
_Avoid_: 路由器（router 是服务名）、history manager

### 通信与状态

**消息（Message）**:
经总线（bus）服务投递的单对象载荷通信单元，发送即忘（`emit`）；需要应答时走请求-应答模式。
_Avoid_: 事件（event 保留给 Cordis 生命周期与框架内部事件）

**请求-应答（Request-Reply）**:
以 `serial` 调度、首个包络截断的跨应用请求模式（`bail` 因不 await 异步回调而禁用）。
_Avoid_: RPC、接口调用

**能力调用（Capability Call）**:
经 `serial` 管线调度、多方可应答、首个包络截断的跨应用请求（ADR-0014/0028 的管线族）；与"单点查询"（服务方法直接调用，如 `ctx.security.check`）互斥。
_Avoid_: RPC、接口调用（与请求-应答同义但强调多方管线语义）

**键空间（Keyspace）**:
状态服务内以键前缀划分的三层可见域：`global:` 全员可读写、`shared:` 订阅组可读写、`local:{appId}:` 单应用私有。键前缀是唯一实现手段。`local:` 键的值必须 JSON 可序列化（驱逐快照的前提），且**禁止存 token/密码/PII**（快照落 sessionStorage，同源可读）。
_Avoid_: 命名空间隔离、isolate 状态

**监听（Watch）**:
通过 `ctx.on('state/changed')` 加键过滤实现的变更订阅；依赖 Cordis 在 Fiber dispose 时自动退订，禁止手工维护退订表。
_Avoid_: 订阅句柄管理、手动 dispose 注册

**应答包络（Reply Envelope）**:
请求-应答结果的统一形状 `{ok:true, value} | {ok:false, reason}`；经 `serial` 调度（Cordis `bail` 不 await 异步回调，已弃用），应答者返回包络表示截断、返回 null/undefined 表示"不应答"；**禁止返回 false**（false 不截断但语义含混）。三态可区分：无应答者 / 查无（`value:null`）/ 裁决失败。
_Avoid_: 哨兵值、false 表示放行、bail 调度请求-应答

**消息队列（Suspended Queue）**:
总线为挂起应用维护的有界待发队列：上限 1000，状态类同键合并，普通消息丢最旧，溢出投递 `bus/overflow`；恢复时按帧分批回放。
_Avoid_: 缓冲区、离线消息

**事件族（Event Family）**:
以事件名前缀划分、共享同一调度结果契约的事件分组（如 `router/guard:*` 返回守卫枚举，请求-应答族返回应答包络）；族契约是可机器校验的基线规则。
_Avoid_: 事件命名空间、topic

### 隔离与安全

**核心层（Core Layer）**:
lifecycle/router/bus/state/sandbox/monitor/security/deps 八个运行时不可替换的服务集合；替换其中任何一个被视为框架级重启事件。
_Avoid_: 基础服务、平台服务

**作用域网络（Scoped Fetch）**:
沙箱内注入的受限 fetch 包装，由生命周期服务在沙箱创建之后、`plugin()` 之前注入，携带微应用身份供安全服务裁决。
**C5-C 归属**：工厂已迁出 lifecycle，归独立模块 `services/scopedFetch.ts` 的纯函数 `createScopedFetch(ctx, appId)`——security 管裁决（sanitizeURL/CSRF）、bus 管链路执行（runNetwork），本模块是两者的编排。lifecycle 注入点直调 `createScopedFetch(this.ctx, appId)`。
_Avoid_: 网络拦截器、请求代理

**服务隔离（Isolate）**:
`ctx.isolate(name)` 制造的服务注入遮蔽，使子树获得该服务的独立实例。仅用于真正需要独立服务实例的场景（如按槽位隔离的只读路由视图）；不是键空间、不是权限边界。
_Avoid_: 状态隔离、命名空间、沙箱（与沙箱是不同层）

**沙箱（Sandbox）**:
微应用代码的执行隔离环境：Proxy 快照沙箱负责全局污染隔离（非安全边界），iframe 沙箱（`sandbox` 属性且不含 `allow-same-origin`）才是安全边界。

硬化工具（向量防御集——C2 wiring 后迁移至独立模块 `services/harden.ts`）：

| 防御面 | 实现位置 | 行为 |
|---|---|---|
| 函数硬化（向量 #1/#2） | `services/harden.ts` `harden(target, report)` | 包装函数的 constructor/__proto__/prototype 不可穿透；受控构造器仅记账返 undefined（不再透传 raw.apply） |
| eval/Function 记账（向量 #1） | `services/harden.ts` `wrapEvalAccounting` / `controlledConstructor` | 记账 + 告警（执行不拦，宿主 CSP 兜底） |
| Escape Vector Matrix 字典（5 向量） | `services/harden.ts` `ESCAPE_VECTOR_MATRIX` + `runEscapeMatrixImpl` | 分类字典 `{kind: {check, doc}}`，独立探测不需 sandbox 闭包 |
| 报告通道 race 修复 | 闭包粒度（`harden(target, report)` 传入） | sandbox 实例独立 report 闭包，**消解原模块单例 `installHardenReport` race** |

_Avoid_: 容器、隔离区

**精简运行时（Lite Runtime）**:
iframe 沙箱内运行的 Cordis 子集——本地管理 fiber/effect（副作用随 iframe 卸载自然消亡），服务调用经代理 ctx 桥接到主框架；不跑服务、不跑调度管线。iframe 崩溃时主框架经 heartbeat 超时感知、按 appId 批量清理。
_Avoid_: 影子 fiber、子框架

**权限（Permission）**:
安全服务对能力调用的拒绝优先（deny-by-default）裁决，支持 `action:'*'` 通配；违例一律上报 `security/violation`。
_Avoid_: 白名单（语义不同：默认拒绝）

### 治理

**错误入口（Error Capture）**:
`monitor.capture` 是所有错误的唯一上报入口；任何模块不得自行 catch 后静默或另建上报通道。
_Avoid_: 错误处理（各模块只做捕获转换，不做处理决策）

**冷启动（Cold Start）**:
无可用快照的完整启动路径——加载资源、创建沙箱、`plugin()`、mount。
_Avoid_: 全量加载、首次启动（暖启动也可能是"首次"——驱逐后首次）

**暖启动（Warm Start）**:
驱逐/重挂载时经快照注水恢复的启动路径——`local:` 键空间在 `plugin()` 前预注水，应用从上次状态恢复；版本不匹配时经 `migrate` 迁移或降级为冷启动。
_Avoid_: 热启动、恢复启动

**对齐基线（Alignment Baseline）**:
`cordis-alignment.md` 中固化的、经 Cordis 源码验证的事实与统一约定；各方案文档与其冲突时以基线为准并修正文档。
_Avoid_: 规范、约定文档
