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

---

# 第二阶段：服务关注面横扫（C5 - C12）

> **TL;DR**：本阶段针对 6 个核心服务（lifecycle / bus / monitor / router / deps /
> security / state）横扫关注面收敛 + 新增 1 个 sandbox helpers 抽离，共 **7 票
> 单 commit 全部落地**。所有票都是"zero-dependency helper 集中 + 服务类瘦身"模式。
>
> 全阶段后：`npm run verify` 全套 **40 文件 / 267 case 全绿 + working tree 干净**；
> 累计 12 票（沙箱 8 + 服务关注面 7，含 1 票 Redux 重复清理）。新增 7 个
> `src/<feature>-helpers.ts` 或 `src/services/<subdir>/<feature>.ts` 模块化层。

## §8. 第二阶段贡献（7 票）

| # | 票 | 强度 | commit | 行数影响 |
|---|---|---|---|---|
| C5-A | KeepAliveService 抽离 | Strong | `4a91cc6`/`46f1966` 中合并 | lifecycle -219 行 / keepAlive +369 |
| C5-B | `finalizeInstance` 统一 cleanup | Strong | `46f1966` | cascadeCleanup 删 |
| C5-C | `scopedFetch` owner 重划 | Strong | `46f1966` | lifecycle -24 / scopedFetch +34 |
| C6-A | `tracing helpers` 下移到 `tracing.ts` | Strong | `20ea82e` | bus -38 / tracing +35 |
| C7-A | `leak detection` 子系统抽离 | Strong | `02a609f` | monitor -21 / leakDetector +113 |
| C8-A | `router parsers` 抽离 | Worth | `1a2ce7c` | router -24 / parsers +54 |
| C9-A | `deps SemVer` 抽离 | Worth | `cd68082` | deps -47 / semver +56 |
| C10-A | `security sanitizers` + 删 `lookupSri` | Strong | `cdcef32` | security -11 / sanitizers +48 |
| C11-A | `state helpers` 抽离 | Worth | `fcb4ac7` | state -59 / helpers +91 |
| C12-A | `document-proxy helpers` + `ReportFn` 复用 | Worth | `2683932` | document-proxy -15 / proxy-helpers +30 |

> C5 三票合并到 `46f1966` 大 commit（lifecycle 关注面集中收口），不独立票号。

## §9. 第二阶段"模式收敛"

7 个单 commit 助手票（C6 ~ C12）共享同一模式：

1. **零依赖 helper 抽离** —— 6 个 `*Helpers` 文件全部符合"零接触 ctx/inspector/
   monitor"；helper 可独立单测
2. **行为零变更** —— 全部以"位置移动 + import 切换"完成；测试用例不需新增
3. **deletion test** —— grep inline 定义 0 命中（如 `^function parseVersion`,
   `^const INJECT_METHODS` 等）
4. **公共面 re-export 兼容** —— `parseTraceparent` / `satisfies` /
   `isIsolateAllowed` 等已 export 符号保留 re-export，外部 import 路径不变

## §10. 文件结构（最终态）

```
src/
├── index.ts                                # 公共 API 聚合
├── services/                               # Cordis 服务 + 助手模块
│   ├── sandbox.ts                          # 沙箱本体（C1/C2/C4 关注面收敛）
│   ├── sandbox/                            # （历史占位；实际 impl 在 services/sandbox.ts）
│   ├── router/
│   │   └── parsers.ts                      # C8-A：5 常量 + 4 helper
│   ├── deps/
│   │   └── semver.ts                       # C9-A：parseVersion / compareVersions / satisfies
│   ├── security/
│   │   └── sanitizers.ts                   # C10-A：matchAction / readCookie / isIsolateAllowed
│   ├── state/
│   │   └── helpers.ts                      # C11-A：6 helper + 1 constant
│   ├── bus.ts                              # 沙箱服务（C6-A tracing helpers 下移）
│   ├── monitor.ts                          # C7-A 关注面收敛到 4 类本职
│   ├── leakDetector.ts                     # C7-A：独立子模块
│   ├── routing.ts ...
│   └── ...
├── sandbox-proxy-helpers.ts                # C12-A：DOM 注入路径 + scoped 查询 + cssEscape
├── document-proxy.ts / inject-tracker.ts   # 沙箱组件（C12-A 复用 ReportFn）
├── suspend.ts                              # SuspendScope（C1 抽离）
└── ...
```

