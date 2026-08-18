# Spec: P0 核心运行时垂直切片（Cordis 微前端框架）

Status: ready-for-agent
Labels: ready-for-agent
Source: 60 项 ADR（docs/adr/0001~0060）+ cordis-alignment.md 基线 + 12 份设计文档（cf8fc26 落地版）

## Tickets

拆分为 12 张 tracer-bullet 垂直切片（依赖序）：

| # | 票 | Blocked by |
|---|-----|-----------|
| 01 | 脚手架 + 主缝测试基座 | - |
| 02 | 沙箱工厂 + 逃逸向量缓解 | 01 |
| 03 | 挂载事务 + deps 最小加载 | 01, 02 |
| 04 | Vue 3 参考适配器 + 样式节点登记 | 03 |
| 05 | 路由：URL 矩阵 + 守卫枚举 + 槽位事件族 | 03 |
| 06 | 状态：三层键空间 + 写管线 + 订阅 | 01 |
| 07 | bus：send 服务方法 + 应答包络 + trace | 01 |
| 08 | 保活：默认挂起 + SuspendScope + 消息队列 | 04, 05, 07 |
| 09 | 恢复三通道收口：state/sync + outlet 重放 | 06, 08 |
| 10 | 驱逐与暖启动：LRU + 水位 + 快照注水 | 06, 08 |
| 11 | 安全全链路 fail-closed 接线 | 03, 05, 06, 07 |
| 12 | 事件契约机器验证 + 核心层守卫（收口） | 05–11 |

见 `issues/`（每票一文件，Status 行记录 triage 状态）。工作边界 = frontier：阻塞已全清的票。


## Problem Statement

框架目前只有设计文档（12 份模块文档 + 基线 + 60 项 ADR），没有任何可运行的代码。使用者无法验证文档承诺的核心体验：把一个现有 Vue 3 应用以"应用 = 插件"范式挂进宿主、在多个槽位同屏运行、切换时保活挂起而不丢消息与状态、被内存压力驱逐后重进时暖启动恢复 local 状态、导航被守卫拦截时得到明确枚举裁决、未授权操作被 fail-closed 拒绝。文档之间的语义（事件契约、依赖方向、挂起仲裁）也无法被机器验证，只能靠人工比对。

## Solution

交付一个可运行的 P0 核心运行时垂直切片：`createCordis()` 入口拉起八服务最小闭环（monitor / security / bus / state / deps / sandbox / router / lifecycle），配一个 Vue 3 参考适配器。宿主应用声明应用清单与槽位布局后，经 `router.navigate()` 驱动挂载/切换；子应用以 `apply(ctx)` 单范式接入，全程消费基线 §2.4 事件契约与 §2.4.1 分发结果契约。P0 覆盖全部 ADR 核心语义的运行时验证：挂载事务（可取消、槽位互斥）、保活三通道（bus 排队回放 / state 拉模型 / 路由重放）、LRU + 水位驱逐与快照暖启动、守卫枚举、请求-应答统一包络、bail 全局禁用、security fail-closed。文档不变--本切片是文档的第一个执行者，文档冲突时以基线为准。

## User Stories

### 入口与装配

