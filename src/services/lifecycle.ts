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

/** 对外状态名（§2.3 小写形式；suspended 在 08 号票加入） */
export type AppExternalState =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'disposed'
  | 'unloading'

/** 应用实例（lifecycle §2.1）：instanceId 为键，支撑同 appId 多实例 */
export interface AppInstance {
  instanceId: string
  appId: string
  outlet: string
  fiber: Fiber
  ctx: Context
  container: HTMLElement
  sandbox: Sandbox | null
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
  // 03 号票裁剪：router/bus/state 尚未落地（05/06/07 号票），先行注入已有四服务，
  // 后续票逐个补入（依赖方向不变，只是时序上的渐进）
  static inject = ['security', 'sandbox', 'deps', 'monitor']

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
    this.ctx.emit('app/loading', { appId, instanceId, signal })

    try {
      // 1. 资源加载（deps；signal 全程透传）
      const plugin = (await this.ctx.deps.loadApp(appId, { signal })) as Record<string, unknown>
      if (signal.aborted) throw new DOMException('aborted', 'AbortError')

      // 2. 沙箱创建（first-party；teardown 双保险注册在 fiber effect 上，§四所有权表）
      const sandbox = await this.ctx.sandbox.create(appId, {})
      if (signal.aborted) {
        await sandbox.destroy()
        throw new DOMException('aborted', 'AbortError')
      }

      // 3. 容器准备（唯一路径 createOutletContainer，基线 §五）
      const container = this.createOutletContainer(outlet)

      // 4. scopedFetch 注入（ADR-0005：沙箱创建后、plugin() 前）
      sandbox.injectSlot.fetch = this.scopedFetch(appId)

      // 5. 插件挂载：inject 未满足时 fiber 停留 PENDING（Cordis reactive coeffect）
      const fiber = this.ctx.plugin(plugin as never, options.config as never)
      const instance: AppInstance = {
        instanceId,
        appId,
        outlet,
        fiber,
        ctx: fiber.ctx,
        container,
        sandbox,
      }

      // 沙箱 teardown 双保险：fiber dispose 时自动销毁（幂等）
      fiber.ctx.effect(() => () => {
        void sandbox.destroy()
      })

      try {
        await fiber // resolve = ACTIVE；reject = FAILED
      } catch (error) {
        await this.cascadeCleanup(fiber, sandbox, container)
        throw error
      }
      if (signal.aborted) {
        // 结果作废：激活完成但调用方已取消 -> 级联清理不留半挂载现场
        await this.cascadeCleanup(fiber, sandbox, container)
        throw new DOMException('aborted', 'AbortError')
      }

      this.instances.set(instanceId, instance)
      this.ctx.emit('app/ready', { appId, instanceId })
      return instance
    } catch (error) {
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

  /** destroy 级联（§3.2）：fiber dispose -> 沙箱销毁（effect 双保险兜底）-> 容器移除 */
  async destroy(instanceId: string, _reason: string): Promise<void> {
    const instance = this.instances.get(instanceId)
    if (!instance) return
    return this.withOutletLock(instance.outlet, async () => {
      if (!this.instances.has(instanceId)) return // 锁内复查（等待期间可能已被 destroy）
      try {
        await instance.fiber.dispose()
      } finally {
        await instance.sandbox?.destroy().catch(() => {})
        this.removeOutletContainer(instance.container)
        this.instances.delete(instanceId)
        this.ctx.emit('app/disposed', { appId: instance.appId, instanceId })
      }
    })
  }

  /** 应用状态查询（§2.3）：monitor/devtools 的唯一同步查询 API，从 fiber.state 派生 */
  getAppState(instanceId: string): AppExternalState {
    const instance = this.instances.get(instanceId)
    if (!instance) return 'disposed'
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
}

declare module 'cordis' {
  interface Context {
    lifecycle: LifecycleService
  }
}
