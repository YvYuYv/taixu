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

---

## §23. F4 · sourcemap 还原管线（commit `3c68070`）

> A 类候选（代码内已留接入点）收官：F1 / F3 / F2 / F4 全部落地。

**friction**：`monitoring.md` §二 要求 capture 内 `sourcemap.rewrite(error.stack)`，
§十 契约是「错误清单 sourcemap 已还原」；实现在 capture 直存原始 stack，
`monitor.errors()` 注释自标「随宿主管线接入后在此层应用」——P1 未落地。

**顺带发现的消费面缺口**：`DevToolsSnapshot.errors[]` 只映射
`message/appId/phase`——**stack 根本没传给 DevTools**，即使还原了消费面也看不到。

| 层 | 改动 |
|---|---|
| monitor | 新增 `SourcemapRewriter` 接口 + `MonitorConfig.sourcemap?` 注入位；capture **入库前**重写 stack |
| devtools | `snapshot().errors[]` 补出 `stack` 字段（此前丢失，还原不可见） |
| index | 导出 `SourcemapRewriter` 类型 |

关键设计：
- 还原点在 **capture 入库前**（§十「已还原」= `errors()` 直出结果，查询面不二次重写，
  devtools 复用同一注入实例——唯一数据源，无第二套采集）
- capture 是**同步**入口，故异步 `.map` 加载须由宿主预缓存后同步消费；缓存也归宿主
  （map 解析结果可长期复用，monitor 不引入新状态——第三轮收敛原则）
- 管线抛错 / 返回空值 → 降级原始 stack（不阻断错误采集，**不上报**——避免
  monitor → security → monitor 回环）

**兼容与契约**：未配 sourcemap 时行为完全不变；`DevToolsSnapshot.errors[]` 增加可选
`stack` 字段（devtools.test.ts 严格断言已同步）。

**测试**：新增 `tests/monitor-sourcemap.test.ts`（5 case，**顺带补 monitor 测试盲区**）——
未配管线原始直出 / 入库前重写且查询面不二次重写 / `monitor/report` 事件与 `errors()`
同源（无两套 stack）/ 管线抛错与返回空值均降级 / devtools 复用同管线。
**负向验证**：rewriteStack 恒返回原始 stack → 3 红；已还原。

### §23.1 A 类候选收官统计

| 票 | 特性 | commit | 新增测试 | 破坏性 |
|---|---|---|---|---|
| F1 | bus 多实例精确定向 | `b119b41` | +4 | 否 |
| F3 | XHR/ES/WS 网络裁决面 | `76f397d` | +6 | **是**（未授权网络面被拦） |
| F2 | state 冲突消解四策略 | `f4e5ca9` | +6 | 否（默认 reject = 既有行为） |
| F4 | sourcemap 还原管线 | `3c68070` | +5 | 契约字段新增（snapshot.errors.stack） |

**43 文件 / 297 case 全绿 + typecheck 干净**

### §23.2 剩余候选（B 类，规范 P2 清单——均为中大型，需立项决策）

| # | 特性 | 来源 | 量级 |
|---|---|---|---|
| F5 | **SSR 水合** | route-adaptation §P2（router 服务端解析 → 槽位矩阵 hydration payload） | **大**（唯一能拉开框架差距的特性） |
| F6 | Angular 适配器 | heterogeneous-loading §P2（standalone + AOT） | 中 |
| F7 | 主题服务 + 冲突检测扫描 | style-isolation §P2 | 中 |
| F8 | Trusted Types 全量 | security §P2 | 中 |
| F9 | PII 管道 + 开销自测 | monitoring §P2 | 中 |
| F10 | 服务端同步 + 时间旅行 | state-sharing §P2 | 大 |
| F11 | 切换事务 mountHidden + 后台 TTL 补算 | lifecycle §P2 | 中 |
| F12 | 原型 freeze + customElements 前缀注册 | js-sandbox §P2 | 中 |

### §23.3 C 类（测试盲区，非特性）

无同名 test 的模块：`deps` / `lifecycle` / `security` / `scopedFetch` /
`document-proxy` / `storage`（`monitor` 已由 F4 补上 `monitor-sourcemap.test.ts`）。
均为「经其他 test 间接覆盖」——非阻塞，做 B 类特性时顺带补对应 seam。

---

## §24. F11 / F8 · 可收口单票（B 类前两票）

### §24.1 F11 · 切换事务 mountHidden + reveal（commit `6c38081`）

**friction**：`lifecycle-management.md` §3.3 的切换事务要求「先挂载目标（不可见容器/
占位），成功后再处置当前应用，末步 reveal」——消除「卸 A 挂 B，B 失败页面悬空」与切换
期间的闪烁/中间态。实现里 switch 虽已是「先 mount 后 retire」序，但目标应用**挂在同一
可见容器**上：挂载期与让位期之间存在并排显示/闪烁的中间态。