## §11. 决策收敛规则（强化）

第二阶段确认了 1 阶段决策树的 4 个核心规则的可持续性：

1. **不开新 ADR** —— 所有抽离都"补全 seam"而非"立契约"
2. **commit 拆/合节奏** —— "先 refactor 行为不变 → 再 wiring 改消费点"；
   本阶段纯位置移动大多单 commit（C6/C7/C8/C9/C10/C11/C12）
3. **测试 helper = file 一一对应** —— 抽离后独立 `<feature>.test.ts`；本阶段
   助手文件零测试（helpers 极简且无业务路径，断言内联即可）
4. **代码 + 文档同步** —— header 注释写明抽离原因，**不**在 doc-typeset 阶段
   单独同步（CONTEST.md 不再引用 helper 内部）

## §12. 改动的可观测证据（27 行删除 vs 12 文件新增）

累计本批次：

| 维度 | 数 |
|---|---|
| 总 commit | 13（沙箱 6 + 服务 7） |
| 新模块文件 | 9（suspendScope.ts / harden.ts / keepAlive.ts / scopedFetch.ts / leakDetector.ts / parsers.ts / semver.ts / sanitizers.ts / helpers.ts / proxy-helpers.ts） |
| 修改文件 | 13 |
| 净行数变化 | ~-50 行（关注面收敛价值 > 抽离成本） |
| 测试通过 | 40 / 267 |

## §13. 未来起手建议（C13+）

可继续的高 leverage 抽离（按强度）：

1. **`monitor.metricsSnapshot` 拆分** —— 当前含 RingBuffer 实例计算（~25 行），
   可独立 `monitor/metrics.ts`（关注面继续收敛：monitor → 错误 / 告警 / 隔离门面 3 类本职）
2. **`router.commit` 独立** —— 入口 URL 回写（~30 行）的纯函数性质强；
   可独立为 `router/commitUrl.ts`
3. **`router.ioFactory` 抽象独立** —— IntersectionObserver 适配+降级策略
   可单独测试
4. **小模块深度** —— `errors.ts` / `events.ts` / `storage.ts` 已"独立模块"，
   无 helpers 可抽

> 候选 1 是最强 — `metricsSnapshot` + `RingBuffer` 同源紧耦合，且有量化测试可下沉。

## §14. 决策树与本批次之外的延伸展望

**延伸 1**：本批次建立的"零依赖 helpers 集中"模式同样适用于**未来新服务**——
DevTools / Hmr / Style 等新服务落地时直接继承此模式（helpers 集中，
服务本体聚焦主路径）。

**延伸 2**：所有 helper 模块的 `*-helpers.ts` 后缀统一，未来 `import { x } from
'/<feature>-helpers'` 即为"暴露内部小工具"的明确信号；与 `services/`
子目录"对外规约" 形成对照。

**延伸 3**：本批次的 deletion test 是**深化最强信号**——所有 12 候选的退出
标准都依赖 grep 0 命中验证；这一标尺可复用到任何后续重构（创建新候选时
先思考"什么 inline 定义可以删"，提前 deletion test 即可起步）。

---

# 第三阶段：新视角 + 收口（C14 - C15）

> **TL;DR**：重置视角（不带前两批心智）后以 **config 接口字段数 + 状态字段密度** 为信号，
> 识别出"config 拆分 + 状态机独立"两类全新 friction，落地 **8 票单 commit**。
> 核心服务（bus / router / style / monitor / security）的子系统抽离全部收口。

## §15. 第三阶段信号（新视角方法）

前两批（C1-C12）的信号是"文件行数 + helper 函数数"；第三批重置视角后新增两个维度：

