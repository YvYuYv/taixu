# 挂起域登记五类副作用，fetch 不冻结，残余行为如实成文

SuspendScope 若只登记 timer/rAF，"冻结"语义是漏的；若全量登记则变成迷你浏览器调度器。决策：登记五类——timer、rAF、requestIdleCallback、三类 observer（Intersection/Mutation/Resize）、WebSocket（挂起即 close 并标记，恢复后由应用重连，WS 消息不经挂起队列）。**fetch 不冻结**：响应回调照常执行（网络栈的诚实语义），应用需在回调中检查挂起标志，文档显式声明"挂起期间到达的响应可能基于陈旧状态"。其余不可冻结项（播放中的媒体、未 settle 的 Promise 链）写入生命周期文档"挂起语义边界"一节——不假装完全冻结。
