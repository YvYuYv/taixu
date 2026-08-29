# Taixu

<div class="badge">52 文件</div><div class="badge">360 测试全绿</div><div class="badge">MIT License</div>

**基于 [Cordis IoC](https://github.com/cordiverse/cordis) 的微前端框架**——让 Vue 2/3、React、Angular 等异构应用在同一宿主下共存：沙箱兜住污染、样式隔离化解冲突、保活消除切换白屏、共享依赖仲裁支撑多版本共存。

## 为什么选择 Taixu

| 痛点 | Taixu 方案 |
|---|---|
| 应用间全局变量/原型污染 | Proxy 双窗口沙箱 + 受控 eval + 原型守护（opt-in）+ `__CORDIS_*` 黑名单 |
| CSS 相互覆盖 | Shadow DOM / scoped 前缀双路线 + CSS-in-JS 补丁 + `@font-face` 提升 |
| 切换白屏与闪烁 | 切换事务（先挂 B 隐藏容器再让位 A）+ 保活池（LRU + 内存水位）+ 驱逐快照暖启动 |
| 多技术栈/多版本共存 | 适配器零硬依赖，`vue@^2` 与 `vue@^3` 经共享依赖仲裁共存 |
| 状态越权访问 | 三层键空间（local/scoped/shared）+ 权限裁决 fail-closed |
| 线上错误无从排查 | appId 归因错误采集 + sourcemap 还原 + PII 脱敏 + 开销自测 |

## 30 秒上手

```typescript
import { createCordis, defineApp } from '@cordis-mf/taixu'

const host = createCordis({
  outlets: { main: '#app-main' },
  routes: [{ basePath: '/cart', appId: 'cart-app' }],
  apps: [defineApp('cart-app', () => cartEntry)],
})

await host.lifecycle.mount('cart-app', 'main')
```

👉 继续阅读 [快速开始](guide/getting-started.md)，或从侧边栏选择主题。

## 设计主线

1. **Cordis 原生能力优先**——应用即 Plugin，effect 追踪/事件总线/IoC 全部复用 Cordis 原生
2. **鉴权走服务方法，通知走事件**——可拦截的操作是方法，fire-and-forget 的通知是事件
3. **丢失必须显式**——队列溢出、断连、版本漂移全部上报
4. **fail-closed**——安全服务未就绪则全部应用无法挂载
5. **隔离是精确工具**——`ctx.isolate` 仅白名单两处；状态隔离用键前缀
6. **保活是框架层概念**——SuspendScope + LRU 池 + 分级裁决，dispose 永远不可逆

完整设计推导见[架构总览](architecture.md)。
