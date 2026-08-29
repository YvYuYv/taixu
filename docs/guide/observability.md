# 可观测性

## 错误采集（appId 归因）

```typescript
// 框架内一切错误路径归因到应用（load/activate/runtime 三阶段）
host.monitor.capture(error, { appId: 'cart-app', phase: 'runtime' })
```

- **唯一错误入口**：适配器渲染错误（Vue errorHandler / React 边界 / Angular ErrorHandler DI）统一转发
- **sourcemap 还原**：宿主注入管线，错误 stack **入库前**还原（`errors()` 直出已还原堆栈）：

```typescript
createCordis({
  monitor: {
    sourcemap: { rewrite: (stack) => sourceMapLib.rewrite(stack) },  // 异步 .map 预缓存后同步消费
  },
})
```

- **PII 脱敏**：入库前对 message/stack 做结构化掩码（`token=xxx` / JSON `"token":"xxx"` / `token: xxx` 三形态；敏感键与 state sensitiveKeys 同族）：

```typescript
createCordis({ monitor: { privacy: { sensitiveKeys: ['orderNo'], mask: '<hidden>' } } })
```

## 指标（环形缓冲 + 分位数）

```typescript
host.monitor.count('latency', 123)
host.monitor.metricsSnapshot()  // { latency: { count, p50, p75, p95, max } }
```

后台标签页暂停采集（`document.hidden`）。

## 告警引擎（deny-by-default）

```typescript
createCordis({
  monitor: {
    alertRules: {
      JS_ERROR_RATE: { cooldownMs: 30_000 },   // 内置：appId 错误率窗口超阈值
      APP_LOAD_FAILED: {},                      // 内置：load 阶段错误
      LEAK_SUSPECT: {},                         // 内置：泄漏嫌疑（决疑证据弱，同实例只报一次）
      MONITOR_OVERHEAD: {},                     // 内置：监控自身开销超预算
    },
  },
})
```

冷却按 (appId, type) 维度；`condition` 真实执行；派发 `monitor/alert`。

## 开销自测（观测者效应）

```typescript
createCordis({ monitor: { overhead: { sampleEvery: 100, budgetMs: 0.1, reportEveryMs: 30_000 } } })
```

抽样测量单事件处理耗时，超预算周期上报 `MONITOR_OVERHEAD`（预算：CPU < 1%、单事件 < 0.1ms）。未配置 = 零自测开销。

## 泄漏探测

FinalizationRegistry + 降级兜底：dispose 的实例对象未回收 → 嫌疑入账（`leakSuspects()`），LEAK_SUSPECT 告警去抖。

## DevTools 联动

```typescript
host.devtools.snapshot()      // 只读聚合：实例/指标/DLQ/错误（已还原+脱敏）/泄漏嫌疑/字体
host.devtools.execute({ type: 'instance/destroy', instanceId })  // 命令通道（root 权限语义）
host.devtools.scanStyleConflicts()  // 跨应用样式冲突
```

devtools **复用**各服务查询面（唯一数据源，无第二套采集循环）。
