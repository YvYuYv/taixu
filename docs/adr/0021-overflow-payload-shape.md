# bus/overflow 携带合并键清单与丢弃计数

ADR-0008 要求应用收到 overflow 后"主动重拉"，但应用不知道丢了哪些键。决策：`bus/overflow` 载荷为 `{coalescedKeys: string[], droppedCount: number}`——被合并的状态键是可列举的（合并表就在队列里），普通丢弃消息无法列举、只给计数。应用对 coalescedKeys 中自己关心的键重拉，对 droppedCount 做告警上报（普通消息语义上不可重放）。备选"应用无脑全量重拉 watch 键"被否：N 应用 × M 键的重拉风暴。备选"框架维护订阅注册表按表重推"被否：与 ADR-0001"不维护手工注册表"的决策精神冲突。