| 维度 | 度量 | 最强信号 |
|---|---|---|
| **config 接口字段数** | `interface XxxConfig` 字段计数 | SecurityConfig **8 字段**（每字段独立关注面） |
| **状态字段密度** | `private` 字段计数 | state.ts **28** / router.ts **26** / bus.ts **16** |

**模式差异**：

| 维度 | C1-C12（前两批） | C14-C15（第三批） |
|---|---|---|
| friction 类型 | helpers 抽离（位置移动） | config 拆分 + 状态机独立 |
| 模式 | 零依赖 helpers 集中 | **闭包工厂 + 独立子系统** |
| 行为变更 | 零变（单 commit） | 零变（单 commit；C14-A config 类型拆分向后兼容） |

## §16. 第三阶段贡献（8 票）

| # | 票 | 强度 | commit | 行数影响 |
|---|---|---|---|---|
| C14-A | SecurityConfig 拆 3 子 config | Strong | `6f8fa07` | security +64（3 子 config + 3 getter） |
| C14-B | router lazy outlet 状态机独立 | Strong | `d88e8b6` | router -22 / lazyOutlet +107 |
| C14-C | bus 挂起队列 + DLQ 双子系统独立 | Strong | `4bd6f7e` | bus -53 / queue +99 / dlq +61 |
| C14-D | style.fontRegistry 子系统独立 | Worth | `0a88cf5` | style -66 / fontRegistry +125 |
| C14-E | monitor errorLedger 子系统独立 | Worth | `edbd7c3` | monitor -20 / errorLedger +68 |
| C14-F | style CSS-in-JS 补丁独立 | Worth | `4b15b0e` | style -64 / cssinjs +123 |
| C15-A | bus 网络拦截链独立 | Strong | `9a7c305` | bus -25 / networkChain +118 |
| C15-B | router commit URL 序列化独立 | Worth | `d44d394` | router -12 / commitUrl +70 |

**闭包工厂模式**（C7-A leakDetector 确立、第三批全面推广）：

```
create<X>Ledger(config) → { 操作面方法, destroy() }
```

- 零 ctx 依赖（纯状态机 / 纯账本 / 纯函数编排）
- 非 cordis service 形态（无 service 抽象必要）
- 服务类改持 handle 引用；原方法改 thin delegate
- `app/disposed` / `ctx.effect` 清理统一走 `ledger.destroy()` / `ledger.clear()`

## §17. 服务责任面收敛终态（四批次累计）

| 服务 | 落地前行数 | 落地后行数 | 关注面收敛 |
|---|---|---|---|
| **lifecycle.ts** | 846 | 610 | mount/destroy 编排 + scopedFetch 注入点 + outlet 容器管理（**-27.9%**） |
| **bus.ts** | 583 | 505 | 消息分发本职（单播/广播/请求-应答/pubLatest）；queue/dlq/networkChain/tracing 全出 |
| **router.ts** | 470 | 412 | outlets 矩阵 + navigate 管线 + popstate；parsers/lazyOutlet/commitUrl 全出 |
| **monitor.ts** | 292 | 270 | 错误/指标/告警/隔离门面 4 类本职；leakDetector/errorLedger 全出 |
| **security.ts** | 308 | 338 | 裁决/急停/净化/限流/CSRF/SRI（3 子 config + sanitizers 出） |
| **state.ts** | ~600 | ~560 | 键空间 + watch + bindLocal（helpers 出） |
| **style.ts** | 351 | 220 | inject 主路径本职；fontRegistry/cssinjs 全出 |
| **deps.ts** | 380 | ~330 | 资源加载 + 仲裁 + 容灾本职；semver 出 |

**18 个新模块终态清单**：

