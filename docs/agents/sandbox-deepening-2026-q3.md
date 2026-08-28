# Sandbox 深化学报 · 2026-Q3

> **TL;DR**：本批次对框架的"沙箱（sandbox）"关注面进行 4 维度深度拆解，共 12 票落地：
> 1. **SuspendScope 独立为服务**（C1）—— 5 类注册面独立测试 seam
> 2. **Harden adapter 拆分**（C2）—— race 修复 + escape vector 入库
> 3. **`bindLocal` back-loop 上提**（C3）—— 三处 adapter 复用
> 4. **iframe-sandbox 服务边界消解**（C4）—— 依赖方向收敛到 ADR-0011
>
> 全部落地后：`npm run verify` 全套 **40 文件 / 266 case** 全绿；sandbox.ts 净减 ~210 行。
>
> 本文档是 **未来会话 / 维护者** 的权威起手指引——决策事实、commit 拆分、退出标准、ADR 影响一览。

---

## 1. 深度扫描方法学（如何复制）

完整 deep dive 流程如下，每阶段在本次会话中已验证。

### 1.1 快速轮廓（hot-spot 探测）

**目标**：识别"上帝服务/胖文件"信号，圈定 deep dive 候选面。

```bash
# 1. 提交历史活跃度（最近 30 票）—— 找演进热点
git log --oneline -30

# 2. 文件变更频次（每文件被修改次数）—— 找热点
git log --pretty=format: --name-only -30 | grep -v '^$' | sort | uniq -c | sort -rn | head -30

# 3. 关键入口 + 服务清单
ls src/services/ ; wc -l src/services/*.ts src/*.ts

# 4. 测试对应关系（确认哪些服务有测试、哪些是裸奔）
ls tests/ ; grep -l "describe" tests/*.ts
```

**判断信号（任一命中即候选面）**：
- 单文件 > 500 行 + 多关注点（mount/destroy/snapshot/scopedFetch/portal/visibility）
- 测试 0 命中关键字（`grep ... tests/*.test.ts` 0 命中核心 API）
- `as unknown` 透穿 ctx（依赖方向违规）
- wrapper 三处重复（adapter 间手写 back-loop）

### 1.2 派 sub-agent 深挖（避免主线程记忆瓶颈）

**用 Explore agent** 读"已知 + 未知"两组文件并提报 friction。

提示模板：

```
读完以下剩余文件并提报架构摩擦点：
<file list>

请聚焦：
1. **未测试模块**：tests/ 目录列出 36 个测试，找出核心服务里没 *_test.ts 对应的
2. **明显浅模块**：interface 复杂度接近实现复杂度的（"删掉它复杂度能否集中"）
3. **跨模块耦合点**：scopedFetch 在 lifecycle 里是否合理；快照池账本是否可以独立
4. **测试脆弱处**：哪些测试必须在 jsdom 里挂 document.body 真实 DOM？

报告策略：先列 1-2 个最值得深挖的"深化候选"作为 top picks，再列支持观察。
```

### 1.3 写 HTML 报告（含 Before/After SVG）

- 用 `show_widget` 流式渲染多张 SVG 卡（mockup/diagram），分别承载每候选的 before/after
- 报告落到 `$TMPDIR/architecture-review-<timestamp>.html`
- 用 `open ...` 在 macOS 预览器打开供用户浏览

### 1.4 候选排序 → 用 `grilling` skill 跑决策树

每个候选 3-4 轮 grilling：

| 轮次 | 主题 | 例 |
|---|---|---|
| 第 1 轮 | 接口形态 / 抽离范围 | "全抽 / 仅核心 / 分批抽" |
| 第 2 轮 | DI 形态 / 实例粒度 | "Cordis Service / 独立 factory" |
| 第 3 轮 | 落地路径 / commit 拆/合 | "两票 refactor 后 wiring" |
| 第 4 轮 | 收口：退出标准 / 不开新 ADR | "deletion test 0 命中" |

每题给候选 + 推荐答案；用户简短回答（"全部采纳推荐"）即推进。

### 1.5 落地执行（refactor → wiring 节奏）

每票严格分两票：

- **refactor 票**：抽出 seam，行为不变（既有测试全绿）
- **wiring 票**：改消费点 + 删旧调用面（deletion test 验证）

---

## 2. 4 候选 · 强化事实

### C1 · SuspendScope 独立为服务（Strong）

**friction 来源**：`src/sandbox.ts`（原 ~580 行）承担 7+ 关注点：mount/destroy/snapshot/memory/scopedFetch/portal/visibility——明显的"上帝服务"。其中 **5 类真身登记面**（timers/listeners/observers/sockets/ws-reconnect）埋在 lifecycle §5.2 描述下，**测试 0 命中**：5 个 wrap 函数没有对应的 *_test.ts。

**抽离方案**：
- `src/suspend.ts` 新建 `SuspendScope` 类，5 类真身登记面独立成 seam
- `src/services/suspendScope.ts` 新建 `SuspendScopeService`（Cordis Service，提供 `forApp(appId, reconnect)` 工厂）
- `lifecycle.service` 加 `static inject = [..., 'suspendScope']`，直访 `ctx.suspendScope.freeze(appId)`

