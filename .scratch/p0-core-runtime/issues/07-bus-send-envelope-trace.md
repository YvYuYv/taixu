# 07 - bus：send 服务方法 + 应答包络 + trace

**What to build:** 应用 A 调 `ctx.bus.send(msg)` 发消息给应用 B：source 从 fiber 派生不可伪造，经权限校验后定向投递 `message/receive`（载荷不广播）；请求-应答走 serial 调度 + 统一包络 `{ok:true,value}|{ok:false,reason}`，超时自动解绑、迟到响应丢弃；载荷自动携带 traceparent 贯通隔离边界。bail 全局禁用。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `ctx.bus.send(ctx, message)` 服务方法（ADR-0041）：source 从调用方 fiber 派生、不接受入参指定；未授权发送不投递并上报 violation
- [ ] 定向投递：按 target 解析目标 fiber ctx 后 emit `message/receive`，旁观应用收不到载荷
- [ ] 请求-应答：serial 调度 + 统一包络（ADR-0014）；`null/undefined` = 不应答；返回 false 被拒绝（类型层面 + 运行时告警）；bail 不出现（ADR-0016）
- [ ] 超时必解绑；迟到响应静默丢弃；correlationId 用 crypto.randomUUID
- [ ] traceparent 自动注入 message 载荷与应答包络（ADR-0022；CSPRNG trace-id）
- [ ] 广播 broadcast 对每个 ACTIVE 应用定向 emit
- [ ] 挂起目标的入队行为在 08 验收（本票投递失败即显式错误）
