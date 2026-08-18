# 09 - 恢复三通道收口：state/sync + outlet 重放

**What to build:** 挂起的应用恢复时三条通道按统一时序收口：state 走拉模型（挂起期间不推送 `state/changed`，恢复时一次性 `state/sync` 同步 watch 键集合，ADR-0023）；router 对该槽位重放一次 `outlet/changed:{outlet}`（应用像响应正常导航一样同步，ADR-0056）；bus 回放以原 traceparent 为 span link 开新 span（ADR-0030）。集成测试验证三通道时序无交错。

**Blocked by:** 06, 08

**Status:** ready-for-agent

- [ ] 挂起期间该应用不收 `state/changed` 推送；恢复时收到一次性 `state/sync {keys}`（含 value+version）
- [ ] 恢复后槽位事件重放一次：应用视图同步与正常导航同路径（无第二套恢复机制）
- [ ] 回放 span link：每条回放消息以原 traceparent 链接开新 span（monitor 可关联挂起前后链路）
- [ ] 恢复时序集成测试：state/sync -> outlet 重放 -> 消息回放 的顺序断言（经主缝探针观察）
- [ ] 分级恢复覆盖语义验收（ADR-0031）：路由级恢复不覆盖命令级 resume
