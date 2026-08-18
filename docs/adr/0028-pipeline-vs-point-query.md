# 区分管线调度与单点查询：scopedFetch 裁决绕过 serial 走服务方法

ADR-0014 的请求-应答用 serial——但 serial 顺序 await 会把高频并发请求（100 个并发 fetch 的裁决）串行化，总延迟 = Σ 每个裁决耗时。决策：**区分两种调度语义**——(a) 真·管线（多方依次表态、顺序敏感），如导航守卫，用 serial + 枚举/包络；(b) **单点查询**（只有一个裁决者，不存在多方表态），如 scopedFetch 的权限裁决，用直接服务方法调用 `await ctx.security.check()`，不经事件调度。ADR-0014 适用范围收窄为 (a)；scopedFetch 高频路径走 (b)，并发请求并发裁决。这是 ADR-0014 的边界澄清，非推翻。
