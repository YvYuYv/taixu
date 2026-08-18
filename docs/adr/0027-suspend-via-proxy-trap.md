# 挂起域经沙箱 Proxy get-trap 包装五个全局，原生引用缓存为已知限制

ADR-0013 的五类副作用若靠应用直接调用才能拦截，第三方库内部自管的 timer 就漏了。决策：SuspendScope 通过沙箱 Proxy 的 `get` trap 包装 timer/rAF/idle/observer/WS 五个全局——所有经 `window.x` 的访问（包括库内部）都拿到包装版。**已知限制如实成文**：在沙箱激活前已缓存原生引用的库（如某些 UMD 加载时缓存 `setTimeout`）不受冻结约束，这类库列入"保活不兼容清单"并建议 `keepAlive:false`。备选"恢复时强制对齐时钟"被否：对动画/轮播造成跳变，比不冻结更糟。
