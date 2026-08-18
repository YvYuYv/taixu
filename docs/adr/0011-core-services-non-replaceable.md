# 核心服务运行时不可替换，替换即框架重启

源码验证（core/src/fiber.ts `_refresh`/`_setEpoch`，reflect.ts `notify`）：服务替换通过 `notify()` 找到所有 inject 该服务的 fiber 并逐个重跑——**注入 fiber 本身重跑，其子 fiber 不级联**。但 lifecycle 重跑意味着挂载管理逻辑重建，应用 fiber 是 lifecycle fiber 的子上下文：若 lifecycle 自身被替换（而非仅重跑），子树会被连带 dispose。决策：lifecycle/router/bus/state/sandbox/monitor/security/deps 八个核心服务标记为 core 层，**运行时替换被视为框架级重启事件**（整树重挂载是预期行为），替换前必须经框架入口而非散落的 `ctx.set`；第三方插件服务不在保护列，替换按 ADR-0007 的整应用重挂载语义处理。
