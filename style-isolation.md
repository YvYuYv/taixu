# Cordis 样式隔离（Style Isolation）

> 对齐基线：[cordis-alignment.md](./cordis-alignment.md)。
> 样式生命周期统一声明（修复旧版双重标准）：**样式的创建与移除经 `ctx.effect` 挂在应用 fiber 上；dispose 时移除；Suspended（保活）时 shadow 内与文档级（head）样式节点一并摘除缓存、resume 一并还回**（与 lifecycle-management.md §5.3 一致，ADR-0033/0042）。

## 一、概述

CSS 天然全局共享。三类冲突：

1. 主应用与子应用冲突（全局 reset 互相影响）
2. 子应用之间冲突（同名类后加载覆盖）
3. 第三方组件库冲突（antd v3/v4 同页）

## 二、隔离策略选型

| 策略 | 机制 | 适用 | 局限 |
|------|------|------|------|
| 命名空间（推荐默认） | 构建期 PostCSS 前缀 | first-party 全部 | 需要构建接入；运行时生成的样式需 runtime 补丁（§2.4） |
| Shadow DOM | 天然边界 + 事件修复 | 重隔离需求/三方组件密集 | @font-face/Portal/事件 retarget 问题（§三） |
| CSS Modules / Scoped | 工程自身约定 | 已有工程 | 框架只做校验不做转换 |
| iframe | 天然隔离 | third-party 应用 | js-sandbox §五（本文不重复） |

## 三、命名空间策略（构建期）

### 3.1 PostCSS 前缀（修复 body/html 语义破坏）

```javascript
// @cordis-mf/postcss-prefix（宿主/子应用构建共用）
module.exports = (opts = {}) => ({
  postcssPlugin: 'cordis-prefix',
  Root(root) {
    root.walkRules((rule, i) => {
      // 每条选择器独立处理；跳过 @keyframes 内部与 :root 相关的宿主保留规则
      rule.selector = rule.selectors.map((sel) => {
        // 1) html/body 级选择器：转译为容器作用域等价物，而非对宿主 div 设 margin
        if (/^(html|body)$/.test(sel)) return `${opts.prefix} :where(*)`        // 容器内全元素选择器
        if (/^(html|body)[ >]/.test(sel)) return sel.replace(/^(html|body)/, opts.prefix)
        // 2) :root -> 容器（CSS 变量仍可经继承共享，见 §五）
        if (sel === ':root') return opts.prefix
        // 3) 普通选择器加前缀（保持特异性可控，用 :where 降权避免覆盖宿主）
        return `${opts.prefix} ${sel}`
      }).join(', ')
    })
    // @keyframes 名字改写（§3.2）；@font-face 提升（§3.3）；@import 展开（§3.4）
  },
})
```

- `body { margin:0 }` 语义修正：容器不是 body（vh/滚动/继承不同），转换为容器内 reset 并**文档声明差异**；宿主级 reset 属于宿主自己的样式域，不归子应用管
- 复合选择器 `html body .x` 前缀化后真实可匹配（`#tx-app1 .x`）

### 3.2 @keyframes / @counter-style 隔离（旧版完全缺失）

```javascript
// 构建期：名字重写为带应用前缀
// @keyframes spin -> @keyframes tx-app1-spin
root.walkAtRules('keyframes', (atRule) => {
  atRule.params = `${opts.ns}-${atRule.params}`
})
root.walkDecls(/^animation(-name)?$/, (decl) => {
  decl.value = decl.value.replace(/\b(spin|fade|...)\b/g, (n) => `${opts.ns}-${n}`)
})
```

- 动画名是**文档级全局命名空间**（Shadow DOM 内也一样）：两个应用同名 `spin` 后者劫持前者--必须重写
- 运行时兜底：js-sandbox 的 InjectedNodesTracker 发现未前缀的 style 注入时告警

### 3.3 @font-face 提升（Shadow DOM 关键限制）

- **Shadow DOM 内的 @font-face 不生效**（Chromium 行为）：构建期把 @font-face 规则**抽出为独立文件**，挂载时注入**文档级**（带 `tx-{appId}-` 字体家族前缀重写，避免家族名撞车）
- 字体去重：宿主维护 font registry（family+src 哈希），重复注册复用同一 @font-face（避免多应用重复下载/FOUT）

