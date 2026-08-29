/**
 * 生命周期服务（lifecycle-management.md）：
 * - 挂载事务（§2.2）：outlet 级 promise 链互斥 + AbortSignal 透传 + 失败级联清理
 * - 状态派生（§2.3）：对外状态全部从 fiber.state 计算，无平行状态字段
 * - destroy 级联（§3.2）：fiber dispose -> 沙箱销毁 -> 容器移除
 * - 错误恢复（§六）：重试主体 = 重走挂载事务（指数退避经配置注入）、fallback、ErrorOutlet
 * - fail-closed（ADR-0009）：显式 inject security；security 未就绪则本服务 fiber 停留 PENDING，
 *   全部应用无一挂载
 *
 * 本票范围（03 号）：挂载/销毁主链路。保活/挂起/驱逐（§五）在 08-10 号票。
 */
import { Service, FiberState, type Context, type Fiber } from 'cordis'
import '../events'
import type { Sandbox } from '../sandbox'
import { suspendRegistry } from '../suspend'
import { AppDisabledError } from '../errors'
import type { SuspendReason, SuspendSource } from '../events'
import type { KeepAliveHost } from './keepAlive'
import { createScopedFetch } from './scopedFetch'

export type { SuspendReason, SuspendSource }

/** 对外状态名（§2.3 小写形式） */
export type AppExternalState =
  | 'pending'
  | 'loading'
  | 'active'
  | 'suspended'
  | 'failed'
  | 'disposed'
  | 'unloading'

/** 来源优先级（数值高 = 优先级高；恢复分级覆盖的裁决依据） */
const SOURCE_PRIORITY: Record<SuspendSource, number> = { route: 3, system: 2, command: 1 }

/** 应用实例（lifecycle §2.1）：instanceId 为键，支撑同 appId 多实例 */
export interface AppInstance {
  instanceId: string
  appId: string
  outlet: string
  fiber: Fiber
  ctx: Context
  container: HTMLElement
  sandbox: Sandbox | null
  /** 挂起仲裁账本（§5.1.1）：非空 = 挂起中（并集语义）；LRU 键 */
  suspendSources: Set<SuspendSource>
  /** LRU 键（§5.4）：resume/message 均刷新（驱逐在 10 号票） */
  lastAccessAt: number
  /** 首次挂起时刻（§5.4 压力候选序：挂起时长排序，ADR-0031） */
  suspendedAt: number | null
  /** 挂起时摘除的样式节点（head 内 data-cordis-app 匹配本应用，ADR-0033） */
  detachedStyles: Element[]
  /** Portal 容器（§4.2：Shadow 外、容器旁；懒创建，随实例销毁移除） */
  portalContainer?: HTMLElement
}

export interface MountOptions {
  signal?: AbortSignal
  config?: unknown
  /**
   * 隐藏挂载（§3.3 切换事务，F11）：容器先以 `display:none` 入 DOM，目标应用挂载
   * 完成后由 `lifecycle.reveal(instanceId)` 显示——消除"卸 A 挂 B"期间的闪烁与
   * 中间态（B 失败也不留悬空窗口）。宿主/普通 mount 缺省 false（行为不变）。
   */
  mountHidden?: boolean
}

export interface RecoveryConfig {
  /** 最大重试次数（默认 2） */
  maxRetries?: number
  /** 退避基数 ms（默认 1000；测试注 0） */
  backoffMs?: number
  /** 降级应用 appId */
  fallbackAppId?: string
}

export interface LifecycleConfig {
  recovery?: RecoveryConfig
  /** 槽位选择器映射（outlet 名 -> CSS selector；缺省 outlet 名即 selector） */
  outlets?: Record<string, string>
}

