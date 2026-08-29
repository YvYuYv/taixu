# Cordis 监控（Monitoring）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> 本模块是错误/指标的**唯一汇聚点**（`monitor.capture` 唯一错误入口，基线 §三）；采集器全部为挂接 `ctx.effect` 的服务内部组件（旧版裸单例 + 未定义 `monitorAlert.trigger` 引用全部废除）。

## 一、问题分析

| 挑战 | 具体表现 | 本版对策 |
|------|----------|---------|
| 多应用性能难统一 | 数据分散 | 槽位/实例维度统一采集 |
| 跨应用错误难追踪 | 堆栈跨应用、压缩不可读 | appId 归因 + sourcemap 还原 + traceparent 串联 |
| 资源加载监控复杂 | 动态资源难追踪 | deps 服务加载事件挂钩 |
| 用户行为难关联 | 链路断裂 | traceparent 全链传播 |
| 告警阈值难设定 | 单一阈值误报 | 按 (appId × alertType) 维度 + 分位数 |

监控目标：可观测、实时、关联、**低开销（有预算并自测，§九）**。

## 二、架构（Service 化）

```typescript
class MonitorService extends Service {
  static [Context.provide] = 'monitor'   // 无业务依赖，最先可用（基线 §2.3）

  collectors: Collector[] = []
  private alertEngine = new AlertEngine(this.ctx)

  constructor(ctx: Context, config: MonitorConfig) {
    super(ctx)
    // 生命周期旁听：global 监听（事件默认经 isolate 过滤，基线 §2.4）
    for (const name of ['app/loading', 'app/ready', 'app/error', 'app/suspend', 'app/disposed'] as const) {
      ctx.on(name, (e) => this.recordLifecycle(name, e), { global: true })
    }
    ctx.on('security/violation', (e) => this.captureSecurity(e), { global: true })
    ctx.on('state/changed', (e) => this.metrics.count('state_change', 1, { key: e.key }), { global: true })
  }

  /** 唯一错误入口（修复归因缺失：旧版 captureJSErrors 从不赋 appId，byApp 恒空） */
  capture(error: Error, info: { appId?: string; instanceId?: string; phase?: 'load' | 'activate' | 'runtime' | 'system'; alert?: AlertType; extra?: Dict }) {
    const appId = info.appId ?? this.tracing.currentAppId() ?? this.sandboxAttribution(error)   // 栈 URL -> 模块 -> appId
    const event: ErrorEvent = {
      error, appId, instanceId: info.instanceId,
      phase: info.phase ?? 'runtime',
      stack: this.sourcemap.rewrite(error.stack),      // sourcemap 还原（devtools 复用同管线）
      traceparent: this.tracing.current()?.outgoing(),
      at: Date.now(),
    }
    this.errorBuffer.push(event)
    if (info.alert) this.alertEngine.trigger({ type: info.alert, appId, detail: { message: error.message } })
    return event
  }
}
```

- 错误采集兜底：`window.onerror / onunhandledrejection` 在 monitor 初始化时注册（挂 ctx.effect；经 tracing 异步上下文或栈 URL 归因 appId）
- 旧版 `lifecycleManager.on('*', event, cb)` 三参自造 API 废除：统一 `ctx.on(name, fn, { global: true })`

### 2.1 隔离边界：采集入口隔离，聚合汇于 root sink（ADR-0010/0025/0045）

monitor 的隔离边界画在**两层入口**上：

- **主动上报入口（按应用隔离）**：每个应用经 `ctx.isolate('monitor', appId)` 拿到独立 monitor 实例（isolate 白名单之一，ADR-0010）--应用调 `ctx.monitor.capture/metric/trace` 时**自动带 appId 归因**，不需要应用手动传；隔离实例遇到带 traceparent 的消息**续接为子 span**（同 traceId 贯通，ADR-0022）
- **被动事件入口（不隔离，root sink 层）**：`app/*`、`security/violation`、`state/changed` 等事件以 `global: true` 在 root 上下文注册（隔离实例收不到 root 广播--Cordis 事件按 isolate 过滤），归因靠事件载荷的 appId 字段
- **聚合 sink**：N 个隔离实例把带 appId 的数据汇入 monitor 内部一个**不隔离的 root 单例 sink**；全局仪表盘/DevTools 从 sink 读取（本地即可见全局视图，聚合不推给后端）

