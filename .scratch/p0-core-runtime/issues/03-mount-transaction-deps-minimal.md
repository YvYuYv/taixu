# 03 - 挂载事务 + deps 最小加载（探针首挂全链路）

**What to build:** 宿主声明应用清单后，`lifecycle.mount(appId, outlet)` 走一次可取消的挂载事务把探针应用（经沙箱）挂进槽位：同槽位事务互斥、AbortSignal 全链透传、失败按策略重试或降级。deps 服务最小实现（清单校验 + 入口直载，不做共享仲裁矩阵）。security 延迟就绪时全部应用停留 PENDING（fail-closed，ADR-0009）；scopedFetch 在沙箱创建后、plugin() 前注入（ADR-0005）。

**Blocked by:** 01, 02

**Status:** resolved

- [x] outlet 级挂载事务：promise 链互斥（同槽位串行、跨槽位并行）、无唤醒竞态
- [x] AbortSignal 取消：挂载中途 abort 不留半挂载现场
- [x] deps 最小加载：manifest 校验 + 入口加载（单版本直载；importmap 仲裁矩阵不在本票）
- [x] scopedFetch 注入时机：应用代码首次执行前拦截链就位（权限接线在 11 验收）
- [x] fail-closed：security 延迟就绪 -> 应用全部 PENDING，无一挂载
- [x] 错误恢复：重试主体 = 重走挂载事务（指数退避），fallback 应用 / ErrorOutlet 降级
- [x] fiber 状态派生对外三态（Active/Suspended/Disposed），不另存平行状态字段

## Answer

已交付（`npm test` 48/48 绿，tsc 0 错）：

- `src/services/lifecycle.ts` LifecycleService：挂载事务（outlet 级 promise 链互斥，mount/destroy 共用锁）、AbortSignal 全链检查（deps 后/沙箱后/激活完成点——激活期取消同样级联清理）、失败级联清理（fiber dispose -> 沙箱销毁 -> 容器移除，`cascadeCleanup` 单一形状）、`app/loading -> app/ready -> app/error -> app/disposed` 事件序（载荷按基线 §2.4）、getAppState 从 fiber.state 派生（§2.3 小写对外态，无平行字段）、错误恢复（重试=重走完整事务新 fiber、指数退避经配置注入、fallbackAppId 传播调用方 signal、ErrorOutlet 转义渲染+重试按钮）。
- `src/services/deps.ts` DepsService：清单存在性校验 + 入口工厂直载（Plugin.Function/Object 均可）、signal "结果作废+未开始不再开始"。
- `src/index.ts`：defineApp(appId, entry)、apps/recovery/outlets 配置、deps+lifecycle 挂入 createCordis。
- `tests/mount-transaction.test.ts`：15 条主缝断言（互斥真串行/激活期 abort/降级三路/destroy 级联）。

裁剪声明：lifecycle `static inject` 本票为已有四服务（security/sandbox/deps/monitor），router/bus/state 在 05/06/07 号票落地后补入（ADR-0054 依赖方向不变，时序渐进）。

## Comments

- **/code-review 双轴结论（均已修复或裁定）**：
  - 补 `app/error` 事件（基线 §2.4 契约，旁听者可感知失败）。
  - destroy 接入 outlet 锁（§2.2 "含其 unmount"）+ 锁内复查幂等；锁表链尾回收。
  - 激活期 abort：fiber settle 后检查 signal，作废结果并级联清理（测试覆盖）。
  - fallback mount 传播调用方 AbortSignal（不再脱离取消链）。
  - 级联清理重复代码收敛为 cascadeCleanup；LifecycleConfig 去掉死继承的 apps；getAppState 用显式 AppExternalState 联合（§2.3 小写形式，非 FiberStateName 大写枚举）。
  - **`app/disposing` 裁定不加**：lifecycle-management §3.2 有此事件但基线 §2.4 契约无——冲突时基线赢（AGENTS.md 规则）；文档该行属待修订项，留待 12 号票机器验证时统一清理。
  - fail-closed 测试以应用 inject 缺失服务模拟 PENDING（security 真延迟场景需服务替换时序，11 号票 fail-closed 全链路验收覆盖）。
