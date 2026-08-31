# 异构应用接入

Taixu 为每种技术栈提供「一行声明」适配器，全部遵循同一契约：mount/unmount 包成**一次** effect、渲染错误统一转发 `monitor.capture`、重跑防双挂载、样式显式登记。

## Vue 3

```typescript
import { defineCordisApp } from '@taixu/adapter-vue3'
import App from './App.vue'

defineApp('cart-app', () =>
  defineCordisApp({ appId: 'cart-app', rootComponent: App, styles: [{ file: 'cart.css', css }] }),
)
```

容器带 `data-tx-ssr="1"` 标记时自动走 `createSSRApp`（hydration 绑定，见 [SSR 水合](ssr.md)）。

## React 18+

```tsx
import { CordisProvider, useCordis, useSharedState } from '@taixu/adapter-react'

// React 应用经 CordisProvider 注入 ctx（非全局单例）
function App() {
  const ctx = useCordis()
  const [items, setItems] = useSharedState('shared:cart.items', [])
  return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>
}
```

## Angular（实验性，standalone + AOT）

要求子应用以 **standalone components + AOT** 构建（运行时 `@NgModule` JIT 方案已废除）。适配器经 `createApplication()` 建**每应用独立 ApplicationRef**（规避"每页面仅一个 platform"限制）：

```typescript
import { defineCordisAngularApp } from '@taixu/adapter-angular'

defineApp('ng-app', () =>
  defineCordisAngularApp({ appId: 'ng-app', rootComponent: AppComponent }),
)
```

`@angular/core` **零硬依赖**——经共享依赖仲裁获取，宿主需先注册：

```typescript
host.deps.registerShared('@angular/core', { version: '17.0.0', module: await import('@angular/core') })
```

未注册即挂载失败（strict 仲裁，不静默降级），错误显式上报 `monitor`。

## Vue 2（多版本共存）

```typescript
import { defineCordisVue2App } from '@taixu/adapter-vue2'

defineApp('legacy-app', () =>
  defineCordisVue2App({ appId: 'legacy-app', render: (h) => h(LegacyRoot) }),
)
```

`vue` 经 `deps.negotiate('vue', '^2')` 仲裁——`vue@^2` 与 Vue 3 应用的 `^3` 是 registry 两个条目，天然多版本共存。注意 Vue 2 语义：`$destroy` 不移除 `$el`，适配器会做容器清空校验。

## AMD / UMD（legacy 路线）

两个 UMD 应用各自 `define('vue', ...)` 会撞全局单例。Taixu 提供 per-app 命名空间：

```typescript
import { createAmdNamespace } from '@taixu/core'

const ns = createAmdNamespace('app-a')
ns.define('vue', [], () => vue2Module)   // 注册到 app-a 的命名空间
ns.require(['vue'], (vue) => { /* ... */ })
```

同名模块按命名空间隔离；重复注册与依赖缺失显式抛错（fail-closed）。

## 适配器义务（自写适配器时）

1. mount/unmount 包成**一次** `ctx.effect()`（无第二套生命周期）
2. 渲染错误转发 `ctx.monitor.capture(err, { appId, phase: 'runtime' })`
3. unmount 后校验容器已清空（残留 = 上次挂载 DOM 未回收，上报后强制清空）
4. 样式经 `ctx.style.inject` 显式登记
5. 异步 effect 的错误**必须显式上报**（cordis 对 async effect 错误静默吞）
