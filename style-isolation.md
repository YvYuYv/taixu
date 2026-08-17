# 样式隔离 (Style Isolation)

## 1. 样式隔离概述

微前端架构中，将多个独立开发、独立部署的应用集成到同一个页面中运行时，样式冲突是一个极为常见且棘手的问题。

### 微前端样式冲突的根本原因
由于 CSS 的设计天然是全局共享的，没有原生的作用域概念（除了较新的 Shadow DOM）。在一个 Document 下加载的所有样式表，都会影响整个页面的所有 DOM 元素。

### 三种典型的样式冲突场景
1. **主应用与子应用冲突**：主应用的全局重置样式（如 `reset.css` 或 `normalize.css`）可能会影响子应用的布局；子应用也可能无意中覆盖主应用的样式。
2. **子应用与子应用冲突**：当页面上同时存在多个子应用，或者在多个子应用之间切换时，如果存在同名的 CSS 类，后加载的样式会覆盖先加载的样式。
3. **第三方组件库冲突**：不同应用如果使用了不同版本的同一个 UI 组件库（例如 antd v3 和 antd v4），且没有隔离类名前缀，会导致严重的样式错乱。

## 2. 隔离策略

### 2.1 命名空间策略（推荐）
在构建阶段，通过给所有的 CSS 选择器自动加上应用的特定前缀（如属性选择器或类名前缀），实现样式的隔离。这种方式对业务代码侵入性小，兼容性好。

#### PostCSS 插件实现
可以借助 PostCSS 插件在编译时自动添加前缀：

```typescript
// postcss.config.js
module.exports = {
  plugins: [
    require('postcss-prefix-selector')({
      prefix: '#taixu-app-react16',
      transform: function (prefix, selector, prefixedSelector) {
        if (selector === 'body' || selector === 'html') {
          return prefix;
        }
        return prefixedSelector;
      }
    })
  ]
};
```

#### 示例代码
原始 CSS:
```css
.container { color: red; }
```
经过转换后的 CSS:
```css
#taixu-app-react16 .container { color: red; }
```

### 2.2 Shadow DOM 策略（强隔离）
利用 Web Components 的 Shadow DOM 特性，将子应用挂载到 Shadow Root 中。Shadow DOM 内部的样式不会泄漏到外部，外部的样式也不会影响到内部。

#### 优缺点分析
- **优点**：提供浏览器原生的严格隔离，彻底解决样式冲突。
- **缺点**：
  - 弹窗组件问题：很多 UI 库的弹窗默认挂载到 `document.body`，会导致弹窗丢失内部样式。
  - 性能开销：创建 Shadow DOM 有一定的性能成本。
  - 事件代理：React 17 之前的版本，事件代理在 document 上，与 Shadow DOM 的事件冒泡机制存在冲突。

#### CSS-in-JS 库的兼容性问题及解决方案
许多 CSS-in-JS 库默认将 `<style>` 标签插入到 `<head>` 中，在 Shadow DOM 模式下会失效。需要通过配置将样式注入到 Shadow Root 中（见第5节）。

### 2.3 CSS Modules 策略
通过在构建时（如 Webpack、Vite）将类名进行 Hash 化处理，确保全局类名的唯一性。

#### 与各框架的集成
- React/Vue 中直接支持 `xxx.module.css`。
```typescript
import styles from './Button.module.css';
// 编译后: .Button_primary__2k9j
<button className={styles.primary}>Click</button>
```
缺点是只能隔离自己写的代码，无法自动隔离引用的第三方库样式。

### 2.4 CSS Scoped 策略
Vue 提供的 `<style scoped>` 方案。通过在 HTML 标签上添加唯一的 data 属性，并结合 CSS 属性选择器来实现样式的作用域。

```html
<style scoped>
.example { color: red; }
</style>
<template>
  <div class="example">hi</div>
</template>
```
编译后：
```html
<style>
.example[data-v-f3f3eg9] { color: red; }
</style>
<div class="example" data-v-f3f3eg9>hi</div>
```

## 3. 主题变量共享

微前端中，通常希望各个子应用能够与主应用保持一致的主题风格。

### CSS 自定义属性跨应用共享
利用 CSS 变量（CSS Custom Properties）具有继承性的特点。主应用在 `:root` 或者子应用挂载的父节点上定义 CSS 变量，子应用直接消费这些变量。

### 主题切换机制
主应用负责维护主题状态并下发变量，子应用只需使用。

```typescript
// 主应用注册主题
ctx.plugin((ctx) => {
  ctx.on('theme/change', (theme: 'light' | 'dark') => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.style.setProperty('--primary-color', '#000000');
      root.style.setProperty('--text-color', '#ffffff');
    } else {
      root.style.setProperty('--primary-color', '#1890ff');
      root.style.setProperty('--text-color', '#333333');
    }
  });
});
```

