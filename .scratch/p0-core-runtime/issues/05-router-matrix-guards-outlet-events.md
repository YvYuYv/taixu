# 05 - 路由：URL 矩阵 + 守卫枚举 + 槽位事件族

**What to build:** 宿主经 router 驱动导航：URL 变为多槽位矩阵（`__tx_` 前缀、槽位参数合并不互抹），导航走 serial 事件触发 lifecycle 挂载，守卫以显式枚举 `{type:'proceed'|'redirect'|'abort'}` 裁决，popstate 不逃逸守卫管线，在途导航被新导航 superseded。槽位变化经 `outlet/changed:{outlet}` 独立事件族通知（隔离视图只订阅本槽位），全槽位 `router/changed` 仅 root 层可见。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 多槽位 URL 矩阵：保留字前缀、通道仲裁、参数合并不互抹
- [ ] 导航序号防竞态：在途导航（守卫 await 中）被新导航 superseded，无交错写 URL
- [ ] 守卫 = serial 事件 + 显式枚举（ADR-0002）：proceed 截断后续守卫、redirect 改道、abort 拒绝；禁止返回 false/裸字符串
- [ ] popstate 全链路：后退/前进走完整守卫管线；守卫拒绝历史导航时 replace 恢复原 URL
- [ ] 双层回写（ADR-0036/0047/0050）：`outlet/changed:{outlet}` 模板字面量族 + `router/changed` root-only（global）
- [ ] 视图隔离只读（ADR-0006）：应用读本槽位、写经全局 NavigationController 合并（isolate 白名单，ADR-0010）
- [ ] router 不 inject lifecycle（事件解耦，无依赖环）
