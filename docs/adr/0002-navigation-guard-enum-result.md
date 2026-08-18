# 导航守卫结果用显式枚举，不用真值判断

路由守卫经 Cordis `serial` 调度。最初以为 `isBailed` 是"任何非 null/undefined 截断"从而推出"返回 false 会被误截断"；ADR-0016 的源码再验证修正了该事实（`isBailed` 对 null/false/undefined 均不截断，且 `bail` 不 await 异步回调）。决策不变，依据更新为：serial 会 await 每个守卫回调，**false 虽不截断但语义含混**（读者无法区分"明确放行"与"忘了返回"），因此守卫结果定为显式枚举 `{type:'proceed'} | {type:'redirect',to} | {type:'abort'}`，返回 `undefined` 才表示不拦截；枚举使守卫意图可静态校验，且与请求-应答包络（ADR-0014）在族边界上清晰分离。备选"约定 falsy 为不拦截"仍被否：隐式契约必然踩坑。
