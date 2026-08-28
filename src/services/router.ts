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
import {
  RESERVED_PREFIX,
  MAIN_CHANNEL,
  MAIN_RESERVED_KEY,
  HASH_CHANNEL_KEY,
  REDIRECT_LOOP_CAP,
  outletEventKey,
  isValidGuardResult,
  segmentPrefixMatch,
  stripReserved,
} from './router/parsers'
import {
  createLazyOutletLedger,
  type LazyOutletLedgerHandle,
} from './router/lazyOutlet'
import { commitUrl } from './router/commitUrl'

export type { GuardResult }

/** 宿主路由配置：basePath -> appId 匹配（路径段边界） */
export interface RouteRule {
  basePath: string
  appId: string
}

/** 挂载意图（onResolve 载荷，基线 §2.3） */
export interface MountIntent {
  appId: string
  outlet: string
  path: string
}

export interface RouterConfig {
  routes?: RouteRule[]
  /** hash 通道槽位清单（浮窗类 widget，§3.1-2）；缺省以 'widget' 为前缀判定 */
  widgetOutlets?: string[]
  /** lifecycle -> router 单向接线：挂载意图回调（基线 §2.3） */
  onResolve?: (intent: MountIntent) => void
  /** 懒槽位宿主选择器映射（与 lifecycle outlets 同一约定：槽位名 -> CSS selector；缺省 `#{outlet}`） */
  outlets?: Record<string, string>
  /** 懒 outlet 清单（§六表 loadOnVisible 的落地形式）：命中槽位的挂载意图延迟到宿主元素进入视口才派发 */
  lazyOutlets?: string[]
  /** IntersectionObserver 注入口（测试/宿主注入；缺省取 globalThis，能力缺失降级立即派发） */
  ioFactory?: new (callback: (entries: { isIntersecting: boolean; target: Element }[], observer: IntersectionObserverLike) => void, options?: unknown) => IntersectionObserverLike
}

/** IntersectionObserver 结构最小面（jsdom 无此 API；测试假件实现同一形状） */
export interface IntersectionObserverLike {
  observe(el: Element): void
  unobserve(el: Element): void
  disconnect(): void
}

/** 槽位状态的通道内表示 */
interface OutletState {
  path: string
  query: Record<string, string>
}

/** history.state 槽位快照（§4.2）：commit 写入、popstate 恢复 */
interface HistorySnapshot {
  __tx_outlets?: Record<string, string>
  /** scroll restoration（§六表）：window + 各槽位容器 scrollTop，restore 时应用 */
  __tx_scroll?: Record<string, number>
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
  private outletSelectors: Record<string, string>
  /** Lazy outlet 账本（C14-B）：5 字段 + 3 方法自洽状态机已抽离到 router/lazyOutlet.ts；
   *   router 改持 ledger 引用，dispatchIntent / flushLazy 改 thin delegate。 */
  private lazyOutletLedger: LazyOutletLedgerHandle