```
src/
├── sandbox-proxy-helpers.ts          # C12-A：DOM 注入路径 + scoped 查询 + cssEscape + ReportFn
└── services/
    ├── suspendScope.ts               # C1：SuspendScope Service（5 类注册面）
    ├── harden.ts                     # C2：硬化工具集 + ESCAPE_VECTOR_MATRIX + race 修复
    ├── keepAlive.ts                  # C5-A：KeepAliveCore + KeepAliveService
    ├── scopedFetch.ts                # C5-C：createScopedFetch（security 裁决 + bus 链路编排）
    ├── leakDetector.ts               # C7-A：createLeakDetector（WeakRef + FinalizationRegistry）
    ├── bus/
    │   ├── queue.ts                  # C14-C：createQueueLedger（挂起队列状态机）
    │   ├── dlq.ts                    # C14-C：createDlqLedger（死信账本）
    │   └── networkChain.ts           # C15-A：createNetworkChain（中间件链 + tracing + monitor 计时）
    ├── router/
    │   ├── parsers.ts                # C8-A：5 常量 + 4 helper（URL 矩阵 + 守卫契约）
    │   ├── lazyOutlet.ts             # C14-B：createLazyOutletLedger（IntersectionObserver 状态机）
    │   └── commitUrl.ts              # C15-B：commitUrl 纯函数（URL 序列化）
    ├── deps/
    │   └── semver.ts                 # C9-A：parseVersion / compareVersions / satisfies
    ├── monitor/
    │   └── errorLedger.ts            # C14-E：createErrorLedger（错误清单 + JS_ERROR_RATE 窗口）
    ├── security/
    │   └── sanitizers.ts             # C10-A：matchAction / readCookie / isIsolateAllowed
    ├── state/
    │   └── helpers.ts                # C11-A：6 helper + 1 constant（键路径 + 序列化）
    └── style/
        ├── fontRegistry.ts           # C14-D：createFontRegistry（@font-face 提升子系统）
        └── cssinjs.ts                # C14-F：prefixSelectors + createCssInJsPatcher
```

## §18. 全量统计（25 commits · 22 候选 · 18 模块 · 2 防漂移测试）

| 维度 | 数 |
|---|---|
| 总 commits（本批 deep dive） | 25（9a97cec chore 起 → cfca7ec） |
| 候选 | 22（沙箱 4 + lifecycle 3 + service 7 + 新视角 6 + C15 2） |
| 新模块文件 | 18 |
| 测试 | 42 文件 / 276 case 全绿 + typecheck 干净（行为零变） |
| 防漂移机器校验 | 2（C16-A 事件契约 / C16-B 依赖方向） |
| 净代码行数 | ~-200 行（关注面收敛价值 > 抽离成本） |
| deletion test | 全部通过（每票 grep inline 定义 0 命中） |

## §19. 可复制方法学（三轮迭代结论）

1. **第一轮信号**：文件行数 + git 热点 → "上帝服务" → helpers 抽离
2. **第二轮信号**：helper 函数数 + 重复定义 → 零依赖 helpers 集中
3. **第三轮信号**：config 接口字段数 + 状态字段密度 → config 拆分 + 状态机独立（闭包工厂）
4. **收敛判据**：服务剩余状态字段全部与"本职"相关（deletion test grep 本职关键字全命中）
5. **第四轮（C16+）**：架构层 friction 饱和后转**契约/约束机器校验**——把人工核对的
   架构不变量（事件契约一致性、依赖方向无环、零依赖叶子）固化为静态层红灯

**C16+ 信号探测结论**（架构层已饱和，换方向）：
- 测试脆弱性 —— 弱（jsdom 真实 DOM 是环境常态，mock 密度仅 2 处）
- config 注入面统一 —— 弱（仅 `appId` 重复，属消费面参数非 config 字段）
- 事件契约覆盖 —— **中**：当前零 drift，但**无自动化防漂移** → 已固化为 C16-A
- 依赖方向（新增信号）—— **中**：依赖图无环，但**无自动化校验** → 已固化为 C16-B

**再下一轮信号建议**（C17+，若继续）：
- 载荷形状契约（events.ts 声明的 payload 类型 vs 实际 emit 载荷字段）
- 事件族调度语义全覆盖（不只 router/navigate，含 message/response 包络族）
- 各服务 config 默认值与文档（CONTEXT.md）一致性校验

