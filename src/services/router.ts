/**
 * 路由服务（route-adaptation.md §三/§四）：
 * - URL 矩阵（§3.1）：主区域 = pathname；浮窗类 widget = hash 通道（URL-encoded `槽位=路径` 映射）；
 *   其余槽位 = query 通道（`__tx_` 保留字前缀）。全量槽位重写（读旧 -> 改目标 -> 写回），参数不互抹
 * - 导航管线（§4.1）：NavigationController 导航序号防竞态 + 每导航 AbortController（superseded 即 abort）
 * - 守卫（§4.3，ADR-0002）：serial 事件 + 显式枚举 {proceed|redirect|abort}；undefined 不表态
 * - popstate（§4.2）：后退/前进走完整守卫管线（state 快照恢复全量矩阵）；拒绝时 replace 恢复
 * - 双层事件（§3.3，ADR-0036/0047）：`outlet/changed:{outlet}` 槽位族 + `router/changed` root-only
 * - 槽位注册（§3.3）：registerOutlet（owner 归因；注销随 fiber dispose 自动完成）
 * - 解耦（基线 §2.3）：不 inject lifecycle；挂载经 onResolve 回调（lifecycle -> router 单向）
 *
 * sanitizeQuery（§3.2）接线在 11 号票（security 权限裁决统一落点）。
 */
import { Service, type Context } from 'cordis'
import '../events'
import type { GuardResult, MatchedApp, RouteLocation } from '../events'

export type { GuardResult }

/** 宿主路由配置：basePath -> appId 匹配（路径段边界） */
export interface RouteRule {
  basePath: string
  appId: string
}

export interface RouterConfig {
  routes?: RouteRule[]
  /** hash 通道槽位清单（浮窗类 widget，§3.1-2）；缺省以 'widget' 为前缀判定 */
  widgetOutlets?: string[]
  /** lifecycle -> router 单向接线：挂载意图回调（基线 §2.3） */
  onResolve?: (intent: { appId: string; outlet: string; path: string }) => void
}

/** 保留字前缀（§3.1-1）：`__tx_` 全框架槽位参数统一前缀 */
const RESERVED_PREFIX = '__tx_'
const MAIN_CHANNEL = 'main'
const MAIN_RESERVED_KEY = `${RESERVED_PREFIX}${MAIN_CHANNEL}`
const HASH_CHANNEL_KEY = 'w' // hash 通道键（§3.1-3：URL-encoded 槽位=路径 映射）
const REDIRECT_LOOP_CAP = 8 // 对齐 vue-router 的 8 次上限（§4.3）

/** 槽位状态的通道内表示 */
interface OutletState {
  path: string
  query: Record<string, string>
}

/**
 * 模板字面量事件键族（ADR-0047/0050）：interface 只能声明代表性键
 * （events.ts 的 'outlet/changed:main'），全部槽位键经本窄化 helper 落键
 */
function outletEventKey(outlet: string): 'outlet/changed:main' {
  return `outlet/changed:${outlet}` as 'outlet/changed:main'
}

/** 路径段边界前缀匹配（§3.3）：`/app1/mod` 不命中 `/app1/module-a` */
function segmentPrefixMatch(basePath: string, path: string): boolean {
  if (path === basePath || path === basePath + '/') return true
  return path.startsWith(basePath + '/')
}

/** 剔除 `__tx_*` 保留字参数（应用可见 query 不含框架参数，§3.2） */
function stripReserved(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(search)) {
    if (!k.startsWith(RESERVED_PREFIX)) out[k] = v
  }
  return out
}

/** history.state 槽位快照（§4.2）：commit 写入、popstate 恢复 */
interface HistorySnapshot {
  __tx_outlets?: Record<string, string>
}

export class RouterService extends Service<RouterConfig> {
  static provide = 'router'
  // 基线 §2.3：router inject security（sanitizeQuery 在 11 号票接线）+ monitor；
  // 不 inject lifecycle（导航经 onResolve 回调解耦，消除依赖环）
  static inject = ['security', 'monitor']

  /** 槽位名 -> 当前状态（全量矩阵的内存态） */
  private outlets = new Map<string, OutletState>()
  /** 槽位注册表（§3.3 registerOutlet）：outlet -> owner/basePath */
  private registrations = new Map<string, { owner: string; basePath?: string }>()
  /** 导航序号（§4.1）：任何更新的导航开始后，旧导航各阶段作废 */
  private seq = 0
  private lastCommitted: string = window.location.href
  private routes: RouteRule[]
  private widgetOutlets: Set<string>
  private onResolve: RouterConfig['onResolve']

