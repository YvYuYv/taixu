/**
 * Vue Router 4/3 桥接（route-adaptation §5.1/§5.2，P1）。
 *
 * - VR4（createCordisRouter）：CordisRouterLike——current 为稳定引用（修复旧版每次
 *   get 新建对象导致依赖收集失效）；push/replace 返回真实 Promise（导航完成才
 *   resolve，修复旧版 Promise.resolve() 使 await 失效）；跨 Vue 副本安全——
 *   桥接不引用运行时全局 reactive，reactive 容器与 computed 均由子应用入口注入
 *   （同一 Vue 副本）或整体退化为纯 getter + onChange 订阅回调
 * - API 范围声明（§5.1"其余 API 按需映射；范围明确列出"）：本桥映射
 *   currentRoute/push/replace/go/back/forward/beforeEach/isReady/onChange；
 *   afterEach/beforeResolve/resolve/getRoutes/params 解析**不在本桥**（路由表归
 *   子应用自己的 Router，位置事实归 Cordis）
 * - VR3（bridgeVueRouter2）：abstract 模式实例 + 全 API 代理（消除双写 History）；
 *   currentRoute 受控更新（不依赖 3.6.5 内部 API history.updateRoute）；$router
 *   经 Vue.prototype 注入（修复旧版仅 this.$root 赋值子组件取不到）
 */
import type { Context } from 'cordis'
import type { GuardResult, RouteLocation } from './events'

/** 桥接路由对象（VR4 currentRoute 形状的最小面） */
export interface BridgeRoute {
  path: string
  query: Record<string, string>
  fullPath: string
  name: null
  params: Record<string, string>
  matched: never[]
  meta: Record<string, unknown>
}

/** 归一化导航目标：字符串 '/a?b=1' 或 { path, query } */
function normalize(to: string | Partial<RouteLocation>): { path: string; query: Record<string, string> } {
  if (typeof to !== 'string') return { path: to.path ?? '/', query: { ...(to.query ?? {}) } }
  const [path, search = ''] = to.split('?')
  const query: Record<string, string> = {}
  for (const pair of search.split('&').filter(Boolean)) {
    const [k, v = ''] = pair.split('=')
    if (k) query[decodeURIComponent(k)] = decodeURIComponent(v)
  }
  return { path: path || '/', query }
}

function toBridgeRoute(loc: RouteLocation): BridgeRoute {
  const search = new URLSearchParams(loc.query).toString()
  return {
    path: loc.path,
    query: { ...loc.query },
    fullPath: search ? `${loc.path}?${search}` : loc.path,
    name: null,
    params: {},
    matched: [],
    meta: {},
  }
}

export interface NavigateOutcome {
  status: 'ok' | 'superseded' | 'guarded' | 'denied' | 'error'
}

/** VR4 桥（§5.1）：不依赖 vue-router 运行时（子应用自己的 Router 类型可结构兼容） */
export interface CordisRouterBridge {
  readonly currentRoute: BridgeRoute
  /** 位置订阅（退化路径：无注入 computed 时，子应用框架层经此驱动自身响应式） */
  onChange(fn: (route: BridgeRoute) => void): () => void
  push(to: string | Partial<RouteLocation>): Promise<NavigateOutcome>
  replace(to: string | Partial<RouteLocation>): Promise<NavigateOutcome>
  go(delta: number): void
  back(): void
  forward(): void
  /** VR4 beforeEach 语义：映射到 router/navigate 守卫管线（serial）；返回退订 */
  beforeEach(guard: (to: BridgeRoute) => GuardResult | Promise<GuardResult> | undefined): () => void
  isReady(): Promise<void>
}

/**
 * VR4 桥工厂：`options.computed` 由子应用入口注入**自己 Vue 副本**的 computed
 * （跨副本安全——旧版用框架运行时 Vue 创建对象，子应用沙箱内另一份 Vue 互不识别）。
 * 未注入时退化为纯 getter + onChange（订阅者驱动，桥本身不引任何响应式 API）。
 */
