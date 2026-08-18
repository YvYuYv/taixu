# isBailed 真实语义与 bail 不 await 的源码核查修正

源码验证（events.ts:6-8, 101-115）：(1) `isBailed(value)` = `value !== null && value !== false && value !== undefined`——**null、false、undefined 三者都表示"不截断"**，不是此前以为的"任何非 null/undefined 都截断"；(2) `bail` 循环里 `Reflect.apply` 的返回值**不 await**——异步回调返回的 Promise 会立即被 isBailed 判定为真值而截断，调用方拿到的是 Promise 而非结果；只有 `serial`（`await Reflect.apply`）会等待异步回调落定再判断截断。结论：请求-应答全族统一走 `serial`（ADR-0014 的"用 bail"修订为"用 serial"）；所有应答者同步返回包络或 null/undefined，**禁止返回 false**（false 不截断但语义含混）；异步应答者必须先内部 await 再返回。此修正影响 ADR-0002、ADR-0014 的论证依据，不影响其决策结论。
