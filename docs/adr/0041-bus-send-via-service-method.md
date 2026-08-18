# 消息发送改 bus 服务方法鉴权，接收保持事件订阅

基线 §2.5 的消息路由是"发送方 emit `message/send` 冒泡到根，bus 以 global:true 监听再投递"——但 emit 是 fire-and-forget，任何应用都能窃听全部消息、伪造发送者。与 ADR-0035"鉴权走服务方法"原则冲突。决策：发送改 `ctx.bus.send(msg)` 服务方法（内部鉴权：只能以真实 appId 发送，不能伪造 source）；接收保持 `ctx.on('message/receive')`（被动订阅无鉴权需求）。备选"维持冒泡但声明可窃听"被否：在信任分级安全基线下不可接受。基线 §2.5 随之修订。