## §20. 变更溯源（完整）

| 时间 | 事件 |
|---|---|
| 2026-08-26 | 第一轮 deep dive：4 候选决策树（C1-C4，12 票计划） |
| 2026-08-26~27 | C1-C4 落地 + 测试补齐 |
| 2026-08-27 | 归档本文档 §1-§7 |
| 2026-08-27 | 第二轮：C5-A/B/C lifecycle 深化（KeepAlive / finalize / scopedFetch） |
| 2026-08-28 上午 | 第二轮收口：C6-C12 服务横扫 7 票（helpers 抽离） |
| 2026-08-28 下午 | 检视复核（13 commits 全部验证通过）+ 新视角扫描 |
| 2026-08-28 晚 | 第三轮：C14-A~F + C15-A/B 共 8 票（config 拆分 + 状态机独立） |
| 2026-08-28 | 全量归档本文档 §15-§20 |

daily note 见 `.workbuddy/memory/2026-08-26.md`（317 行）/ `2026-08-27.md`（47 行）/ `2026-08-28.md`（494 行，含全部 22 commits 表 + 20 候选清单）。

---

## §21. 第四轮：C16+ 契约 / 约束机器校验

> **背景**：三轮 deep dive 后架构层 friction 饱和（三个新信号中两个弱）。
> 本轮换方向——把**人工核对的架构不变量固化为静态层红灯**，防止未来 drift。

### §21.1 C16-A · 事件契约机器校验（commit `0b59c94`）

**新增** `tests/event-contract.test.ts`（4 case）：

| 断言 | 内容 | 守护 ADR |
|---|---|---|
| 事件族非空 | events.ts 声明了事件族（非空契约） | — |
| 无孤儿定义 | events.ts 声明的每个事件都有派发/监听点（无死契约） | 基线 §2.4 |
| 无野生事件 | 代码派发的每个事件名都在 events.ts 声明（不绕过契约） | 基线 §2.4 |
| 模板族白名单 | `outlet/changed:{outlet}` 经 `outletEventKey` helper 落键 | ADR-0047/0050 |
| serial 族调度语义 | `router/navigate` 必须声明 `GuardResult \| Promise<GuardResult>` | ADR-0002 |

**提取策略**：
- 定义侧：`'xxx/yyy'(payload` 形式（事件名后跟 `(` = 声明行，排除注释引用）
- 使用侧：`.emit(` / `.on(` / `.serial(` 调用参数内的字符串字面量或模板字面量前缀；
  模板字面量族另经**落键 helper**（`outletEventKey`）调用登记族前缀

**负向验证**：把 `security/violation` 改名 `security/wildcard` → 孤儿 + 野生**双捕获**红灯 ✅

### §21.2 C16-B · 依赖方向机器校验（commit `cfca7ec`）

**新增** `tests/dependency-graph.test.ts`（5 case）：

| 断言 | 内容 | 守护 ADR |
|---|---|---|
| 服务声明非空 | 提取到服务声明（依赖图非空） | — |
| **无环（DAG）** | 依赖图可拓扑排序（Kahn）；循环注入即红灯 | ADR-0054 |
| 零业务依赖叶子 | monitor / security 不 inject 任何服务 | ADR-0054 |
| 核心层不反向依赖 | 核心八服务不依赖 devtools（诊断层不进主路径） | ADR-0011 |
| 核心层完整 | 核心八服务全部声明在案 | ADR-0011 |

**提取策略**：`static provide = 'x'` 之后（下一个 provide 之前）最近的 `static inject = [...]`；
同文件多服务各自成条（devtools.ts 的 DevTools + Hmr）。

**负向验证两组** ✅：
1. monitor 加 `inject=['security']` → 「零业务依赖叶子」红灯
2. security + monitor **双向注入** → 「无环」红灯（真循环注入捕获）

### §21.3 依赖图实测（无环 DAG）