/** 保活池预算配置已迁至 services/keepAlive.ts（C5.1）；此处 re-export 保持 import 面不变 */
export type { KeepAliveConfig } from './keepAlive'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class LifecycleService extends Service<LifecycleConfig> {
  static provide = 'lifecycle'
  // 唯一多注入编排者（ADR-0054）；security 显式注入 = fail-closed（ADR-0009）。
  // 03 号票裁剪：router/bus/state 于 05/06/07 号票落地后逐个补入
  // （router 经 onResolve 事件解耦不 inject；bus/state 由 lifecycle 单向登记/监听）
  // C1.2 wiring：suspendScope 由 lifecycle 注入（lifecycle 是唯一编排者 ADR-0054）。
  // lifecycle 调 ctx.suspendScope.freeze/unfreeze 直访——不再经 sandbox.freeze/unfreeze 中转
  static inject = ["security", "sandbox", "deps", "monitor", "state", "bus", "suspendScope", "keepAlive"]

  /** outlet 级串行队列（§2.2-1）：promise 链天然串行、无唤醒竞态 */
  private outletLocks = new Map<string, Promise<void>>()
  private instances = new Map<string, AppInstance>()
  /** 按应用隔离 monitor impl 的注销器（fiber dispose 即释放；WeakMap 防 root fiber effect 泄漏堆积） */
  private isolatedMonitors = new WeakMap<Fiber, () => unknown>()

  /** 释放实例的隔离 monitor impl（幂等）：finalizeInstance 统一经此收口 */
  private releaseIsolatedMonitor(fiber: Fiber): void {
    const release = this.isolatedMonitors.get(fiber)
    if (release) {
      this.isolatedMonitors.delete(fiber)
      void Promise.resolve(release()).catch(() => {})
    }
  }

  private cfg: LifecycleConfig

  constructor(ctx: Context, config: LifecycleConfig = {}) {
    super(ctx, 'lifecycle')
    this.cfg = config
    // C5.2 wiring：KeepAliveService 承载保活账本/探测/仲裁/快照（services/keepAlive.ts）；
    // lifecycle bindHost 注入编排回调（C1.2 setReconnect 同 pattern）——core 不反向依赖
    // lifecycle 类型（ADR-0054 依赖方向）。探测心跳（轮询/visibility）由 KeepAliveService 自持（Q18）
    ctx.keepAlive.bindHost(this.keepAliveHost())
    // KillSwitch 急停执行点（security §十）：禁用指令 -> 该应用全部实例销毁
    //（含挂起实例；事件旁听，security 不反向注入）
    ctx.on('security/killswitch', (e) => {
      if (e.action === 'disable') void this.destroyByAppId(e.appId, `killswitch: ${e.reason}`)
    }, { global: true })
  }

  /**
   * 保活核心宿主回调（C5.1）：state/deps/monitor 服务面直通 + 编排委托
   *（listSuspended 投影挂起池；destroyInstance 走 §3.2 destroy；onEvicted 派发事件）。
   */
  private keepAliveHost(): KeepAliveHost {
    return {
      dumpLocal: (appId) => this.ctx.state.dumpLocal(appId),
      hydrateLocal: (appId, data) => this.ctx.state.hydrateLocal(appId, data),
      manifest: (appId) => this.ctx.deps.manifest(appId),
      capture: (err, meta) => this.ctx.monitor.capture(err, meta),
      listSuspended: () =>
        this.getInstances()
          .filter((i) => i.suspendSources.size > 0)
          .map((i) => ({ appId: i.appId, instanceId: i.instanceId, suspendedAt: i.suspendedAt, lastAccessAt: i.lastAccessAt })),
      destroyInstance: (instanceId, reason) => this.destroy(instanceId, reason),
      onEvicted: (appId, instanceId, cause) => this.ctx.emit('app/evicted', { appId, instanceId, cause }),
    }
  }

  /** outlet 级互斥入口：mount 与 destroy 共用（§2.2："含其 unmount"） */
  private async withOutletLock<T>(outlet: string, body: () => Promise<T>): Promise<T> {
    const prev = this.outletLocks.get(outlet) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    this.outletLocks.set(outlet, prev.then(() => gate))
    try {
      await prev
      return await body()
    } finally {
      release()
      if (this.outletLocks.get(outlet) === prev.then(() => gate)) {
        this.outletLocks.delete(outlet) // 链尾回收，防无界增长
      }
    }
  }

  /** 挂载事务：同槽位串行、跨槽位并行（§2.2） */
  async mount(appId: string, outlet: string, options: MountOptions = {}): Promise<AppInstance> {
    const signal = options.signal ?? new AbortController().signal
    return this.withOutletLock(outlet, () => this.mountOnce(appId, outlet, signal, options, 0))
  }

  private async mountOnce(
    appId: string,
    outlet: string,
    signal: AbortSignal,
    options: MountOptions,
    attempt: number,
  ): Promise<AppInstance> {
    const instanceId = `${appId}:${crypto.randomUUID()}`
    // 容器在事务开头（首个 await 前）创建：async 函数体第一个 await 即让出，
    // 后续步骤均在微任务批次恢复；容器在 sandbox.create 前就位即不再触发
    // sandbox-missing-container 降级（js-sandbox §3.5 scoped 查询边界 = 容器）
    const container = this.createOutletContainer(
      outlet,
      this.ctx.deps.manifest(appId)?.shadow === true,
      options.mountHidden === true, // §3.3 切换事务：隐藏入 DOM，reveal 后显示（F11）
    )
    this.ctx.emit('app/loading', { appId, instanceId, signal })

    let stage: 'load' | 'activate' = 'load' // 阶段跟踪：loadApp 之前 = load（资源期）；之后 = activate（激活期）
    try {
      // 1. 资源加载（deps；signal 全程透传）
      const plugin = (await this.ctx.deps.loadApp(appId, { signal })) as Record<string, unknown>
      stage = 'activate'
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      this.ctx.emit('app/loaded', { appId, instanceId }) // 资源就绪（基线 §2.4）

      // 2. SuspendScope 注册（lifecycle §5.2；C1.2 wiring）——在 sandbox create 之前
      //   forApp 二次注入 reconnect 由 sandbox 创建后 step 2.5 完成
      const suspendScope = this.ctx.suspendScope.forApp(appId)

      // 2.sandbox 创建（first-party；teardown 双保险注册在 fiber effect 上，§四所有权表）
      const sandbox = await this.ctx.sandbox.create(appId, { container, suspendScope })
      if (signal.aborted) {
        await sandbox.destroy()
        this.removeOutletContainer(container)
        throw new DOMException('aborted', 'AbortError')
      }
      // 2.5 reconnect 二次注入（ADR-0017：框架重建连接，订阅由应用重建）
      suspendScope.setReconnect((d) => sandbox.reconnectSocket(d))

      // 3. scopedFetch 注入（ADR-0005：沙箱创建后、plugin() 前）
      // C5-C：工厂已迁出 lifecycle——security 管裁决、bus 管链路，模块在 services/scopedFetch.ts
      sandbox.injectSlot.fetch = createScopedFetch(this.ctx, appId)

      // 3.5 暖启动注水（§5.5）：plugin() **之前**预注水到 state 服务——
      // 应用 apply 时 local 键空间已就位；版本漂移裁决在 ctx.keepAlive.hydrate 内（ADR-0034）
      this.ctx.keepAlive.hydrate(appId)

      // 4. 插件挂载：inject 未满足时 fiber 停留 PENDING（Cordis reactive coeffect）。
      //    plugin() 的 apply 经 _reload 在微任务中执行；实例在 plugin() 返回后同步登记，
      //    故 apply 运行时 containerOf 已可解析（fiber 判等见其注释）。
      //    按应用隔离 monitor 主动上报入口（monitoring §2.1，ADR-0010/0025）：应用在
      //    isolate('monitor', appId) ctx 上挂载，注入解析到 forApp(appId) 门面
      //    （capture/count 自动归因、startSpan 续接子 span）；root 单例与被动事件入口
      //    不受影响（聚合仍汇 root sink）。隔离 impl 随实例销毁注销（WeakMap 追踪）。
      //    label 用 Symbol(appId)：唯一（同 appId 重挂载不撞 registry 键）且描述保留归因
      const isoCtx = this.ctx.isolate('monitor' as never, Symbol(appId)) as Context
      const releaseMonitor = isoCtx.reflect.provide('monitor', this.ctx.monitor.forApp(appId))
      let fiber!: Fiber
      try {
        fiber = isoCtx.plugin(plugin as never, options.config as never)
        this.isolatedMonitors.set(fiber, releaseMonitor)
      } catch (error) {
        void Promise.resolve(releaseMonitor()).catch(() => {}) // plugin 同步失败：隔离 impl 不滞留 registry
        throw error
      }
      const instance: AppInstance = {
        instanceId,
        appId,
        outlet,
        fiber,
        ctx: fiber.ctx,
        container,
        sandbox,
        suspendSources: new Set(),
        lastAccessAt: Date.now(),
        suspendedAt: null,
        detachedStyles: [],
      }
      this.instances.set(instanceId, instance)

      // 沙箱 teardown 双保险：fiber dispose 时自动销毁（幂等）
      fiber.ctx.effect(() => () => {
        void sandbox.destroy()
      })

      try {
        await fiber // resolve = ACTIVE；reject = FAILED
        if (signal.aborted) {
          // 结果作废：激活完成但调用方已取消 -> 级联清理不留半挂载现场
          // C5B.2：与 destroy 同构（fiber.dispose + finalizeInstance 统一收口，
          // 补齐旧 cascadeCleanup 漏掉的 bus.unregister / trackDisposed / app/disposed）
          await fiber.dispose().catch(() => {})
          await this.finalizeInstance(instance)
          throw new DOMException('aborted', 'AbortError')
        }
      } catch (error) {
        this.instances.delete(instanceId)
        this.ctx.bus.unregister(instanceId)
        // C5B.2：事务失败路径同构收口（fiber 可能 PENDING——dispose 幂等 catch）
        await fiber.dispose().catch(() => {})
        await this.finalizeInstance(instance)
        throw error
      }

      // bus 实例登记（lifecycle -> bus 单向，基线 §2.3：send 定向投递的目标解析数据源；
      // touch = LRU 键刷新回调，§5.4 resume/message 均刷新）
      this.ctx.bus.register({ appId, instanceId, ctx: fiber.ctx, touch: () => (instance.lastAccessAt = Date.now()) })

      this.ctx.emit('app/ready', { appId, instanceId })
      void this.ctx.keepAlive.probe() // 操作触发预算检查（挂载，ADR-0057）
      return instance
    } catch (error) {
      // 事务失败统一回收容器（loadApp/sandbox 失败路径不经过 fiber 级联清理）
      this.removeOutletContainer(container)
      if (signal.aborted || (error as Error).name === 'AbortError') {
        throw error instanceof Error ? error : new Error(String(error))
      }
      // 基线 §2.4 app/error：旁听者经 global 监听感知失败
      this.ctx.emit('app/error', {
        appId,
        instanceId,
        phase: stage, // 事务阶段如实归因（入口抛 Error 也是 load 期错误——旧启发式误判 activate）
        error: error instanceof Error ? error : new Error(String(error)),
        recoverable: true,
      })
      return this.recover(appId, outlet, error as Error, attempt, options)
    }
  }

  // C5B.2：cascadeCleanup 已删除——destroy / abort / 事务失败三路径统一走
  // fiber.dispose + finalizeInstance（Q2 决策：不留两个顺序源）

  /**
   * 错误恢复（§6.1）：重试主体 = 重走挂载事务；配置驱动（测试注 backoffMs:0）。
   * AbortError 不进恢复（用户取消不是故障）。
   */
  private async recover(
    appId: string,
    outlet: string,
    error: Error,
    attempt: number,
    options: MountOptions,
  ): Promise<AppInstance> {
    // AbortError（用户取消）与 AppDisabledError（KillSwitch 禁用，§十）都不是故障：
    // 不进恢复重试（禁用应用空转重试违背急停语义）
    if (error.name === 'AbortError' || error instanceof AppDisabledError) throw error
    const policy = this.cfg.recovery ?? {}
    const maxRetries = policy.maxRetries ?? 2

    this.ctx.monitor.capture(error, { appId, phase: 'activate' })

    if (attempt < maxRetries) {
      const backoff = policy.backoffMs ?? 1000
      await sleep(backoff * 2 ** attempt)
      return this.mountOnce(appId, outlet, options.signal ?? new AbortController().signal, options, attempt + 1)
    }
    if (policy.fallbackAppId) {
      return this.mountOnce(policy.fallbackAppId, outlet, options.signal ?? new AbortController().signal, {}, 0)
    }
    this.renderErrorOutlet(outlet, appId, error)
    throw error
  }

  /** ErrorOutlet（§6.2）：转义渲染 + 手动重试入口（XSS 基线：textContent） */
  private renderErrorOutlet(outlet: string, appId: string, error: Error): void {
    const el = this.resolveOutletHost(outlet)
    el.textContent = ''
    const msg = document.createElement('div')
    msg.textContent = `应用 ${appId} 加载失败：${error.message}`
    const retry = document.createElement('button')
    retry.textContent = '重试'
    retry.addEventListener('click', () => void this.mount(appId, outlet))
    el.appendChild(msg)
    el.appendChild(retry)
  }

  /**
   * 容器创建唯一路径（heterogeneous §4.3）：宿主节点先入 DOM 再返回容器。
   * shadow = true（style-isolation §4.1 Shadow DOM 路线）：宿主挂 open shadowRoot，
   * 返回 shadow 内的渲染容器（天然样式边界——挂起随宿主摘除，scoped 样式一并缓存）
   *
   * @param hidden 隐藏入 DOM（§3.3 切换事务，F11）：容器以 `display:none` 挂载，
   *   待切换事务收尾由 `reveal()` 显示——避免"卸 A 挂 B"期间的闪烁与中间态。
   */
  createOutletContainer(outlet: string, shadow = false, hidden = false): HTMLElement {
    // F5-04 SSR adopt（heterogeneous §九 同构模式）：宿主元素内已有服务端写入的
    // 容器（data-tx-ssr="1"）-> **复用**而非新建——新建会让 SSR 内容留在外层、应用
    // 挂进空容器，hydration 无从绑定（首屏闪烁的根因）。shadow 应用不做 adopt
    // （shadowRoot 服务端无法预渲染，回落新建）。
    if (!shadow) {
      const existing = this.resolveOutletHost(outlet).querySelector<HTMLElement>(':scope > [data-tx-ssr="1"]')
      if (existing) return existing
    }
    const host = document.createElement('div')
    host.id = `tx-${outlet}`
    if (shadow) host.dataset.txShadow = '1'
    if (hidden) setMountHidden(host, true)
    this.resolveOutletHost(outlet).appendChild(host)
    if (!shadow) return host
    const root = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('div')
    root.appendChild(inner)
    return inner
  }

  /**
   * 显示（§3.3 切换事务末步，F11）：`mountHidden` 挂载的应用在切换事务收尾后调用——
   * 挂载完成后再显示，避免闪烁；**retire 失败也照常 reveal**（宁可旧应用残留，
   * 不留空白悬空窗口——§3.3 要消除的正是这个）。
   * @returns 实例是否存在（不存在返回 false，不抛）
   */
  reveal(instanceId: string): boolean {
    const instance = this.instances.get(instanceId)
    if (!instance) return false
    const root = instance.container.getRootNode()
    setMountHidden(root instanceof ShadowRoot ? (root.host as HTMLElement) : instance.container, false)
    return true
  }

  private resolveOutletHost(outlet: string): HTMLElement {
    const selector = this.cfg.outlets?.[outlet] ?? `#${outlet}`
    return document.querySelector<HTMLElement>(selector) ?? document.body
  }

  private removeOutletContainer(container: HTMLElement): void {
    // Shadow 容器：移除 shadow 宿主（shadowRoot 随之脱落）；普通容器直接移除
    const root = container.getRootNode()
    ;(root instanceof ShadowRoot ? root.host : container).remove()
  }

  // ---- 挂起仲裁（§5.1/§5.1.1，ADR-0018/0020/0031/0035）----

  /**
   * 挂起/恢复操作鉴权（deny-by-default，ADR-0035）：受信层 = root fiber（宿主/系统）；
   * 应用只能操作自己 appId 的实例。两方法共用同一裁决，无字符串重复。
   */
  private assertOperable(caller: Context, instance: AppInstance, action: 'suspend' | 'resume'): void {
    const callerAppId = caller.fiber.name
    if (callerAppId === 'root' || callerAppId === instance.appId) return
    throw new Error(`lifecycle: ${action} denied for ${callerAppId} (not owner of ${instance.appId})`)
  }

  /**
   * 挂起意图的唯一入口（服务方法可鉴权；`app/intent:*` 事件不存在，ADR-0035--emit 是
   * fire-and-forget，无法阻止恶意应用挂起他人）。挂起取并集（任一来源即挂起）；
   * 重复挂起幂等（账本已含来源则不重复动作）。
   */
  async requestSuspend(
    caller: Context,
    instanceId: string,
    reason: SuspendReason,
    source: SuspendSource,
  ): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (!instance) throw new Error(`lifecycle: unknown instance "${instanceId}"`)
    this.assertOperable(caller, instance, 'suspend')
    if (instance.suspendSources.has(source)) return // 幂等：同来源重复挂起
    const first = instance.suspendSources.size === 0
    instance.suspendSources.add(source) // 并集（ADR-0018）
    if (!first) return // 已挂起：账本更新即止
    this.suspendInstance(instance, reason)
  }

  /**
   * 恢复分级解除（ADR-0031）：高优先级来源的恢复可解除全部低优先级挂起；
   * 低优先级恢复解不了高优先级挂起（用户主动切到的页签不能是死的）。
   * 账本清空才执行恢复动作。
   */
  async requestResume(caller: Context, instanceId: string, source: SuspendSource): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (!instance) throw new Error(`lifecycle: unknown instance "${instanceId}"`)
    this.assertOperable(caller, instance, 'resume')
    const priority = SOURCE_PRIORITY[source]
    for (const held of [...instance.suspendSources]) {
      if (SOURCE_PRIORITY[held] <= priority) instance.suspendSources.delete(held) // 解除全部 ≤ 自身优先级
    }
    if (instance.suspendSources.size > 0) return // 更高优先级挂起仍在：保持挂起
    this.resumeInstance(instance)
  }

  /** 挂起动作（fiber 仍 ACTIVE、DOM 摘离、效应冻结，§5.1） */
  private suspendInstance(instance: AppInstance, reason: SuspendReason): void {
    suspendRegistry.suspend(instance.appId) // 注册表（沙箱包装/bus 投递的共享查询点）
    // C1.2 wiring：lifecycle 经 ctx.suspendScope 直访（不再经 sandbox.freeze 中转）
    this.ctx.suspendScope.freeze(instance.appId) // 定时器保留剩余时长、监听门控、WS close(1000)（§5.2）
    // DOM 摘离到文档片段缓存（§5.3 dom 模式默认）；恢复原位还回。
    // Shadow 应用摘离目标 = shadow 宿主（连带 shadow 内样式一并缓存，§六；
    // 摘 shadow 内容器只会移除渲染目标、样式边界仍在文档）
    const detachRoot = instance.container.getRootNode()
    ;(detachRoot instanceof ShadowRoot ? detachRoot.host : instance.container).remove()
    // head 内本应用样式节点一并摘除（不留幽灵样式，ADR-0033/0042）
    instance.detachedStyles = [...document.head.querySelectorAll<Element>(`style[data-cordis-app="${instance.appId}"], link[data-cordis-app="${instance.appId}"]`)]
    for (const node of instance.detachedStyles) node.remove()
    instance.lastAccessAt = Date.now() // 触点更新（§5.4：挂起/恢复/通信）
    if (instance.suspendedAt === null) instance.suspendedAt = Date.now() // 候选序键（压力驱逐）
    this.ctx.emit('app/suspend', { instanceId: instance.instanceId, reason })
    void this.ctx.keepAlive.probe() // 操作触发预算检查（ADR-0057）
  }

  /** 恢复动作：注册表解挂 + 解冻 + DOM/样式还回（§5.1/§5.3） */
  private resumeInstance(instance: AppInstance): void {
    suspendRegistry.resume(instance.appId)
    // C1.2 wiring：lifecycle 经 ctx.suspendScope 直访（不再经 sandbox.unfreeze 中转）
    this.ctx.suspendScope.unfreeze(instance.appId) // 定时器以剩余时长续期
    const host = this.resolveOutletHost(instance.outlet)
    // 还回目标 = shadow 宿主（若 shadow 应用）；contains 判等防重复还回
    const attachRoot = instance.container.getRootNode()
    const reattach = attachRoot instanceof ShadowRoot ? attachRoot.host : instance.container
    if (!host.contains(reattach)) host.appendChild(reattach) // 原位还回
    for (const node of instance.detachedStyles) document.head.appendChild(node) // 样式还回零闪烁
    instance.detachedStyles = []
    instance.lastAccessAt = Date.now() // LRU 键刷新（§5.4）
    // 恢复三通道统一时序收口（09 号票；lifecycle 是唯一编排者，ADR-0054）：
    // 1. app/resume——state 在此收口一次性 state/sync（ADR-0023）
    this.ctx.emit('app/resume', { instanceId: instance.instanceId })
    // 2. router/replay——该槽位重放一次 outlet/changed（ADR-0056）
    this.ctx.emit('router/replay', { instanceId: instance.instanceId, outlet: instance.outlet })
    // 3. bus/replay——挂起队列按全序回放（ADR-0015/0030）
    this.ctx.emit('bus/replay', { instanceId: instance.instanceId })
    instance.suspendedAt = null
    void this.ctx.keepAlive.probe() // 操作触发预算检查（ADR-0057）
  }

  /**
   * 槽位切换（§5.1.2 默认保活，ADR-0020）：原应用默认挂起（keepAlive 未配置也走挂起，
   * 回程零冷启动）；**应用声明 `keepAlive: false` 时切换直接 dispose**（§5.1.2）。
   * 切回已挂起的应用 = 恢复（路由来源，优先级最高），不重新挂载。
   */
  async switch(outlet: string, appId: string, options: MountOptions = {}): Promise<AppInstance> {
    const current = this.getInstances().find((i) => i.outlet === outlet && i.suspendSources.size === 0)
    const suspended = this.getInstances().find((i) => i.outlet === outlet && i.appId === appId && i.suspendSources.size > 0)
    if (suspended) {
      // 回程零冷启动：恢复既有实例（路由恢复解除全部低优先级挂起，ADR-0031）
      await this.requestResume(this.ctx, suspended.instanceId, 'route')
      if (current && current.instanceId !== suspended.instanceId) {
        await this.retireCurrent(current)
      }
      return suspended
    }
    // 切换事务（§3.3，F11）：目标先**隐藏挂载** —— mountHidden 容器在 mount 期间不可见，
    // 挂载成功后才处置当前应用、末步 reveal。由此消除"卸 A 挂 B"期间的闪烁与中间态，
    // 且 B 挂载失败时当前应用仍在原位（不留悬空窗口）。
    const next = await this.mount(appId, outlet, { ...options, mountHidden: true })
    if (!current || current.instanceId === next.instanceId) {
      this.reveal(next.instanceId) // 无让位方（空槽位切同应用）：直接显示
      return next
    }
    try {
      await this.retireCurrent(current)
    } finally {
      // 无论如何新应用必须可见：retire 失败也照常 reveal（宁可旧应用残留，
      // 不留空白悬空窗口——§3.3 要消除的正是这个）。错误照常上抛给调用方。
      this.reveal(next.instanceId)
    }
    return next
  }

  /**
   * 原应用让位（§5.1.2/§5.3 三模式）：`dom`（缺省）挂起——容器摘离缓存、fiber 仍 ACTIVE；
   * `state` 销毁 DOM 仅留状态快照（驱逐快照机制复用，重挂载注水暖启动）；
   * `memory`/`false` 销毁 DOM 与状态（memory 仅留 deps 模块缓存——P0 直载即宿主工厂，天然保留）。
   */
  private async retireCurrent(current: AppInstance): Promise<void> {
    const mode = this.ctx.deps.manifest(current.appId)?.keepAlive ?? 'dom'
    if (mode === 'dom' || mode === true) {
      await this.requestSuspend(this.ctx, current.instanceId, 'keepalive', 'route')
    } else if (mode === 'state') {
      this.ctx.keepAlive.snapshot(current.appId) // 状态快照入池（§5.3 state 模式）
      await this.destroy(current.instanceId, 'keepalive-state')
    } else {
      await this.destroy(current.instanceId, 'keepalive-disabled') // memory/false（ADR-0020）
    }
  }

  /**
   * 按应用销毁全部实例（security §十 KillSwitch 强制执行点）：security 经
   * security/killswitch 事件旁听驱动（security 不 inject lifecycle——依赖方向 ADR-0054）。
   */
  async destroyByAppId(appId: string, reason: string): Promise<void> {
    for (const inst of [...this.instances.values()].filter((i) => i.appId === appId)) {
      await this.destroy(inst.instanceId, reason)
    }
    // C5.2 wiring：KillSwitch 销毁后清账本/快照（Q4/Q5 决策兑现）；禁用应用不应在重挂载时注水旧态
    this.ctx.keepAlive.destroyLedger(appId)
  }

  /** destroy 级联（§3.2）：fiber dispose -> 沙箱销毁（effect 双保险兜底）-> 容器移除；挂起实例同样可销毁（§5.4 驱逐走本路径） */
  async destroy(instanceId: string, _reason: string): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (!instance) return
    return this.withOutletLock(instance.outlet, async () => {
      if (!this.instances.has(instanceId)) return // 锁内复查（等待期间可能已被 destroy）
      suspendRegistry.resume(instance.appId) // 注册表解挂（沙箱 destroy 与监听器残留引用的诚实清理）
      instance.suspendSources.clear()
      try {
        await instance.fiber.dispose()
      } finally {
        await this.finalizeInstance(instance)
      }
    })
  }

  /**
   * 实例终结清理原语（C5B.1 抽离，Q4 决策：fiber dispose 之后的确定性清理 8 步）：
   * 释放隔离 monitor -> 沙箱销毁 -> portal/容器移除 -> 账本删除 -> bus 注销 ->
   * 泄漏嫌疑登记 -> app/disposed 派发。全量幂等（Q3）：半挂载现场（bus 未注册 /
   * portal 未建）各步均安全 noop——destroy / 事务失败 / abort 三路径统一走此收口。
   */
  private async finalizeInstance(instance: AppInstance): Promise<void> {
    this.releaseIsolatedMonitor(instance.fiber)
    await instance.sandbox?.destroy().catch(() => {})
    instance.portalContainer?.remove()
    this.removeOutletContainer(instance.container) // 已摘离的容器 remove 幂等
    this.instances.delete(instance.instanceId)
    this.ctx.bus.unregister(instance.instanceId)
    // 泄漏嫌疑登记（monitoring §四）：容器应随 dispose 可回收——超 TTL 仍活且发生过 GC 则告警
    this.ctx.monitor.trackDisposed({ instanceId: instance.instanceId, object: instance.container })
    this.ctx.emit('app/disposed', { appId: instance.appId, instanceId: instance.instanceId })
  }

  /** 应用状态查询（§2.3）：monitor/devtools 的唯一同步查询 API，从 fiber.state 派生（挂起账本优先，§5.1） */
  getAppState(instanceId: string): AppExternalState {
    const instance = this.instances.get(instanceId)
    if (!instance) return 'disposed'
    if (instance.suspendSources.size > 0) return 'suspended' // fiber 仍 ACTIVE（挂起非销毁）
    switch (instance.fiber.state) {
      case FiberState.PENDING:
        return 'pending'
      case FiberState.LOADING:
        return 'loading'
      case FiberState.ACTIVE:
        return 'active'
      case FiberState.FAILED:
        return 'failed'
      case FiberState.UNLOADING:
        return 'unloading'
      case FiberState.DISPOSED:
        return 'disposed'
      default:
        return 'disposed'
    }
  }

  getInstances(): AppInstance[] {
    return [...this.instances.values()]
  }

  /** 应用 ctx -> 槽位容器（heterogeneous §4.1：适配器 mount 的目标，容器唯一路径的读取面） */
  containerOf(ctx: Context): HTMLElement | null {
    return this.instanceOf(ctx)?.container ?? null
  }

  /**
   * Portal 容器（style-isolation §4.2）：Shadow 外、容器旁（继承应用命名空间样式）——
   * antd/Element 弹层默认挂 document.body 的重定向目标。懒创建、同实例复用、
   * 随实例销毁移除（应用侧经 ctx.effect 进一步托管可提前回收）。
   */
  getPortalContainer(ctx: Context): HTMLElement {
    const instance = this.instanceOf(ctx)
    if (!instance) throw new Error('lifecycle.getPortalContainer: no instance for ctx (mount outside lifecycle transaction?)')
    if (instance.portalContainer) return instance.portalContainer
    const portal = document.createElement('div')
    portal.dataset.txPortal = instance.appId
    // Shadow 外、容器旁：挂在容器宿主的父节点（shadow 宿主或容器本身同级之后）
    const root = instance.container.getRootNode()
    const host = root instanceof ShadowRoot ? root.host : instance.container
    host.parentNode?.insertBefore(portal, host.nextSibling)
    instance.portalContainer = portal
    return portal
  }

  /** 应用 ctx -> 实例（fiber 原型链判等：plugin() 返回 Object.create(fiber) 包装） */
  private instanceOf(ctx: Context): AppInstance | undefined {
    for (const instance of this.instances.values()) {
      if (instance.fiber === ctx.fiber || Object.getPrototypeOf(instance.fiber) === ctx.fiber) {
        return instance
      }
    }
    return undefined
  }
}

declare module 'cordis' {
  interface Context {
    lifecycle: LifecycleService
  }
}

/**
 * 容器显隐（§3.3 切换事务，F11）：隐藏用 `display:none`，复位用 `''`
 * ——置空即交还宿主样式表，不覆盖宿主 CSS。
 * `data-tx-mount-hidden` 标记仅供诊断与测试断言，不参与布局。
 */
function setMountHidden(el: HTMLElement, hidden: boolean): void {
  el.style.display = hidden ? 'none' : ''
  if (hidden) el.dataset.txMountHidden = '1'
  else delete el.dataset.txMountHidden
}
