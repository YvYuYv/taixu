# 挂起期间 state 不推送，恢复时按 watch 键集合一次性拉取

ADR-0008 的"状态类同键合并"只适用于 bus 通道的消息。state 通道（`ctx.on('state/changed')`，ADR-0001）若照搬队列模型，会让 state 服务反向依赖 lifecycle（§2.3 禁环）——且状态与消息本质不同：状态可重拉，消息不可重放。决策：state 服务通过监听 `app/suspend`/`app/resume` 事件（不 inject lifecycle）感知挂起态；挂起期间对该应用**不推送** `state/changed`；恢复时按该应用 watch 的键集合一次性同步当前值（`state/sync` 事件，载荷 `{keys: Record<key, {value, version}>}`）。拉最新值在语义上永远等价于合并回放，且避免了依赖环。
