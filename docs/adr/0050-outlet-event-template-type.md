# outlet/changed 用模板字面量类型 + 槽位运行时枚举

ADR-0047 的槽位事件名是动态的（`outlet/changed:main`），Cordis 的 Events 接口是静态类型，动态名让 TS 类型检查失效。决策：(a) TS 声明用模板字面量类型 `outlet/changed:${string}`、载荷统一 `{outlet, matched}`；(b) 槽位名在路由表注册时确定（运行时枚举），DevTools 可列出全部已注册槽位。备选"运行时 zod 校验载荷"被否：载荷由框架自己发出，不需要防御自己；纯模板类型不带槽位枚举会让 DevTools 无法列出槽位清单。
