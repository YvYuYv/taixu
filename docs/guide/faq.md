# 常见问题

## 与 qiankun / wujie 的区别？

| | qiankun / wujie | Taixu |
|---|---|---|
| 架构基底 | 自建生命周期/通信 | Cordis IoC（应用 = Plugin，effect/dispose 原生回收） |
| 状态管理 | 各自为政/约定 | 框架层三层键空间 + 权限 + CAS + 时间旅行 |
| 多版本共存 | 弱约束 | 共享依赖仲裁（semver + registry + split-brain 告警） |
| 可观测 | 侵入式接入 | 内建（归因/sourcemap/PII/开销自测/泄漏探测） |
| 安全 | 部分 | fail-closed 权限 + Trusted Types + KillSwitch 签名通道 |

## 沙箱怎么选？

默认 Proxy 双窗口（可信级应用）；需要强隔离（不可信三方）用 iframe 路线（`host.sandbox.createIframeSandbox`，handshake 超时 fail-closed）。

## 原型守护为什么默认关闭？

实测全量冻结原型与 cordis 运行时自身不兼容（内部存在对象 constructor 写点）。它是**opt-in 的实验性能力**——开启前请完成自有兼容性验证。

## 如何接入已有的 Vue 2 应用？

用 `defineCordisVue2App`（经共享依赖 `vue@^2` 仲裁，与 Vue 3 应用共存）。注意 `$destroy` 不移除 `$el`，适配器已做容器清空校验。

## 切换时页面闪烁？

确认走 `lifecycle.switch`（切换事务：目标先挂隐藏容器）。自行 mount/destroy 组合无法获得该保证。

## 深链 404？

history 模式需要服务端 fallback：`try_files $uri $uri/ /index.html;`（CDN 用 error page 重写）。

## 如何排查「应用挂载后立刻消失」？

1. `host.on('security/violation', console.log)` 看是否有权限拒绝
2. `host.monitor.errors()` 看错误（已还原 + 脱敏）
3. 检查应用是否在 apply 外做副作用（应全部经 `ctx.effect`）

## 测试如何隔离？

每个 host 是独立 Context（`createCordis` 即建即用）；`document.body.textContent = ''` 清 DOM 残留；`__tx_snapshot:*` sessionStorage 键按需清理。
