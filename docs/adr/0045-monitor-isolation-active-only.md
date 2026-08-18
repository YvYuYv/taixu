# 隔离 monitor 实例只做主动上报归因，被动监听归 root sink

ADR-0010 的 monitor 按应用隔离，但被动监听（`app/error` 等）以 `global:true` 在 root 上下文注册——隔离实例收不到 root 广播（Cordis 事件默认按 isolate 过滤）。决策：隔离 monitor 实例的唯一职责是**主动上报的归因入口**（应用调 `ctx.monitor.capture/metric/trace` 自动带 appId）；被动事件监听统一在 root sink 层做，归因靠事件载荷的 appId 字段。隔离的边界因此清晰：**"应用→monitor"的入口隔离，"事件→monitor"的入口不隔离**。这是 ADR-0010 的边界注记。
