# 路由矩阵与守卫

## 槽位 URL 矩阵

多个槽位的状态编码进**一个 URL**：主槽位走 pathname，其余槽位走 `__tx_` 保留参数：

```
/cart?__tx_side=/notif&__tx_widget=/clock
```

- 保留字前缀 `__tx_` 全框架统一，应用不可侵占
- 深链直达：启动时从 URL 恢复全量矩阵（全部槽位一次到位）
- 后退/前进走完整守卫管线 + history.state 快照恢复

```typescript
createCordis({
  routes: [{ basePath: '/cart', appId: 'cart-app' }],   // 路径段边界匹配
  widgetOutlets: ['widget'],                            // hash 通道槽位（浮窗类）
})
```

## 导航与守卫

```typescript
await ctx.router.navigate({ path: '/pay' }, { caller: ctx, outlet: 'main' })
```

- 守卫 serial 管线（对齐 vue-router 的 8 次重定向上限）
- 每次导航独立 AbortController：被更新导航 superseded 时 abort，守卫可观测取消
- 每槽位事件族 `outlet/changed:{outlet}` + root `router/changed`

## 懒 outlet

```typescript
createCordis({ router: { lazyOutlets: ['side'] } })
```

命中槽位的挂载意图延迟到宿主元素进入视口（IntersectionObserver）才派发；pending 期间多次导航只派最新意图；IO 能力缺失降级立即派发（优化不阻塞挂载）。

## 敏感 query 过滤

```typescript
createCordis({ security: { queryBlacklist: ['token', '_t', 'sign'] } })
```

黑名单键从路由 query 剥离（默认 token/_t/sign）。

## SSR 水合

服务端解析 URL 后注入 hydration payload，客户端以 `initialUrl` 为**唯一解析源**（无双源竞态，应用挂载恰好一次）。见 [SSR 水合与同构](ssr.md)。

## history 模式部署（服务端 fallback）

```nginx
location / { try_files $uri $uri/ /index.html; }
```

CDN 静态托管：error page 404 → /index.html 重写规则。
