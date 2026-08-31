# wujie 官方示例的 Taixu 改造版

对齐 [Tencent/wujie/examples](https://github.com/Tencent/wujie/tree/master/examples) 的核心演示场景，用 `@taixu/core` + 适配器包重写。

## 场景对照

| wujie 示例场景 | Taixu 改造 |
|---|---|
| React 主应用菜单 + 子应用页 | 框架无关宿主壳（`createCordis` + 原生 TS UI），菜单按钮 → `lifecycle.switch` |
| `bus.$on('sub-route-change')` 路由同步 | **框架原生**：槽位 URL 矩阵（`initialUrl`/`__tx_*`），主应用 URL 驱动槽位，无需事件同步 |
| 子应用 keep-alive | `lifecycle` 默认挂起保活（suspend/resume），回程零冷启动 |
| `EventBus` 跨应用通信 | `ctx.bus`（鉴权 send/broadcast/请求-应答，deny-by-default）+ `state` 三层键空间 |
| 子应用独立构建/独立部署 | 各子应用独立 esbuild 出自包含 ESM（`app.mjs`），宿主运行时动态 import 加载 |
| 多子应用同屏 | 多槽位共存（main + side） |

**改造差异**：Vue 2 子应用与 Angular 12 子应用未进首发示例——Vue 2 走共享依赖仲裁（`@taixu/adapter-vue2` 已发布），Angular 为实验性适配器（`@taixu/adapter-angular`）；两者接入方式见[适配器指南](https://yvyuv.github.io/taixu/#/guide/adapters)。

## 结构

```
host/                 # 宿主：createCordis + 菜单/槽位/共享购物车面板/事件流
apps/
  react17/            # React 18 子应用（@taixu/adapter-react，useSharedState 写 shared:cart）
  vue3/               # Vue 3 子应用（@taixu/adapter-vue3，主题变量 + 保活计数）
  vite/               # Vite 构建的 Vue 3 子应用（Todo 列表）
build-apps.mjs        # 子应用独立构建（esbuild → docs/demo/apps/*/app.mjs）
```

## 运行

```bash
npm install
npm run build     # 子应用 esbuild + 宿主 vite（产物 → docs/demo/）
npm run dev       # 本地开发
```

部署后访问 `…/taixu/demo/host/`（GitHub Pages）。

## 关键实现点

1. **远程子应用加载**：`defineApp(appId, async () => (await import(url)).default)` —— entry 支持异步返回 Plugin，独立构建/独立部署/运行时集成
2. **跨技术栈共享状态**：React 子应用 `useSharedState('shared:cart')` 写入，宿主（原生 TS）经 `host.state.watch` 实时渲染——共享不依赖同一框架实例
3. **保活切换**：菜单切换走 `lifecycle.switch`，子应用 suspend 而非 dispose，切回即恢复（Vue 子应用本地计数不丢）
4. **权限**：子应用的 shared 写入需宿主 `permissions` 声明（deny-by-default）