```
应用 A ctx.monitor.capture(err) ──isolate──> 实例 A（自动归因 A）──┐
应用 B ctx.monitor.capture(err) ──isolate──> 实例 B（自动归因 B）──┼──> root sink ──> 告警/仪表盘/DevTools
root 事件（app/error 等）──────────global──> root 监听（载荷 appId）──┘
```

### 2.2 挂起回放的 span 语义（ADR-0030）

挂起队列滞留的消息回放时，以原 traceparent 为 **span link**（OpenTelemetry 语义）开新 span：traceId 保持关联（同一调用链可查），但 span 时长只计真实处理时间、不计队列滞留（避免 3 分钟巨型 span 触发 P99 告警爆炸）。追踪后端非 OTel 兼容时降级为如实长 span。

## 三、指标体系

| 类别 | 指标 | 采集方式 | 说明 |
|------|------|----------|------|
| 性能 | FCP/LCP/INP/CLS | PerformanceObserver（`buffered: true`，修复晚启动漏采） | viewport 相关 |
| 性能 | 长任务 | PerformanceObserver longtask | **告警阈值 200ms**（50ms 是定义阈值，旧版每条都告警） |
| 性能 | FPS | rAF 循环 | `document.hidden` 时暂停（修复后台误报 LOW_FPS） |
| 性能 | JS 内存 | `performance.measureUserAgentSpecificMemory`（优先）降级 `performance.memory` | 预算阈值按 heap 真实分母（旧版 4GB 的 80% 无意义） |
| 加载 | 应用加载时长 | `app/loading -> app/ready` 事件差 | 含重试计数 |
| 加载 | 资源失败率/SRI 失败 | deps 加载事件 | 版本偏斜（DEPLOY_SKEW）独立类型 |
| 运行时 | JS 错误率（by appId/phase） | capture | 分位数 p50/p75/p95 而非均值 |
| 运行时 | 泄漏嫌疑 | §四 Detached DOM + 定时器/监听记账 | |
| 行为 | 点击/路由 | 委托采集（脱敏 §六） | 与 trace 关联 |

- TTI：**Performance API 无此指标**（旧版表错误）--改为 INP + 自定义 ready 信号（主线程空闲 5s 内无长任务），标注算法近似
- 环形缓冲统一实现（旧版 `buffer.shift()` O(n)）：定长数组 + 游标

## 四、泄漏探测（准确性诚实化）

```typescript
class LeakDetector {
  constructor(ctx: Context) {
    // 特性检测（WeakRef: Chrome 84+/Safari 14.1+；不支持则降级为记账审计模式，检测插件自身不抛错）
    this.supported = typeof WeakRef === 'function' && typeof FinalizationRegistry === 'function'
    if (this.supported) {
      this.registry = new FinalizationRegistry((key: string) => {
        // 回收确认：节点被 GC -> 从嫌疑清单移除（旧版 deref 非空即报泄漏，GC 时序无保证导致大量误报）
        this.suspects.delete(key)
      })
    }
  }

  /** dispose 后登记嫌疑；FinalizationRegistry 在 TTL（默认 60s，可配）内未回收 -> 告警 */
  trackDisposed(instance: AppInstance) {
    const key = instance.instanceId
    const ref = new WeakRef(instance.ctx.rootElement)
    this.suspects.set(key, { ref, at: Date.now() })
    this.registry?.register(instance.ctx.rootElement, key)
    // 告警判定：suspects 存活超过 TTL 且期间发生过 GC（performance.memory 下降事件）才触发
    // （修复：deref 非空不能证明泄漏--浏览器可能数分钟不 GC；keep-alive 场景经 lifecycle 的 suspendState 排除）
  }
}
```

- 能力边界声明：DOM WeakRef 只覆盖"分离 DOM"；**JS 堆泄漏（闭包/数组）检测不到**，由定时器/监听记账审计（js-sandbox §3.6 数据）补位
- 告警去抖：同 instanceId 只报一次；探测定时器挂 ctx.effect（可取消）

## 五、采样与上报