### 3.4 @import / @layer

- `@import` 构建期展开进前缀管线（ bundler 标准行为，显式声明不依赖运行时）
- `@layer` 名同样全局：`@layer base` -> `@layer tx-app1.base`（嵌套 layer 天然隔离）

### 3.5 CSS 变量继承（与 `all: initial` 的冲突修复）

- 旧 heterogeneous-loading 文档给容器 `all: initial`，会**重置自定义属性继承**，摧毁主题共享。修复：容器初始化改为**显式重置清单**：

```css
/* 容器初始化（不用 all:initial） */
#tx-app1 {
  all: unset;                    /* 只重置标准属性 */
  /* 注意：部分实现中 all:unset 仍影响继承的自定义属性 -> 用变量白名单恢复 */
  --tx-theme-primary: inherit;   /* 框架管理的主题变量显式透传（§五） */
  display: block; contain: content;
}
```

- 主题变量走**框架管理通道**（`--tx-*` 前缀），不依赖未受控继承

## 四、运行时与 Shadow DOM

### 4.1 Shadow DOM 路线

- 容器创建唯一路径 `lifecycle.createOutletContainer()`（基线 §五）；Shadow 选项在此层
- 样式注入：优先 **Constructable Stylesheets**（`adoptedStyleSheets`，替换式更新零重排；Safari 16.4+ 检测降级为 style 节点）
- 文档级例外（@font-face、全局 reset）经 §3.3 提升注入

### 4.2 Portal / 弹层容器重定向

```typescript
// 应用 apply 内（antd/Element 弹层默认挂 document.body -> 重定向到应用自己的 portal 容器）
ctx.effect(() => {
  const portal = lifecycle.getPortalContainer(ctx)     // Shadow 外、容器旁（继承应用命名空间样式）
  const doc = sandbox.documentProxy
  const rawBody = doc.body
  // 弹层容器查找重定向：Antd ConfigProvider getPopupContainer / Element appendTo 一等支持；
  // 未适配的库经 document.body 代理重定向（仅 append 弹层类节点，判断 el.role/类名特征）
  return () => { /* portal 随 fiber dispose 移除 */ }
})
```

- 滚动锁（`document.body.style.overflow`）：portal 容器代理拦截该赋值，改为容器级 `overflow:hidden`（不泄漏到主应用 body）
- z-index：宿主提供分层 registry（`--tx-z-modal` 等 token），弹层经 token 取值而非裸数字

### 4.3 React 16/17 事件 Retargeting（补丁细化）

- 合成事件名补全：`input/keydown/keyup/focusin/focusout/submit`（React16 focus 走 focusin 代理）
- `InputEvent` 保真：重新派发时复制 `data/inputType/isComposing`（React 受控组件依赖）
- `stopPropagation` 修复策略修正：**不再**在 shadow root 上无差别 stopPropagation（旧版误杀主应用 light DOM 合法监听）；改为 `composed: false` 重派发 + React 内部 listener 标记（React 17+ 事件挂 root 后该问题消失，补丁仅覆盖 16/17 legacy）

### 4.4 运行时生成的样式（CSS-in-JS / cssinjs，旧版缺失）

- antd v4 cssinjs / emotion/styled-components 运行时注入：命名空间路线下提供**运行时前缀补丁**（观测 style 注入，对规则文本做 §3.1 等价前缀重写，性能敏感应用建议改走 Shadow 路线）
- 检测：InjectedNodesTracker 发现未前缀规则 -> 开发模式告警 + DevTools 面板展示

## 五、主题共享

```typescript
class ThemeService extends Service {
  static [Context.provide] = 'theme'

  setTheme(theme: ThemeTokens) {
    // 文档级 :root 设置 --tx-* 变量（唯一写点；样式生命周期=宿主，不随应用卸载）
    for (const [k, v] of Object.entries(theme)) root.style.setProperty(`--tx-${k}`, v)
  }
}
```

- 运行时 `ctx.on('theme/change')`（旧版）与静态 `cordis.styles.json` 的 `theme.variables`（旧版 §10）两套并存 -> 统一为 ThemeService（配置即初始主题）
- 应用消费 `var(--tx-primary)`；主题变更应用自动响应（CSS 变量特性）
- prefers-color-scheme：ThemeService 内聚处理（dark/light token 集切换），不再有第二机制

