# bus.send 默认 fire-and-forget，背压走显式 sendAndWait 或 request

ADR-0041 把发送改成服务方法，但服务方法的同步性引出背压问题：bus 内部投递若 await 接收者的异步处理，高频发送路径（日志流）被最慢接收者拖累。决策：`ctx.bus.send` 默认 **fire-and-forget**（同步返回，投递即完成）——消息语义本就是"发送即忘"；需要送达确认的用 `bus.request`（请求-应答，ADR-0014）而非 send；显式提供 `bus.sendAndWait` 供需要背压的场景（如批量数据同步），但默认路径不背压。备选"send 一律 await 所有接收者"被否：背压强加给所有发送者，高频日志流阻塞主线程。
