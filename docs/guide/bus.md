# 通信总线

## 设计原则

**鉴权走服务方法，通知走事件**——需要鉴权的操作（发消息）是服务方法（可拦截可拒绝）；纯通知（状态变更/生命周期事件）是事件（fire-and-forget）。两者不可混用。

## send（点对点，鉴权）

```typescript
// 应用 A 发送（需 bus:send:app-b 权限，deny-by-default）
const result = ctx.bus.send('app-b', 'cart:checkout', { items }, { caller: ctx })
// 未授权：不投递 + security/violation 上报
```

- 队列有上限，溢出上报 `bus/overflow`（丢失必须显式，不假装没丢）
- 死信（DLQ）：投递失败入死信队列，可 `dlq-replay` 重放（DevTools 命令）

## 广播（无免检旁路）

```typescript
ctx.bus.broadcast('theme:refresh', { dark: true }, { caller: ctx })
```

未授权应用 broadcast 同样被拒——广播不是权限旁路。

## 请求-应答

```typescript
// 请求方
const reply = await ctx.bus.request('pay-app', 'pay:quote', { amount }, { caller: ctx })
// 应答方（返回 false = 拒绝应答，不投递 + monitor 告警）
ctx.bus.onRequest(ctx, 'pay:quote', async (payload) => quoteOf(payload))
```

## 挂起与回放

应用挂起期间到达的消息进入挂起队列（有上限与批大小配置）；恢复时按全序回放（`bus/replay` 事件）——保活应用回程不丢消息。

## 事件族（通知）

框架事件全部是通知族（fire-and-forget）：`app/loading → app/loaded → app/ready`、`app/suspend / app/resume / app/disposed`、`monitor/report / monitor/alert`、`security/violation`、`outlet/changed:{outlet}`。订阅：

```typescript
ctx.on('app/disposed', (e) => { /* e.appId, e.reason */ })
```
