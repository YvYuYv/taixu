# 基线 §2.3 依赖方向图重画，lifecycle 为唯一高层编排者

基线 §2.3 的旧依赖图未反映 ADR-0009（security 是 lifecycle 的 inject 依赖）、ADR-0023（state 监听 app 事件不 inject lifecycle）、ADR-0028/0041（单点查询/消息发送走服务方法）的最新关系。决策：重画 §2.3——monitor/security 无依赖最先可用；bus/state/deps/sandbox/router inject security；**lifecycle 是唯一可 inject 多服务的高层编排者**（inject security/router/sandbox/bus/state/deps/monitor）。关键不变量：monitor/security 不 inject 任何业务服务；router 不 inject lifecycle（事件解耦）。
