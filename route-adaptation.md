# Cordis 路由适配层方案

## 一、问题分析

### 1.1 现有微前端路由的痛点

| 问题维度 | 具体表现 |
|----------|----------|
| **嵌套路由冲突** | 主应用 `/app1/detail` 与子应用 `/detail` 路径重叠时，两者路由表同时匹配 |
| **状态丢失** | 切换应用时，原应用的路由参数、query、hash 丢失 |
| **前进后退异常** | 浏览器前进后退按钮在跨应用切换时行为不一致 |
| **URL 同步** | 子应用内部导航后，主应用侧边栏/面包屑不更新 |
| **多版本路由共存** | 同一组件依赖 Vue Router 2.x 和 4.x 的两个版本，路由实例冲突 |

### 1.2 LinkJS 的现有方案

LinkJS 采用**主应用代理路由**模式：
- 主应用持有完整路由表
- 子应用通过 `LinkJS.navigate(path)` 委托主应用导航
- 子应用内部通过 `this.$router` 访问被代理的路由实例

**问题**：子应用无法独立管理路由，强依赖主应用实现。

---

## 二、Cordis 理论视角下的路由

### 2.1 路由即 Coeffect

在 Cordis 理论中，**路由是一种典型的共效应（coeffect）**：
- 它描述应用"从哪个上下文来"（当前路径）
- 它影响应用"到哪个上下文去"（目标路径）
- 它是**可逆的**：前进 ↔ 后退，push ↔ replace

```
路由 = coeffect<PathState>
```

### 2.2 路由上下文分层

```
┌─────────────────────────────────────────┐
│  Root Route Context（根路由上下文）       │
│  - 管理应用级路径：/app1, /app2          │
│  - 持有浏览器 History API                │
├─────────────────────────────────────────┤
│  Sub Route Context（子路由上下文）        │
│  - 管理子应用内部路径：/detail, /list    │
│  - 由父上下文派生，不直接操作 History    │
├─────────────────────────────────────────┤
│  Component Route Context（组件路由上下文）│
│  - 组件内部路由状态：params, query       │
│  - 响应式订阅父上下文变化                │
└─────────────────────────────────────────┘
```

---

## 三、适配层架构设计

### 3.1 核心设计原则

1. **子应用零改动**：现有 Vue 组件代码 `this.$router.push('/xxx')` 完全不变
2. **路由隔离**：每个子应用拥有独立路由表，互不干扰
3. **汇合性保证**：无论从哪个路径进入，最终状态一致
4. **可逆性**：前进后退在跨应用切换时正确工作

### 3.2 架构分层

```
┌─────────────────────────────────────────────────────────┐
│  声明层：cordis.routes.json                              │
│  声明每个子应用的路由前缀和路由表                          │
├─────────────────────────────────────────────────────────┤
│  构建层：vite-plugin-cordis-router                       │
│  构建时转换 Vue Router 实例为 Cordis 路由上下文           │
├─────────────────────────────────────────────────────────┤
│  运行时层：@cordis/router                                │
│  提供 createRouter、useRoute、useRouter 的 Cordis 版本   │
├─────────────────────────────────────────────────────────┤
│  桥接层：cordova-router-vue2 / cordis-router-vue3        │
│  将 Cordis 路由上下文桥接为 Vue Router 实例              │
└─────────────────────────────────────────────────────────┘
```

---

## 四、各层详细设计

### 4.1 声明层：`cordis.routes.json`

每个子应用根目录声明路由配置：

```json
{
  "routes": {
    "basePath": "/app1",
    "mode": "history",
    "routes": [
      { "path": "/", "component": "views/Home.vue" },
      { "path": "/detail/:id", "component": "views/Detail.vue" }
    ]
  },
  "fallback": {
    "enabled": true,
    "target": "/404"
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `basePath` | string | 子应用在浏览器 URL 中的路径前缀 |
| `mode` | `'history' \| 'hash'` | 路由模式，默认 history |
| `routes` | Route[] | 子应用路由表（与 Vue Router 格式一致） |
| `fallback.enabled` | boolean | 是否启用 404 兜底 |
| `fallback.target` | string | 404 页面路径 |

### 4.2 构建层：`vite-plugin-cordis-router`

#### 4.2.1 构建时转换规则

**转换目标**：将子应用的 `createRouter()` 调用转换为 Cordis 路由上下文创建。

**转换示例**：

```javascript
// 源代码（子应用，不改动）
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [...]
})

export default router
```

```javascript
// 构建后（插件自动生成）
import { __cordis_create_router__ } from '@cordis/router'