  constructor(ctx: Context, config: RouterConfig = {}) {
    super(ctx, 'router')
    this.routes = config.routes ?? []
    this.widgetOutlets = new Set(config.widgetOutlets ?? [])
    this.onResolve = config.onResolve
    this.initFromLocation()
    this.initPopState()
    // 恢复重放（ADR-0056，route-adaptation §三）：lifecycle 按统一时序派发 router/replay，
    // 本服务对该槽位重放一次 outlet/changed（载荷 = 当前匹配结果）——与正常导航同一事件，
    // 不为恢复发明第二套路由同步机制
    ctx.on('router/replay', (e) => {
      const loc = this.current(e.outlet)
      this.ctx.emit(outletEventKey(e.outlet), { outlet: e.outlet, matched: this.match(loc.path, e.outlet) })
    }, { global: true })
  }

  private isWidget(outlet: string): boolean {
    return this.widgetOutlets.has(outlet) || outlet.startsWith('widget')
  }

  /** 启动时从 URL 恢复全量矩阵（深链直达的读侧；挂载侧由宿主/lifecycle 驱动） */
  private initFromLocation(): void {
    const url = new URL(window.location.href)
    this.outlets.set(MAIN_CHANNEL, { path: url.pathname, query: stripReserved(url.search) })
    for (const [key, value] of url.searchParams) {
      if (key.startsWith(RESERVED_PREFIX) && key !== MAIN_RESERVED_KEY) {
        this.outlets.set(key.slice(RESERVED_PREFIX.length), { path: value, query: {} })
      }
    }
    // hash 通道（§3.1-3）：w = '&'-连接的 URL-encoded `槽位=路径` 对（逐对解码）
    const hashMap = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '')
    const encoded = hashMap.get(HASH_CHANNEL_KEY)
    if (encoded) {
      for (const pair of encoded.split('&')) {
        const decoded = decodeURIComponent(pair)
        const eq = decoded.indexOf('=')
        const slot = eq === -1 ? '' : decoded.slice(0, eq)
        const path = eq === -1 ? '' : decoded.slice(eq + 1)
        if (slot.startsWith(RESERVED_PREFIX)) this.outlets.set(slot.slice(RESERVED_PREFIX.length), { path, query: {} })
      }
    }
  }

  /** popstate 全链路（§4.2）：后退/前进走完整守卫管线 + state 快照恢复 */
  private initPopState(): void {
    this.ctx.effect(() => {
      const onPop = async (e: PopStateEvent) => {
        // 先快照内存矩阵：守卫拒绝时连同矩阵一起回滚（仅恢复 URL 会留状态/地址不一致）
        const matrixBackup = new Map(this.outlets)
        // state 快照优先（§4.2：恢复时从 state 而非重新猜测），缺省回退 URL 直读
        const snap = (e.state ?? null) as HistorySnapshot | null
        if (snap?.__tx_outlets) {
          for (const [outlet, path] of Object.entries(snap.__tx_outlets)) {
            this.outlets.set(outlet, { path, query: outlet === MAIN_CHANNEL ? stripReserved(window.location.search) : {} })
          }
        } else {
          this.outlets.set(MAIN_CHANNEL, { path: window.location.pathname, query: stripReserved(window.location.search) })
        }
        const from = this.lastCommitted
        const result = await this.navigate(this.current(MAIN_CHANNEL), { caller: this.rootCtx(), outlet: MAIN_CHANNEL, history: true })
        if (result.status === 'guarded' || result.status === 'superseded') {
          this.outlets = matrixBackup // 矩阵回滚
          // 守卫拒绝历史导航：replace 恢复原 URL（不产生新历史记录）
          window.history.replaceState(e.state ?? null, '', from)
        }
      }
      const onHash = (e: HashChangeEvent) => {
        // hash 模式双事件去重（§4.2）：同一 location 只处理一次
        if (e.oldURL === e.newURL) return
        void onPop(e as unknown as PopStateEvent)
      }
      window.addEventListener('popstate', onPop)
      window.addEventListener('hashchange', onHash)
      return () => {
        window.removeEventListener('popstate', onPop)
        window.removeEventListener('hashchange', onHash)
      }
    })
  }

  /** 槽位注册（§3.3）：owner 归因；注销随调用方 fiber dispose 自动完成（ctx.effect） */
  registerOutlet(ctx: Context, outlet: string, options: { owner: string; basePath?: string }): void {
    const existing = this.registrations.get(outlet)
    if (existing && existing.basePath && options.basePath && existing.basePath !== options.basePath) {
      throw new Error(`router: outlet "${outlet}" already registered with basePath "${existing.basePath}"`) // 同 basePath 重复注册显式报错
    }
    this.registrations.set(outlet, { owner: options.owner, basePath: options.basePath })
    ctx.effect(() => () => {
      if (this.registrations.get(outlet)?.owner === options.owner) this.registrations.delete(outlet)
    })
  }

  /** 应用侧读入口：本槽位当前位置 */
  current(outlet: string): RouteLocation {
    const state = this.outlets.get(outlet)
    return state ? { ...state, query: { ...state.query } } : { path: '/', query: {} }
  }

  /** 全槽位矩阵快照（匹配结果；root-only 消费） */
  snapshot(): Record<string, MatchedApp | null> {
    const out: Record<string, MatchedApp | null> = {}
    for (const [outlet, state] of this.outlets) {
      out[outlet] = this.match(state.path, outlet)
    }
    return out
  }

  private match(path: string, outlet: string): MatchedApp | null {
    const reg = this.registrations.get(outlet)
    if (reg?.basePath && segmentPrefixMatch(reg.basePath, path)) return { appId: reg.owner, outlet }
    for (const rule of this.routes) {
      if (segmentPrefixMatch(rule.basePath, path)) return { appId: rule.appId, outlet }
    }
    return null
  }

  /** reactive coeffect（§二）：槽位事件族订阅 + 首跑同步取值（ADR-0047） */
  watch(ctx: Context, outlet: string, fn: (loc: RouteLocation) => void): () => void {
    const off = ctx.on(outletEventKey(outlet), () => fn(this.current(outlet)))
    fn(this.current(outlet))
    return off
  }

  /** 写入口（导航，§4.1）：隔离视图内也经本全局控制器合并（ADR-0006 写侧不隔离） */
  async navigate(
    to: Partial<RouteLocation>,
    options: { caller: Context; outlet?: string; replace?: boolean; history?: boolean; depth?: number },
  ): Promise<{ status: 'ok' | 'superseded' | 'guarded' | 'denied' | 'error' }> {
    const outlet = options.outlet ?? MAIN_CHANNEL
    // 0. 守卫前置（11 号票，security §四.6 导航资源）：调用者显式归因（caller 必填——
    //    无归因即拒绝，fail-closed，不做"缺省放行"）；root/宿主不受限；
    //    拒绝发生在守卫管线之前——未授权者连守卫都不可见
    const callerAppId = options.caller.fiber.name
    if (callerAppId !== 'root' && !this.ctx.security.check(callerAppId, 'route:navigate').allowed) {
      this.ctx.security.reportViolation(callerAppId, 'route:navigate', { outlet, to })
      return { status: 'denied' }
    }
    const id = ++this.seq
    // 每导航 AbortController（§4.1）：superseded 时 abort，守卫可观测取消
    const controller = new AbortController()
    const stale = () => id !== this.seq
    if (stale()) controller.abort()
    const from = this.current(outlet)
    // 敏感参数过滤（route-adaptation §3.2）：token/_t/sign 等黑名单键剥离，杜绝跨应用泄漏
    const target: RouteLocation = { path: to.path ?? from.path, query: this.ctx.security.sanitizeQuery(to.query ?? {}) }

    // 1. 守卫管线（serial，ADR-0002）：守卫经 ctx.on('router/navigate', ..., { global: true }) 注册
    const verdict = (await this.ctx.serial('router/navigate', {
      from,
      to: target,
      outlet,
      signal: controller.signal,
    })) as GuardResult
    if (stale()) {
      controller.abort()
      return { status: 'superseded' }
    }
    if (verdict) {
      controller.abort()
      if (verdict.type === 'redirect') {
        return this.handleRedirect(verdict.to, outlet, options)
      }
      if (verdict.type === 'abort') {
        this.ctx.emit('router/aborted', { outlet, reason: 'guard' })
        return { status: 'guarded' }
      }
      // proceed：明确放行（serial 已截断后续守卫），落入提交阶段
    }

    // 2. 提交矩阵（读旧全量 -> 仅改目标槽位 -> 写回，§3.1-4 参数合并不互抹）
    this.outlets.set(outlet, { path: target.path, query: target.query })
    this.commit(outlet, options)

    // 3. 挂载意图（基线 §2.3：事件解耦，router 不 inject lifecycle；历史导航同样触发）
    const matched = this.match(target.path, outlet)
    if (matched) this.onResolve?.({ appId: matched.appId, outlet, path: target.path })

    // 4. 双层变更通知（ADR-0036/0047）：槽位族给隔离视图；全局矩阵 root-only
    this.ctx.emit(outletEventKey(outlet), { outlet, matched })
    this.ctx.emit('router/changed', { location: this.current(MAIN_CHANNEL), outlets: this.snapshot() })
    return { status: 'ok' }
  }

  /** URL 回写 + history.state 快照（§4.2）：全量槽位状态合并序列化 */
  private commit(outlet: string, options: { replace?: boolean; history?: boolean }): void {
    const stateSnapshot: HistorySnapshot = { __tx_outlets: {} }
    const url = new URL(window.location.href)
    const main = this.outlets.get(MAIN_CHANNEL)
    if (main && !options.history) url.pathname = main.path
    // 业务 query 保留，仅更新 query 通道槽位参数
    const params = new URLSearchParams(url.search)
    for (const key of [...params.keys()]) {
      if (key.startsWith(RESERVED_PREFIX) && key !== MAIN_RESERVED_KEY) params.delete(key)
    }
    if (main) for (const [k, v] of Object.entries(main.query)) params.set(k, v)
    // hash 通道值 = URL-encoded 的 `槽位=路径` 映射（§3.1-3：w=__tx_widget%3D%2Fhome，多浮窗 & 连接）
    const hashPairs: string[] = []
    for (const [name, state] of this.outlets) {
      stateSnapshot.__tx_outlets![name] = state.path
      if (name === MAIN_CHANNEL) continue
      if (this.isWidget(name)) hashPairs.push(encodeURIComponent(`${RESERVED_PREFIX}${name}=${state.path}`))
      else params.set(`${RESERVED_PREFIX}${name}`, state.path)
    }
    url.search = params.toString() ? `?${params}` : ''
    url.hash = hashPairs.length ? `#${HASH_CHANNEL_KEY}=${hashPairs.join('&')}` : url.hash
    const href = url.pathname + (url.search || '') + (url.hash || '')

    this.lastCommitted = options.history ? window.location.href : href
    if (options.history) return // 历史导航：URL 已由浏览器写入，仅同步矩阵与快照
    if (options.replace) window.history.replaceState(stateSnapshot, '', href)
    else window.history.pushState(stateSnapshot, '', href)
  }

  /** 重定向防死循环（§4.3）：8 次上限 + monitor 告警；保留原导航的 replace 语义 */
  private async handleRedirect(
    to: string,
    outlet: string,
    options: { replace?: boolean; history?: boolean; depth?: number },
  ): Promise<{ status: 'ok' | 'superseded' | 'guarded' | 'denied' | 'error' }> {
    const depth = (options.depth ?? 0) + 1
    if (depth >= REDIRECT_LOOP_CAP) {
      this.ctx.monitor.capture(new Error(`router: redirect loop (>= ${REDIRECT_LOOP_CAP}) at "${to}"`), {
        phase: 'runtime',
      })
      this.ctx.emit('monitor/alert', { alert: { level: 'error', message: 'ROUTER_REDIRECT_LOOP' } })
      return { status: 'error' }
    }
    return this.navigate({ path: to }, { caller: this.rootCtx(), outlet, replace: options.replace, depth })
  }

  /** root ctx（宿主）：内部导航（popstate 恢复/重定向递归）的系统归因——沿 fiber 父链上溯（root 自环即止） */
  private rootCtx(): Context {
    let fiber = this.ctx.fiber
    while (fiber.parent?.fiber && fiber.parent.fiber !== fiber) fiber = fiber.parent.fiber
    return fiber.ctx
  }
}

declare module 'cordis' {
  interface Context {
    router: RouterService
  }
}
