# isolate 白名单：router 视图（按槽位）与 monitor（按应用）

`ctx.isolate` 的合法用途收束为两条并写进对齐基线作为白名单：(a) 按槽位隔离的只读 router 视图；(b) 按应用隔离的 monitor——错误归因是横切痛点，monitor 实例无共享态，隔离收益确凿。明确拒绝 security 按应用隔离：权限裁决必须全局一致，独立实例会让"全局封禁某 API"需要在 N 个实例上同步执行，出现裁决漂移。今后新增 isolate 用途必须先修改对齐基线，再改文档。

**边界注记（ADR-0045）**：monitor 按应用隔离的隔离边界画在**主动上报入口**（`ctx.monitor.capture/metric/trace` 自动带 appId 归因）；被动事件监听（`app/error` 等）以 `global:true` 在 root 上下文注册、隔离实例收不到 root 广播（Cordis 事件按 isolate 过滤），统一在 root sink 层做、归因靠载荷 appId。即"应用→monitor"入口隔离，"事件→monitor"入口不隔离。