// 路由前缀由 cordis.routes.json 注入
const router = __cordis_create_router__({
  basePath: '/app1',           // 从 cordis.routes.json 读取
  mode: 'history',             // 从 cordis.routes.json 读取
  routes: [
    { path: '/', component: () => import('views/Home.vue') },
    { path: '/detail/:id', component: () => import('views/Detail.vue') }
  ],
  // 自动注入桥接配置
  __cordis_bridge__: {
    type: 'vue3',              // 检测 Vue 版本
    routerModule: 'vue-router' // 原始路由模块
  }
})

export default router
```

#### 4.2.2 Vue Router API 兼容转换

插件识别并转换常见的 Vue Router API 调用：

| 原始 API | 转换后 |
|----------|--------|
| `router.push('/path')` | `__cordis_router_push__('/path', '/app1')` |
| `router.replace('/path')` | `__cordis_router_replace__('/path', '/app1')` |
| `route.params` | `__cordis_route_params__()` |
| `route.query` | `__cordis_route_query__()` |
| `router.beforeEach(fn)` | `__cordis_router_guard__('beforeEach', fn)` |

#### 4.2.3 Vue 2 与 Vue 3 的差异处理

**Vue 2（Vue Router 3.x）**：
```javascript
// 构建时插件注入 mixin
Vue.mixin({
  beforeCreate() {
    // 将 Cordis 路由上下文注入为 this.$router
    if (this.$root === this && !this.$router) {
      this.$router = __cordis_get_router__(this)
    }
  }
})
```

**Vue 3（Vue Router 4.x）**：
```javascript
// 构建时插件自动包装 app.use(router)
const app = createApp(...)
// 原始：app.use(router)
// 转换后：
app.use(__cordis_bridge_router__(router, { type: 'vue3' }))
```

### 4.3 运行时层：`@cordis/router`

#### 4.3.1 核心 API

```typescript
// 创建 Cordis 路由上下文
function createRouteContext(config: {
  basePath: string
  mode: 'history' | 'hash'
  routes: Route[]
}): RouteContext

// 路由导航（内部使用）
function navigate(path: string, basePath?: string): void

// 获取当前路由状态（响应式）
function useRoute(): Reactive<RouteState>

// 获取路由导航方法
function useRouter(): Router

// 路由守卫（跨应用协调）
function beforeEach(guard: NavigationGuard): () => void
```

#### 4.3.2 路由状态同步机制

```typescript
// 路由状态结构
interface RouteState {
  fullPath: string        // 完整路径：/app1/detail/123?tab=info
  basePath: string        // 子应用前缀：/app1
  subPath: string         // 子应用内部路径：/detail/123
  params: Record<string, string>
  query: Record<string, string>
  hash: string
}

// 状态同步流程
// 1. 用户在子应用点击导航：router.push('/detail/123')
// 2. Cordis 路由拦截，拼接完整路径：/app1/detail/123
// 3. 调用根路由上下文更新浏览器 URL
// 4. 根路由广播变化事件
// 5. 所有子应用的路由上下文响应式更新
```

#### 4.3.3 跨应用路由协调

```typescript
// 路由上下文节点
interface RouteContextNode {
  context: RouteContext;
  children: Map<string, RouteContextNode>;
}

// 路由上下文树（支持多级嵌套）
class RouteContextTree {
  private root: RouteContextNode; // 根节点

  // 支持多级注册：/app1 下再注册 /app1/module-a
  register(basePath: string, context: RouteContext, parentPath?: string) {
    const parent = parentPath ? this.findNode(parentPath) : this.root;
    parent.children.set(basePath, { context, children: new Map() });
  }

  // 递归匹配最深的路由上下文
  resolve(fullPath: string): RouteContextNode[] {
    // 返回从 root 到最深匹配的节点链
    // 实现省略：根据路径前缀逐级向下匹配
    return matchedNodes;
  }

  // 子路由导航时，委托给根路由
  navigate(subPath: string, fromBase: string) {
    const fullPath = this.joinPath(fromBase, subPath)
    this.root.context.push(fullPath)  // 只有根路由操作 History API
  }

  // 浏览器前进后退时，从根路由分发到最深匹配的子路由
  onPopState(fullPath: string) {
    const nodes = this.resolve(fullPath)
    if (nodes.length > 0) {
      const deepestCtx = nodes[nodes.length - 1].context
      deepestCtx.syncFromRoot(fullPath)
    }
  }
}
```

#### 4.3.4 路由守卫跨应用处理

跨应用路由切换时，需要按顺序执行多个应用的路由守卫，并正确处理重定向或取消。

```typescript
class CrossAppGuardManager {
  private guards: Array<{ priority: number; guard: NavigationGuard }> = [];
  
