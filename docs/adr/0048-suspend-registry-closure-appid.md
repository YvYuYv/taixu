# 挂起注册表的 appId 由沙箱实例创建期闭包捕获

ADR-0032 的 `suspendRegistry.isSuspended(appId)` 需要知道"当前调用属于哪个应用"。决策：沙箱按应用实例化（基线 §2.2），创建时把 appId **闭包捕获**进该应用的所有包装函数——appId 是沙箱实例的固有属性，不需要运行时推断。备选"维护当前执行上下文栈（zone.js 式）"被否：异步回调（Promise.then、setTimeout 回调）里上下文丢失；备选 stack trace 推断被否：不可靠且严格模式禁用。此为 ADR-0032 的实现注记，显式声明以避免实现者去造上下文追踪。
