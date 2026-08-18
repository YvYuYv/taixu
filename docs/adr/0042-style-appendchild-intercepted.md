# 库直接 appendChild 的样式经沙箱拦截自动登记

ADR-0033 要求样式经 `ctx.style.inject` 注册，但第三方组件库（Element Plus、Ant Design）运行时直接 `document.head.appendChild(style)`，不知道框架 API。决策：沙箱 Proxy 拦截 `document.head.appendChild`/`insertBefore`/`adoptedStyleSheets`，库调用时自动把样式节点登记到当前应用的 SuspendScope——与 ADR-0027"库内部走 `window.x` 的调用也被拦截"同一机制，对库透明。ADR-0033 的"禁止直接 appendChild"修订为"直接 appendChild 的节点经沙箱拦截自动登记"。备选"列不兼容清单"被否：大量主流组件库会失去保活；备选构建时 AST 重写被否：对运行时动态注入无效。