```typescript
class Sampler {
  /** 会话粘性采样（修复逐事件 Math.random 导致同一用户忽采忽不采） */
  private sessionSampled: boolean | null = null
  shouldSample(eventType: string, appId?: string): boolean {
    if (this.sessionSampled === null) {
      const h = hash(this.sessionId)             // 会话 ID 稳定
      this.sessionSampled = (h % 100) < this.config.sessionRate * 100
    }
    if (!this.sessionSampled) return false
    const rate = this.config.rates[eventType] ?? this.config.rates.default ?? 1
    return Math.random() < rate
  }
}

class Reporter {
  /** 错误也走批量（修复旧版每条错误单独 sendBeacon 击穿队列）；采样在入队前判定（接线修复） */
  enqueue(event: TelemetryEvent) {
    if (!this.sampler.shouldSample(event.type)) return
    this.queue.push(event)
    if (this.queue.length >= 20) this.flushNow()
    else this.scheduleFlush()   // 3s 防抖
  }
  async flushNow() {
    const batch = this.queue.splice(0)
    if (!batch.length) return
    try {
      await this.send(batch)                        // fetch keepalive（>64KB 自动分片）
    } catch {
      await this.persistent.enqueue(batch)           // 失败入持久队列（IndexedDB）
      this.scheduleRetry()                           // 指数退避
    }
  }
}

class PersistentEventQueue {
  /** recover() 在 monitor 启动时调用（修复旧版从未被调用：持久化事件永不补发） */
  async recover() { for (const batch of await this.store.drain()) this.reporter.send(batch) }
  // openDB 为真实 IndexedDB 实现（旧版返回 {} 存根废除）
}
```

- 采样器接入：**所有** enqueue 路径（采集器/错误/行为）统一经 Sampler（旧版 Sampler 零调用点）；配置粒度统一为 eventType（模块级配置映射到类型前缀）

## 六、隐私与 PII

- 点击目标采集：**不采集 textContent**（旧版 shadow host 时取整棵子树文本）；仅采集 role/tagName/自定义 `data-track` 属性
- 路由/URL：query 脱敏（security.sanitizeQuery 同规则复用，token 类剥离）
- 用户标识：会话随机 ID（不指纹）；合规：采集清单 + 关闭开关（DNT 尊重）写入宿主配置
- 敏感键（state sensitiveKeys）联动掩码

## 七、告警引擎

```typescript
class AlertEngine {
  trigger(alert: Alert) {
    const rule = this.rules[alert.type]
    if (!rule) return
    if (rule.condition && !rule.condition(alert)) return   // condition 真实执行（旧版死代码）
    const key = `${alert.appId ?? 'host'}:${alert.type}`   // 冷却按 (appId, type) 维度（旧版全局一份，一个应用报警静默所有应用）
    if (this.inCooldown(key)) return
    this.setCooldown(key, rule.cooldown ?? 30_000)
    this.ctx.emit('monitor/alert', { alert })              // 订阅经 ctx.on（security 审计/宿主通知）
  }
}
```

内置规则（阈值全部带 appId 维度与分位数）：

| 告警 | 条件 |
|------|------|
| APP_LOAD_FAILED | load phase 错误（含重试耗尽） |
| JS_ERROR_RATE | appId 错误率 5min 窗口超阈值 |
| LONG_TASK | 单任务 > 200ms 且 5min > N 次 |
| MEMORY_BUDGET | 实测 heap 超应用预算（lifecycle LRU 消费同一数据源） |
| LEAK_SUSPECT | §四 判定 |
| DEPLOY_SKEW | chunk 404 后 manifest 刷新发现版本变更 |
| QUEUE_DEAD_LETTER / DEP_CONFLICT / ROUTER_REDIRECT_LOOP | 各服务事件 |

## 八、Tracing（与 communication-protocol §七同一实现）

- `TracingService`：CSPRNG traceId/spanId、child 延续、跨异步边界 run() 包装（bus 派发/fetch/定时器回调处包裹）
- fetch 埋点：**挂 bus.network 唯一链**（修复同文件矛盾：旧版 §4.2 注释要求用 FetchInterceptorChain，§4.6 又直接猴补 window.fetch）
- span 上报：消息/路由/fetch 生成轻量 span（name/traceId/parentId/duration），BatchReporter 统一出站（旧版只有 traceId 无 span，"链路存储"无数据来源）
- 第三方域请求不注入 traceparent header（外泄）

