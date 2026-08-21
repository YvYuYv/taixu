# 11 - 安全全链路 fail-closed 接线

**What to build:** 权限裁决贯穿全部消费点：bus.send / state 读写 / router 导航守卫前置 / scopedFetch 四处接线 security（修复"权限中间件从未接线"）。裁决 deny-by-default、只本地可判定（ADR-0051）、不做跨调用缓存（ADR-0039）、5s 超时即拒绝并上报 monitor（ADR-0024）。违规全部经 `security/violation` 事件可审计。isolate 白名单机器生效（仅 router-view/monitor，ADR-0010）。

**Blocked by:** 03, 05, 06, 07

**Status:** done

- [x] 四消费点接线：bus.send（message:* 资源）、state 读写（key 资源）、router 守卫前置（导航资源）、scopedFetch（URL 白名单 + SRI 就位）
- [x] deny-by-default：未授权/未注册类型一律拒绝（不因"未注册"默认放行）
- [x] 裁决三不变量（security §5.1）：无跨调用缓存（版本键编译缓存除外）、本地可判定（远程策略预编译）、5s 超时拒绝 + monitor.capture
- [x] violation 事件：appId + rule + detail 全量可审计；网络违规类按 (appId, rule) 限流去重
- [x] isolate 白名单：`ctx.isolate` 请求非白名单标签时开发模式告警/测试断言拦截
- [x] lifecycle 显式 inject security 的 fail-closed 已在 03 验收，本票补全其余消费点

## Answer

- **router 守卫前置**（`src/services/router.ts`）：`navigate` 的 `caller: Context` **必填**——无归因即类型层拒绝（fail-closed，无"缺省放行"旁路）；root/宿主不受限、应用需 `route:navigate` 授权；拒绝发生在守卫管线之前（未授权者连守卫都不可见），返回 `status:'denied'` 显式枚举 + `security/violation {rule:'route:navigate'}`（与裁决 action 同名，审计可关联）。内部导航（popstate 恢复/重定向递归）经 `rootCtx()`（fiber 父链上溯）系统归因。
- **sanitizeQuery**（security 服务 + router 消费）：导航 target query 剥离 `token/_t/sign` 黑名单键（可配置追加，键名小写比较），杜绝 `?token=xxx` 跨应用泄漏（route-adaptation §3.2）。
- **scopedFetch URL 白名单**（`security.sanitizeURL`，lifecycle 消费）：协议门（https-only，http 需 `allowInsecure`；data:/blob:/javascript:/file: 一律拒绝）+ origin 授权（精确 `net:fetch:{origin}` 同步判定；粗授权 `net:fetch` 经 `adjudicate`——5s 超时 fail-closed，ADR-0024）。`new URL` 解析天然覆盖协议相对 URL。Request 对象原样透传（method/body/headers 不丢）。
- **violation 审计与限流**（`reportViolation`）：全量 `security/violation {appId, rule, detail}`；网络违规类（`net:` 前缀）按 `(appId, rule)` 5s 窗口去重（§8），账本超 512 条回收过期项防无界增长。
- **isolate 白名单**（框架入口 `createCordis` 安装，ADR-0010"仅允许两处"）：root ctx.isolate 以 own property 包装——非白名单标签（router-view/monitor 之外）**抛错拦截** + violation 审计痕。守卫装在框架入口而非服务构造（服务 this.ctx 构造期是注册代理，且 monkey-patch 不应由服务持有）。
- **裁决三不变量**：无缓存（同步内存查询，无 TTL/跨调用缓存，ADR-0039）；本地可判定（规则仅 `{appId, allow, deny}` 模式匹配，ADR-0051）；`adjudicate` 超时包装（Promise.race 5s → `{allowed:false, reason:'adjudication-timeout'}` + violation 上报含连续计数，输局 timer 清理；本地同步裁决下超时结构上不可达，属就位不变量）。超时上报经 violation 事件（security 不 inject monitor，ADR-0054——monitor 旁听后 capture）。
- **deny 一票否决**（§五）：`PermissionRule.deny?: string[]`，deny 命中优先于任何 allow（顺序无关）。
- **SRI 就位 seam**：`SecurityConfig.integrityManifest`（url -> integrity）+ `security.lookupSri(url)`；deps 子资源加载接线在后续票。
- **测试**（`tests/security-wiring.test.ts`，6 例主缝）：bus deny-by-default、router 守卫前置（denied/ok/root）、scopedFetch（origin 限定/越源/http/data:/无授权 + 仅放行请求到达原生 fetch）、sanitizeQuery（黑名单剥离 + URL 不泄漏）、violation 限流（net: 去重 / 非网络全量）、isolate 拦截。全量 130 绿灯。

## Comments

- 双轴审查发现并已修复：**router 守卫曾依赖可选 `caller`（缺省即完全跳过检查 = fail-open，票面目标的反面）**→ 改为必填参数（类型层 + 运行时双闸）；isolate 守卫曾以服务构造期 monkey-patch root ctx（时序敏感、fiber 内部耦合、重复包装）→ 移到框架入口直接安装并改为抛错拦截；violation 规则名 `route-navigate` 与裁决 action `route:navigate` 不一致 → 统一；adjudicate 输局 timer 泄漏 → finally 清理 + 连续超时计数；`networkViolationAt` 无界增长 → 过期回收；scopedFetch 曾把 Request 降级为 URL 字符串（method/body 丢失）→ Request 原样透传；补 `deny` 一票否决规则。
- 已知边界：应用直接 `inject: ['router']` 调 `navigate` 必须传自身 ctx（类型必填引导 + 运行时归因拒绝）；isolate 守卫覆盖 root ctx 入口（host 侧调用面），fork 出的应用 ctx 对象自带原型 isolate 不经此守卫——完整覆盖需 cordis 层配合，记入 12 号票复核。
- SRI 校验执行（deps loadScript 挂 integrity + 失败 reject）与 NetworkGateway 挂 bus 链在 security.md §338 P1 清单，后续票。
