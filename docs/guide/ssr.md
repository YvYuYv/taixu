# SSR 水合与同构

## 阶段 1：基础模式（主应用 SSR + 子应用 CSR，default）

### 服务端

按路由解析 URL，产出 hydration payload 注入 HTML：

```jsonc
<!-- 宿主 HTML（JSON script 而非全局变量：便于 CSP nonce；可加 type 校验） -->
<script type="application/json" id="tx-hydration">
{ "url": "https://host.example.com/cart?__tx_side=/notif", "outlets": { "main": "/cart", "side": "/notif" } }
</script>
```

- `outlets` 与框架内部 `__tx_outlets` 矩阵同形（对账用）
- **query 不进 payload**（敏感 query 不落 HTML，客户端从 URL 现取）

### 客户端（宿主接入 = 一行）

```typescript
import { readHydrationPayload, hydrationMismatch, createCordis } from '@taixu/core'

const payload = readHydrationPayload()                                    // 读 payload（fail-closed：缺失/非法 JSON -> null）
const mismatch = payload ? hydrationMismatch(payload, window.location) : null
const host = createCordis({
  router: { initialUrl: mismatch ?? payload?.url },   // mismatch 以客户端 URL 为准（页面实际地址不可违背）
  // ...
})
```

- `initialUrl` 是矩阵初始化的**唯一源**（hydration 与 location 不并存 → 应用挂载恰好一次，无双源竞态）
- payload 缺失/非法/CSP 拦截 → 回落 `window.location`，启动不阻断（水合是优化不是正确性强依赖）
- 未注入 payload 时行为与纯 CSR 完全一致

### 首次 watch 直取

应用侧「注册 watch → 渲染」的写法在水合态下天然可用——`router.watch()` 注册即同步回调当前位置（ADR-0047 首跑取值），无需等首次导航。

## 阶段 2：同构模式（子应用服务端渲染）

子应用产出 ESM 且无浏览器依赖 → 服务端 `renderToString` 输出片段 → 宿主拼装进槽位容器并**打标记**：

```html
<div id="app-main">
  <div data-tx-ssr="1"><!-- renderToString 产物 --></div>
</div>
```

客户端 `lifecycle.mount` 时：

1. **lifecycle 复用**已有 SSR 容器（不再新建空容器——新建会让 hydration 无从绑定）
2. **vue3 适配器**检测容器标记 → `createSSRApp`（Vue 3 在已有内容上 hydration 绑定，SSR 节点原样保留）
3. 无标记 → 走完整 CSR 挂载（既有行为）；shadow 应用不做 adopt（shadowRoot 无法服务端预渲染）

效果：SSR 内容被**接管**而非卸载重建——首屏零闪烁。

## 服务端同步（进阶）

状态服务端快照经 hydration payload 下发的完整管线随应用侧同构改造推进；框架侧能力（payload 读取 / adopt / hydration）已就绪。