  async runGuards(from: Route, to: Route): Promise<boolean> {
    // 按优先级排序执行
    const sorted = [...this.guards].sort((a, b) => a.priority - b.priority);
    for (const { guard } of sorted) {
      const result = await guard(from, to);
      if (result === false) return false; // 守卫拒绝，取消导航
      if (typeof result === 'string') {
        // 重定向
        await this.navigate(result);
        return false;
      }
    }
    return true;
  }
}
```

### 4.4 桥接层：`cordis-router-vue3` / `cordis-router-vue2`

#### 4.4.1 Vue 3 桥接实现

```typescript
// 将 Cordis 路由上下文桥接为 Vue Router 4.x 兼容实例
function bridgeToVueRouter(ctx: RouteContext): Router {
  const router = {
    // 实现 Vue Router 4.x 的 Router 接口
    push(to: RouteLocationRaw) {
      const path = resolvePath(to)
      ctx.navigate(path)
      return Promise.resolve()
    },

    replace(to: RouteLocationRaw) {
      const path = resolvePath(to)
      ctx.navigate(path, { replace: true })
      return Promise.resolve()
    },

    get currentRoute() {
      return reactive({
        path: ctx.subPath,
        fullPath: ctx.fullPath,
        params: ctx.params,
        query: ctx.query,
        hash: ctx.hash
      })
    },

    beforeEach(guard: NavigationGuard) {
      return ctx.addGuard('beforeEach', guard)
    },

    // ... 其他 Vue Router API 实现
  }

  return router
}
```

#### 4.4.2 Vue 2 桥接实现

```typescript
// 将 Cordis 路由上下文桥接为 Vue Router 3.x 兼容实例
function bridgeToVue2Router(ctx: RouteContext): VueRouter {
  const router = new VueRouter({
    mode: ctx.mode === 'history' ? 'history' : 'hash',
    base: ctx.basePath,
    routes: []  // 路由表由 Cordis 管理
  })

  // 拦截 Vue Router 的导航方法
  const originalPush = router.push
  router.push = (location, onComplete, onAbort) => {
    const path = resolvePath(location)
    ctx.navigate(path)
    // 不调用 originalPush，由 Cordis 统一管理
  }

  // 监听 Cordis 路由变化，同步到 Vue Router
  ctx.onChange((state) => {
    const vueRouterInternal = (router as any).history
    vueRouterInternal.updateRoute(state)
  })

  return router
}
```

> [!WARNING]
> **Vue 2 桥接脆弱性风险**：此处使用了 Vue Router 3.x 的内部 API `history.updateRoute(state)`。由于该 API 非公开，强依赖于特定版本的内部实现，如果微应用升级了 Vue Router 的非主版本，可能会导致桥接失效。建议在项目中严格锁定 Vue Router 3.x 的版本（推荐锁定 `3.6.5` 及以下）。

---

## 五、关键场景处理

### 5.1 场景：子应用内部导航

```
用户操作：在 /app1 子应用中点击 <router-link to="/detail/123">

流程：
1. Vue Router 拦截 click 事件
2. 调用 router.push('/detail/123')
3. Cordis 桥接层拦截，拼接 basePath：/app1/detail/123
4. 调用根路由 context.navigate('/app1/detail/123')
5. 根路由更新浏览器 URL（History API）
6. 根路由广播 onRouteChange 事件
7. /app1 子应用的路由上下文响应式更新 subPath = '/detail/123'
8. Vue Router 桥接实例触发 route change，组件重新渲染
```

### 5.2 场景：跨应用跳转

```
用户操作：在 /app1 子应用中调用 router.push('/app2/home')

流程：
1. Cordis 检测到目标路径前缀 /app2 不属于当前子应用
2. 触发主应用路由切换：卸载 /app1，加载 /app2
3. /app2 子应用路由上下文初始化，subPath = '/home'
4. 浏览器 URL 更新为 /app2/home
```

> [!NOTE]
> **query/hash 保留机制**：在跨应用导航时，Cordis 路由上下文会自动提取 `from` 路由的 query 和 hash，并在生成目标路径时进行合并。如果在 `router.push({ path: '/app2/home', query: { k: 'v' } })` 中显式传递了参数，则会覆盖默认保留的 query/hash，保证应用间状态平滑传递。

### 5.3 场景：浏览器前进后退

```
用户操作：点击浏览器后退按钮

