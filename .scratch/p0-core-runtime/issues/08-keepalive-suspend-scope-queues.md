# 08 - 保活：默认挂起 + SuspendScope + 消息队列

**What to build:** 应用切换时默认走挂起而非销毁（ADR-0020）：挂起仲裁单点于 lifecycle（来源分级：路由 > 系统信号 > 命令；恢复分级覆盖，ADR-0018/0031/0035），SuspendScope 冻结定时器/监听（包装函数查挂起注册表，ADR-0027/0032），样式节点摘除缓存、恢复还回（ADR-0033），挂起期间发给该应用的 bus 消息进入有界队列（上限 1000、同键合并、溢出上报 `bus/overflow`），恢复时按全序回放（50/帧，ADR-0015/0021）。

**Blocked by:** 04, 05, 07

**Status:** done

- [x] 挂起意图走 `lifecycle.requestSuspend/Resume` 服务方法（可鉴权可拒绝；`app/intent:*` 事件不存在，ADR-0035）
- [x] 仲裁单点：来源分级与恢复分级覆盖（系统信号恢复 < 命令恢复；路由挂起优先级最高）
- [x] SuspendScope 五类注册：timers（含 injectTimers 闭包 appId）、事件监听、observers、requestIdleCallback、WS 断连关闭
- [x] 默认挂起：keepalive 未配置的切换也走挂起（回程零冷启动）
- [x] 挂起队列：上限 1000、FIFO 丢最旧、同键 coalesceKey 合并、溢出投 `bus/overflow {coalescedKeys, droppedCount}`
- [x] 回放：50/帧分批、回放期间新消息入队尾保持全序；监听保留（挂起不清理监听）
- [x] 样式节点（shadow 内 + head 内）挂起摘除缓存、恢复还回零闪烁
- [x] 诚实边界：fetch 不冻结、媒体元素暂停、Promise 链继续（文档声明的不冻结清单）

## Answer

- **挂起仲裁**（`src/services/lifecycle.ts`）：`requestSuspend(caller, instanceId, reason, source)` / `requestResume(caller, instanceId, source)`。鉴权 `assertOperable`（root fiber 受信例外，否则只能操作自己 appId 的实例）；挂起并集（`suspendSources` Set）、恢复按 `SOURCE_PRIORITY`（route 3 > system 2 > command 1）清除全部 ≤ 自身优先级的挂起。`SuspendReason`/`SuspendSource` 显式枚举类型（events.ts），无字符串 cast、无 bail。
- **挂起动作**：`suspendRegistry.suspend(appId)`（`src/suspend.ts` 共享查询点，唯一写入方 lifecycle，ADR-0048）+ `sandbox.freeze()` + 容器摘离 + head 内 `style/link[data-cordis-app]` 摘除缓存（ADR-0033）+ `app/suspend` 事件；fiber 保持 ACTIVE，`getAppState` 派生 'suspended'。恢复对称还回 + `app/resume` + LRU 键刷新。
- **SuspendScope**（`src/sandbox.ts`）：定时器账本（freeze 保留剩余时长、unfreeze 续期重排）；事件监听经 WeakMap 包装门控（函数与 `{handleEvent}` 对象两形态，remove 同引用解绑）；三类 observer 构造器回调门控；requestIdleCallback 挂起期返回 -1；WS 挂起 close(1000) 记录描述符（重连在 09 号票）。
- **switch 默认保活**（ADR-0020）：未配置 keepalive 的切换走挂起；切回已挂起应用 = 恢复既有实例（同 instanceId，零冷启动），不重新挂载。
- **挂起队列**（`src/services/bus.ts`）：send/dispatch 与广播路径对挂起实例入队；上限 FIFO 丢最旧（默认 1000）、`metadata.coalesceKey` 同键合并（旧值移除、最新值入队尾，保持时间序）；恢复回放每帧 50 条（`app/resume` global 监听触发，回放中新消息入队尾保全序，ADR-0015）；溢出双路上报 `bus/overflow {coalescedKeys, droppedCount}`（ADR-0021）；dispose 清队列。LRU 键经 `BusInstance.touch` 在 message 投递时刷新（§5.4）。

## Comments

- 双轴审查（Standards + Spec）发现并已修复：coalesce 应"移除旧值 + 最新入队尾"（我最初实现为旧位替换，与 §5.5 时间序语义冲突）；`switch` 切回已挂起应用曾冷挂载新实例（违反"回程零冷启动"）；`handleEvent` 对象形态监听器曾绕过门控；`reason` 自由字符串经 cast 伪装成枚举（已建 `SuspendReason` 类型）；`coalesceKey` 顶层字段与文档 `message.metadata.coalesceKey` 不一致（已对齐）。
- 遗留到后续票：WS 重连（09 号票恢复通道）；LRU 驱逐执行（10 号票，本票已备 `lastAccessAt` 键与 touch 刷新）；`keepAlive: false` 显式销毁（10 号票）。
- 测试面说明：定时器/监听门控经 `instance.sandbox.proxy`（= 应用执行环境的 globalThis 替身，即应用视角）断言；`fiberStateName` 取代魔数断言；11 个主缝测试 + 全量 111 绿灯。