## 六、样式生命周期（与 lifecycle 对齐）

| 事件 | 行为 |
|------|------|
| 挂载 | 注入 style/link（经 InjectedNodesTracker 记账；挂 ctx.effect） |
| Suspended | **scoped 到 shadow root 的样式随容器 DOM 一并摘除缓存；文档级（head）样式节点也一并摘除**（ADR-0033--否则挂起期间出现"幽灵样式"：应用看不见但样式仍作用于全局） |
| resume | 摘除的全部节点（shadow 内 + head 内）一并还回--恢复零闪烁 |
| dispose | effect 逆序移除全部记账节点（含文档级字体例外） |
| HMR（css-only） | §七真热替换 |

**样式节点的两条登记路径**（ADR-0033/0042）：

1. 显式 API：应用经 `ctx.style.inject(...)` 注册（lifecycle 可直接追踪）
2. 自动兜底：第三方库直接 `document.head.appendChild(style)` 的，由沙箱的 InjectedNodesTracker（js-sandbox §3.5）拦截 `appendChild`/`insertBefore`/`append`/`prepend`/`replaceChildren` 自动登记到当前应用的 SuspendScope--对库透明

挂起摘除/恢复还回由 lifecycle 执行（它持有 SuspendScope 的记账数据）；样式模块只保证记账完整。

## 七、HMR（修复目标节点找不到的 bug）

```typescript
// 注入时统一打标（style 与 link 两种节点都可被 HMR 定位）
styleNode.dataset.cordisApp = appId          // 旧版注入 <link> 却用 style[data-app-id] 查询 + innerHTML 更新

// css-only 热替换
hmr.on('update', ({ appId, file, css }) => {
  const target = document.querySelector(`style[data-cordis-app="${appId}"][data-file="${file}"]`)
  if (target) target.textContent = css                          // style 节点
  else sheet.replaceSync(css)                                   // Constructable Stylesheet 路线
  // link 路线：换 href 带 cache-busting query
})
```

## 八、验证与 DevTools

- 冲突检测：开发模式扫描文档级规则的选择器命中数（跨应用同名类命中 -> 告警）
- DevTools 样式面板：每应用注入规则数、文档级例外清单、字体 registry

## 九、实施计划

| 优先级 | 内容 |
|--------|------|
| P0 | PostCSS 前缀（含 html/body/:root 语义、keyframes 重写、@import 展开） |
| P0 | 注入记账 + ctx.effect 生命周期（dispose 移除/保活保留） |
| P1 | Shadow DOM 路线（Constructable Stylesheets + Portal 重定向 + React 事件补丁） |
| P1 | @font-face 提升 + 字体 registry、运行时 CSS-in-JS 补丁 |
| P2 | 主题服务、HMR css-only、冲突检测扫描 |

## 十、与旧文档差异一览

| 旧设计问题（评审编号） | 本版修复 |
|------------------------|----------|
| S-1 DOM 修改未用 ctx.effect（自违原则） | §六 统一声明 + 全部写点挂 effect |
| S-3 body/html 转换语义破坏 | §3.1 语义等价转换 + 差异声明 |
| S-4 @keyframes/@font-face/@import/@layer 缺失 | §3.2-3.4 |
| S-5 `all: initial` 切断变量继承 | §3.5 显式重置清单 + `--tx-*` 管理通道 |
| S-6 antd Portal 不完整/ReactDOM.render legacy | §4.2（渲染 API 统一 createRoot，基线 §五） |
| S-7 HMR 查询目标节点不存在 | §七 dataset 统一打标 |
| S-8 React16 事件补丁简化/stopPropagation 误杀 | §4.3 |
| S-9 锚点时序 | 注入记账统一（js-sandbox §3.5），锚点插件 prepend 注册 |
| S-10 Constructable Stylesheets 缺失 | §4.1 |
| 主题双机制 | §五 ThemeService 唯一 |
| 保活期间样式生命周期未定义 | §六 Suspended 摘除缓存（shadow 内 + head 内一并）、resume 还回 |
