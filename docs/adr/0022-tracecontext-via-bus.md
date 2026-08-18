# TraceContext 由 bus 层贯通，隔离 monitor 实例续接为子 span

ADR-0010 采纳 monitor 按应用隔离后，跨应用调用链（A 应用 scopedFetch → bus 裁决 → B 应用应答）的 W3C TraceContext 会在隔离边界断成两段独立 trace。决策：**bus 是不隔离的公共层，天然是贯通的唯一合法位置**——bus 在 `message/send` 与请求-应答包络上自动注入/携带 `traceparent`（W3C 标准头格式）；接收侧的隔离 monitor 实例遇到带 traceparent 的消息时**续接为子 span** 而非开新 trace。备选"各实例共享全局 trace 注册表"被否：实质上架空了隔离。备选"两条独立 trace 事后关联"被否：让监控文档自己列的高严重性挑战（跨应用错误追踪）无解。
