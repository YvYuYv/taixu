# 状态监听走事件订阅，不做手工退订登记

状态共享的 watch 原设计为 `ctx.effect` 内手工维护退订函数表。已改为直接 `ctx.on('state/changed', listener)` 加键过滤，因为 Cordis 的 `ctx.on` 内部即经 `fiber.effect` 登记，Fiber dispose 时自动退订；手工登记是冗余且引入了第二套生命周期真相源。