| 改动 | 内容 |
|---|---|
| `MountOptions.mountHidden?` | 容器以 `display:none` 入 DOM（缺省 false，普通 mount 不变） |
| `createOutletContainer(outlet, shadow, hidden?)` | 第三参透传（public 签名向后兼容） |
| `lifecycle.reveal(instanceId)`（新公开面） | 取消隐藏；未知 id 返回 false 不抛 |
| switch 三步收口 | mountHidden 挂载 → retireCurrent → **finally 内 reveal** |

- `reveal` 置于 `finally`：**retire 失败也照常 reveal**（宁可旧应用残留，不留空白悬空
  窗口），错误照常上抛调用方
- 显隐目标 = shadow 宿主（`shadowRoot.host`）或容器本身；复位用 `display: ''`
  （置空交还宿主样式表，不覆盖宿主 CSS）；`data-tx-mount-hidden` 标记仅供诊断

**顺带核对**：§3.3 同条的「后台标签页 TTL 补算」**已落地**（keepAlive `hiddenAt`/
`hiddenTotal` 记账 + visibilitychange 驱动 + `ttlElapsed` 扣除，
`tests/keepAlive.test.ts:266` 已覆盖）——本票不重复实现。

**测试**：新增 `tests/switch-transaction.test.ts`（8 case，**顺带补 lifecycle 测试盲区**）。
负向验证两组（去掉 mountHidden → 1 红；去掉两处 reveal → 4 红）。

### §24.2 F8 · Trusted Types 纵深（commit `2f291b4`）

**friction**：`security.md` §3.1 要求 TT 作为纵深（DOM XSS sink 拦截）且「框架自身的
innerHTML 写点全部改为安全 API」。此前框架净化结果（DOMPurify 产物）是裸 string：
宿主一旦启用 `require-trusted-types-for 'script'`，所有 HTML sink 赋值（应用 innerHTML /
iframe srcdoc）都会抛 TypeError——**TT 纵深等于不可用**。

| 层 | 改动 |
|---|---|
| 新模块 | `services/security/trustedTypes.ts`（零依赖纯模块 + 策略单例缓存） |
| config | `SecurityConfig.trustedTypes?: { policyName? }`（默认 `taixu#html`） |
| 服务面 | `security.sanitizeToTrustedHTML(html)`：净化在前、包装在后 |
| 接线 | 沙箱 document 的 HTML sink trap + iframe `srcdoc`（框架自身唯一真写点） |

**关键发现**：**DOMPurify 已内建 TT 支持**——检测到 `window.trustedTypes` 时它自建
`dompurify` 策略并直接返回 `TrustedHTML`。故框架**不再二次包装**（否则把 TrustedHTML
当 string 再喂 `createHTML`）；框架侧包装是**兜底面**，覆盖 DOMPurify 未返回
TrustedHTML 的情形（版本/配置差异）与安全降级转义路径。

**降级**：TT 不可用（Firefox/Safari/jsdom）或策略创建失败（CSP 未允许该名）→ 返回
string，行为与启用 TT 前完全一致；不抛、不削弱净化。

**测试**：新增 `tests/trusted-types.test.ts`（8 case：适配器直测 + 服务面 + 应用写点 +
iframe srcdoc）。负向验证：`toTrustedHTML` 的 `createHTML` 改为恒返回入参 → 3 红。

### §24.3 两票统计

| 票 | commit | 新增模块 | 新测试文件 | +case |
|---|---|---|---|---|
| F11 | `6c38081` | — | `switch-transaction.test.ts`（补 lifecycle 盲区） | 8 |
| F8 | `2f291b4` | `security/trustedTypes.ts` | `trusted-types.test.ts`（补 security 盲区） | 8 |

**45 文件 / 313 case 全绿 + typecheck 干净**

---

## §25. F5 · SSR 水合立项（方案先行，未实现）

> 大特性按用户节奏「可收口单票先行，SSR 水合最后立项」——本轮只出**方案**，不实现。
> 完整规格与票拆分在**本地 issue tracker** `.scratch/ssr-hydration/`（按 AGENTS.md 约定，
> `.scratch/` 受 .gitignore 保护、不进版本控制）；本节记录立项的**关键结论**以便追溯。

### §25.1 现状调研（实测，非推测）

