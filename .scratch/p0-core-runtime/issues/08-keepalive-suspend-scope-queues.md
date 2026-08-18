# 08 - 保活：默认挂起 + SuspendScope + 消息队列

**What to build:** 应用切换时默认走挂起而非销毁（ADR-0020）：挂起仲裁单点于 lifecycle（来源分级：路由 > 系统信号 > 命令；恢复分级覆盖，ADR-0018/0031/0035），SuspendScope 冻结定时器/监听（包装函数查挂起注册表，ADR-0027/0032），样式节点摘除缓存、恢复还回（ADR-0033），挂起期间发给该应用的 bus 消息进入有界队列（上限 1000、同键合并、溢出上报 `bus/overflow`），恢复时按全序回放（50/帧，ADR-0015/0021）。

**Blocked by:** 04, 05, 07

**Status:** ready-for-agent

- [ ] 挂起意图走 `lifecycle.requestSuspend/Resume` 服务方法（可鉴权可拒绝；`app/intent:*` 事件不存在，ADR-0035）
- [ ] 仲裁单点：来源分级与恢复分级覆盖（系统信号恢复 < 命令恢复；路由挂起优先级最高）
- [ ] SuspendScope 五类注册：timers（含 injectTimers 闭包 appId）、事件监听、observers、requestIdleCallback、WS 断连关闭
- [ ] 默认挂起：keepalive 未配置的切换也走挂起（回程零冷启动）
- [ ] 挂起队列：上限 1000、FIFO 丢最旧、同键 coalesceKey 合并、溢出投 `bus/overflow {coalescedKeys, droppedCount}`
- [ ] 回放：50/帧分批、回放期间新消息入队尾保持全序；监听保留（挂起不清理监听）
- [ ] 样式节点（shadow 内 + head 内）挂起摘除缓存、恢复还回零闪烁
- [ ] 诚实边界：fetch 不冻结、媒体元素暂停、Promise 链继续（文档声明的不冻结清单）
