# iframe 沙箱不复制能力面，应用拿代理 ctx 经 postMessage 桥接

版本分裂强制 iframe 沙箱（ADR-0038），但 scopedFetch/挂起注册表/样式拦截都挂在 Proxy 沙箱的 window 上，iframe 是真实另一个 window，两套沙箱的能力面不对称。决策：iframe 沙箱**不复制能力面**——iframe 内应用拿到的是**代理 ctx**，对 `ctx.bus.send`、`ctx.state.set` 等调用序列化后经 postMessage 转发到主框架执行、结果回传；所有能力调用异步化（跨边界的诚实语义）。备选"iframe 内重建完整能力面"被否：等于跑第二套框架；备选"iframe 不支持保活"被否：版本分裂往往是业务刚需。异构加载文档须补"iframe 沙箱 = 代理 ctx 桥接"一节。