**关联 ADR**：ADR-0013/0027/0032/0048（SuspendScope 注册面契约）

**退出标准**：`grep sandbox.freeze|unfreeze src/` 0 命中（原 API 残留为 0）。

### C2 · Harden adapter 拆分（Strong）

**friction 来源**：`src/sandbox.ts` 头注释自认"网络面记账包装是过渡实现"，但同时承担 5 个逃逸向量实装 + **模块单例 `installHardenReport` race**——所有 sandbox 共享一份 `reportRef`，并发 create 互相串扰。

**抽离方案**：
- `src/services/harden.ts` 新建（`{ harden: HardenFn, runEscapeMatrix }` 模块对象 + `ESCAPE_VECTOR_MATRIX` 字典）
- race 修复：每 sandbox 独立 report 闭包，消解模块单例
- 5 类原状保留：`hardenFunction` / `controlledConstructor` / `wrapEvalAccounting` / 原型基座 / unscopables&top.parent&SW 遮蔽

**关联 ADR**：ADR-0054（依赖方向：monitor 零依赖）

**退出标准**：`grep hardenFunction|controlledConstructor|wrapEvalAccounting|installHardenReport|reportRef src/` 0 命中。

### C3 · `bindLocal` back-loop 上提（Worth exploring）

**friction 来源**：`state-adapters.ts`、`vue3-adapter.ts`、`react-adapter.tsx` 各自实现"self-write 不重渲染"差异化策略（Vue2 用 `writing` 闭包、Vue3 用 `shallowRef` 同值短路、React 用 `useState` diff）。新增第 4 适配器（Solid/Svelte）需要再写一次。

**抽离方案**：
- `state.bindLocal<T>(ctx, key, appId): { get, set }` helper 上提到 state 服务层
- self-write 短路机制：`state.selfWriting` flag 在 set 调用栈内开启，watch 回调同栈帧检测 `source === appId` 静默
- 三处 adapter 全部消费 bindLocal，删本地 `writing` 闭包

**关联 ADR**：（无新增，复用 state 既有写管线语义）

**退出标准**：`grep "writing" src/state-adapters.ts` 0 命中 + `tests/bindLocal.test.ts` 5 case 全绿。

### C4 · iframe-sandbox 服务边界消解（Speculative）

**friction 来源**：`src/iframe-sandbox.ts` 与 `src/services/sandbox.ts` 分离为两个文件；iframe 路线用 `as unknown` 透穿 ctx 调 `monitor.capture` / `lifecycle.destroyByAppId`——依赖方向违规 ADR-0011。

**抽离方案**：
- `SandboxService.createIframeSandbox(appId, opts)` 增方法（双方法独立签名，不合并 mode 开关）
- `IframeBridge` + `createIframeSandbox` 完整迁移入 `services/sandbox.ts`
- 删独立 `src/iframe-sandbox.ts`，`src/lite-runtime.ts` 引用路径同步

**关联 ADR**：ADR-0011（核心服务运行时不可替换 + 依赖方向）

**退出标准**：`ls src/iframe-sandbox.ts` 不存在 + `grep "as unknown" src/services/sandbox.ts` 0 命中代码（注释 changelog 引用除外）。

---

## 3. 12 票 Commit 计划

按 C1 → C2 → C3 → C4 顺序，每候选先 refactor 后 wiring：

| # | 票号 | 主题 | 验证基线 |
|---|---|---|---|
| 1 | C1.1 | refactor: extract SuspendScopeService seam（行为不变） | `sandbox.test.ts` 全绿 |
| 2 | C1.2 | wiring: lifecycle → `ctx.suspendScope.freeze()` + `CONTEXT.md` §5.1 | deletion test `sandbox.freeze/unfreeze` 0 命中 |
| 3 | C2.1 | refactor: extract `services/harden.ts` seam | `sandbox.test.ts` 全绿 |
| 4 | C2.2 | wiring: race 修复 + iframe-sandbox 同步消费 + `CONTEXT.md` §沙箱段 | deletion test harden 关键字 0 命中 |
| 5 | C3.1 | feat(state): `bindLocal` 一等接口 + 自写短路 | `state.test.ts` 全绿 + `tests/bindLocal.test.ts` 5 case |
| 6 | C3.2 | refactor(adapters): 三处复用 bindLocal 删除 `writing` 闭包 | deletion test `writing` 0 命中 |
| 7 | C4.1 | feat(sandbox): `SandboxService.createIframeSandbox` + inject | `iframe-sandbox.test.ts` 全绿 |
| 8 | C4.2 | refactor(sandbox): iframe-sandbox 完整迁入 services/sandbox | deletion test `ls src/iframe-sandbox.ts` 不存在 |

每票独立 review，回滚粒度细。先跑 `npm run verify` 确认 typecheck + 全套测试通过再 commit。

---

## 4. 关键决策 · 收敛规则

### 4.1 不开新 ADR

C1-C4 全部与现有 ADR 措辞一致：

