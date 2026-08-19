# 05 - 路由：URL 矩阵 + 守卫枚举 + 槽位事件族

**What to build:** 宿主经 router 驱动导航：URL 变为多槽位矩阵（`__tx_` 前缀、槽位参数合并不互抹），导航走 serial 事件触发 lifecycle 挂载，守卫以显式枚举 `{type:'proceed'|'redirect'|'abort'}` 裁决，popstate 不逃逸守卫管线，在途导航被新导航 superseded。槽位变化经 `outlet/changed:{outlet}` 独立事件族通知（隔离视图只订阅本槽位），全槽位 `router/changed` 仅 root 层可见。

**Blocked by:** 03

**Status:** resolved

- [x] 多槽位 URL 矩阵：保留字前缀、通道仲裁、参数合并不互抹
- [x] 导航序号防竞态：在途导航（守卫 await 中）被新导航 superseded，无交错写 URL
- [x] 守卫 = serial 事件 + 显式枚举（ADR-0002）：proceed 截断后续守卫、redirect 改道、abort 拒绝；禁止返回 false/裸字符串
- [x] popstate 全链路：后退/前进走完整守卫管线；守卫拒绝历史导航时 replace 恢复原 URL
- [x] 双层回写（ADR-0036/0047/0050）：`outlet/changed:{outlet}` 模板字面量族 + `router/changed` root-only（global）
- [x] 视图隔离只读（ADR-0006）：应用读本槽位、写经全局 NavigationController 合并（isolate 白名单，ADR-0010）
- [x] router 不 inject lifecycle（事件解耦，无依赖环）

## Answer

`RouterService`（`static provide = 'router'`，`inject: ['security','monitor']`，**不 inject lifecycle**——基线 §2.3）落进 createCordis 主缝：

- **URL 矩阵（§3.1）**：主区域 = pathname；浮窗类 widget（`widgetOutlets` 配置或 `widget` 前缀判定）走 hash 通道 `#w=__tx_widget%3D%2Fhome`（URL-encoded 槽位=路径对，多浮窗 `&` 连接）；其余槽位 = query 通道 `__tx_` 前缀。commit 时读旧全量 -> 仅改目标槽位 -> 写回，业务 query 与其他槽位参数不互抹。
- **导航序号（§4.1）**：`seq` 自增 + 每导航 AbortController（裁决后/superseded 即 abort，守卫可观测取消）；在途导航在守卫 await 中被新导航 superseded 时静默让位，不交错写 URL。
- **守卫枚举（§4.3，ADR-0002）**：`ctx.serial('router/navigate', {...})`，监听器返回 `{type:'proceed'|'redirect'|'abort'}` 或 undefined 不表态；proceed = serial 截断后续守卫后放行（isBailed 机制）；redirect 经 handleRedirect 改道（保留 replace 语义，8 次上限 + monitor.capture + ROUTER_REDIRECT_LOOP 告警）；abort → `router/aborted {reason:'guard'}`。守卫注册：`ctx.on('router/navigate', fn, { global: true })`。
- **popstate（§4.2）**：后退/前进先快照内存矩阵、从 `event.state.__tx_outlets` 恢复全量槽位（缺省 URL 直读回退），再走完整守卫管线；守卫拒绝时**矩阵回滚 + replaceState 恢复原 URL**。hashchange 双事件去重。
- **双层事件（ADR-0036/0047）**：`outlet/changed:{outlet}`（载荷 `{outlet, matched}`）槽位族给隔离视图；`router/changed`（全槽位矩阵）root-only global 旁听。模板字面量键以 events.ts 代表键 `'outlet/changed:main'` 声明 + `outletEventKey()` 窄化 helper 统一落键。`watch(ctx, outlet, fn)` = 事件族订阅 + 首跑同步取值（reactive coeffect）。
- **槽位注册（§3.3）**：`registerOutlet(ctx, outlet, {owner, basePath?})`（basePath 路径段边界匹配、冲突显式报错；注销随调用方 fiber dispose 经 ctx.effect 自动完成）。
- **lifecycle 解耦（基线 §2.3）**：挂载意图经 `onResolve` 回调（lifecycle -> router 单向）；历史导航同样触发。

测试 `tests/router.test.ts`（16 例）全走主缝；全量 71/71 绿，tsc 通过。

## Comments

- **code-review 双轴发现与修复**：
  - Standards：`inject` 缺 `security`（基线 §2.3 无条件）→ 已补；redirect-loop 曾绕过 monitor.capture 直接发 alert → 现双路（capture + alert）；AbortSignal 曾是装饰品（new 后无人能 abort）→ 每导航 controller、裁决/superseded 即 abort；死代码 `parseQuery`/`lastHash`、重复的 `__tx_main` 魔法串（提 `MAIN_RESERVED_KEY`）、两处重复键窄化 cast（提 `outletEventKey`）。
  - Spec：hash 通道整块缺失 → 实现（含双编码 bug 修复：pair 逐个 encode，解析侧手工解码）；`registerOutlet` 缺失 → 实现；`event.state` 快照写了不读（popstate 曾重新猜测 URL）→ 恢复优先 state；**守卫拒绝只恢复 URL 不回滚矩阵**（状态/地址不一致）→ matrix 快照回滚；redirect 丢失 `replace` 语义 → 透传；历史导航不触发 onResolve → 补齐；hashchange+dedupe 缺失 → 补齐。
  - 深链启动挂载（initFromLocation 只恢复读侧）与 spec `init()` 一致（不在本票 checkbox）；`sanitizeQuery`（§3.2）接线在 11 号票（security 权限裁决统一落点，代码注释标注）。
- cordis v4 API 事实追加：`ctx.serial(name, payload)` 对对象型返回值 isBailed 截断链（proceed 枚举直接复用）；`ctx.isolate(name)` 第二参是 symbol 非 string（测试只按名隔离）。
- `watch` 返回 cordis `ctx.on` 的退订函数（`() => void`）；ADR-0001 同款不自建 watcher 注册表。
