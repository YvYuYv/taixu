# 挂起时 head 里的应用样式节点一并摘除，样式必须经框架 API 注册

挂起摘除 DOM 时，scoped 到 shadow root 的样式随 DOM 一起缓存；但 inject 到 `document.head` 的样式（某些方案的 fallback）挂起后仍在 head 里，作用于全局、可能与其他应用冲突（"幽灵样式"）。决策：lifecycle 挂起时把 SuspendScope 登记的应用样式节点（head 里的 `<style>`/`<link>`）一并摘除到同一文档片段缓存，恢复时一并还回。前提约束：**应用样式必须经框架 API 注册（`ctx.style.inject`）**——这是 lifecycle 能追踪样式节点的唯一前提。备选"一律 scoped 到 shadow root"被否：对第三方库不可执行。

**修订（ADR-0042）**：第三方组件库运行时直接 `document.head.appendChild(style)` 的，由沙箱 Proxy 拦截 `appendChild`/`insertBefore`/`adoptedStyleSheets` 自动登记到当前应用的 SuspendScope——与 ADR-0027 同一机制，对库透明。"禁止直接 appendChild"修订为"直接 appendChild 的节点经沙箱拦截自动登记"。