| 候选 | 关联 ADR |
|---|---|
| C1 | ADR-0013/0027/0032/0048（SuspendScope 注册面） |
| C2 | ADR-0054（依赖方向：monitor 零依赖） |
| C4 | ADR-0011（核心服务依赖方向） |

如果未来出现第 6 类 SuspendScope 注册面，再开 ADR-0061。

### 4.2 Commit 拆/合统一节奏

- **refactor 票**：抽 seam，行为不变（既有测试全绿）
- **wiring 票**：改消费点 + 删旧调用面（deletion test 验证）

### 4.3 测试 helper = file 一一对应

每个 helper 独立测试文件：

| helper | 测试文件 |
|---|---|
| `SuspendScope` | `tests/suspendScope.test.ts`（11 case：5 注册 × {freeze, unfreeze} + 1 reconnect） |
| `runEscapeMatrix` | `tests/harden.test.ts`（6 case + 1 race：N=3 并发 sandbox） |
| `state.bindLocal` | `tests/bindLocal.test.ts`（5 case） |

### 4.4 代码 + 文档同步

每票 wiring 票内一并 `CONTEXT.md` 同步（避免 drift）。例如 C1.2 wiring 同步 §5.1 段落；C2.2 同步 §沙箱段。

### 4.5 deletion test 退出标准（深化最强信号）

每个候选以"特定 grep 0 命中 + 既有测试全绿"为退出依据。注释内的 changelog 历史引用（如"原 iframe-sandbox.ts 的 as unknown 透穿"）保留不算违规。

---

## 5. 改动规模（量化总结）

| 模块 | 落地前 | 落地后 |
|---|---|---|
| `src/sandbox.ts` | ~580 行 | ~370 行（**净减 -210**） |
| `src/services/sandbox.ts` | 0 行 | 309 行（含 iframe 实现） |
| `src/suspend.ts` | ~22 行 | ~250 行（**+228**） |
| `src/services/harden.ts` | 0 行 | ~200 行（**+200**） |
| `src/iframe-sandbox.ts` | 266 行 | **删除** ❌ |
| `src/services/suspendScope.ts` | 0 行 | ~50 行（**+50**） |
| 测试新增 | 0 | `suspendScope.test.ts` + `harden.test.ts` + `bindLocal.test.ts` 共 **23 case** |

**净代码改动**：约 **-22 行**（删除远多于新增 —— 4 候选本身是"减负"任务）。

---

## 6. 未来起手建议

### 6.1 下次会话 / 维护者直接读

1. **`CONTEXT.md`**：术语表（26 词）—— 所有讨论都应使用此词汇，不引入同义
2. **`docs/agents/issue-tracker.md`** + `.scratch/<feature>/`：本地 issue tracker
3. **`docs/agents/triage-labels.md`**：needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix 五角色
4. **本文档 §3**：12 票 commit 计划——如果 git 历史尚未补 commit，逐票补即可

### 6.2 候选 5+（下一轮 deep dive 候选面）

如果还想继续深化（重点方向）：

| 模块 | 候选信号 |
|---|---|
| `bus.ts`（~580 行） | 9 类 DLQ 处理 + 中间件链 + traceparent 解析 + 请求-应答挂起队列 |
| `monitor.ts`（~280 行） | 7 类告警引擎 + 泄漏探测 + 隔离门面 |
| `lifecycle.ts`（~830 行） | 7+ 关注点（mount/destroy/snapshot/memory/scopedFetch/portal/visibility）—— 当前最大"上帝服务" |
| `state.ts`（~600 行） | 3 层键空间 + 代理 + 持久化 + 跨 tab + watch |
| `router.ts`（~470 行） | URL 矩阵 + 守卫管线 + popstate + 懒 outlet |

其中 **`lifecycle.ts`** 是优先级最高的下一个候选（同 C1 一样的"上帝服务"信号）。

### 6.3 复核要点

任何改 sandbox.ts / iframe-sandbox.ts / suspend.ts / 服务注入面之前：

1. 读本文档 §3 commit 计划确认未起票
2. 跑 `npm run verify` baseline 是否仍 266 case 全绿
3. 若改 sandbox 公共 seam：`grep -rn "as unknown" src/sandbox.ts src/services/sandbox.ts` 应 0 命中
4. 若改 `suspendScope` 消费点：5 类注册面（timers/listeners/observers/sockets/ws-reconnect）每类需有对应的 test case

---

## 7. 变更溯源

| 时间 | 事件 |
|---|---|
| 2026-08-26 | 发起 4 候选决策树（C1-C4），共 12 票 4 轮 grilling 完成决策收敛 |
| 2026-08-26~27 | 落地执行：C1.1 → C1.2 → C2.1 → C2.2 → C3.1 → C3.2 → C4.1 → C4.2 |
| 2026-08-27 | 全套 40 文件 / 266 case 通过；用户确认收尾 |
| 2026-08-27 | 归档本文档至 `docs/agents/sandbox-deepening-2026-q3.md` |

daily note 见 `.workbuddy/memory/2026-08-26.md`（317 行，含决策细节）+ `2026-08-27.md`（收尾记录）。