1. As a 宿主开发者, I want 以一次 `createCordis()` 调用拉起完整运行时（八服务按 Cordis DI 自动解析激活）, so that 我不需要手写任何初始化顺序。
2. As a 宿主开发者, I want 在入口处声明应用清单（appId、入口、信任级别、依赖声明）与槽位布局, so that 框架知道"哪个应用能出现在哪个槽位"。
3. As a 宿主开发者, I want security 服务未就绪时所有应用保持 PENDING、无任何应用挂载, so that 安全面永远 fail-closed 而不是"先跑起来再说"（ADR-0009）。
4. As a 宿主开发者, I want 监听基线 §2.4 全部事件（app/*、outlet/changed:{outlet}、state/*、bus/overflow、app/evicted、security/violation）, so that 我能在宿主层做日志、埋点与错误兜底 UI。
5. As a 框架维护者, I want 八核心服务在运行时不可被散落的 `ctx.set` 替换, so that 核心层语义不会被第三方插件悄悄换掉（ADR-0011）。

### 子应用接入（Vue 3 参考适配器）

6. As a Vue 3 子应用作者, I want 以 `defineCordisApp({ rootComponent })` 一行声明接入, so that 我不需要了解微前端协议细节。
7. As a Vue 3 子应用作者, I want 我的 mount/unmount 被适配器包成一次 Cordis effect, so that 卸载清理由 runtime 自动回收、不存在第二套生命周期（基线 §2.1）。
8. As a Vue 3 子应用作者, I want 在 `apply(ctx)` 里用 `static inject` 声明消费 router/state/bus, so that 服务未就绪时自动 PENDING、就绪自动激活。
9. As a 子应用作者, I want 应用运行在注入过的 globalThis（Proxy 沙箱）中, so that 我的全局变量污染与效应被隔离并可回收。
10. As a 子应用作者, I want scopedFetch 在我首次执行前已注入沙箱, so that 我发出的网络请求天然过权限裁决与 trace 注入（ADR-0005）。

### 路由与槽位

11. As a 宿主开发者, I want 多槽位 URL 矩阵（`__tx_` 保留前缀、槽位参数合并不互抹）, so that 多应用同屏时各自的 URL 状态互不覆盖。
12. As a 宿主开发者, I want popstate（后退/前进）走完整守卫管线, so that 历史导航不能绕过守卫（route-adaptation §4.2）。
13. As a 宿主开发者, I want 守卫返回显式枚举 `{type:'proceed'|'redirect'|'abort'}`, so that "明确放行/改道/拒绝"三种意图可静态区分、永不误读为真值（ADR-0002）。
14. As a 宿主开发者, I want 在途导航可被新导航 superseded（导航序号防竞态）, so that 快速连续导航不产生交错写 URL。
15. As a 子应用作者, I want 只订阅本槽位的 `outlet/changed:{outlet}` 事件族, so that 我的视图同步不被其他槽位的变化打扰（ADR-0047/0050）。
16. As a 子应用作者, I want 视图隔离只读（读本槽位、写经全局 NavigationController 合并）, so that 我不会意外重写整页 URL（ADR-0006）。

### 状态共享

17. As a 子应用作者, I want 三层键空间 global:/shared:/local:{appId}:, so that 全局约定、跨应用共享与私有状态各得其所。
18. As a 子应用作者, I want local: 键经"键前缀 + fiber 归属校验"隔离（而非 isolate）, so that 跨应用互不可见且 shared 层保持全局唯一服务实例（ADR-0003）。
19. As a 子应用作者, I want 经 `ctx.on('state/changed')` 订阅（带键过滤），dispose 自动退订, so that 我不需要手动管理监听器生命周期（ADR-0001）。
20. As a 子应用作者, I want 写入过权限校验与版本推进，收到单次带版本号的通知, so that 我不会收到乱序或重复的变更。
21. As a 子应用作者, I want local: 键只存 JSON 可序列化数据（禁 token/密码/PII）, so that 快照/暖启动机制有前提保证（ADR-0029/0044）。

### 通信

22. As a 子应用作者, I want 经 `ctx.bus.send(msg)` 服务方法发消息（source 从 fiber 派生）, so that 我的身份不可伪造、发送有鉴权拦截点（ADR-0041）。
23. As a 子应用作者, I want 接收方只收到定向投递的 `message/receive`（载荷不广播）, so that 敏感载荷不会泄漏给旁观应用。
24. As a 子应用作者, I want 请求-应答走 serial + 统一包络 `{ok,value,reason}`, so that 多响应者、失败与超时有统一表达、永不误用 bail（ADR-0014/0016）。
25. As a 子应用作者, I want 请求超时自动解绑, so that 监听器不泄漏、迟到响应被丢弃。
26. As a 宿主开发者, I want 载荷自动携带 traceparent 并经 bus 贯通, so that 跨应用链路可追踪（ADR-0022）。
27. As a 子应用作者, I want 单点能力查询（如权限裁决）直接 `await ctx.security.check()`, so that 不为只有一个裁决者的场景硬套事件管线（ADR-0028）。

### 保活与挂起

28. As a 宿主开发者, I want 应用切换时默认走挂起而非销毁（keepalive 未配置时）, so that 回程切换零冷启动（ADR-0020）。
29. As a 宿主开发者, I want 挂起仲裁单点化于 lifecycle（来源分级：路由 > 系统信号 > 命令；恢复分级覆盖）, so that 挂起/恢复不会出现两个指挥官（ADR-0018/0031）。
30. As a 宿主开发者, I want 挂起/恢复意图经 `lifecycle.requestSuspend/Resume` 服务方法表达（非事件）, so that 意图可鉴权可拒绝、通知与意图不混用（ADR-0035）。
31. As a 子应用作者, I want 挂起时我的定时器/事件监听被冻结（包装函数查挂起注册表）, so that 挂起期间零后台开销、恢复后无缝续跑（ADR-0027/0032）。
32. As a 子应用作者, I want 挂起期间发给我的 bus 消息进入有界队列（上限 1000、同键合并）, so that 恢复后按全序回放、且溢出显式上报（ADR-0004/0008/0015/0021）。
33. As a 子应用作者, I want 恢复时收到一次性 `state/sync`（拉模型）而非挂起期间的逐条推送, so that 恢复同步 O(变更集) 而非 O(挂起时长)（ADR-0023）。
34. As a 子应用作者, I want 恢复后 router 对我的槽位重放一次 `outlet/changed:{outlet}`, so that 我像响应正常导航一样同步、不为恢复学第二套机制（ADR-0056）。
35. As a 子应用作者, I want 挂起时我的样式节点（shadow 内 + head 内）一并摘除缓存、恢复还回, so that 挂起应用不占用样式面、恢复零闪烁（ADR-0033/0042）。

### 驱逐与暖启动

36. As a 宿主开发者, I want 保活池 LRU 上限（默认 5）+ 内存水位（Chromium-only、0.85、30s 轮询 + 操作触发）双重驱逐, so that 保活不会变成无限内存泄漏（ADR-0019/0026/0057）。
37. As a 宿主开发者, I want 驱逐前自动快照 local: 键空间（lz-string 压缩、池上限 6MB LRU）, so that 驱逐可回收内存且用户回到应用时状态仍在（ADR-0029/0052）。
38. As a 子应用作者, I want 重挂载时 pre-plugin() 阶段注水（版本兼容则恢复、漂移则丢弃并上报）, so that 暖启动有明确语义且不做假恢复（ADR-0029/0034/0044）。
39. As a 宿主开发者, I want 快照只覆盖 local: 层（global/shared 不入快照）, so that 隐私边界清晰、恢复不越权（ADR-0044）。
40. As a 宿主开发者, I want 收到 `app/evicted` 事件感知驱逐, so that 我能做埋点与用户提示。

### 沙箱与安全

41. As a 框架维护者, I want 双窗口 Proxy 沙箱对 10 项逃逸向量（constructor 链/getPrototypeOf/unscopables/Worker/SW/网络面等）有清单化缓解, so that 恶意/粗心应用的逃逸面收敛（js-sandbox §逃逸向量表）。
42. As a 宿主开发者, I want 权限规则只本地可判定、裁决不做跨调用缓存, so that 裁决结果不可被缓存投毒（ADR-0039/0051）。
43. As a 宿主开发者, I want 权限裁决超时（5s）即拒绝并上报 monitor, so that 裁决面 fail-closed（ADR-0024）。
44. As a 宿主开发者, I want 违规经 `security/violation` 事件上报且 bus/state/router 各消费点接线, so that "权限中间件从未接线"这类旧缺陷不会复发（security §二）。
45. As a 宿主开发者, I want `ctx.isolate` 仅白名单两处（router 按槽位只读视图、monitor 按应用）, so that 隔离是精确工具而非滥用面（ADR-0010）。

### 监控与错误

46. As a 宿主开发者, I want monitor 为唯一错误入口（capture 归因 appId + sourcemap 还原）, so that 错误不双轨、可按应用下钻。
47. As a 框架维护者, I want monitor/security 零业务依赖、最先可用, so that 任何服务的启动错误都能被采集（ADR-0054）。
48. As a 宿主开发者, I want 可恢复错误自动重试（重走挂载事务、指数退避）或降级到 fallback 应用, so that 单应用故障不拖垮宿主。
49. As a 宿主开发者, I want ErrorOutlet 渲染错误态并提供手动重试, so that 用户永远有出路。

### 验证文档语义

50. As a 框架维护者, I want 一套机器可验证的事件契约测试（基线 §2.4 全事件形状）, so that 文档承诺不再靠人工比对。
51. As a 框架维护者, I want 守卫枚举/应答包络/单点查询三族结果契约有 lint 级校验, so that 事件族边界违规能被 CI 拦截（ADR-0012）。

## Implementation Decisions

- **范围**：八服务最小闭环 + Vue 3 参考适配器 + 一个最小宿主示例。iframe 精简运行时、Vue2/React/jQuery/Angular 适配器、qiankun/wujie 兼容、DevTools 扩展、HMR、SSR、跨标签页同步、WS 断连重连全部不做。
- **依赖方向**（基线 §2.3，ADR-0054）：monitor/security 零业务依赖（security 违规经事件上报、不 inject monitor）；bus/state/deps/sandbox/router 各 inject security+monitor（≤2）；lifecycle 是唯一多注入编排者（七项，含显式 inject security = fail-closed）。初始化顺序由 Cordis DI 解析，禁止手写顺序表。
- **子应用范式**：应用 = 插件（`apply(ctx)`），无 bootstrap/mount/unmount 双轨；适配器把宿主框架 mount/unmount 包成一次 effect。
- **核心层不可替换**：八服务运行时替换视为框架级重启事件，必须经框架入口（ADR-0011）；第三方插件服务替换按整应用重挂载语义（ADR-0007）。
- **沙箱**：每应用实例化（不池化）；scopedFetch 由 lifecycle 在沙箱创建后、plugin() 前注入（ADR-0005）；挂起冻结经包装函数查挂起注册表（appId 创建期闭包捕获，ADR-0032）；沙箱是污染隔离不是安全边界（定位声明不变）。
- **保活语义**：默认挂起（ADR-0020）；仲裁单点 lifecycle（ADR-0018）；恢复分级覆盖（ADR-0031）；监听保留但消息排队（不清理）；样式节点挂起摘除/恢复还回（ADR-0033）。
- **驱逐与快照**：LRU 5 + 水位 0.85（Chromium-only、30s 轮询 + 操作触发检查）；快照仅 local: 层、lz-string、6MB LRU 池；注水在 pre-plugin()；版本漂移丢弃并上报（迁移函数纯函数）。
- **事件契约**：全量按基线 §2.4（app/*、outlet/changed:{outlet} 模板字面量族、router/changed root-only、bus/overflow、state/changed、state/sync、app/evicted）；app/intent:* 不存在。分发结果按 §2.4.1 三族：守卫枚举 / serial+包络（bail 禁用）/ 单点直接方法。
- **bus**：send 是服务方法（source 从 fiber 派生不可伪造）；定向投递不广播；挂起队列上限 1000、同键合并、溢出报 coalescedKeys+droppedCount；回放 50/帧保持全序。
- **安全**：deny-by-default；权限规则本地可判定；裁决 5s 超时拒绝；消费点接线 bus/state/router/deps/scopedFetch。
- **monitor**：唯一错误入口；按应用 isolate 实例只做主动上报归因、聚合汇 root sink（ADR-0045）；挂起回放 span link（ADR-0030）。
- **术语**：全程使用 CONTEXT.md 词汇（槽位 outlet、容器 container、保活、挂起域 SuspendScope、键空间、暖启动等），遵守各词条 Avoid 列表。

## Testing Decisions

- **好的测试**：只测外部行为（DOM 结果、事件序列、URL 状态、恢复后的状态值），不断言内部数据结构或调用次数。事件序列断言经宿主层 global 监听收集，不经服务内部。
- **主缝（理想唯一缝）--框架入口**：`createCordis()` + 应用清单 + `router.navigate()` 驱动，配**探针应用**（probe plugin：在 apply(ctx) 内消费 ctx 契约并回报观察）作为观察手段。水位驱逐、快照池 LRU 等经**配置注入**模拟（把阈值调低触发），不开放服务级缝。
- **唯一例外--沙箱工厂直测**：10 项逃逸向量为防呆性质，经入口缝构造过于迂回，保留对 sandbox 工厂的直测。
- **测试面**：挂载事务（成功/取消/竞态）、守卫三枚举、保活三通道（队列回放全序、state/sync、outlet 重放）、LRU 与水位驱逐、快照暖启动与版本漂移丢弃、bus 包络与超时、fail-closed（security 延迟就绪）、事件契约全形状、逃逸向量。
- **先例**：本仓库为 docs-only，无既有测试可循；事件契约测试以基线 §2.4 类型定义为机器可读源。

## Out of Scope

- iframe 精简运行时与 postMessage 代理桥（ADR-0043/0049）、版本分裂强制 iframe（ADR-0038）
- Vue 2 / React / jQuery / Angular 适配器；qiankun/wujie/micro-app 兼容
- DevTools 浏览器扩展、HMR（含快照复用热更路径）、SSR、预加载与多 CDN 容灾
- 跨标签页 BroadcastChannel 同步、WS 断连/重连框架接管（ADR-0017 的重连部分；挂起断连关闭仍含）
- 样式隔离完整策略（PostCSS 命名空间/Shadow DOM/主题通道）--P0 仅含"样式节点挂起摘除/恢复还回 + dispose 回收"
- 告警引擎、采样上报、泄漏探测、sourcemap 服务端还原
- importmap 共享依赖仲裁的完整矩阵（P0 仅单版本直载）

## Further Notes

- 冲突裁决规则：模块文档与基线冲突时以 cordis-alignment.md 为准（AGENTS.md 已声明）。
- 快照/水位等阈值均经 createCordis 配置暴露，测试注入小值触发；生产默认值按各 ADR。
- 后续 P1 建议（不承诺）：iframe 路线、React/Vue2 适配器、HMR、DevTools、WS 重连接管，见各模块文档实施计划节。
