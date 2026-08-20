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
import type { SuspendReason, SuspendSource } from '../events'

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
  /** 挂起时摘除的样式节点（head 内 data-cordis-app 匹配本应用，ADR-0033） */
  detachedStyles: Element[]
}

export interface MountOptions {
  signal?: AbortSignal
  config?: unknown
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class LifecycleService extends Service<LifecycleConfig> {
  static provide = 'lifecycle'
  // 唯一多注入编排者（ADR-0054）；security 显式注入 = fail-closed（ADR-0009）。
  // 03 号票裁剪：router/bus/state 于 05/06/07 号票落地后逐个补入
  // （router 经 onResolve 事件解耦不 inject；bus/state 由 lifecycle 单向登记/监听）
  static inject = ['security', 'sandbox', 'deps', 'monitor', 'state', 'bus']

  /** outlet 级串行队列（§2.2-1）：promise 链天然串行、无唤醒竞态 */
  private outletLocks = new Map<string, Promise<void>>()
  private instances = new Map<string, AppInstance>()

  private cfg: LifecycleConfig

  constructor(ctx: Context, config: LifecycleConfig = {}) {
    super(ctx, 'lifecycle')
    this.cfg = config
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
    const container = this.createOutletContainer(outlet)
    this.ctx.emit('app/loading', { appId, instanceId, signal })

    try {
      // 1. 资源加载（deps；signal 全程透传）
      const plugin = (await this.ctx.deps.loadApp(appId, { signal })) as Record<string, unknown>
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')

      // 2. sandbox 创建（first-party；teardown 双保险注册在 fiber effect 上，§四所有权表）
      const sandbox = await this.ctx.sandbox.create(appId, { container })
      if (signal.aborted) {
        await sandbox.destroy()
        this.removeOutletContainer(container)
        throw new DOMException('aborted', 'AbortError')
      }

      // 3. scopedFetch 注入（ADR-0005：沙箱创建后、plugin() 前）
      sandbox.injectSlot.fetch = this.scopedFetch(appId)

      // 4. 插件挂载：inject 未满足时 fiber 停留 PENDING（Cordis reactive coeffect）。
      //    plugin() 的 apply 经 _reload 在微任务中执行；实例在 plugin() 返回后同步登记，
      //    故 apply 运行时 containerOf 已可解析（fiber 判等见其注释）
      const fiber = this.ctx.plugin(plugin as never, options.config as never)
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
          await this.cascadeCleanup(fiber, sandbox, container)
          this.instances.delete(instanceId)
          this.ctx.bus.unregister(instanceId)
          throw new DOMException('aborted', 'AbortError')
        }
      } catch (error) {
        this.instances.delete(instanceId)
        this.ctx.bus.unregister(instanceId)
        await this.cascadeCleanup(fiber, sandbox, container)
        throw error
      }

      // bus 实例登记（lifecycle -> bus 单向，基线 §2.3：send 定向投递的目标解析数据源；
      // touch = LRU 键刷新回调，§5.4 resume/message 均刷新）
      this.ctx.bus.register({ appId, instanceId, ctx: fiber.ctx, touch: () => (instance.lastAccessAt = Date.now()) })

      this.ctx.emit('app/ready', { appId, instanceId })
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
        phase: attempt === 0 && !(error instanceof Error) ? 'load' : 'activate',
        error: error instanceof Error ? error : new Error(String(error)),
        recoverable: true,
      })
      return this.recover(appId, outlet, error as Error, attempt, options)
    }
  }

  /** 级联清理：fiber dispose -> 沙箱销毁 -> 容器移除（§2.2 catch / §3.2 共用形状） */
  private async cascadeCleanup(fiber: Fiber, sandbox: Sandbox, container: HTMLElement): Promise<void> {
    await fiber.dispose().catch(() => {})
    await sandbox.destroy().catch(() => {})
    this.removeOutletContainer(container)
  }

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
    if (error.name === 'AbortError') throw error
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

  /** 容器创建唯一路径（heterogeneous §4.3）：宿主节点先入 DOM 再返回容器 */
  createOutletContainer(outlet: string): HTMLElement {
    const host = document.createElement('div')
    host.id = `tx-${outlet}`
    this.resolveOutletHost(outlet).appendChild(host)
    return host
  }

  private resolveOutletHost(outlet: string): HTMLElement {
    const selector = this.cfg.outlets?.[outlet] ?? `#${outlet}`
    return document.querySelector<HTMLElement>(selector) ?? document.body
  }

  private removeOutletContainer(container: HTMLElement): void {
    container.remove()
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
    instance.sandbox?.freeze() // 定时器保留剩余时长、监听门控、WS close(1000)（§5.2）
    // DOM 摘离到文档片段缓存（§5.3 dom 模式默认）；恢复原位还回
    instance.container.remove()
    // head 内本应用样式节点一并摘除（不留幽灵样式，ADR-0033/0042）
    instance.detachedStyles = [...document.head.querySelectorAll<Element>(`style[data-cordis-app="${instance.appId}"], link[data-cordis-app="${instance.appId}"]`)]
    for (const node of instance.detachedStyles) node.remove()
    this.ctx.emit('app/suspend', { instanceId: instance.instanceId, reason })
  }

  /** 恢复动作：注册表解挂 + 解冻 + DOM/样式还回（§5.1/§5.3） */
  private resumeInstance(instance: AppInstance): void {
    suspendRegistry.resume(instance.appId)
    instance.sandbox?.unfreeze() // 定时器以剩余时长续期
    const host = this.resolveOutletHost(instance.outlet)
    if (!host.contains(instance.container)) host.appendChild(instance.container) // 原位还回
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
  }

  /**
   * 槽位切换（§5.1.2 默认保活，ADR-0020）：原应用默认挂起（keepAlive 未配置也走挂起，
   * 回程零冷启动）。切回已挂起的应用 = 恢复（路由来源，优先级最高），不重新挂载。
   */
  async switch(outlet: string, appId: string, options: MountOptions = {}): Promise<AppInstance> {
    const current = this.getInstances().find((i) => i.outlet === outlet && i.suspendSources.size === 0)
    const suspended = this.getInstances().find((i) => i.outlet === outlet && i.appId === appId && i.suspendSources.size > 0)
    if (suspended) {
      // 回程零冷启动：恢复既有实例（路由恢复解除全部低优先级挂起，ADR-0031）
      await this.requestResume(this.ctx, suspended.instanceId, 'route')
      if (current && current.instanceId !== suspended.instanceId) {
        await this.requestSuspend(this.ctx, current.instanceId, 'keepalive', 'route')
      }
      return suspended
    }
    const next = await this.mount(appId, outlet, options) // 新事务先行（§2.2 槽位串行）
    if (current && current.instanceId !== next.instanceId) {
      await this.requestSuspend(this.ctx, current.instanceId, 'keepalive', 'route') // 路由来源（优先级最高）
    }
    return next
  }

  /** scopedFetch 最小实现：权限裁决接线在 11 号票；本票保证注入时序（ADR-0005） */
  private scopedFetch(appId: string): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const verdict = this.ctx.security.check(appId, 'net:fetch')
      if (!verdict.allowed) {
        this.ctx.security.reportViolation(appId, 'net:fetch', { url: String(input) })
        throw new Error(`scopedFetch: net:fetch denied for ${appId}`)
      }
      return globalThis.fetch(input, init)
    }
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
        await instance.sandbox?.destroy().catch(() => {})
        this.removeOutletContainer(instance.container) // 已摘离的容器 remove 幂等
        this.instances.delete(instanceId)
        this.ctx.bus.unregister(instanceId)
        this.ctx.emit('app/disposed', { appId: instance.appId, instanceId })
      }
    })
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
    for (const instance of this.instances.values()) {
      // ctx.plugin() 返回 Object.create(fiber) 的 thenable 包装（cordis registry），
      // 而 ctx.fiber 是原 fiber -- 以原型链判等
      if (instance.fiber === ctx.fiber || Object.getPrototypeOf(instance.fiber) === ctx.fiber) {
        return instance.container
      }
    }
    return null
  }
}

declare module 'cordis' {
  interface Context {
    lifecycle: LifecycleService
  }
}