export function createCordisRouter(
  ctx: Context,
  options: {
    outlet?: string
    /** 子应用自己 Vue 副本的 reactive（容器包装——computed 依赖收集的前提） */
    reactive?: <T extends object>(value: T) => T
    /** 子应用自己 Vue 副本的 computed（须与 reactive 同源配对注入，否则 computed 永不失效） */
    computed?: <T>(getter: () => T) => { readonly value: T }
  } = {},
): CordisRouterBridge {
  const outlet = options.outlet ?? 'main'
  // 稳定容器（§5.1 shallowReactive 同形）：注入版包 reactive（属性替换触发依赖收集），
  // 退化版为普通对象（getter + onChange 订阅面驱动）
  const box = { route: toBridgeRoute(ctx.router.current(outlet)) }
  const currentRef = options.reactive ? options.reactive(box) : box
  const listeners = new Set<(r: BridgeRoute) => void>()
  const apply = (loc: RouteLocation) => {
    const next = toBridgeRoute(loc)
    if (options.reactive) {
      currentRef.route = next // reactive 容器内替换（触发子应用侧依赖更新）
    } else {
      Object.assign(box.route, next) // 退化版：稳定对象字段更新
    }
    for (const fn of listeners) fn(currentRef.route)
  }
  ctx.router.watch(ctx, outlet, apply)

  const currentRoute = options.computed
    ? options.computed(() => currentRef.route) // 注入版：读取 reactive 属性（依赖可收集）
    : { get value() { return box.route } } // 退化版：纯 getter 订阅面

  const navigate = async (to: string | Partial<RouteLocation>, replace: boolean): Promise<NavigateOutcome> => {
    const { path, query } = normalize(to)
    // push/replace 返回真实 Promise：navigate 完成后才 resolve（await 语义成立）
    return ctx.router.navigate({ path, query }, { caller: ctx, outlet, replace }) as Promise<NavigateOutcome>
  }

  return {
    get currentRoute() {
      return currentRoute.value
    },
    onChange(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    push: (to) => navigate(to, false),
    replace: (to) => navigate(to, true),
    go: (delta) => history.go(delta), // 原生（popstate 管线接管）
    back: () => history.go(-1),
    forward: () => history.go(1),
    beforeEach(guard) {
      // 映射到守卫管线：本槽位守卫以 BridgeRoute 形状见 to
      const off = ctx.on('router/navigate', (e) => {
        if (e.outlet !== outlet) return undefined
        return guard(toBridgeRoute(e.to))
      }, { global: true })
      return off
    },
    isReady: () => Promise.resolve(),
  }
}

/** VR3 桥的最小结构面（VueRouter 2/3 实例鸭子面；abstract 模式） */
export interface VueRouter2Like {
  push(to: unknown): unknown
  replace(to: unknown): unknown
  go(delta: number): void
  back(): void
  forward(): void
  currentRoute: unknown
  options?: { routes?: unknown[] }
}

/** VR2/3 桥（§5.2）：真实实例 + 全 API 代理（abstract 模式实例由调用方 new，本桥接管读写） */
export function bridgeVueRouter2(
  ctx: Context,
  Vue: { prototype: object },
  router: VueRouter2Like,
  options: { outlet?: string } = {},
): VueRouter2Like {
  const outlet = options.outlet ?? 'main'
  // abstract 模式：实例不监听 popstate/hashchange（消除与 Cordis 根路由双写 History）
  router.push = (to) => ctx.router.navigate(normalize(to as string | Partial<RouteLocation>), { caller: ctx, outlet }) as unknown
  router.replace = (to) =>
    ctx.router.navigate(normalize(to as string | Partial<RouteLocation>), { caller: ctx, outlet, replace: true }) as unknown
  router.go = (delta) => history.go(delta)
  router.back = () => history.go(-1)
  router.forward = () => history.go(1)
  // currentRoute 受控更新（不再依赖内部 API history.updateRoute / 锁版本）
  ctx.router.watch(ctx, outlet, (loc) => {
    router.currentRoute = toBridgeRoute(loc)
  })
  // $router 注入：Vue.prototype（修复旧版仅 this.$root 赋值、子组件取不到）
  Object.defineProperty(Vue.prototype, '$router', { get: () => router, configurable: true })
  return router
}