| 项 | 状态 | 位置 | 对 SSR 的意义 |
|---|---|---|---|
| URL 解析 helpers | ✅ 纯函数、零 DOM 依赖 | `router/parsers.ts` | 服务端可直接复用——**杜绝双实现 drift** |
| `__tx_outlets` 矩阵形态 | ✅ 已存在 | `router.ts:221-222`（popstate 快照恢复） | hydration payload **复用同形**，零新契约 |
| 矩阵初始化 | ❌ **硬依赖 `window.location`** | `router.ts:119 initFromLocation()` | 核心障碍：需改造为**源可注入** |
| 槽位消费面 | ✅ 已存在 | `router.watch()` + `outlet/changed:{outlet}` | 需补「首次 watch 直取」 |
| 子应用服务端渲染 | ❌ 依赖应用侧 ESM + 无浏览器依赖 | 应用侧 | 阶段 2 前置，框架无法强制 |

### §25.2 设计要点

- **payload 形态**：`<script type="application/json" id="tx-hydration">`（JSON script 而非
  全局变量——便于 CSP nonce）；`{ url, outlets }`，`outlets` 与 `__tx_outlets` 同形
- **query 不进 payload**：query 由客户端从 URL 现取——避免敏感 query 落进 HTML
  （security §3.2 `sanitizeQuery` 同源顾虑）
- **CSR 单一入口**：hydration 与 location 只能有一个初始化入口，杜绝双源竞态（应用挂载两次）
- **水合不一致 → 以客户端 URL 为准**（页面实际地址不可违背）+ violation 留痕，不阻断启动
- **首次 watch 直取**：水合态下槽位已就绪，watch 注册即回调——否则应用「等首次
  outlet/changed 再渲染」的写法永远等不到（首屏不挂载，SSR 白干）
- **同构模式 adopt**：容器已有 SSR 内容（`data-tx-ssr="1"`）时走接管而非重建，避免
  首屏闪烁（标记约定与 F11 的 `data-tx-mount-hidden` 同源）

### §25.3 分期票（`.scratch/ssr-hydration/issues/`）

| 票 | 内容 | 量级 | 前置 |
|---|---|---|---|
| 01 | router 解析源可注入（hydration 入口 + 回落 location） | 小 | — |
| 02 | payload 读取 + 形态校验 + 一致性 mismatch 处理 | 中 | 01 |
| 03 | 首次 watch 直取（水合态立即回调） | 小 | 02 |
| 04 | 同构模式：SSR 内容 adopt 而非重建 | **大**（依赖应用侧改造） | 03 |
| 05 | 测试（水合命中/回落/mismatch/首次 watch）+ 文档同步 | 中 | 01-04 |

**建议节奏**：先做阶段 1（01+02+03+05），落地后出应用适配指南，再评估 04
（同构模式依赖生态推动，非纯框架工作）。

### §25.4 验收底线

1. 注入 payload → 应用 `mount` 恰好一次（零双重挂载）
2. **未注入 payload → 行为与改动前完全一致**（既有 313 case 全绿是底线）
3. mismatch → 以 URL 为准 + 留痕，不阻断
4. deletion test：服务端解析无第二套实现（`parsers.ts` 单一来源）

---

## §26. B 类单票收官（F6 / F7 / F9 / F12）

### §26.1 F6 · Angular 适配器（commit `4fe18c2`）

**friction**：heterogeneous-loading §4.2 的 Angular 路线（P2 实验性）只有「可行性
诚实化」结论，无实现——宿主无从接入。

| 设计点 | 内容 |
|---|---|
| 零硬依赖 | `@angular/core` 经 `deps.negotiate(range, { singleton, strict })` 仲裁获取（框架不 import Angular） |
| 错误边界走 DI | `createApplication({ providers })` 阶段注入 `ErrorHandler` -> `monitor.capture` |
| async effect 静默失败显式化 | cordis 对 async effect 错误是 `task.catch(logger.error)`——适配器 try/catch 先上报再上抛 |

**顺带修复（F6 曝出）**：`deps/semver.ts` 的 `satisfies` **不支持 `*` 通配符**
（落到精确比较恒 false）——共享依赖声明「任意版本」时仲裁永远无匹配，strict 模式下
宿主看到的是「依赖缺失」而非真正的版本问题。现支持 `*`/`x`/`X`。

### §26.2 F7 · 主题服务 + 冲突检测扫描（commit `d9980f8`）

- **ThemeService**（provide='theme'，零服务依赖 L0）：配置即初始主题；`:root` 的
  `--tx-*` **唯一写点**；主题变更应用自动响应（CSS 自定义属性特性，**无事件广播**——
  正是旧版 `theme/change` 事件与静态配置两套并存被统一掉的原因）；prefers-color-scheme
  内聚（followSystem 时 dark/light 叠加 base，默认不跟随）
