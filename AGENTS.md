# AGENTS.md

面向 AI agent 的工程协作约定。人类开发者请看 [README.md](./README.md)。

## 常用命令

```bash
npm run typecheck   # 类型检查（tsc --noEmit）
npm test            # 全量测试（vitest，360 case）
npm run verify      # typecheck + 测试——任何代码改动后必跑，红灯不交差
```

## 工程事实（先读再动手）

- **测试是语义源**：360 个 case 覆盖全部公开面；改行为前先看对应测试文件顶部的注释块（标注语义源 = 哪份规范的哪一节）
- **规范即契约**：`docs/specs/` 下 12 份领域文档是行为权威（如 `specs/monitoring.md` §二 定义 capture 语义）。实现与规范冲突时，**先核对规范再动手**——F3/F4/F12 都出现过规范推翻实施预想的案例
- **术语**：`CONTEXT.md` 是术语唯一权威（Fiber/槽位/容器/键空间/暖启动），禁用同义词
- **ADR**：`docs/adr/`（60 项）；新 seam 补全不开新 ADR，契约变更才开
- **验收三合一**：deletion test（grep 旧实现 0 命中）+ `npm run verify` 全绿 + typecheck 干净
- **负向验证**：新增能力必须做"改坏即红灯"验证（把核心逻辑临时改成恒空/恒真，确认测试真的在测它）

## 代码模式（沿既有惯例）

- **闭包工厂**：零 ctx 依赖的子系统抽离用 `create<X>Ledger(config)` 模式 + 非 cordis service + thin delegate（见 state/timeTravel.ts、monitor/pii.ts、router/hydration.ts——已推广 10+ 处）
- **标记约定族**：DOM 标记统一 `data-tx-*`（`data-tx-shadow` / `data-tx-mount-hidden` / `data-tx-ssr` / `data-tx-mount-hidden`）
- **事件契约**：新增事件族必须过 `tests/event-contract.test.ts` 看门狗（无孤儿定义/无野生事件）；依赖方向过 `tests/dependency-graph.test.ts`（无环 DAG，security/monitor/style 等为零依赖叶子，核心层不反向依赖 devtools）
- **deny-by-default**：安全面（权限/告警规则/命令通道）缺省拒绝，穷举守卫

## 提交与协作

- **commit 节奏**：纯位置移动单 commit；行为变更拆 refactor/wiring 两票；commit message 记录 friction（为什么做）+ 改动 + 测试 + 负向验证
- **文档同步**：wiring 票内一并改 `docs/specs/` 对应文档与 `CONTEXT.md`；每票完成后归档到 `docs/agents/sandbox-deepening-2026-q3.md`（§ 编号递增）
- **本批不自动 push**：用户 IDE 内 review 后自行推送（或明确授权后推）

## Issue tracker

Issues 以本地 Markdown 文件追踪于 `.scratch/<feature>/`（spec.md + issues/NN-*.md，Status/Blocked by 齐备）。**`.scratch/` 受 .gitignore 保护，不进版本控制**——需跨会话保留的结论另归档到 `docs/agents/`。见 `docs/agents/issue-tracker.md`。

## Triage labels

五角色标签（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）。见 `docs/agents/triage-labels.md`。

## Domain docs

单上下文：根级 `CONTEXT.md`（术语表）+ `docs/adr/`（ADR-0001~0060）。见 `docs/agents/domain.md`。

## Git

- remote：`git@github-yvyuv:YvYuYv/taixu.git`（SSH 别名，双账号共存：默认 `github.com` 走 Himoriarty 的 `id_ed25519`，yvyuv 专用 key 走 `~/.ssh/config` 的 `github-yvyuv` Host）
- 推送前确认 `npm run verify` 全绿
