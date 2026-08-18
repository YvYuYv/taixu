# 03 - 挂载事务 + deps 最小加载（探针首挂全链路）

**What to build:** 宿主声明应用清单后，`lifecycle.mount(appId, outlet)` 走一次可取消的挂载事务把探针应用（经沙箱）挂进槽位：同槽位事务互斥、AbortSignal 全链透传、失败按策略重试或降级。deps 服务最小实现（清单校验 + 入口直载，不做共享仲裁矩阵）。security 延迟就绪时全部应用停留 PENDING（fail-closed，ADR-0009）；scopedFetch 在沙箱创建后、plugin() 前注入（ADR-0005）。

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] outlet 级挂载事务：promise 链互斥（同槽位串行、跨槽位并行）、无唤醒竞态
- [ ] AbortSignal 取消：挂载中途 abort 不留半挂载现场
- [ ] deps 最小加载：manifest 校验 + 入口加载（单版本直载；importmap 仲裁矩阵不在本票）
- [ ] scopedFetch 注入时机：应用代码首次执行前拦截链就位（权限接线在 11 验收）
- [ ] fail-closed：security 延迟就绪 -> 应用全部 PENDING，无一挂载
- [ ] 错误恢复：重试主体 = 重走挂载事务（指数退避），fallback 应用 / ErrorOutlet 降级
- [ ] fiber 状态派生对外三态（Active/Suspended/Disposed），不另存平行状态字段
