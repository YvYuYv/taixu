import { Context } from 'cordis'
import './events'
import { MonitorService, type MonitorConfig } from './services/monitor'
import { SecurityService, type PermissionRule, type SecurityConfig } from './services/security'
import { isIsolateAllowed } from './services/security/sanitizers'
import { SandboxService } from './services/sandbox'
import { DepsService, type AppManifestEntry } from './services/deps'
import { LifecycleService, type RecoveryConfig } from './services/lifecycle'
import { KeepAliveService, type KeepAliveConfig, type KeepAliveHost } from './services/keepAlive'
import { StyleService, type StyleConfig } from './services/style'
import { ThemeService, type ThemeConfig, type ThemeTokens } from './services/theme'
import { freezePrototypes } from './services/harden'
import { RouterService, type RouteRule, type RouterConfig } from './services/router'
import { StateService, type StateConfig } from './services/state'
import type { TracingConfig } from './services/tracing'
import { BusService, type BusConfig } from './services/bus'
import { TracingService } from './services/tracing'
import { DevToolsService, HmrService } from './services/devtools'
import { SuspendScopeService } from './services/suspendScope'
import { defineCordisApp } from './vue3-adapter'

export { MonitorService } from './services/monitor'
export type { MonitorConfig, AlertRule, AppMonitor, SourcemapRewriter, PrivacyConfig, OverheadBudget } from './services/monitor'
export { redactText, redactUrl, newSessionId, dntEnabled, DEFAULT_SENSITIVE_KEYS } from './services/monitor/pii'
export { SecurityService } from './services/security'
export type { PermissionRule, PermissionVerdict, SecurityConfig } from './services/security'
export { SandboxService } from './services/sandbox'
export { prefixSelectors } from './services/style'
export { createSandbox, storagePrefix } from './sandbox'
export { createIframeSandbox, IframeBridge } from './services/sandbox'
export type { IframeSandboxOptions, IframeBridgeOptions, Envelope } from './services/sandbox'
export { createLiteRuntime } from './lite-runtime'
export type { LiteRuntime, LiteCtx, LiteTransport } from './lite-runtime'
export { SandboxDisposedError, AppDisabledError, DependencyConflictError } from './errors'
export type { Sandbox, SandboxOptions } from './sandbox'
export { createProbeApp } from './probe'
export type { ProbeReport, ProbeOptions } from './probe'
export { DepsService } from './services/deps'
export type { AppManifestEntry, SharedModule, NegotiateOptions, ResilientLoadOptions } from './services/deps'
export { satisfies as satisfiesSemver } from './services/deps'
export { LifecycleService } from './services/lifecycle'
export type { AppInstance, MountOptions, RecoveryConfig, LifecycleConfig, AppExternalState } from './services/lifecycle'
export { KeepAliveService } from './services/keepAlive'
export type { KeepAliveConfig, KeepAliveHost } from './services/keepAlive'
export { createScopedFetch } from './services/scopedFetch'
export { StyleService } from './services/style'
export type { StyleAsset, StyleConfig, CSSStyleSheetLike } from './services/style'
export { RouterService } from './services/router'
export type { RouteRule, RouterConfig, GuardResult, MountIntent, IntersectionObserverLike } from './services/router'
export { ThemeService } from './services/theme'
export { freezePrototypes, DEFAULT_FREEZE_TARGETS } from './services/harden'
/** SSR 水合（route-adaptation §六，F5 阶段 1）：宿主读 payload -> initialUrl 单一源接入 */
export { readHydrationPayload, hydrationMismatch, type HydrationPayload } from './services/router/hydration'
export type { ThemeConfig, ThemeTokens } from './services/theme'
export { StateService } from './services/state'
export type { StateConfig, PersistConfig, CrossTabChannel } from './services/state'
/** 版本冲突消解（state-sharing §4.5）：注入 StateConfig.conflict 替换默认 reject 策略 */
export { lwwResolver, mergeResolver, defaultMerge, REJECT_RESOLVER } from './services/state/conflict'
export type { ConflictResolver, ConflictResolution, StateConflict } from './services/state/conflict'
export type { WatchOptions as StateWatchOptions, GetOptions as StateGetOptions, SetOptions as StateSetOptions } from './services/state'
export { BusService, parseTraceparent } from './services/bus'
export type { Reply, BusInstance, BusConfig, DeadLetterRecord, SendMessageInput, RequestOptions, NetworkMiddleware } from './services/bus'
export { TracingService, parseTraceparent as parseTraceparentForTracing, formatTraceparent } from './services/tracing'
export { DevToolsService, HmrService } from './services/devtools'
export type { DevToolsSnapshot, DevToolsCommand, HmrCssUpdate } from './services/devtools'
export type { TracingConfig, SpanRecord, Span } from './services/tracing'
export { SuspendScopeService } from './services/suspendScope'
export type { SuspendReconnect, SuspendScope, SuspendClosedSocket, SuspendSocketHandle } from './services/suspendScope'
export { defineCordisApp } from './vue3-adapter'
export type { CordisAppOptions } from './vue3-adapter'
/** Angular 适配器（heterogeneous-loading §4.2，P2 **实验性**：standalone + AOT 路线，F6） */
export { defineCordisAngularApp } from './angular-adapter'
/** Vue 2 适配器（heterogeneous-loading §4.2/§八 多版本共存，F6 子项）：经共享依赖 vue@^2 */
export { defineCordisVue2App } from './vue2-adapter'
export type { CordisVue2AppOptions, Vue2Module, Vue2Ctor, Vue2Instance } from './vue2-adapter'
/** AMD per-app 命名空间（heterogeneous-loading §7.1，F6 子项）：legacy 路线同名模块按 appId 隔离 */
export { createAmdNamespace, type AmdNamespace } from './amd-namespace'
export type { CordisAngularAppOptions, AngularCoreModule, AngularApplicationRef } from './angular-adapter'
export { useSharedState, defineSharedState } from './state-adapters'
export { CordisProvider, useCordis, useSharedState as useReactSharedState } from './react-adapter'
export { createCordisRouter, bridgeVueRouter2 } from './router-bridge'
export type { CordisRouterBridge, BridgeRoute, VueRouter2Like, NavigateOutcome } from './router-bridge'
export * from './events'

