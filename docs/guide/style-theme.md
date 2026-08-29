# 样式隔离与主题

## 双路线

| 路线 | 机制 |
|---|---|
| scoped 前缀（默认） | 构建期 PostCSS 前缀 + 运行时 `style.inject` 打标（`data-cordis-app`） |
| Shadow DOM | 容器挂 open shadowRoot + Constructable Stylesheets（能力缺失降级 style 节点）+ Portal 容器 |

```typescript
defineCordisApp({ appId: 'x', rootComponent: App, shadow: true, styles: [...] })
```

## 样式生命周期（与 lifecycle 对齐）

- **挂载**：注入 style/link（经 InjectedNodesTracker 记账，挂 ctx.effect）
- **Suspended**：shadow 内 + head 内文档级样式节点一并摘除（否则挂起期间出现"幽灵样式"）
- **resume**：摘除的全部节点原位还回（零闪烁）
- **dispose**：effect 逆序移除全部记账节点
- **HMR**：css-only 热替换（style 节点替换 textContent / Constructable 走 replaceSync）

## CSS-in-JS 补丁

运行时补丁拦截 emotion 类库的注入，规则前缀化 + 指标上报（cssinjs_patched）。

## 字体 registry

`@font-face` 自动提升到文档级（shadow 内字体加载问题），按应用记账（`fontRegistryEntries()`），随实例销毁释放。

## 主题服务

```typescript
createCordis({
  theme: {
    tokens: { primary: '#07c160' },                 // 配置即初始主题
    dark: { primary: '#0f172a' },                   // prefers-color-scheme: dark 叠加集
    followSystem: true,                             // 跟随系统（默认 false）
  },
})

host.theme.setTheme({ primary: '#4a6cf7' })   // 全量替换
host.theme.patchTheme({ radius: '6px' })      // 增量覆盖
host.theme.reset()                             // 回到配置初始态
```

- **唯一写点**：文档级 `:root` 的 `--tx-*` 变量（生命周期 = 宿主，不随应用卸载）
- **无事件广播**：应用消费 `var(--tx-primary)`，主题变更 CSS 变量特性自动响应
- 容器重置清单显式透传主题变量（`--tx-theme-primary: inherit`）——Shadow DOM 也不丢主题

## 冲突检测扫描（开发/诊断）

```typescript
host.devtools.scanStyleConflicts()
// => [{ selector: '.leaked', apps: ['app-a', 'app-b'], hitCount: 2 }]
```

扫描文档级样式规则，同一选择器命中 ≥2 个应用 = 跨应用样式泄漏（无 Shadow 隔离的典型症状）。跨源 stylesheet 与非法选择器跳过；`@media/@supports` 分组规则递归下探。
