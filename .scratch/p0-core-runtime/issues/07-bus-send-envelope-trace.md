# 07 - bus：send 服务方法 + 应答包络 + trace

**What to build:** 应用 A 调 `ctx.bus.send(msg)` 发消息给应用 B：source 从 fiber 派生不可伪造，经权限校验后定向投递 `message/receive`（载荷不广播）；请求-应答走 serial 调度 + 统一包络 `{ok:true,value}|{ok:false,reason}`，超时自动解绑、迟到响应丢弃；载荷自动携带 traceparent 贯通隔离边界。bail 全局禁用。

**Blocked by:** 01

**Status:** resolved

- [x] `ctx.bus.send(ctx, message)` 服务方法（ADR-0041）：source 从调用方 fiber 派生、不接受入参指定；未授权发送不投递并上报 violation
- [x] 定向投递：按 target 解析目标 fiber ctx 后 emit `message/receive`，旁观应用收不到载荷
- [x] 请求-应答：serial 调度 + 统一包络（ADR-0014）；`null/undefined` = 不应答；返回 false 被拒绝（类型层面 + 运行时告警）；bail 不出现（ADR-0016）
- [x] 超时必解绑；迟到响应静默丢弃；correlationId 用 crypto.randomUUID
- [x] traceparent 自动注入 message 载荷与应答包络（ADR-0022；CSPRNG trace-id）
- [x] 广播 broadcast 对每个 ACTIVE 应用定向 emit
- [x] 挂起目标的入队行为在 08 验收（本票投递失败即显式错误）

## Answer

`BusService`（`static provide = 'bus'`，`inject: ['security','monitor']`；lifecycle 补入 `bus` inject 并单向 register/unregister 实例表——基线 §2.3 方向）：

- **send（§3.1，ADR-0041）**：source 从 `ctx.fiber.name` 派生（'root' = 宿主 system，受信层），入参伪造字段被覆写；权限 `message:{type}` deny-by-default（未授权不投递 + violation）；TTL 过期投递前丢弃；目标未注册 = 显式 throw（挂起入队 08 号票）。
- **定向投递**：`target.ctx.events.emit(target.ctx, 'message/receive', {message, targetCtx})`（基线 §2.4 载荷含 targetCtx）。**cordis v4 关键事实：plain ctx 无 `[Context.filter]`，`ctx.emit(name, ...)` 默认触达全部非 global 监听器**——为每个应用 ctx 安装 scoped filter（`installScopedFilter`，fiber 子树判定），定向事件只有目标子树（非 global）与 global 旁听者（monitor/DevTools）可见，旁观应用收不到载荷。`message/send` 通知族经 `GLOBAL_ONLY` 哨兵（filter 恒 false）仅 global 可见。
- **请求-应答（§3.3，ADR-0014/0016）**：`request(ctx, type, payload, {target, timeout, signal})`——correlationId `crypto.randomUUID`，`{global:true}` 监听 + 按 correlationId 过滤（迟到/他人响应丢弃），成功/超时/abort 三路统一 `finish()` 解绑（含 abort 监听器移除），超时 = 无应答者（resolve undefined），abort = AbortError。`respond(ctx, type, handler)`——handler 返回类型 `Reply | null`（**false 不在类型层**；运行时守卫兜底 JS 应用并 monitor 告警）；抛错自动包络 `{ok:false, reason}`；应答 `response:{type}`、同 traceId 新 spanId 续链。
- **traceparent（§七，ADR-0022）**：CSPRNG（禁全零，W3C），格式 `00-{trace-32hex}-{span-16hex}-01`，send 构建消息时自动注入、应答续子 span；`parseTraceparent` 版本字段解析导出。
- **广播**：`broadcast(ctx, msg)` = `send(ctx, {...msg, target: undefined})`——与 send 同一裁决（**广播无免检旁路**），逐 ACTIVE 实例定向 emit；message/send 通知只发一次。

测试 `tests/bus.test.ts`（14 例）：source 不可伪造、未授权不投递、定向+旁观隔离+卸载后 unreachable、包络 ok/错误、超时/迟到/abort、并发 correlationId、false 运行时拒绝+告警、traceparent 格式与全零禁令、广播（含未授权广播被拒）、TTL、message/send 仅 global。全量 101/101 绿，tsc 通过。

## Comments

- **code-review 双轴发现与修复**：
  - Spec：**broadcast 曾完全绕过权限**（公开方法无裁决）→ broadcast 收敛为 send 的无 target 别名（同一裁决路径）；TTL 缺失 → 补 createdAt/ttl 字段与 dispatch 首步检查；**类型层未拒绝 false**（handler 返回类型含 false）→ 收敛为 `Reply | null`（运行时守卫保留兜底）；message/send 曾与 broadcast 双发（重复 id/traceparent）→ 只在 send 发一次；abort 监听器成功路径泄漏 → finish() 统一三路解绑。
  - Standards：message/receive 载荷缺 `targetCtx`（基线 §2.4 明文）→ 补齐；generateTraceId/generateSpanId 重复字节 hex 逻辑 → 提 randomHex(n)；send/broadcast 重复消息构建 → 单一构建路径；基线 §2.5"broadcast（global: true）"与本实现 scoped emit 的语义等价性在代码注释中论证（目标子树 + global 旁听可见 = 载荷不广播的票面硬性要求）。
- **installScopedFilter 的风险与边界**（reviewer 判"leaning violation"）：对应用 fiber ctx defineProperty `Context.filter`（框架符号）是侵入式手段，但它是 cordis v4 plain ctx 缺 filter 的事实下实现"载荷不广播"的唯一途径；影响面 = 该 ctx 发出的全部事件对非 global 监听者收敛为子树可见（与 isolate 白名单机制方向一致，ADR-0010）。记为对基线 §1.3 的实现层补充，12 号票机器验证时复核。调试代价：isWithin 的 fiber 父链在 root 处自环（v4：root fiber 的 parent 即自身），首版无限循环挂死测试——已修并记录。
- 记录性偏离：root/system 发送免 security 裁决（宿主受信层，spec 未定义）；`String(error)` 作 reason 丢栈信息（包络需可序列化，完整栈经 monitor.capture 旁路保留）；同 appId 多实例定向"取最新"，instance 级定向与死信（§5.4）/挂起队列（§5.5）在 08 号票。
- cordis v4 API 事实追加：`ctx.events.emit(thisArg, name, payload)` 显式 thisArg 形式才会消费 `[Context.filter]`；`ctx.emit(name, payload)` 恒广播（thisArg=null）——这解释了 05/06 号票中应用能收到 root 发出事件的现像，也是本票 scoped filter 的动机。