```
L0（零依赖）：security, monitor, harden, suspendScope, style, tracing
L1：bus, deps, router, sandbox, state       (→ security, monitor)
L2：keepAlive                                (→ state, deps, monitor)
L3：lifecycle                                (→ security, sandbox, deps, monitor, state, bus, suspendScope, keepAlive)
L4：devtools, hmr                            (→ lifecycle, monitor, bus, style, security)
```

### §21.4 本轮价值（为什么值得做）

架构不变量（契约一致性 / 依赖方向）此前只能**人工核对**——
而这两类破坏的运行时症状与根因距离极远：

| 破坏类型 | 运行时症状 | 根因定位成本 |
|---|---|---|
| 事件契约 drift | 监听器静默不触发 / 载荷 undefined | 高（跨服务追踪） |
| 依赖环 | 注入 undefined / 启动死锁 | 高（启动时序黑盒） |

固化为静态层红灯后：**改坏即失败**，与 `npm run verify` 同跑（42 文件 / 276 case）。

### §21.5 收口状态

- **25 commits / 22 候选 / 18 新模块 / 42-276 测试全绿**
- 核心服务深化饱和 + 架构不变量机器校验就位
- 下一阶段建议：新特性开发（架构底座已就绪，18 个 seam 模块 + 2 个防漂移断言）

---

## §22. 第五轮：新特性批次（F1 / F3 / F2）

> **背景**：四轮 deep dive 后架构底座就绪（18 seam 模块 + 2 防漂移断言）。
> 本轮换方向做**新特性**——候选不靠空想，靠**三路工程内证据扫描**：
>
> | 证据源 | 扫描方式 | 命中 |
> |---|---|---|
> | 代码内未完成票 | `grep "[0-9]{2} 号票"` + `TODO/FIXME/P1` | 4 项（F1/F3/F4） |
> | 规范文档 P2 清单 | `grep "未实现\|未来\|P2\|P3"` 各 *.md | 8 项（F5-F12） |
> | 测试盲区 | src 文件 vs tests 同名 test | 7 模块无同名 test |
>
> 按「价值 / 工作量」取前三推进：**F1 → F3 → F2**（均属 A 类：代码内已留接入点）。

### §22.1 F1 · bus 多实例精确定向（commit `b119b41`）

**friction**：`communication-protocol.md` §二/§3.1 的 target 携带 instanceId 维度，
实现把 target 平铺为 appId 字符串——同 appId 挂多实例时 dispatch 只能「取最新」。

| 改动 | 内容 |
|---|---|
| `events.ts` | `CordisMessage.targetInstanceId?`（消息携带，DLQ/重放可复现） |
| `SendMessageInput` / `RequestOptions` | 加 `instanceId?`（send / request 均可定向） |
| `bus.resolveTarget`（新） | instanceId 精确匹配优先 → 缺省回退「同 appId 取最新」 |
| 归属校验 | 两者共存时 instanceId 须属于该 appId，否则**不可达死信**（fail-closed 不静默错投） |
| 附带修复 | `findByInstanceId` 定义行缺换行（`{` 与 `for` 同行） |

向后兼容：不破坏既有 `target: string` 形状。+4 case（精确投递 / 归属不符 / request 定向 / 已卸载实例）。

### §22.2 F3 · XHR/EventSource/WebSocket 网络裁决面（commit `76f397d`）

**friction**：`security.md` §六 承诺「fetch/XHR/WS/ES 全覆盖拦截」，`js-sandbox.md` §3.6
要求 XHR 是「open/send 包装：URL 白名单 + traceparent + 埋点」；实现只在构造期**记账**
（一条 violation），不裁决、不注入 traceparent——fetch 之外的网络面等于裸奔。

**中途方向修正**（核对规范后推翻原「删除过渡包装」计划）：删包装只会让覆盖面更窄，
正确落法是**补齐裁决**（用户确认后执行）。

| 层 | 改动 |
|---|---|
| security | 抽 `safeUrl`（协议门 + ws 豁免）复用；新增 `checkNetUrl(appId, url, allowWs?)` **同步**裁决 |
| sandbox | `SandboxOptions.adjudicateNetworkUrl?` 注入位；拆 xhrConstructor / esConstructor / wsConstructor |
| services/sandbox | `create` 默认接线 `security.checkNetUrl`（调用方显式提供则优先） |

