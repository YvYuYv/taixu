# 快速开始

## 安装

```bash
npm install @taixu/core @taixu/adapter-vue3 cordis
```

## 宿主：创建运行时

```typescript
import { createCordis, defineApp } from '@taixu/core'

const host = createCordis({
  // 槽位：CSS 选择器映射（缺省 #{outlet}）
  outlets: { main: '#app-main', side: '#app-side' },
  // 路由：路径段前缀 -> 应用
  routes: [
    { basePath: '/cart', appId: 'cart-app' },
    { basePath: '/pay', appId: 'pay-app' },
  ],
  // 应用清单
  apps: [defineApp('cart-app', () => cartEntry), defineApp('pay-app', () => payEntry)],
  // 权限（deny-by-default：未声明即拒绝）
  permissions: [
    { appId: 'cart-app', allow: ['state:write:shared:cart', 'bus:send:pay-app'] },
  ],
})
```

## 挂载与切换

```typescript
// 按应用挂载到槽位
await host.lifecycle.mount('cart-app', 'main')

// 槽位切换：先挂目标（隐藏容器）-> 让位当前应用 -> reveal
// 应用默认挂起保活（回程零冷启动），声明 keepAlive:false 则直接销毁
await host.lifecycle.switch('main', 'pay-app')
```

## 应用侧：声明接入

```typescript
import { defineApp } from '@taixu/core'
import { defineCordisApp } from '@taixu/adapter-vue3'
import App from './App.vue'

export default defineApp('cart-app', () =>
  defineCordisApp({ appId: 'cart-app', rootComponent: App, styles: [{ file: 'cart.css', css }] }),
)
```

## 状态读写（三层键空间）

```typescript
// 应用内（经沙箱注入的 ctx）
ctx.state.set('shared:cart.items', [...], { appId: 'cart-app' })
ctx.state.get('local:draft')          // local: 应用私有
ctx.state.get('shared:cart.items')    // shared: 跨应用（需权限）
```

## 下一步

- [异构应用接入](adapters.md)：React / Angular / Vue 2 / legacy UMD
- [生命周期与保活](lifecycle.md)：切换事务、挂起、驱逐
- [createCordis 全量配置](api/create-cordis.md)
