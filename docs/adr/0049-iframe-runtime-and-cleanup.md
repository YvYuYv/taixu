# iframe 内跑精简 Cordis 运行时，卸载经 heartbeat 感知按 appId 批量清理

ADR-0043 的代理 ctx 桥接留下问题：iframe 应用注册的 effect 归属哪侧 fiber？决策：iframe 内跑**精简 Cordis 运行时**（fiber/effect 本地管理），代理 ctx 只桥接**服务调用**（bus.send、state.set、monitor.capture）；iframe 卸载（正常 dispose 或崩溃）时主框架经 heartbeat/Unload 事件感知，按 appId **批量清理**主框架侧为该应用注册的所有资源（消息订阅、状态键权限、挂起注册表条目）。备选"影子 fiber 状态同步"被否：分布式状态机一致性噩梦；备选"所有副作用桥接到主框架"被否：setInterval 也桥接性能不可接受。已知限制：iframe 崩溃（非正常 dispose）靠 heartbeat 超时感知，清理延迟 ≈ heartbeat 周期（默认 5s）。