/** createCordis 配置：阈值均经配置注入（测试注小值触发，生产默认按各 ADR） */
export interface CreateCordisOptions {
  /** 权限规则（本地可判定，deny-by-default，ADR-0051） */
  permissions?: PermissionRule[]
  /** security 扥展配置（allowInsecure/queryBlacklist/限流窗口/SRI 清单；rules 以 permissions 为准） */
  security?: Omit<SecurityConfig, 'rules'>
  /** 应用清单（appId + 入口工厂） */
  apps?: AppManifestEntry[]
  /** style 配置（Constructable Stylesheet 工厂注入等） */
  style?: StyleConfig
  /** deps 扩展配置（容灾退避/共享依赖清单声明，cordis.dependencies.json 形状） */
  deps?: { retryBackoffMs?: number; shared?: Record<string, import('./services/deps').SharedDeclaration> }
  /** 错误恢复策略（lifecycle §六） */
  recovery?: RecoveryConfig
  /** 槽位选择器映射 */
  outlets?: Record<string, string>
  /** 路由规则（basePath -> appId，路径段边界匹配，route-adaptation §3.3） */
  routes?: RouteRule[]
  /** 挂载意图回调（lifecycle -> router 单向接线，基线 §2.3；测试/宿主注入） */
  onResolve?: RouterConfig['onResolve']
  /** router 扩展配置（懒 outlet 清单/IO 注入等；routes 与 onResolve 以顶层为准） */
  router?: Omit<RouterConfig, 'routes' | 'onResolve'>
  /** bus 配置（挂起队列上限/回放批大小，§5.5；测试注小值） */
  bus?: BusConfig
  /** monitor 配置（告警规则/冷却/错误率阈值，§七；测试注小窗口） */
  monitor?: MonitorConfig
  /** 主题配置（style-isolation §五，F7）：配置即初始主题 —— `--tx-*` 变量写点 */
  theme?: ThemeConfig
  /**
   * 原型守护（js-sandbox §3.3，F12）：createCordis 启动期冻结内建原型（默认集
   * DEFAULT_FREEZE_TARGETS），阻断「应用侧 monkey-patch 原型影响所有应用」的污染向量。
   *
   * **默认关闭（与规范"默认冻结"的偏差）**：实测全量冻结与 cordis 运行时自身不兼容
   * （cordis 内部存在对对象 constructor 的写点，属外部依赖不可修——81/343 用例失败）。
   * 宿主显式开启前须完成自有兼容性验证（实验性，可用性优先）。
   */
  prototypeGuard?: { enabled?: boolean; targets?: readonly object[] }
  /** state 配置（持久化/跨 tab/敏感键，§七） */
  state?: StateConfig
  /** tracing 配置（span 缓冲容量，§八） */
  tracing?: TracingConfig
  /** 保活池预算（LRU 上限/水位/快照池，§5.4/§5.5；测试注小阈值触发） */
  keepAlive?: KeepAliveConfig
}