- **冲突检测扫描**（`devtools.scanStyleConflicts()`，§八）：扫描 styleSheets，选择器
  命中元素归属 ≥2 应用即上报 `{ selector, apps, hitCount }`；跨源 sheet 与非法选择器
  跳过；分组规则递归下探；只读、仅开发/诊断路径

### §26.3 F9 · PII 管道 + 开销自测（commit `2e4ef81`）

- **PII 管道**（`monitor/pii.ts` 零状态纯模块）：`redactUrl`（query 敏感键掩码，
  相对路径同脱敏）/ `redactText`（key=value / JSON / `k: v` 三形态，**不做整段猜测性
  替换**——过度脱敏毁掉排障价值）/ `newSessionId`（CSPRNG 不指纹）/ `dntEnabled`
- 接线：`MonitorConfig.privacy?` -> capture **入库前**脱敏（errors() 直出已脱敏结果）
- **开销自测**（§九）：`MonitorConfig.overhead?` 抽样测量单事件 capture 耗时，超预算
  周期上报 `MONITOR_OVERHEAD`（deny-by-default，需注册 alertRules）；未配置零开销

实现中修掉两个自伤 bug：默认掩码 `[REDACTED]` 会被 URLSearchParams 编码成 `%5B..%5D`
（改 `REDACTED`）；`String.replace` 回调第 4 参是 offset 而非捕获组（误用致掩码后缀
残留字符）。

### §26.4 F12 · 原型守护（commit `b25157a`）—— **与规范的偏差记录**

- `DEFAULT_FREEZE_TARGETS`（11 个内建原型）+ `freezePrototypes`（幂等、进程级不可逆、
  先于应用加载）+ `createCordis({ prototypeGuard })` 接线
- customElements 前缀注册（向量 #9）此前已落地并有测试，不重复实现
- **⚠️ 与规范「默认冻结」的偏差**：默认改为 **opt-in（关闭）**。实测全量冻结与
  **cordis 运行时自身不兼容**——cordis 内部存在对对象 `constructor` 的写点（外部依赖
  不可修），默认开启时 **81/343 用例失败**。按 §3.3「可用性优先」收敛：宿主显式开启
  前须完成自有兼容性验证（实验性）。规范已同步偏差说明。

### §26.5 四票统计

| 票 | commit | 新增文件 | +case | 特别产出 |
|---|---|---|---|---|
| F6 | `4fe18c2` | `angular-adapter.ts` + semver 测试 | 5 | **semver `*` 通配符修复** |
| F7 | `d9980f8` | `services/theme.ts` | 9 | 新服务（第 20 个） |
| F9 | `2e4ef81` | `monitor/pii.ts` | 12 | 修 2 个自伤 bug |
| F12 | `b25157a` | — | 4 | **规范偏差实测记录** |

**49 文件 / 343 case 全绿 + typecheck 干净**。B 类剩余：F10 时间旅行 / F5 SSR 水合
（已立项，阶段 1 实施中）/ F6 的 Vue2 与 AMD 命名空间子项。

---

## §27. F5 · SSR 水合阶段 1 落地（F5-01 / F5-02 / F5-03）

> 立项（§25）后的实施。阶段 1 = 基础模式（主应用 SSR + 子应用 CSR）的框架侧全部能力。

| 票 | commit | 内容 |
|---|---|---|
| 01 | `fd9052b` | `RouterConfig.initialUrl?`：解析源可注入（缺省回落 location，零变化）；注入后为**唯一源**——hydration 与 location 不再并存（无双源竞态 → 应用挂载恰好一次） |
| 02 | `19e2a69` | `readHydrationPayload`（DOM 读取 + 形态校验，fail-closed null）+ `hydrationMismatch`（**以客户端 URL 为准**）；宿主接入 = \`initialUrl: mismatch ?? payload.url\` 一行 |
| 03 | 核对 | **已天然满足，无需实现**——\`watch()\` 本是 reactive coeffect（ADR-0047 首跑同步取值），水合态下注册即拿到位置 |

**关键设计修正（相对立项票 02 的原设想）**：**不做 initialOutlets 矩阵直注**——
payload.outlets 仅供服务端/诊断对账，客户端矩阵仍从 initialUrl 单一源解析（否则重新
引入 01 要消灭的双源竞态）；mismatch 新事件族需求随之消解（不新增契约）。

**验收对照（spec §六）**：注入 payload 意图恰好一次 ✅ / 未注入行为不变 ✅（348 case
全绿含全部既有用例）/ mismatch 以 URL 为准 + 端到端用例 ✅ / 首次 watch 直取 ✅（既有
ADR-0047 语义）/ 解析单一来源 ✅（parsers.ts，无第二套）。

**剩余**：04 同构 adopt（依赖应用侧生态推动，需先出适配指南）/ 05 文档同步已完成
（route-adaptation §六/§七已标注）。
