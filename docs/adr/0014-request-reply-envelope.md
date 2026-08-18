# 请求-应答统一包络 {ok,value,reason}，区分三类失败

`bail` 的 isBailed 语义下，"查无此项"返回 null 会被当作"无应答"继续传给下一个监听者，返回哨兵对象又污染类型——这是 ADR-0002 真值陷阱在应答侧的镜像。决策：请求-应答全族使用统一包络 `{ok:true, value} | {ok:false, reason}`。三态可区分：无应答者（bail 返回 undefined）、应答但查无（`{ok:true, value:null}`）、裁决失败如权限拒绝（`{ok:false, reason}`）。包络与 ADR-0012 的族契约合并为基线的"调度结果契约"一节。

**修正（ADR-0016）**：源码再验证发现两处先前误述——(1) `isBailed` 实际为 `value !== null && value !== false && value !== undefined`，即 **null/false/undefined 三者都表示"不截断"**；(2) `bail` **不 await** 异步回调（返回 Promise 会立即被当真值截断），只有 `serial` await。结论：请求-应答全族统一走 `serial`，应答者同步返回包络或 null/undefined，**永不返回 false**（false 不截断但语义含混）；异步应答者必须先完成内部 await 再返回。ADR-0002 的守卫枚举结论不受影响（serial 语义未变），但其"false 被截断"的论证依据作废，正确依据是"false 不截断但禁止作为放行信号"。

**边界澄清（ADR-0028）**：本 ADR 的包络 + serial 适用于**真·管线**（多方可能应答、顺序敏感，如导航守卫、能力调用）。**单点查询**（只有一个裁决者，如 scopedFetch 的权限裁决）绕过事件调度，走直接服务方法调用 `await ctx.security.check()`——避免 serial 的顺序 await 把高频并发请求串行化。
