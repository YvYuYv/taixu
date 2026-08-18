# 隔离 monitor 的边界画在采集入口，聚合汇于 root 单例 sink

ADR-0010 的 monitor 按应用隔离若连存储/上报也隔离，全局仪表盘和 DevTools 全局视图就无解。决策：隔离的边界只在**采集入口**（自动打 appId 归因、traceparent 续接为子 span）；N 个隔离实例把带 appId 的数据汇入 monitor 内部一个**不隔离的 root 单例聚合 sink**，全局仪表盘/DevTools 从 sink 读取。备选"各实例独立上报后端、后端聚合"被否：本地 DevTools 看不到全局视图。备选"DevTools 遍历 fiber 树拉数据"被否：违反分层。
