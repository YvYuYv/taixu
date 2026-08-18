# 挂起/恢复意图走 lifecycle 服务方法鉴权，不走全局事件

ADR-0018 把挂起/恢复意图建模为全局事件——但 emit 是 fire-and-forget，任何应用都能 emit `app/intent:suspend` 把别的应用挂起，是权限黑洞，且无法在 emit 路径上拦截。决策：挂起/恢复意图**改为 lifecycle 的服务方法调用** `ctx.lifecycle.requestSuspend(instanceId, reason)` / `requestResume(instanceId)`，方法内部经 security 鉴权（发送者只能操作自己的 instanceId，root/系统来源除外）；系统信号（Page Visibility 等）由 lifecycle 自己在 root 上下文监听，不经任何应用。ADR-0018 的"意图事件"措辞修订为"意图方法调用"；基线 §2.4 的 `app/intent:*` 事件契约随之删除。
