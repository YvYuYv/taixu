# 12 - 事件契约机器验证 + 核心层守卫（P0 收口）

**What to build:** P0 收口：基线 §2.4 全部事件形状有机器可读的契约测试（载荷单对象、kebab-case、模板字面量族），三族分发结果契约（守卫枚举 / serial+包络 / 单点方法）有 lint 级校验拦截违规；八核心服务运行时替换被视为框架级重启事件（ADR-0011），散落的 `ctx.set` 替换被拒绝。宿主演示页串起全部 P0 能力作为最终验收演示。

**Blocked by:** 05, 06, 07, 08, 09, 10, 11

**Status:** done

- [x] 事件契约测试：基线 §2.4 每个事件在集成场景中断言形状（单对象载荷、必填字段、version/source）
- [x] 结果契约校验：守卫族只允许枚举三值 + undefined；请求-应答族只允许包络/null/undefined（false 拒绝）；通知族忽略返回值（ADR-0002/0012/0014）
- [x] bail 禁用校验：代码库零 `ctx.bail` 调用（lint 规则）
- [x] `app/intent:*` 不存在校验；已删除事件名静态扫描
- [x] 核心层守卫：八服务运行时替换 = 框架级重启事件（经框架入口）；散落 ctx.set 被拒并上报
- [x] 演示页终验：挂载 -> 切换保活 -> 挂起消息回放 -> 驱逐暖启动 -> 守卫拦截 -> fail-closed 全链路可演示
- [x] 与基线冲突时以 cordis-alignment.md 为准的裁决已在 CI 文档中声明

## Answer

- **事件契约机器验证**（`tests/contract.test.ts`）：CONTRACT 机器可读表（事件 -> 必填字段类型，含 enum/AbortSignal/nonnull-object 判别）+ 一个集成大场景（挂载/loaded/ready、state、bus 请求应答、路由 + 守卫 abort + redirect-loop → monitor/alert、violation、挂起恢复（state/sync + outlet 族双槽位 + 回放溢出 bus/overflow）、驱逐（evicted/disposed）、失败应用 app/error）断言**每次触发的载荷为单对象且字段类型符合契约**，且契约表全部事件被触发（覆盖完整性双向断言）。模板字面量族以 `outlet/changed:main` + `outlet/changed:side` 双槽位代表（ADR-0047）。
- **结果契约三族**：守卫族运行时形状校验（`isValidGuardResult`——枚举三值 + undefined 之外按中止 + monitor 上报含槽位 owner 归因，测试断言不落 commit）；请求-应答族 false 运行时拒绝（07 号票实现，本票补契约测试：false → 无包络 + bus-reply-false 告警）；通知族忽略返回值（监听器返回垃圾值派发照常）。静态扫描：零 `ctx.bail`、`app/intent:` 引号内零使用（ADR-0035）、已删除旧契约名（lifecycle:beforeLoad/beforeMount/mounted、state:change）零引用、禁 `ctx.service.x`。
- **核心层守卫**（`src/index.ts` `installCoreGuard`）：`ctx.set` 包装——八个核心服务（lifecycle/router/bus/state/sandbox/monitor/security/deps）运行时替换抛错拒绝 + `core-service-replacement` violation；第三方键放行（cordis 自身 provide 校验接管）。与 isolate 守卫共用 `wrapRootMethod`（原始方法以**调用点 this** 执行——子 ctx 不被钉死在 root 作用域）。
- **演示终验**（`demo/`，`npm run dev`）：挂载 → 请求-应答 → 切换保活（默认挂起）→ 挂起消息回放 → 驱逐暖启动（快照注水 cart 还原）→ 守卫拦截 → fail-closed（未授权 send / 核心服务替换 / isolate 白名单）。
- **收口基建**：`npm run verify`（typecheck + 全量）与 `npm run lint:contract` scripts；`.github/workflows/ci.yml` + README "P0 核心运行时 · 验证与裁决声明"——文档冲突以 cordis-alignment.md 为准（AGENTS.md 约定）在 CI 注释与 README 双处声明。
- **基线对齐**：cordis-alignment.md §2.4 补录三个已实现扩展（`app/evicted.cause`、`message/response`、`router/replay`/`bus/replay`——分别源自 10/07/09 号票），消除"唯一版本"声明与实现的漂移；lifecycle 补发 `app/loaded`（曾声明未派发）。

## Comments

- 双轴审查发现并已修复：CONTRACT 表与基线漂移（app/evicted.cause / message/response / router·bus/replay）→ 以补录基线方式收口（单一版本原则）；`app/error` 曾弱化 phase/recoverable 断言 → 补回；`checkField` 'object' 放过 null → 增 `nonnull-object` 判别；`isValidGuardResult` 插在他人文档注释与函数之间 → 归位；guard-contract 上报补槽位 owner 归因；两守卫包装重复 + `raw` 钉死 root this → 提取 `wrapRootMethod` 共用 + 调用点 this 动态执行；契约表补 `outlet/changed:side`（族不只断言一个槽位）。
- 已知边界（记录不阻断）：结果契约"lint 级"以 vitest 运行时校验 + 静态扫描组合实现（无独立 eslint 规则工程）；`ctx.set` 守卫的 violation 归因为 'root'（root 层守卫无法定位 fiber 调用方，cordis 未暴露调用栈归因面）；静态扫描覆盖 `src/`（生产代码），tests/demo 不在扫描列。
- P0 收口完成：12 张票全部 done，139 测试全绿，typecheck 通过。