/**
 * 声明应用清单条目：defineApp(appId, entryFactory, options?)。
 * 入口工厂在每次挂载事务中调用（重试 = 新事务 = 新插件实例）。
 * options.version/migrate 参与驱逐快照的版本裁决（ADR-0034）。
 */
export function defineApp(
  appId: string,
  entry: () => unknown,
  options: {
    version?: number
    migrate?: AppManifestEntry['migrate']
    keepAlive?: AppManifestEntry['keepAlive']
    /** Shadow DOM 路线（style-isolation §4.1）：容器挂 open shadowRoot */
    shadow?: boolean
  } = {},
): AppManifestEntry {
  return { appId, entry, ...options }
}

/**
 * root ctx 方法守卫共用包装（isolate 白名单 / 核心服务替换，ADR-0010/0011）：
 * 以 own property 遮蔽原型方法；原始方法以**调用点 this** 执行（子 ctx 经原型链
 * 取得同一包装时不被钉死在 root 作用域）。
 */
function wrapRootMethod<M extends string>(
  ctx: Context,
  method: M,
  makeWrapper: (invoke: (this: Context, ...args: never[]) => unknown) => (this: Context, ...args: never[]) => unknown,
  guardName: string,
): void {
  const holder = ctx as unknown as Record<M, (this: Context, ...args: never[]) => unknown>
  const raw = holder[method]
  const wrapped = makeWrapper(function (this: Context, ...args: never[]) {
    return raw.apply(this, args)
  })
  try {
    Object.defineProperty(ctx, method, { value: wrapped, writable: true, configurable: true })
  } catch {
    // ctx 不可包装：守卫安装失败属框架环境异常，交由上层可见（不静默）
    throw new Error(`createCordis: failed to install ${guardName}`)
  }
}

/**
 * isolate 白名单守卫（ADR-0010/0003）：非白名单标签抛错拦截（deny-by-default）
 * 并留 security/violation 审计痕。
 */
function installIsolateGuard(ctx: Context): void {
  wrapRootMethod(ctx, 'isolate', (invoke) => function (this: Context, name: never, symbol?: never) {
    if (!isIsolateAllowed(name as unknown as string)) {
      ctx.emit('security/violation', { appId: 'root', rule: 'isolate-non-whitelisted', detail: { tag: name } })
      throw new Error(`isolate: tag "${String(name)}" not whitelisted (router-view/monitor only, ADR-0010)`)
    }
    return invoke.call(this, name, symbol as never)
  }, 'isolate guard')
}

/**
 * 核心层替换守卫（ADR-0011）：基线 §2.2 八个核心服务（lifecycle/router/bus/state/
 * sandbox/monitor/security/deps）运行时不可替换——替换即框架级重启事件，必须经框架入口
 * （重新 createCordis）。散落的 `ctx.set(key, ...)` 对保护键抛错拒绝 + violation 上报；
 * 第三方插件服务不在保护列（按 ADR-0007 整应用重挂载语义处理）。
 */
const CORE_SERVICES = new Set(['lifecycle', 'router', 'bus', 'state', 'sandbox', 'monitor', 'security', 'deps'])