## 4. 样式动态注入与清理

为了避免卸载后的子应用样式污染全局，样式的生命周期必须与应用的生命周期绑定。在 Taixu 框架中，可以使用 Cordis 的 `ctx.effect()` 来管理副作用的自动清理。

### 使用 cordis ctx.effect() 自动清理
```typescript
import { Context } from 'cordis';

export function stylePlugin(ctx: Context, config: { url: string }) {
  // 当插件/服务被激活时注册副作用
  ctx.effect(() => {
    // 动态插入 <style> 标签
    const styleElement = document.createElement('link');
    styleElement.rel = 'stylesheet';
    styleElement.href = config.url;
    document.head.appendChild(styleElement);

    // 返回的函数会在插件卸载或该 effect 被清理时自动调用
    return () => {
      document.head.removeChild(styleElement);
    };
  });
}
```

## 5. CSS-in-JS 兼容性

在使用 Shadow DOM 作为样式隔离方案时，`styled-components` 和 `Emotion` 会遇到样式插入位置的问题。

### styled-components 解决方案
使用 `StyleSheetManager` 将样式重定向到对应的 Shadow Root 节点。

```typescript
import { StyleSheetManager } from 'styled-components';

function App({ shadowRoot }) {
  return (
    <StyleSheetManager target={shadowRoot}>
      <YourApp />
    </StyleSheetManager>
  );
}
```

### Emotion 解决方案
使用 `CacheProvider` 创建自定义的缓存实例并指定 `container`。

```typescript
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';

function App({ shadowRoot }) {
  const cache = createCache({
    key: 'taixu-emotion',
    container: shadowRoot,
  });

  return (
    <CacheProvider value={cache}>
      <YourApp />
    </CacheProvider>
  );
}
```

## 6. 样式加载顺序控制

当主应用和多个子应用同时存在时，样式的加载顺序决定了样式的覆盖优先级。

### 样式优先级策略
1. **主应用基础样式** 应该最先加载。
2. **子应用样式** 随后加载，以便能够覆盖基础样式中不符合子应用需求的部分。
3. **动态注入样式**（如组件库按需加载的 CSS）通常会附加到 `<head>` 尾部。

Taixu 框架通过维护一个统一的样式注入锚点来控制：
```typescript
ctx.plugin((ctx) => {
  const taixuStyleAnchor = document.createComment('taixu-styles-anchor');
  document.head.appendChild(taixuStyleAnchor);

  ctx.on('app/load-style', (styleNode) => {
    // 确保子应用的样式始终插入在锚点之前
    document.head.insertBefore(styleNode, taixuStyleAnchor);
  });
});
```

## 7. 样式热更新

在开发模式下，Taixu 支持通过 WebSocket 监听样式文件的变化，并通过 HMR 机制进行热更新。
当监听到样式变化时，Taixu 会拦截更新，不刷新整个页面，而是通过 Cordis 事件机制通知对应的微应用替换特定的 `<style>` 标签或重新加载 CSS。

```typescript
ctx.on('hmr/style-update', (payload) => {
  const { appId, cssContent } = payload;
  const styleNode = document.querySelector(`style[data-app-id="${appId}"]`);
  if (styleNode) {
    styleNode.innerHTML = cssContent;
  }
});
```

## 8. 配置声明

Taixu 支持通过配置文件声明应用的样式策略。

### `cordis.styles.json` 格式
```json
{
  "isolationMode": "namespace",
  "namespace": {
    "prefix": "#taixu-app-vue3"
  },
  "shadowDOM": false,
  "theme": {
    "inherit": true,
    "variables": {
      "primary-color": "#42b983"
    }
  },
  "injectedStyles": [
    "https://cdn.example.com/global.css"
  ]
}
```

## 9. 最佳实践

### 不同场景下的策略选择建议
- **新项目开发**：推荐首选 **CSS Modules** 或框架自带的 **Scoped CSS** 配合 **CSS Variables**，从源头避免冲突。
- **老项目接入 / 巨石应用拆分**：由于老项目可能存在大量全局样式，推荐使用 **命名空间策略** (通过 PostCSS 构建时加前缀)，这种方式侵入性最小。
- **极端严格要求 / 不信任的第三方接入**：使用 **Shadow DOM**，但需注意妥善处理弹窗组件挂载点和 CSS-in-JS 的兼容性。

### 性能考量
- 尽量避免频繁插入和删除大量的 DOM 节点（如不断切换微应用时导致 `<style>` 的挂载和卸载）。
- 对大规模 CSS 应用启用缓存，避免每次挂载微应用都重新解析相同的 CSS 文本。
- Shadow DOM 在低端设备上创建多个隔离环境时可能会有内存和性能压力，按需使用。
