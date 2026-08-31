# Taixu

**基于 [Cordis IoC](https://github.com/cordiverse/cordis) 的微前端框架**——让 Vue 2/3、React、Angular 等异构应用在同一宿主下共存：沙箱兜住污染、样式隔离化解冲突、保活消除切换白屏、共享依赖仲裁支撑多版本共存。

[![tests](https://img.shields.io/badge/tests-360%20passing-brightgreen)]() [![typecheck](https://img.shields.io/badge/typecheck-clean-blue)]() [![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> 📖 **官方文档**：[文档站](https://yvyuv.github.io/taixu/)（本仓库 `docs/` 目录，docsify 构建）
> 🏛️ **架构深读**：[docs/architecture.md](./docs/architecture.md) · 设计基线与 12 份领域规范见 [docs/specs/](./docs/specs/)

## 快速开始

框架按包拆分发布（scope `@taixu`）——核心与适配器独立安装，按需取用：

```bash
npm install @taixu/core @taixu/adapter-vue3 cordis
# 其他适配器：@taixu/adapter-react / adapter-vue2 / adapter-angular（实验性）
```

### 宿主接入（一行创建运行时）

```typescript
import { createCordis, defineApp } from '@taixu/core'
import { defineCordisApp } from '@taixu/adapter-vue3'

const host = createCordis({
  outlets: { main: '#app-main', side: '#app-side' },
  routes: [
    { basePath: '/cart', appId: 'cart-app' },
    { basePath: '/pay', appId: 'pay-app' },
  ],
  apps: [defineApp('cart-app', () => cartEntry), defineApp('pay-app', () => payEntry)],
})

await host.lifecycle.mount('cart-app', 'main') // 槽位挂载
await host.lifecycle.switch('main', 'pay-app') // 切换事务：先挂 B（隐藏容器）再让位 A，无闪烁无悬空
```

### Vue 3 应用接入（一行声明）

```typescript
import { defineApp } from '@taixu/core'
import { defineCordisApp } from '@taixu/adapter-vue3'
import App from './App.vue'

export default defineApp('cart-app', () => defineCordisApp({ appId: 'cart-app', rootComponent: App }))
```

React / Angular / Vue 2 / legacy UMD 见[适配器指南](https://yvyuv.github.io/taixu/#/guide/adapters)。

## 核心特性

| 能力 | 说明 |
|---|---|
| 🧩 **异构适配** | Vue 3 / Vue 2 / React / Angular（standalone+AOT）/ AMD-UMD，适配器零硬依赖——Angular 与 Vue 2 经共享依赖仲裁获取 |
| 🛡️ **JS 沙箱** | Proxy 双窗口 + 受控 eval + 原型守护（opt-in）+ customElements 前缀注册 + 5 类逃逸向量直测 |
| 🎨 **样式隔离** | Shadow DOM / scoped 前缀双路线，CSS-in-JS 补丁、字体 registry、主题服务（`--tx-*` 唯一写点）、跨应用样式冲突扫描 |
| 🔀 **路由矩阵** | 多槽位 URL 矩阵（`__tx_outlets`）、守卫 serial 管线、懒 outlet、SSR 水合（`initialUrl` 单一源） |
| 💾 **状态三层键空间** | local / scoped / shared 权限隔离、深层代理、乐观并发 CAS + 四策略冲突消解、时间旅行（开发模式） |
| 📮 **通信总线** | 鉴权 send / 广播 / 请求-应答 / 挂起队列回放，deny-by-default |
| 📊 **可观测** | appId 归因错误采集 + sourcemap 还原 + PII 脱敏 + 开销自测（MONITOR_OVERHEAD）+ 泄漏探测 |
| 🔒 **安全** | 权限裁决 fail-closed、URL 白名单、DOMPurify 真 sanitize + Trusted Types 纵深、KillSwitch 签名通道 |
| ⏸️ **保活** | SuspendScope 五类全局包装（定时器/WS/rAF/RAF/事件）、LRU + 内存水位驱逐、驱逐快照暖启动 |
| 🧊 **SSR 同构** | 容器复用 adopt + `createSSRApp` hydration 绑定，SSR 内容零闪烁接管 |

## 包结构（npm 发布物）

| 包 | 说明 | peer |
|---|---|---|
| [`@taixu/core`](./packages/core) | 8 服务 + 沙箱 + 主题/水合/PII/时间旅行 + AMD 命名空间 | — |
| [`@taixu/adapter-vue3`](./packages/adapter-vue3) | Vue 3 适配器（含 SSR adopt） | vue ^3.2 |
| [`@taixu/adapter-react`](./packages/adapter-react) | React 适配器（CordisProvider 注入） | react 17/18/19 |
| [`@taixu/adapter-vue2`](./packages/adapter-vue2) | Vue 2 适配器（共享依赖仲裁，零框架依赖） | — |
| [`@taixu/adapter-angular`](./packages/adapter-angular) | Angular 适配器（实验性，零框架依赖） | — |

发布流程（changesets）：`npm run changeset` 记录变更 → `npm run version-packages` 消费版本 → `npm run release`（build + publish，需 npm 登录且已加入 @taixu org）。

## 目录结构

```
src/
  index.ts            # 公开 API（createCordis / defineApp / 适配器 / 类型）
  sandbox.ts          # JS 沙箱核心（fakeWindow + 受控视图）
  document-proxy.ts   # 沙箱 document 代理（注入记账 + HTML sink 净化）
  vue3-adapter.ts     # Vue 3 适配器（含 SSR adopt）
  services/
    lifecycle.ts      # 挂载/切换事务/保活编排
    router.ts         # 槽位矩阵 + 守卫管线（parsers/hydration 子模块）
    state.ts          # 三层键空间 + CAS + 时间旅行
    bus.ts            # 鉴权通信总线
    security.ts       # 权限/裁决/KillSwitch（sanitizers/trustedTypes 子模块）
    monitor.ts        # 错误/指标/告警/PII/开销自测
    sandbox.ts        # iframe 沙箱（强隔离路线）
    style.ts          # 样式登记/Shadow DOM/字体 registry
    theme.ts          # 主题服务
    harden.ts         # 沙箱硬化工具集（原型守护/逃逸向量矩阵）
    deps.ts           # 共享依赖仲裁（semver 子模块）
docs/
  specs/              # 12 份领域规范（设计基线 + 各子系统语义）
  architecture.md     # 整体架构深读（原架构概览）
  adr/                # 60 项架构决策
  agents/             # agent 协作约定
tests/                # 360 主缝测试（事件契约 + 依赖方向双看门狗同跑）
```

## 开发

```bash
npm run typecheck   # 类型检查
npm test            # 全量测试（360 case）
npm run verify      # typecheck + 测试（提交前必跑）
npm run build       # 构建 5 个发布包（demo 与 typecheck 依赖产物，首次运行先执行）
npm run dev         # 启动 demo（vite，演示全链路：挂载/保活/回放/暖启动/Vue3 子应用/fail-closed）
```

提交前跑 `npm run verify`；规范语义变更须同步 `docs/specs/` 对应文档。

## 设计原则

1. **Cordis 原生能力优先**——effect 追踪/事件总线/disposer 栈用 Cordis 原生，框架只建模微前端领域概念
2. **鉴权走服务方法，通知走事件**——可拦截的操作是方法，fire-and-forget 的通知是事件
3. **丢失必须显式**——队列溢出、断连、版本漂移全部上报，不假装什么都没丢
4. **fail-closed**——安全服务未就绪则全部应用无法挂载，安全侧默认值永远是拒绝
5. **隔离是精确工具**——`ctx.isolate` 仅白名单两处；状态隔离用键前缀
6. **保活是框架层概念**——SuspendScope + LRU 池 + 分级裁决，dispose 永远不可逆

## License

[MIT](./LICENSE)