关键设计：
- **为什么不是 `bus.network`**：XHR 的 open/send、ES/WS 构造是同步 API，进不了异步链，
  也无法 await `sanitizeURL` 的 adjudicate 超时路径（ADR-0024）。代价：同步面只认精确源
  `net:fetch:{origin}`，拿不到粗授权 `net:fetch`
- 裁决点：XHR 在 `open`（URL 此时才给定，拒绝 = 不 open 且 `send` 抛错）；ES/WS 在构造器
  （拒绝 = 构造抛错，`super` 之前不建立连接）
- 授权面与 fetch 共用 `net:fetch:{origin}`——宿主一套规则覆盖全部网络出口
- traceparent 仅 tracing 启用时注入（未启用不注入：不给应用请求平白增加触发 CORS 预检的自定义头）
- 记账（`sandbox-network-*`）与拒绝（`sandbox-network-*-denied`）分列上报

**破坏性变更**：未配 net:fetch 授权的应用，其 XHR/ES/WS 现被拦截
（`tests/suspend.test.ts` 的 WS 用例已补授权——覆盖面兑现的预期代价）。+6 case。

### §22.3 F2 · state 版本冲突消解四策略（commit `f4e5ca9`）

**friction**：`state-sharing.md` §4.5 要求 ConflictResolver 四策略接入写入管线；
实现在 `setIfMatch` 版本不匹配分支硬编码抛 VERSION_CONFLICT（注释自标 P1 未落地）。

新增 `src/services/state/conflict.ts`（**零状态纯策略**，无 ctx/服务依赖，与 state/helpers.ts 同层）：

| 导出 | 语义 |
|---|---|
| `REJECT_RESOLVER` | 默认（P0 行为不变，抛 VERSION_CONFLICT） |
| `lwwResolver()` | last-write-wins：本地值无条件覆盖 |
| `mergeResolver(merge?)` | merge 策略，缺省 `defaultMerge` |
| `defaultMerge` | 数组 = remote ++ local 去重保序；纯对象 = **递归**逐字段合并；类型不一致 / 深度超限（>8 层）回退 local |

**递归而非浅合并的理由**：仅浅合并会让数组字段被 local 整体覆盖、丢失 remote 内容，
与 §4.5「concat + 去重保序」意图相悖（state 值绝大多数是对象包数组）。

接线：`StateConfig.conflict` → `setIfMatch` 冲突分支；消解值经**同一 commit 管线**
提交（版本原子推进，通知/持久化/跨 tab 语义一致）；权限裁决仍在最前置（消解不绕过）。+6 case。

### §22.4 本批统计

| 维度 | 数 |
|---|---|
| commits | 3（F1 `b119b41` / F3 `76f397d` / F2 `f4e5ca9`） |
| 新模块 | 1（`services/state/conflict.ts`） |
| 新增测试 | +16 case（42 文件 / **292 case** 全绿 + typecheck 干净） |
| 破坏性变更 | 1（F3 网络面拦截：未授权 XHR/ES/WS 被拒） |
| 负向验证 | 每票均做（F1 3 红 / F3 5 红 / F2 3 红），全部还原 |

### §22.5 剩余候选（未推进）

| 类 | 候选 | 备注 |
|---|---|---|
| A | F4 sourcemap 还原 | monitor `errors()` 已留接入点（"随宿主管线接入后在此层应用"） |
| B | F5 SSR 水合 / F6 Angular 适配器 / F7 主题服务 / F8 Trusted Types / F9 PII 管道 / F10 时间旅行 / F11 切换事务 / F12 沙箱硬化 | 规范 P2 清单；F5 是唯一能拉开框架差距的大特性（需单独立项） |
| C | 测试盲区（deps/lifecycle/monitor/security/scopedFetch 等无同名 test） | 非特性；做 F4 或新增 seam 时顺带补 |
