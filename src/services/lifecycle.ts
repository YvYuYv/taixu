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
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import '../events'
import type { Sandbox } from '../sandbox'
import { suspendRegistry } from '../suspend'
import type { SuspendReason, SuspendSource } from '../events'
import type { Snapshot } from './deps'

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
  /** 保活池预算与驱逐（§5.4/§5.5，ADR-0019/0026/0052/0057） */
  keepAlive?: KeepAliveConfig
}

/** 保活池预算（§5.4）：数量上限为主、内存水位辅助；快照池上限独立 */
export interface KeepAliveConfig {
  /** 最大同时保活实例数（默认 5；超限 LRU 驱逐） */
  maxCount?: number
  /** 单实例最长保活 ms（超时驱逐；后台标签页 document.hidden 期间暂停计时，§5.4 尾条） */
  ttlMs?: number
  /** 内存水位阈值（默认 0.85；Chromium 限定，非 Chromium 优雅退化跳过） */
  watermark?: number
  /** 水位轮询间隔 ms（默认 30000；操作触发检查为主、轮询兜底，ADR-0057） */
  pollMs?: number
  /** mUASM 路径的堆上限字节（仅 measureUserAgentSpecificMemory 可用而无 legacy jsHeapSizeLimit 时作分母） */
  memoryLimitBytes?: number
  /** 快照池总量上限字节（默认 6MB；超限按 LRU 回收最旧快照，ADR-0052） */
  snapshotPoolBytes?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** idle 回调（§5.4：驱逐决策避免切换关键路径卡顿）；无 rIC 环境退化为 setTimeout(0) */
function idleCallback(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve())
    else setTimeout(resolve, 0)
  })
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
  /** 按应用隔离 monitor impl 的注销器（fiber dispose 即释放；WeakMap 防 root fiber effect 泄漏堆积） */
  private isolatedMonitors = new WeakMap<Fiber, () => unknown>()

  /** 释放实例的隔离 monitor impl（幂等）：destroy/cascadeCleanup 统一经此收口 */
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
    // 水位轮询兜底（ADR-0057）：30s 低频；操作触发检查为主。非 Chromium（无 memory API）
    // 不启用轮询（优雅退化）。ctx.effect 托管清理
    if (this.hasMemoryApi()) {
      const timer = setInterval(() => void this.enforceBudget(), config.keepAlive?.pollMs ?? 30000)
      ctx.effect(() => () => clearInterval(timer))
    }
    // 后台标签页 TTL 计时暂停（§5.4 尾条）：document.hidden 期间累计隐藏时长，
    // TTL 裁决时从挂起时长中扣除（浏览器节流 setTimeout 不可靠，改记账补算）
    const onVisibility = () => {
      if (document.hidden) this.hiddenAt = Date.now()
      else if (this.hiddenAt !== null) {
        this.hiddenTotal += Date.now() - this.hiddenAt
        this.hiddenAt = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    ctx.effect(() => () => document.removeEventListener('visibilitychange', onVisibility))
    // 快照池跨会话账本重建（ADR-0052）：扫描上一会话残留的 __tx_snapshot:* 键入账
    //（at = 0 视为最旧——预算紧张时优先回收，本会话快照存活率更高）
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith('__tx_snapshot:')) {
        const payload = sessionStorage.getItem(key) ?? ''
        this.snapshotPool.set(key.slice('__tx_snapshot:'.length), { bytes: payload.length * 2, at: 0 })
      }
    }
  }

  /** 隐藏记账（TTL 计时暂停用） */
  private hiddenAt: number | null = null
  private hiddenTotal = 0

  /** TTL 已挂起时长（扣除后台隐藏时长；未声明 ttlMs 时不参与裁决） */
  private ttlElapsed(instance: AppInstance): number {
    const hiddenNow = this.hiddenAt !== null ? Date.now() - this.hiddenAt : 0
    return Date.now() - (instance.suspendedAt ?? Date.now()) - this.hiddenTotal - hiddenNow
  }

  /** Chromium memory API 可用性（水位驱逐的启用条件，ADR-0026） */
  private hasMemoryApi(): boolean {
    const perf = this.memoryPerf()
    return Boolean(perf.memory) || typeof perf.measureUserAgentSpecificMemory === 'function'
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

    let stage: 'load' | 'activate' = 'load' // 阶段跟踪：loadApp 之前 = load（资源期）；之后 = activate（激活期）
    try {
      // 1. 资源加载（deps；signal 全程透传）
      const plugin = (await this.ctx.deps.loadApp(appId, { signal })) as Record<string, unknown>
      stage = 'activate'
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')
      this.ctx.emit('app/loaded', { appId, instanceId }) // 资源就绪（基线 §2.4）

      // 2. sandbox 创建（first-party；teardown 双保险注册在 fiber effect 上，§四所有权表）
      const sandbox = await this.ctx.sandbox.create(appId, { container })
      if (signal.aborted) {
        await sandbox.destroy()
        this.removeOutletContainer(container)
        throw new DOMException('aborted', 'AbortError')
      }

      // 3. scopedFetch 注入（ADR-0005：沙箱创建后、plugin() 前）
      sandbox.injectSlot.fetch = this.scopedFetch(appId)

      // 3.5 暖启动注水（§5.5）：plugin() **之前**预注水到 state 服务——
      // 应用 apply 时 local 键空间已就位；版本漂移裁决在 hydrateLocalKeys 内（ADR-0034）
      this.hydrateLocalKeys(appId)

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
      void this.enforceBudget() // 操作触发预算检查（挂载，ADR-0057）
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

  /** 级联清理：fiber dispose -> 沙箱销毁 -> 容器移除（§2.2 catch / §3.2 共用形状） */
  private async cascadeCleanup(fiber: Fiber, sandbox: Sandbox, container: HTMLElement): Promise<void> {
    this.releaseIsolatedMonitor(fiber)
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
    instance.lastAccessAt = Date.now() // 触点更新（§5.4：挂起/恢复/通信）
    if (instance.suspendedAt === null) instance.suspendedAt = Date.now() // 候选序键（压力驱逐）
    this.ctx.emit('app/suspend', { instanceId: instance.instanceId, reason })
    void this.enforceBudget() // 操作触发预算检查（ADR-0057）
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
    instance.suspendedAt = null
    void this.enforceBudget() // 操作触发预算检查（ADR-0057）
  }

  // ---- 驱逐与暖启动（§5.4/§5.5，ADR-0019/0026/0029/0031/0034/0044/0052/0057）----

  /** 快照池账本（appId -> 压缩载荷 + 字节 + 最近写入时刻；LRU 回收依据） */
  private snapshotPool = new Map<string, { bytes: number; at: number }>()
  private get keepAlive(): KeepAliveConfig {
    return this.cfg.keepAlive ?? {}
  }

  /** Chromium memory API 的类型视图（水位检查共用，避免重复 cast） */
  private memoryPerf(): Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
  } {
    return performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
    }
  }

  /** 挂起池（保活候选） */
  private suspendedInstances(): AppInstance[] {
    return this.getInstances().filter((i) => i.suspendSources.size > 0)
  }

  /**
   * 预算执行（§5.4）：数量上限为主（LRU 驱逐）+ 内存水位辅助（压力候选序驱逐）。
   * 决策经 idle 回调（§5.4：避免切换关键路径卡顿）；操作触发为主 + 轮询兜底（ADR-0057）。
   */
  private async enforceBudget(): Promise<void> {
    if (this.budgetRunning) return
    this.budgetRunning = true
    try {
      await idleCallback()
      const maxCount = this.keepAlive.maxCount ?? 5
      // TTL 驱逐（§5.4 尾条）：单实例最长保活，超时按挂起时长驱逐（后台隐藏时间不计）
      const ttlMs = this.keepAlive.ttlMs
      if (ttlMs !== undefined) {
        for (const instance of [...this.suspendedInstances()]) {
          if (this.ttlElapsed(instance) > ttlMs) {
            this.ctx.monitor.capture(new Error('TTL 保活超时驱逐'), { appId: instance.appId, phase: 'runtime' })
            await this.evict(instance, 'ttl')
          }
        }
      }
      // 数量上限（LRU：lastAccessAt 最旧先走）
      while (this.suspendedInstances().length > maxCount) {
        const victim = [...this.suspendedInstances()].sort((a, b) => a.lastAccessAt - b.lastAccessAt)[0]
        if (!victim) break
        await this.evict(victim, 'lru')
      }
      // 内存水位（ADR-0026：Chromium 限定）：压力下按候选序驱逐；**每轮预算检查至多驱逐一个**
      // （压力常驻时由后续操作触发/轮询检查继续，逐个释放给 GC 留出时间）
      if (await this.underPressure()) {
        const victim = this.pickPressureCandidate()
        if (victim) {
          this.ctx.monitor.capture(new Error('内存压力驱逐'), { appId: victim.appId, phase: 'runtime' })
          await this.evict(victim, 'pressure')
        }
      }
    } finally {
      this.budgetRunning = false
    }
  }

  private budgetRunning = false

  /** 压力候选序（ADR-0031 候选清单）：挂起时长降序，同长按快照体积降序 */
  private pickPressureCandidate(): AppInstance | undefined {
    const candidates = this.suspendedInstances()
    return candidates.sort((a, b) => {
      const da = a.suspendedAt ?? Date.now()
      const db = b.suspendedAt ?? Date.now()
      if (da !== db) return da - db // 挂起更久者优先
      return (this.snapshotPool.get(b.appId)?.bytes ?? 0) - (this.snapshotPool.get(a.appId)?.bytes ?? 0)
    })[0]
  }

  /**
   * 内存压力检查（§5.4，ADR-0026）：`performance.measureUserAgentSpecificMemory` 优先
   * （分母 = memoryLimitBytes 配置或 legacy jsHeapSizeLimit），降级 `performance.memory`
   * 比率；两者皆无（非 Chromium）不启用水位（优雅退化为纯数量上限）。
   */
  private async underPressure(): Promise<boolean> {
    const perf = this.memoryPerf()
    const watermark = this.keepAlive.watermark ?? 0.85
    const limit = this.keepAlive.memoryLimitBytes ?? perf.memory?.jsHeapSizeLimit
    if (typeof perf.measureUserAgentSpecificMemory === 'function') {
      if (!limit || limit <= 0) return false
      const { bytes } = await perf.measureUserAgentSpecificMemory()
      return bytes / limit > watermark
    }
    if (perf.memory && perf.memory.jsHeapSizeLimit > 0) {
      return perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit > watermark
    }
    return false // 非 Chromium：不启用（降级跳过）
  }

  /** 驱逐 = 快照 + 销毁 + app/evicted（§5.4/§5.5：淘汰统一走 §3.2 destroy 真正释放） */
  private async evict(instance: AppInstance, cause: 'lru' | 'pressure' | 'ttl'): Promise<void> {
    this.snapshotLocalKeys(instance.appId) // 销毁会回收 local 键空间：先快照（app/disposed 监听）
    await this.destroy(instance.instanceId, 'evicted')
    this.ctx.emit('app/evicted', { appId: instance.appId, instanceId: instance.instanceId, cause })
  }

  /**
   * local: 键空间快照（§5.5，ADR-0029/0044/0052；cordis-alignment：>2MB 放弃）：
   * lz-string 压缩落 sessionStorage `__tx_snapshot:{appId}`；单快照超 2MB 放弃
   * （快照丢失仅降级冷启动）；池总量超限按 LRU 回收最旧。
   */
  snapshotLocalKeys(appId: string): Snapshot | null {
    const data = this.ctx.state.dumpLocal(appId)
    const snapshot: Snapshot = { version: this.ctx.deps.manifest(appId)?.version ?? 0, data }
    const compressed = compressToUTF16(JSON.stringify(snapshot))
    const bytes = compressed.length * 2 // UTF-16 近似字节
    if (bytes > 2 * 1024 * 1024) {
      // >2MB 放弃（cordis-alignment 驱逐快照基线）：同时清掉旧快照，避免残留过时状态
      sessionStorage.removeItem(`__tx_snapshot:${appId}`)
      this.snapshotPool.delete(appId)
      return null
    }
    sessionStorage.setItem(`__tx_snapshot:${appId}`, compressed)
    this.snapshotPool.set(appId, { bytes, at: Date.now() })
    this.trimSnapshotPool()
    return snapshot
  }

  /** 快照池 LRU 回收（ADR-0052）：总量超限丢最旧（哪怕对应应用还在保活池） */
  private trimSnapshotPool(): void {
    const limit = this.keepAlive.snapshotPoolBytes ?? 6 * 1024 * 1024
    const total = () => [...this.snapshotPool.values()].reduce((sum, e) => sum + e.bytes, 0)
    while (total() > limit && this.snapshotPool.size > 0) {
      const oldest = [...this.snapshotPool.entries()].sort((a, b) => a[1].at - b[1].at)[0]!
      this.snapshotPool.delete(oldest[0])
      sessionStorage.removeItem(`__tx_snapshot:${oldest[0]}`)
    }
  }

  /**
   * 快照读取 + 版本裁决（ADR-0034）：命中直接注水；漂移经 manifest.migrate 纯函数迁移，
   * 无 migrate 丢弃冷启动并 monitor 上报"快照版本漂移丢弃"；损坏快照（解析失败）
   * 同样降级冷启动（§5.5"快照丢失仅降级冷启动"姿态）。快照一次性消费：用后即删
   * （快照生命周期跟随驱逐，避免非驱逐销毁后的残留旧态注回下次冷启动）。
   */
  hydrateLocalKeys(appId: string): void {
    const compressed = sessionStorage.getItem(`__tx_snapshot:${appId}`)
    if (!compressed) return
    const consume = () => {
      sessionStorage.removeItem(`__tx_snapshot:${appId}`)
      this.snapshotPool.delete(appId)
    }
    let parsed: Snapshot | null = null
    try {
      parsed = JSON.parse(decompressFromUTF16(compressed) ?? 'null') as Snapshot | null
    } catch {
      this.ctx.monitor.capture(new Error(`快照损坏丢弃: ${appId}`), { appId, phase: 'runtime' })
      consume()
      return
    }
    if (!parsed) return
    const manifest = this.ctx.deps.manifest(appId)
    const currentVersion = manifest?.version ?? 0
    if (parsed.version !== currentVersion) {
      if (manifest?.migrate) {
        const data = manifest.migrate(parsed.data, parsed.version) // 纯函数、沙箱外执行
        this.ctx.state.hydrateLocal(appId, data)
        consume()
        return
      }
      this.ctx.monitor.capture(new Error(`快照版本漂移丢弃: ${appId} ${parsed.version} -> ${currentVersion}`), {
        appId, phase: 'runtime',
      })
      consume()
      return
    }
    this.ctx.state.hydrateLocal(appId, parsed.data)
    consume()
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
    const next = await this.mount(appId, outlet, options) // 新事务先行（§2.2 槽位串行）
    if (current && current.instanceId !== next.instanceId) {
      await this.retireCurrent(current)
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
      this.snapshotLocalKeys(current.appId) // 状态快照入池（§5.3 state 模式）
      await this.destroy(current.instanceId, 'keepalive-state')
    } else {
      await this.destroy(current.instanceId, 'keepalive-disabled') // memory/false（ADR-0020）
    }
  }

  /**
   * scopedFetch（ADR-0005 唯一 fetch 链路；11 号票全链路接线）：
   * security.sanitizeURL 一体裁决（协议门 + origin 授权，粗授权经 adjudicate
   * 超时 fail-closed，ADR-0024/0051）；拒绝路径 violation 上报
   * （网络类按 (appId, rule) 限流去重，§8）。
   */
  private scopedFetch(appId: string): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      const sanitized = await this.ctx.security.sanitizeURL(appId, url)
      if (sanitized === null) {
        this.ctx.security.reportViolation(appId, 'net:fetch', { url })
        throw new Error(`scopedFetch: net:fetch denied for ${appId} (${url})`)
      }
      // Request 对象原样透传（method/body/headers 不丢）；字符串/URL 以规范化后的 href 请求
      if (input instanceof Request) return globalThis.fetch(input, init)
      return globalThis.fetch(sanitized, init)
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
        this.releaseIsolatedMonitor(instance.fiber)
        await instance.sandbox?.destroy().catch(() => {})
        this.removeOutletContainer(instance.container) // 已摘离的容器 remove 幂等
        this.instances.delete(instanceId)
        this.ctx.bus.unregister(instanceId)
        // 泄漏嫌疑登记（monitoring §四）：容器应随 dispose 可回收——超 TTL 仍活且发生过 GC 则告警
        this.ctx.monitor.trackDisposed({ instanceId, object: instance.container })
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
