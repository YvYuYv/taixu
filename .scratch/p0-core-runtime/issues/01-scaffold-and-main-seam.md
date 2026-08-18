# 01 - 仓库脚手架 + 主缝测试基座

**What to build:** 开发者运行一次 `createCordis()` 即可拉起框架基础层（monitor/security 零业务依赖、最先可用），一个"探针应用"（probe plugin）在派生的 fiber 上下文中运行并向宿主回报它观察到的 ctx 契约（fiber 状态、注入的服务、事件可见性）。宿主侧有一个最小演示页；测试侧有 vitest + jsdom 基座，所有后续票共用这条主缝。

**Blocked by:** None - can start immediately.

**Status:** resolved

- [x] `createCordis(config)` 入口拉起 monitor 与 security（Cordis Service 形态，`static [Context.provide]`，零业务依赖），返回宿主 ctx
- [x] 探针应用 = 纯 `apply(ctx)` 插件，能回报 fiber 状态变迁（PENDING->ACTIVE）与可注入服务清单
- [x] monitor.capture 唯一错误入口可用（appId 归因），宿主能 global 旁听 `app/*` 事件
- [x] security/violation 事件经 monitor 旁听（security 不 inject monitor，ADR-0054）
- [x] 宿主演示页与 vitest+jsdom 测试基座跑通（一条端到端主缝断言：探针回报 ACTIVE）
- [x] 术语与 CONTEXT.md 一致；TypeScript strict 模式

## Answer

已交付：

- `src/index.ts` `createCordis(options)`：拉起 `MonitorService` + `SecurityService`（零业务依赖，ADR-0054 依赖方向），返回宿主 ctx；`permissions` 经配置注入（deny-by-default，ADR-0051）。
- `src/events.ts`：基线 §2.4 事件契约的机器可读源（cordis v4 `Events` 监听器函数签名形式）；`outlet/changed:{outlet}` 模板字面量键待 05 号票按槽位落地，见文件尾注释。
- `src/probe.ts` `createProbeApp(appId, onReport)`：探针回报全部来自对 ctx 的**真实观察**（服务可见性逐个探测 `ctx[name]`、fiber 状态读 `ctx.fiber.state`、`{global:true}` 旁听、effect 清理回滚）。
- `tests/main-seam.test.ts`：8 条主缝断言全绿（vitest + jsdom）；`internal/status` 旁听已标注为 cordis-internal 缝，03 号票 lifecycle 派发 `app/*` 后改走契约事件。
- `demo/`：最小宿主演示页（`npm run dev`）。
- 脚手架：`package.json`（`@cordis-mf/taixu`）、`tsconfig.json`（strict + noUncheckedIndexedAccess）、`vitest.config.ts`。

验收备注：

- 探针自身不可见 PENDING（apply 运行于 LOADING 起）--主缝测试由宿主旁听补齐 `PENDING->LOADING->ACTIVE` 全序，符合票面"PENDING->ACTIVE 回报"意图。
- demo 的 `app/ready`/`security/violation` 旁听在 01 号票无人派发属预期（lifecycle 在 03 号票）--demo 注册仅为展示宿主旁听姿势，页面由 monitor/report 驱动。

## Comments

- **cordis v4 事实记录**（基线写法 vs npm 物理事实）：npm `cordis@4.0.0-rc.8` 的 Service 注册是 `static provide = 'name'`（无 `Context.provide` symbol 键）+ `super(ctx, 'name')` 双保险；插件 config 以第二参整体传入（`ctx.plugin(SecurityService, { rules })`）；`ctx.plugin()` 返回 Fiber（thenable，`fiber.await()`）；`ctx.dispose()` 不存在，拆卸用 `fiber.dispose()` 或 `registry.delete`；`FiberState` 是 `const enum` 不支持反向映射（项目内维护名字表 `FiberStateNames`）。基线 §1.3 的 `static [Context.provide]` 写法对应 cordis 主仓最新源码，rc.8 已等效简化--不改基线（它是权威语义），落地以本注释为准。
- **/code-review 双轴结论（均已修复）**：Standards 轴 2 项硬违规（`app/suspend`/`app/resume` 载荷形状对齐基线 §2.4 去掉 appId；`this.ctx.events.emit` -> `ctx.emit`）+ 5 项判断项（phase 枚举 `AppPhase`、`Metric` 判别联合 `ErrorMetric`、内联 import 收敛、`_operand` 猜测性参数删除、排版）；Spec 轴 3 项（探针改为真实观察 ctx 而非复读配置、`internal/status` 缝标注 cordis-internal + 03 号票迁移注、`CORE_SERVICES` 死常量删除移交 12 号票）。通配匹配保留（基线 §四.6 明文）；denial 不自动 reportViolation 已注释说明 11 号票接线。
- 测试基座命令：`npm test` / `npm run typecheck` / `npm run dev`（demo）。
