import { Context } from 'cordis'
import './events'
import { MonitorService } from './services/monitor'
import { SecurityService, isIsolateAllowed, type PermissionRule, type SecurityConfig } from './services/security'
import { SandboxService } from './services/sandbox'
import { DepsService, type AppManifestEntry } from './services/deps'
import { LifecycleService, type RecoveryConfig, type KeepAliveConfig } from './services/lifecycle'
import { StyleService } from './services/style'
import { RouterService, type RouteRule, type RouterConfig } from './services/router'
import { StateService } from './services/state'
import { BusService, type BusConfig } from './services/bus'
import { defineCordisApp } from './vue3-adapter'

export { MonitorService } from './services/monitor'
export { SecurityService } from './services/security'
export type { PermissionRule, PermissionVerdict, SecurityConfig } from './services/security'
export { SandboxService } from './services/sandbox'
export { createSandbox, storagePrefix } from './sandbox'
export { SandboxDisposedError } from './errors'
export type { Sandbox, SandboxOptions } from './sandbox'
export { createProbeApp } from './probe'
export type { ProbeReport, ProbeOptions } from './probe'
export { DepsService } from './services/deps'
export type { AppManifestEntry } from './services/deps'
export { LifecycleService } from './services/lifecycle'
export type { AppInstance, MountOptions, RecoveryConfig, LifecycleConfig, KeepAliveConfig, AppExternalState } from './services/lifecycle'
export { StyleService } from './services/style'
export type { StyleAsset } from './services/style'
export { RouterService } from './services/router'
export type { RouteRule, RouterConfig, GuardResult } from './services/router'
export { StateService } from './services/state'
export type { WatchOptions as StateWatchOptions, GetOptions as StateGetOptions, SetOptions as StateSetOptions } from './services/state'
export { BusService, parseTraceparent } from './services/bus'
export type { Reply, BusInstance, BusConfig, DeadLetterRecord, SendMessageInput, RequestOptions } from './services/bus'
export { defineCordisApp } from './vue3-adapter'
export type { CordisAppOptions } from './vue3-adapter'
export * from './events'

/** createCordis 配置：阈值均经配置注入（测试注小值触发，生产默认按各 ADR） */
export interface CreateCordisOptions {
  /** 权限规则（本地可判定，deny-by-default，ADR-0051） */
  permissions?: PermissionRule[]
  /** security 扥展配置（allowInsecure/queryBlacklist/限流窗口/SRI 清单；rules 以 permissions 为准） */
  security?: Omit<SecurityConfig, 'rules'>
  /** 应用清单（appId + 入口工厂） */
  apps?: AppManifestEntry[]
  /** 错误恢复策略（lifecycle §六） */
  recovery?: RecoveryConfig
  /** 槽位选择器映射 */
  outlets?: Record<string, string>
  /** 路由规则（basePath -> appId，路径段边界匹配，route-adaptation §3.3） */
  routes?: RouteRule[]
  /** 挂载意图回调（lifecycle -> router 单向接线，基线 §2.3；测试/宿主注入） */
  onResolve?: RouterConfig['onResolve']
  /** bus 配置（挂起队列上限/回放批大小，§5.5；测试注小值） */
  bus?: BusConfig
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
  options: { version?: number; migrate?: AppManifestEntry['migrate']; keepAlive?: AppManifestEntry['keepAlive'] } = {},
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
  ctx.plugin(MonitorService)
  // isolate 白名单守卫（ADR-0010"仅允许两处"）：装在框架入口的 root ctx 上——
  // 非白名单标签（router-view/monitor 之外）拦截抛错 + violation 上报（fail-closed）
  installIsolateGuard(ctx)
  // 核心层守卫（ADR-0011）：八核心服务运行时替换 = 框架级重启事件，必须经框架入口；
  // 散落的 ctx.set 替换被拒绝并上报
  installCoreGuard(ctx)
  ctx.plugin(SecurityService, { ...options.security, rules: options.permissions ?? [] })
  ctx.plugin(SandboxService)
  ctx.plugin(DepsService, { apps: options.apps })
  ctx.plugin(StyleService)
  ctx.plugin(RouterService, { routes: options.routes, onResolve: options.onResolve })
  ctx.plugin(StateService)
  ctx.plugin(BusService, options.bus)
  ctx.plugin(LifecycleService, {
    recovery: options.recovery,
    outlets: options.outlets,
    keepAlive: options.keepAlive,
  })
  return ctx
}
