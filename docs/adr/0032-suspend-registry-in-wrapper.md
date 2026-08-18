# SuspendScope 的冻结经沙箱包装函数内的挂起注册表，不加第二层 trap

ADR-0027 需要让 SuspendScope 拦截库内部的 timer 调用，但沙箱的 `get` trap 已在做全局污染隔离——同一 trap 不能同时背两个职责。决策：沙箱注入的 `window.setTimeout` 等本身就是包装函数（隔离层职责），包装函数**内部**执行前查询全局挂起注册表 `suspendRegistry.isSuspended(appId)`——挂起则丢弃/延后，否则执行。权责清晰：sandbox 负责"注入包装"，lifecycle 负责"维护注册表"，包装函数是唯一交汇点。备选"双层 trap"被否：trap 顺序问题；备选"sandbox 感知挂起概念"被否：引入 sandbox→lifecycle 的反向依赖（§2.3 禁环）。
