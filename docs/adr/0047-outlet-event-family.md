# 槽位事件独立为 outlet/* 族，与 router/* 分离

ADR-0036 把 `router/changed` 拆成按槽位事件 `router/changed:main`——但动态槽位名让基线 §2.4.1 的事件族边界模糊（`router/changed:main` 不在任何已声明的族里）。决策：槽位事件改名 `outlet/changed:{outlet}`，`outlet/*` 成为独立通知族（fire-and-forget）；全局 `router/changed`（全槽位矩阵）保留在 `router/*` 族、仅 root 层 DevTools/monitor 可见。理由：槽位是路由的投影不是路由本身；族边界清晰（`outlet/*` = 通知族）让 lint 规则可写。基线 §2.4 与 §2.4.1 随之修订。
