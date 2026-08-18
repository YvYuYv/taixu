# 跨挂起的 trace 用 span link 关联，不续接为子 span

ADR-0022 的 traceparent 贯通遇到挂起：消息在队列滞留 3 分钟后回放，若续接为子 span，span 时长变成 3 分钟，P99 告警爆炸。决策：回放时以原 traceparent 为 **span link**（OpenTelemetry 语义）开启新 span——traceId 保持关联（同一调用链可查），但 span 时长只计真实处理时间。**能力边界**：W3C TraceContext 标准本身无 link 概念，link 是 OTel 扩展；追踪后端非 OTel 兼容时降级为如实长 span。备选"队列消息不入 trace"被否：断裂"消息属于哪个用户操作"的因果链。
