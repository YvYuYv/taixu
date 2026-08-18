# 06 - 状态：三层键空间 + 写管线 + 订阅

**What to build:** 应用经 state 服务读写三层键空间（global: / shared: / local:{appId}:）：每次写经权限校验 + 版本推进后单次通知；应用用 `ctx.on('state/changed')`（带键过滤）订阅、dispose 自动退订。local: 层以"键前缀 + fiber 归属校验"隔离（禁用 isolate），`local:` 键只接受 JSON 可序列化值（快照前提）。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 三层键空间：global / shared / local:{appId}: 前缀语义与可见性
- [ ] 唯一写入管线：权限校验（security 接线点就位，全链 fail-closed 在 11 验收）-> 版本推进 -> 单次通知
- [ ] 订阅 = `ctx.on('state/changed')` + 键过滤；首运行值即送；dispose 自动退订（ADR-0001）
- [ ] local: 隔离 = 键前缀 + fiber 归属校验（ADR-0003：禁 `ctx.isolate('state')`）
- [ ] `local:` 键使用条款：JSON 可序列化、拒绝 token/密码/PII 键名（写入时校验并上报）
- [ ] 深层代理身份稳定（同一路径多次访问同引用）
- [ ] state 感知挂起经监听 app/suspend/app/resume 事件（不 inject lifecycle，ADR-0023 的挂起分支在 08/09 验收）