## 九、开销预算（观测者效应自测）

- 预算：监控自身 CPU < 1% 、内存 < 5MB、单事件处理 < 0.1ms（抽样 profiler 自测并周期上报 `MONITOR_OVERHEAD`）
- 实现纪律：采集批量化、避免每事件 JSON.stringify（体积用字节数估算器）、`recordMessage` 频率统计改为环形计数桶（修复旧版每消息 O(n) 扫描 5000 条历史）

## 十、DevTools 联动

- devtools **复用** monitor 采集（唯一数据源；不重复注册 PerformanceObserver/rAF 循环--旧版双份常驻采集废除）
- 暴露只读查询：`monitor.snapshot()`（指标环形缓冲快照）、错误清单（sourcemap 已还原）、泄漏嫌疑
- 落地形式（P1，`devtools` 服务）：`snapshot()` 复用各服务查询面聚合（实例/指标/span 计数/DLQ/字体 registry/错误清单 `monitor.errors()`/泄漏嫌疑 `monitor.leakSuspects()`）；命令通道 `execute()`（destroy/suspend/resume/dlq-replay/killswitch-disable，全部转发既有服务入口，穷举守卫 deny-by-default）。**未落地**：面板 UI 与 Vite 集成（运行时之外）；HMR 经 `hmr` 服务（css-only 热替换 style/link/constructable 三路线 + fiber 重跑暖启动——ADR-0037 快照/注水为驱逐 dispose 路径，fiber 重跑不经 dispose 无注水必要）

**sourcemap 还原管线（F4 已落地）**：`MonitorConfig.sourcemap?: SourcemapRewriter`
（`{ rewrite(stack: string): string }`，宿主注入）

- 还原点在 **capture 入库前**（"错误清单 sourcemap 已还原" = `errors()` 直出结果，
  查询面不二次重写）；devtools 复用同一注入实例（唯一数据源，无第二套采集）
- capture 是**同步**入口，故异步的 `.map` 加载须由宿主预缓存后同步消费；
  缓存也归宿主（map 解析结果可长期复用）
- 管线抛错 / 返回空值 → 降级为原始 stack（不阻断错误采集，**不上报**——避免
  monitor → security → monitor 回环）
- `DevToolsSnapshot.errors[]` 补出 `stack` 字段（此前只映射 message/appId/phase，
  还原了也看不到）

## 十一、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | MonitorService + capture（归因 + sourcemap）+ 事件旁听接线 |
| P0 | Sampler 会话粘性 + BatchReporter（含错误批量）+ 持久队列 recover |
| P1 | 指标采集（buffered/分位数/后台暂停）+ AlertEngine（condition/appId 维度） |
| P1 | LeakDetector（FinalizationRegistry + 特性降级）+ Tracing span 上报 |
| P2 | PII 管道、开销自测、行为采集 |

## 十二、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| M-1 采集器裸单例/未定义 monitorAlert | §二 Service 内组件 |
| M-2 三参自造事件 API | ctx.on + global |
| M-3 同文件两套 fetch 埋点互斥 | §八 唯一 bus.network 链 |
| M-4 WeakRef 误报/无特性检测/deref 语义 | §四 FinalizationRegistry + TTL + 降级 + 能力边界 |
| M-5 无上限数组/buffered 缺失/TTI 谎言/50ms 阈值/4GB 分母/后台 FPS | §三 逐项修复 |
| M-6 错误无 appId/无 sourcemap | §二 capture 归因 + rewrite |
| M-7 错误绕过批量/recover 零调用/openDB 存根 | §五 |
| M-8 采样未接线/粒度不匹配 | §五 Sampler 全路径接入 |
| M-9 condition 死代码/冷却无 appId 维度 | §七 |
| M-10 traceId Math.random/单例 currentTraceId/无 span/Headers 合并错误 | §八（与 comm §七共用实现） |
| M-11 PII（textContent 整树/UV 指纹） | §六 |
| M-12 对比表失实（Sentry 不支持微前端） | 删除该营销性对比 |
