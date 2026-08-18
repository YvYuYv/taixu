# router/changed 拆分为按槽位事件，全局矩阵仅 root 层可见

router 按槽位隔离只读视图（ADR-0006/0010），但全局 `router/changed` 事件的载荷含**所有槽位**的匹配结果——隔离视图从此事件看到其他槽位，隔离泄漏。决策：每槽位一个事件 `router/changed:{outlet}`，隔离视图只订阅本槽位；全局 `router/changed`（全槽位矩阵）保留给 root 层的 DevTools/monitor（`global: true` 注册），不对应用暴露。备选"按接收者过滤载荷"不可行：Cordis 的 Context.filter 只能过滤"收不收"，不能改载荷内容。基线 §2.4 事件契约随之拆分。
