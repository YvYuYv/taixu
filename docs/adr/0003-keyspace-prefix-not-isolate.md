# Local 键空间用键前缀实现，不用 ctx.isolate('state')

原设计用 `ctx.isolate('state')` 给每个应用隔离状态服务。这是概念误用：isolate 是服务级注入遮蔽，隔离后每个应用拿到的是**独立的 state 服务实例**（整个存储分离），而非同一存储内的键前缀私有域，且会破坏 `shared:` 层的跨应用可见性。Local 私有域改为键前缀 `local:{appId}:` + Fiber 归属校验实现；`ctx.isolate` 保留给真正需要独立服务实例的场景（按槽位的只读路由视图）。
