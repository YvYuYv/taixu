# 应用侧 API

## defineApp（应用声明）

```typescript
defineApp(appId, entryFactory, options?)
```

- `entryFactory` 返回 Plugin 对象（或适配器调用结果）
- 应用经 `static inject` 声明服务依赖，未就绪自动 PENDING

## 应用内 ctx（沙箱内受控视图）

```typescript
defineApp('cart-app', () => ({
  name: 'cart-app',
  inject: ['state', 'bus', 'monitor'],
  apply(ctx: Context) {
    // 副作用全部经 effect（dispose 自动逆序回收）
    ctx.effect(() => {
      const container = ctx.lifecycle.containerOf(ctx)
      // ... 渲染
      return () => { /* 清理 */ }
    })
  },
}))
```

| 面 | 说明 |
|---|---|
| `ctx.document` | 沙箱 document（HTML 写点全过净化 + 注入记账） |
| `ctx.state` | 三层键空间（local/scoped/shared 前缀即权限） |
| `ctx.bus` | send/broadcast/request（需权限，deny-by-default） |
| `ctx.monitor` | capture（错误归因到本应用） |
| `ctx.style` | inject（样式显式登记） |
| `ctx.effect(fn)` | 副作用注册（支持异步，dispose 逆序回收） |

## 适配器

| 适配器 | 说明 |
|---|---|
| `defineCordisApp({ appId, rootComponent, styles?, shadow? })` | Vue 3（SSR adopt 自动） |
| `defineCordisVue2App({ appId, render, vueRange?, styles? })` | Vue 2（共享依赖 `vue@^2`） |
| `defineCordisAngularApp({ appId, rootComponent, angularRange?, styles? })` | Angular standalone+AOT（共享依赖 `@angular/core`） |
| `CordisProvider` / `useCordis` / `useSharedState` | React hooks（ctx 注入非全局单例） |
| `createAmdNamespace(appId)` | AMD per-app 命名空间 |

## 样式声明

```typescript
defineCordisApp({
  appId: 'cart-app',
  rootComponent: App,
  styles: [{ file: 'cart.css', css: '.cart-btn { ... }' }],  // 显式登记（HMR 定位键）
})
```

第三方库的 head 注入走沙箱自动兜底（记账 + 净化），显式通道优先。
