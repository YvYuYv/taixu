# 介绍

Taixu（太虚）是一个基于 [Cordis IoC 架构](https://github.com/cordiverse/cordis)的微前端框架。

## 核心理念：微应用 = 注册在 Context 上的 Plugin

传统微前端框架自建生命周期管理与事件系统；Taixu 把微前端建模为 **IoC 领域问题**：

- 主应用创建根 Context（`createCordis`），8 个核心服务（lifecycle / router / bus / state / sandbox / monitor / security / deps）以 Plugin 注册
- 每个子应用经 `defineApp` 注册为 Plugin，`static inject` 声明服务依赖——未就绪自动 PENDING、就绪自动激活（**空间维组合**）
- 应用的一切副作用经 `ctx.effect()` 注册，dispose 时 runtime 自动逆序回收（**时间维组合**）
- 应用状态从 Cordis Fiber 状态机派生，不存在平行状态机

这套组合让「多应用在时间（先后挂载/切换/重跑）与空间（多槽位/多实例）上自由组合」成为框架原生能力，而非补丁。

## 能力全景

```
宿主 createCordis()
├── lifecycle   挂载/切换事务/分级挂起/保活池/驱逐快照
├── router      槽位 URL 矩阵 + 守卫 serial 管线 + SSR 水合
├── state       三层键空间 + 深层代理 + CAS 冲突消解 + 时间旅行
├── bus         鉴权 send/广播/请求-应答 + 挂起队列回放
├── sandbox     Proxy 双窗口（默认）+ iframe（强隔离路线）
├── monitor     错误归因/sourcemap/PII/指标/告警/泄漏探测
├── security    权限裁决 fail-closed/KillSwitch/Trusted Types
└── deps        共享依赖仲裁（semver）+ 多版本共存
```

## 适用场景

- 多团队异构技术栈（Vue/React/Angular/legacy jQuery）聚合到一个壳
- 巨石应用渐进式拆分（按路由槽位逐步迁移）
- 需要「切换不丢状态」（保活）与「回滚可追溯」（时间旅行）的运营型中台