流程：
1. 浏览器触发 popstate 事件
2. 根路由上下文接收新 URL：/app1/list
3. 根路由匹配 basePath = /app1
4. 分发给 /app1 子路由上下文
5. /app1 子路由更新 subPath = '/list'
6. Vue 组件响应式更新
```

### 5.4 场景：多版本 Vue Router 共存

```
场景：/app1 使用 Vue Router 3.x，/app2 使用 Vue Router 4.x

Cordis 解决方式：
1. 两个子应用各自 import 自己的 vue-router 版本
2. 构建时插件分别桥接为 Cordis 路由上下文
3. 运行时两个桥接实例共享同一个 RouteContextTree
4. 路由状态通过 Cordis 上下文同步，互不干扰
```

### 5.5 场景：混合路由模式（主应用 History + 子应用 Hash）

在实际微前端场景中，主应用可能使用 `history` 模式，而某些子应用因历史包袱必须使用 `hash` 模式。Cordis 适配层通过将 basePath 与模式特定逻辑结合来解决此问题：

```typescript
// 混合模式支持：主应用 history 模式 + 子应用 hash 模式
class MixedModeRouter {
  navigate(path: string, context: RouteContext) {
    if (context.mode === 'hash') {
      // 子应用内部路由使用 hash
      const fullPath = `${context.basePath}#${path}`;
      window.history.pushState(null, '', fullPath);
    } else {
      // 正常 history 模式
      window.history.pushState(null, '', `${context.basePath}${path}`);
    }
  }
}
```

### 5.6 场景：深度链接（应用未加载时的路由保留）

当用户直接通过一个带有子应用深层路径的 URL（如 `/app1/detail/123`）访问时，对应的子应用可能尚未加载。适配层需要拦截此路由并暂存状态：

```typescript
// 深链接支持：应用未加载时保存路由
class DeepLinkResolver {
  async resolve(fullPath: string) {
    const context = this.routeTree.resolve(fullPath);
    const app = this.appRegistry.getApp(context.appId);
    
    if (!app.isLoaded) {
      // 保存待导航路径
      this.pendingNavigation = fullPath;
      // 加载应用
      await this.lifecycleManager.load(context.appId);
      await this.lifecycleManager.activate(context.appId);
      // 应用加载完成后，导航到保存的路径
      context.navigate(this.pendingNavigation);
    }
  }
}
```

---

## 六、与 LinkJS 方案对比

| 维度 | LinkJS | Cordis 路由适配层 |
|------|--------|-------------------|
| **子应用改动量** | 需要调用 `LinkJS.navigate()` | 零改动，`router.push` 原生使用 |
| **路由独立性** | 子应用无法独立管理路由 | 子应用拥有完整路由表 |
| **多版本共存** | 不支持 | 原生支持 |
| **跨应用导航** | 依赖主应用路由表 | 基于 basePath 自动路由 |
| **前进后退** | 偶有异常 | 汇合性保证一致性 |
| **类型安全** | 部分丢失 | 保留原始 Vue Router 类型 |

---

## 七、配置示例

### 7.1 主应用配置

```javascript
// main-app/src/main.js
import { createApp } from 'vue'
import { createCordisRouter } from '@cordis/router'

const app = createApp(App)

// 创建根路由上下文
const routeTree = createCordisRouter({
  mode: 'history',
  apps: {
    '/app1': {
      loader: () => import('app1/dist/main.js')
    },
    '/app2': {
      loader: () => import('app2/dist/main.js')
    }
  }
})

app.use(routeTree)
app.mount('#app')
```

### 7.2 子应用配置

```javascript
// sub-app1/src/main.js
import { createApp } from 'vue'
import App from './App.vue'

// 子应用不需要知道 Cordis 的存在
// 构建时插件会自动处理路由
import router from './router'  // 原生 Vue Router 写法

const app = createApp(App)
app.use(router)  // 构建时被插件转换为 Cordis 桥接
app.mount('#app')
```

---

## 八、实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 子应用内部导航 | 基础功能，必须首先实现 |
| P0 | 浏览器前进后退 | 基础体验保证 |
| P1 | 跨应用跳转 | 微前端核心场景 |
| P1 | Vue 3 桥接 | 新项目优先使用 Vue 3 |
| P2 | Vue 2 桥接 | 兼容存量项目 |
| P2 | 路由守卫协调 | 跨应用守卫顺序 |
| P3 | 多版本路由共存 | 渐进式迁移场景 |