  constructor(ctx: Context, config: RouterConfig = {}) {
    super(ctx, 'router')
    this.routes = config.routes ?? []
    this.widgetOutlets = new Set(config.widgetOutlets ?? [])
    this.onResolve = config.onResolve
    this.outletSelectors = config.outlets ?? {}
    // C14-B：lazy outlet 状态机抽离到 router/lazyOutlet.ts；router 改持 ledger 引用
    this.lazyOutletLedger = createLazyOutletLedger(
      config.ioFactory ?? (globalThis as unknown as { IntersectionObserver?: typeof config.ioFactory }).IntersectionObserver ?? null,
      this.outletSelectors,
      this.onResolve,
      config.lazyOutlets ?? [],
    )
    // C14-B：io 初始化已抽离到 router/lazyOutlet.ts；router 不再持 io 字段
    ctx.effect(() => () => this.lazyOutletLedger.destroy()) // observer 挂 ctx.effect（§六表）
    this.initFromLocation()
    this.initPopState()
    this.resolveDeepLinks()
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

  /**
   * 挂载意图统一派发口（导航第 3 步与深链启动同一入口）：懒槽位（§六表
   * loadOnVisible）未可见时扣住意图——观察宿主元素，进入视口才派发最新意图；
   * IO 能力缺失/宿主元素缺失降级为立即派发（懒加载是优化不是正确性闸门，不阻塞挂载）。
   *
   * C14-B：thin delegate 到 lazyOutletLedger.dispatchIntent。
   */
  private dispatchIntent(intent: MountIntent): void {
    this.lazyOutletLedger.dispatchIntent(intent)
  }

  /** 懒槽位放行：标记已可见 + 派发 pending 的最新意图（一次性；后续导航走直通）——
   * C14-B：thin delegate 到 lazyOutletLedger.flush。 */
  private flushLazy(outlet: string): void {
    this.lazyOutletLedger.flush(outlet)
  }

  /** 槽位滚动容器查找（lifecycle 容器 id 约定 `tx-{outlet}`；缺失返回 null——读侧宽容） */
  private scrollContainer(outlet: string): HTMLElement | null {
    return document.getElementById(`tx-${outlet}`)
  }

  /** scroll restoration 采集（§六表）：window.scrollY + 各槽位容器 scrollTop */
  private captureScroll(): Record<string, number> {
    const out: Record<string, number> = { window: window.scrollY }
    for (const outlet of this.outlets.keys()) {
      const el = this.scrollContainer(outlet)
      if (el && el.scrollTop > 0) out[outlet] = el.scrollTop
    }
    return out
  }

  /** scroll restoration 应用（popstate 恢复时）：history.state 快照回放 */
  private applyScroll(snapshot: Record<string, number> | undefined): void {
    if (!snapshot) return
    if (typeof snapshot.window === 'number') window.scrollTo(0, snapshot.window)
    for (const [outlet, top] of Object.entries(snapshot)) {
      if (outlet === 'window') continue
      const el = this.scrollContainer(outlet)
      if (el) el.scrollTop = top
    }
  }

  /**
   * 深链启动挂载（§3 读侧之外的挂载侧，A7）：冷启动时按 URL 矩阵对每个已匹配槽位
   * 派发一次挂载意图（与导航第 3 步同一 onResolve 回调——无第二套启动挂载机制）。
   */
  private resolveDeepLinks(): void {
    if (!this.onResolve) return
    for (const [outlet, state] of this.outlets) {
      const matched = this.match(state.path, outlet)
      if (matched) this.dispatchIntent({ appId: matched.appId, outlet, path: state.path })
    }
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
        } else {
          this.applyScroll(snap?.__tx_scroll) // scroll restoration（§六表）：恢复历史点的滚动位置
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
    // 结果契约校验（12 号票，ADR-0002）：守卫返回值只允许枚举三值 + undefined；
    // 违规形状按中止处理并 monitor 上报（不做真值裁决）
    if (verdict !== undefined && !isValidGuardResult(verdict)) {
      this.ctx.monitor.capture(new Error(`guard-contract-violation on router/navigate (outlet=${outlet})`), {
        appId: this.registrations.get(outlet)?.owner, // 槽位 owner 归因（无注册则为 undefined）
        phase: 'runtime',
      })
      this.ctx.emit('router/aborted', { outlet, reason: 'guard' })
      controller.abort()
      return { status: 'guarded' }
    }
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
    if (matched) this.dispatchIntent({ appId: matched.appId, outlet, path: target.path })

    // 4. 双层变更通知（ADR-0036/0047）：槽位族给隔离视图；全局矩阵 root-only
    this.ctx.emit(outletEventKey(outlet), { outlet, matched })
    this.ctx.emit('router/changed', { location: this.current(MAIN_CHANNEL), outlets: this.snapshot() })
    return { status: 'ok' }
  }

  /** URL 回写 + history.state 快照（§4.2）：全量槽位状态合并序列化——
   * C15-B：URL 序列化纯函数已抽离到 router/commitUrl.ts；本方法保留 history
   * 写入副作用 + lastCommitted 记账本职。 */
  private commit(outlet: string, options: { replace?: boolean; history?: boolean }): void {
    void outlet
    const { href, stateSnapshot } = commitUrl(
      this.outlets,
      (name) => this.isWidget(name),
      options,
      this.captureScroll(),
    )
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
