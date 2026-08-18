# 11 - 安全全链路 fail-closed 接线

**What to build:** 权限裁决贯穿全部消费点：bus.send / state 读写 / router 导航守卫前置 / scopedFetch 四处接线 security（修复"权限中间件从未接线"）。裁决 deny-by-default、只本地可判定（ADR-0051）、不做跨调用缓存（ADR-0039）、5s 超时即拒绝并上报 monitor（ADR-0024）。违规全部经 `security/violation` 事件可审计。isolate 白名单机器生效（仅 router-view/monitor，ADR-0010）。

**Blocked by:** 03, 05, 06, 07

**Status:** ready-for-agent

- [ ] 四消费点接线：bus.send（message:* 资源）、state 读写（key 资源）、router 守卫前置（导航资源）、scopedFetch（URL 白名单 + SRI 就位）
- [ ] deny-by-default：未授权/未注册类型一律拒绝（不因"未注册"默认放行）
- [ ] 裁决三不变量（security §5.1）：无跨调用缓存（版本键编译缓存除外）、本地可判定（远程策略预编译）、5s 超时拒绝 + monitor.capture
- [ ] violation 事件：appId + rule + detail 全量可审计；网络违规类按 (appId, rule) 限流去重
- [ ] isolate 白名单：`ctx.isolate` 请求非白名单标签时开发模式告警/测试断言拦截
- [ ] lifecycle 显式 inject security 的 fail-closed 已在 03 验收，本票补全其余消费点