function installCoreGuard(ctx: Context): void {
  wrapRootMethod(ctx, 'set', (invoke) => function (this: Context, key: never, value: never) {
    if (typeof key === 'string' && CORE_SERVICES.has(key)) {
      ctx.emit('security/violation', { appId: 'root', rule: 'core-service-replacement', detail: { key } })
      throw new Error(`ctx.set: core service "${key}" is not replaceable at runtime (framework restart required, ADR-0011)`)
    }
    return invoke.call(this, key, value)
  }, 'core service guard')
}

/**
 * 框架入口：一次调用拉起核心运行时。
 *
 * 01 号票：基础层 = monitor + security（零业务依赖、最先可用，ADR-0054）。
 * 02 号票：+ sandbox（双窗口 Proxy 沙箱工厂，first-party）。
 * 03 号票：+ deps（最小加载）+ lifecycle（挂载事务）。
 * 04 号票：+ style（样式登记辅助服务）+ Vue 3 参考适配器（defineCordisApp）。
 * 05 号票：+ router（URL 矩阵 + 守卫管线 + 槽位事件族；不 inject lifecycle，基线 §2.3）。
 * 06 号票：+ state（三层键空间 + 唯一写管线 + 订阅；不 inject lifecycle，ADR-0023）。
 * 07 号票：+ bus（send 服务方法 + 应答包络 + traceparent；lifecycle -> bus 单向登记）。
 * 初始化顺序由 Cordis DI 解析，禁止手写顺序表。
 *
 * @returns 宿主 ctx（根上下文）
 */
export function createCordis(options: CreateCordisOptions = {}): Context {
  const ctx = new Context()
  // 原型守护（js-sandbox §3.3，F12）：**opt-in**（默认关闭，见 options 注释）——
  // freeze 先于一切服务与应用加载（时序明确）
  if (options.prototypeGuard?.enabled === true) {
    freezePrototypes(options.prototypeGuard.targets)
  }
  ctx.plugin(MonitorService, options.monitor)
  // isolate 白名单守卫（ADR-0010"仅允许两处"）：装在框架入口的 root ctx 上——
  // 非白名单标签（router-view/monitor 之外）拦截抛错 + violation 上报（fail-closed）
  installIsolateGuard(ctx)
  // 核心层守卫（ADR-0011）：八核心服务运行时替换 = 框架级重启事件，必须经框架入口；
  // 散落的 ctx.set 替换被拒绝并上报
  installCoreGuard(ctx)
  ctx.plugin(SecurityService, { ...options.security, rules: options.permissions ?? [] })
  ctx.plugin(SandboxService)
  ctx.plugin(DepsService, { apps: options.apps, retryBackoffMs: options.deps?.retryBackoffMs, shared: options.deps?.shared })
  ctx.plugin(StyleService, options.style)
  // 主题服务（style-isolation §五，F7）：配置即初始主题；:root 的 --tx-* 唯一写点
  ctx.plugin(ThemeService, options.theme)
  ctx.plugin(RouterService, {
    ...options.router,
    // 懒 outlet 宿主选择器：router 扩展未指定处回落顶层 outlets（同一约定，免重复声明）
    outlets: options.router?.outlets ?? options.outlets,
    routes: options.routes,
    onResolve: options.onResolve,
  })
  ctx.plugin(StateService, options.state)
  ctx.plugin(TracingService, options.tracing)
  ctx.plugin(DevToolsService, {})
  ctx.plugin(HmrService, {})
  ctx.plugin(BusService, options.bus)
  // C1.2 wiring：SuspendScopeService 先于 LifecycleService 注册（lifecycle inject suspendScope 走标准 DI 解析）
  ctx.plugin(SuspendScopeService, {})
  // C5.2 wiring：KeepAliveService 先于 LifecycleService 注册（lifecycle inject keepAlive 走标准 DI 解析；
  // keepAlive 配置面从 LifecycleService 拆出独立注入）
  ctx.plugin(KeepAliveService, options.keepAlive)
  ctx.plugin(LifecycleService, {
    recovery: options.recovery,
    outlets: options.outlets,
  })
  return ctx
}
