/**
 * 保活预算核心（lifecycle-management §5.4/§5.5，ADR-0019/0026/0029/0031/0034/0044/0052/0057）。
 *
 * C5.1 抽离：原 lifecycle.ts 内嵌的 ~165 行保活子系统（账本 + 状态机 + 驱逐仲裁）
 * 独立为本核心。职责边界：
 * - **账本**：snapshotPool（appId -> 压缩字节 + 时刻；LRU 回收依据）+ 跨会话重建
 * - **探测**：performance.memory 水位 / document.hidden 后台计时暂停 / idle 回调调度
 * - **仲裁**：TTL 驱逐 + 数量上限（LRU）+ 内存压力（候选序，每轮至多一个）
 * - **快照**：snapshotLocalKeys（lz-string 压缩落 sessionStorage）/ hydrateLocalKeys
 *   （版本裁决 + migrate 纯函数迁移 + 一次性消费）
 *
 * 编排委托：本核心不反向依赖 lifecycle 类型——挂起池条目以最小投影
 * `SuspendPoolEntry` 传入，销毁/事件经 `KeepAliveHost` 回调由 lifecycle 兑现
 * （lifecycle 是唯一编排者，ADR-0054）。
 */
// lz-string 是 CJS：ESM 下 named import 不可靠（Node 的 cjs-module-lexer 无法静态识别），
// 走 default import 解构（与 dompurify 同一处理方式）
import lzStringNS from 'lz-string'

const { compressToUTF16, decompressFromUTF16 } = lzStringNS as unknown as {
  compressToUTF16: (input: string) => string
  decompressFromUTF16: (input: string) => string
}
import { Service, type Context } from 'cordis'
import type { Snapshot } from './deps'

/** 保活预算配置（§5.4；createCordis keepAlive 选项的原形状） */
export interface KeepAliveConfig {
  /** 保活池数量上限（默认 5；LRU 驱逐） */
  maxCount?: number
  /** 单实例最长保活 ms（§5.4 尾条；超时按挂起时长驱逐，后台隐藏时间不计） */
  ttlMs?: number
  /** 内存水位比率（默认 0.85，ADR-0026） */
  watermark?: number
  /** 水位轮询兜底周期 ms（默认 30000，ADR-0057；非 Chromium 不启用） */
  pollMs?: number
  /** mUASM 路径的堆上限字节（仅 measureUserAgentSpecificMemory 可用而无 legacy jsHeapSizeLimit 时作分母） */
  memoryLimitBytes?: number
  /** 快照池总量上限字节（默认 6MB；超限按 LRU 回收最旧快照，ADR-0052） */
  snapshotPoolBytes?: number
}

/** lifecycle 挂起池条目的最小投影（core 不依赖 AppInstance 完整类型） */
export interface SuspendPoolEntry {
  appId: string
  instanceId: string
  /** 挂起起点（候选序键；null = 未挂起，不应出现在 listSuspended 结果中） */
  suspendedAt: number | null
  /** LRU 键（§5.4：挂起/恢复/通信触点更新） */
  lastAccessAt: number
}

/** lifecycle 侧注入的宿主回调（编排委托面；C5.2 起由 ctx 服务面兑现） */
export interface KeepAliveHost {
  /** state 面：local 键空间导出（快照数据源，§5.5） */
  dumpLocal(appId: string): Record<string, unknown>
  /** state 面：local 键空间注水（暖启动，§5.5） */
  hydrateLocal(appId: string, data: Record<string, unknown>): void
  /** deps 面：应用清单（快照版本裁决 + migrate，ADR-0034） */
  manifest(appId: string): { version?: number; migrate?: (data: Record<string, unknown>, from: number) => Record<string, unknown> } | undefined
  /** monitor 面：驱逐/快照丢弃上报 */
  capture(err: Error, meta: { appId: string; phase: 'runtime' }): void
  /** lifecycle 面：当前挂起池（保活候选；LRU/TTL/压力仲裁的数据源） */
  listSuspended(): SuspendPoolEntry[]
  /** lifecycle 面：驱逐执行 = §3.2 destroy 真正释放 */
  destroyInstance(instanceId: string, reason: string): Promise<void>
  /** lifecycle 面：驱逐完成事件（app/evicted 派发） */
  onEvicted(appId: string, instanceId: string, cause: 'lru' | 'pressure' | 'ttl'): void
}

/** idle 回调（§5.4：驱逐决策避免切换关键路径卡顿）；无 rIC 环境退化为 setTimeout(0) */
function idleCallback(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve())
    else setTimeout(resolve, 0)
  })
}

const SNAP_KEY_PREFIX = '__tx_snapshot:'

export class KeepAliveCore {
  private readonly cfg: KeepAliveConfig
  /** 宿主回调（C5.2 wiring：bindHost 二次注入——C1.2 setReconnect 同 pattern；绑定前探测空转） */
  private host: KeepAliveHost | null = null

  /** 快照池账本（appId -> 压缩载荷 + 字节 + 最近写入时刻；LRU 回收依据） */
  private readonly snapshotPool = new Map<string, { bytes: number; at: number }>()
  /** 后台标签页隐藏记账（TTL 计时暂停用，§5.4 尾条） */
  private hiddenAt: number | null = null
  private hiddenTotal = 0
  private budgetRunning = false

  constructor(config: KeepAliveConfig = {}) {
    this.cfg = config
    // 快照池跨会话账本重建（ADR-0052）：扫描上一会话残留的 __tx_snapshot:* 键入账
    //（at = 0 视为最旧——预算紧张时优先回收，本会话快照存活率更高）
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(SNAP_KEY_PREFIX)) {
        const payload = sessionStorage.getItem(key) ?? ''
        this.snapshotPool.set(key.slice(SNAP_KEY_PREFIX.length), { bytes: payload.length * 2, at: 0 })
      }
    }
  }

  /** lifecycle 编排回调绑定（lifecycle 构造时调用；core 不反向依赖 lifecycle 类型） */
  bindHost(host: KeepAliveHost): void {
    this.host = host
  }

  private requireHost(): KeepAliveHost {
    if (!this.host) throw new Error('keepAlive: host not bound (lifecycle not started)')
    return this.host
  }

  /** 后台标签页可见性变化（KeepAliveService 的 visibilitychange 监听委托至此） */
  onVisibility(hidden: boolean): void {
    if (hidden) this.hiddenAt = Date.now()
    else if (this.hiddenAt !== null) {
      this.hiddenTotal += Date.now() - this.hiddenAt
      this.hiddenAt = null
    }
  }

  /** Chromium memory API 可用性（水位驱逐的启用条件，ADR-0026） */
  hasMemoryApi(): boolean {
    const perf = this.memoryPerf()
    return Boolean(perf.memory) || typeof perf.measureUserAgentSpecificMemory === 'function'
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

  /** TTL 已挂起时长（扣除后台隐藏时长；未声明 ttlMs 时不参与裁决） */
  private ttlElapsed(entry: SuspendPoolEntry): number {
    const hiddenNow = this.hiddenAt !== null ? Date.now() - this.hiddenAt : 0
    return Date.now() - (entry.suspendedAt ?? Date.now()) - this.hiddenTotal - hiddenNow
  }

  /**
   * 预算执行（§5.4）：数量上限为主（LRU 驱逐）+ 内存水位辅助（压力候选序驱逐）。
   * 决策经 idle 回调（§5.4：避免切换关键路径卡顿）；操作触发为主 + 轮询兜底（ADR-0057）。
   */
  async enforceBudget(): Promise<void> {
    if (this.budgetRunning) return
    this.budgetRunning = true
    try {
      await idleCallback()
      const maxCount = this.cfg.maxCount ?? 5
      // TTL 驱逐（§5.4 尾条）：单实例最长保活，超时按挂起时长驱逐（后台隐藏时间不计）
      const ttlMs = this.cfg.ttlMs
      if (ttlMs !== undefined) {
        for (const entry of [...this.requireHost().listSuspended()]) {
          if (this.ttlElapsed(entry) > ttlMs) {
            this.requireHost().capture(new Error('TTL 保活超时驱逐'), { appId: entry.appId, phase: 'runtime' })
            await this.evict(entry, 'ttl')
          }
        }
      }
      // 数量上限（LRU：lastAccessAt 最旧先走）
      let suspended = this.requireHost().listSuspended()
      while (suspended.length > maxCount) {
        const victim = [...suspended].sort((a, b) => a.lastAccessAt - b.lastAccessAt)[0]
        if (!victim) break
        await this.evict(victim, 'lru')
        suspended = this.requireHost().listSuspended()
      }
      // 内存水位（ADR-0026：Chromium 限定）：压力下按候选序驱逐；**每轮预算检查至多驱逐一个**
      // （压力常驻时由后续操作触发/轮询检查继续，逐个释放给 GC 留出时间）
      if (await this.underPressure()) {
        const victim = this.pickPressureCandidate()
        if (victim) {
          this.requireHost().capture(new Error('内存压力驱逐'), { appId: victim.appId, phase: 'runtime' })
          await this.evict(victim, 'pressure')
        }
      }
    } finally {
      this.budgetRunning = false
    }
  }

  /** 压力候选序（ADR-0031 候选清单）：挂起时长降序，同长按快照体积降序 */
  private pickPressureCandidate(): SuspendPoolEntry | undefined {
    const candidates = this.requireHost().listSuspended()
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
    const watermark = this.cfg.watermark ?? 0.85
    const limit = this.cfg.memoryLimitBytes ?? perf.memory?.jsHeapSizeLimit
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
  private async evict(entry: SuspendPoolEntry, cause: 'lru' | 'pressure' | 'ttl'): Promise<void> {
    this.snapshotLocalKeys(entry.appId) // 销毁会回收 local 键空间：先快照（app/disposed 监听）
    await this.requireHost().destroyInstance(entry.instanceId, 'evicted')
    this.requireHost().onEvicted(entry.appId, entry.instanceId, cause)
  }

  /**
   * local: 键空间快照（§5.5，ADR-0029/0044/0052；cordis-alignment：>2MB 放弃）：
   * lz-string 压缩落 sessionStorage `__tx_snapshot:{appId}`；单快照超 2MB 放弃
   * （快照丢失仅降级冷启动）；池总量超限按 LRU 回收最旧。
   */
  snapshotLocalKeys(appId: string): Snapshot | null {
    const data = this.requireHost().dumpLocal(appId)
    const snapshot: Snapshot = { version: this.requireHost().manifest(appId)?.version ?? 0, data }
    const compressed = compressToUTF16(JSON.stringify(snapshot))
    const bytes = compressed.length * 2 // UTF-16 近似字节
    if (bytes > 2 * 1024 * 1024) {
      // >2MB 放弃（cordis-alignment 驱逐快照基线）：同时清掉旧快照，避免残留过时状态
      sessionStorage.removeItem(`${SNAP_KEY_PREFIX}${appId}`)
      this.snapshotPool.delete(appId)
      return null
    }
    sessionStorage.setItem(`${SNAP_KEY_PREFIX}${appId}`, compressed)
    this.snapshotPool.set(appId, { bytes, at: Date.now() })
    this.trimSnapshotPool()
    return snapshot
  }

  /** 快照池 LRU 回收（ADR-0052）：总量超限丢最旧（哪怕对应应用还在保活池） */
  private trimSnapshotPool(): void {
    const limit = this.cfg.snapshotPoolBytes ?? 6 * 1024 * 1024
    const total = () => [...this.snapshotPool.values()].reduce((sum, e) => sum + e.bytes, 0)
    while (total() > limit && this.snapshotPool.size > 0) {
      const oldest = [...this.snapshotPool.entries()].sort((a, b) => a[1].at - b[1].at)[0]!
      this.snapshotPool.delete(oldest[0])
      sessionStorage.removeItem(`${SNAP_KEY_PREFIX}${oldest[0]}`)
    }
  }

  /**
   * 快照读取 + 版本裁决（ADR-0034）：命中直接注水；漂移经 manifest.migrate 纯函数迁移，
   * 无 migrate 丢弃冷启动并 monitor 上报"快照版本漂移丢弃"；损坏快照（解析失败）
   * 同样降级冷启动（§5.5"快照丢失仅降级冷启动"姿态）。快照一次性消费：用后即删
   * （快照生命周期跟随驱逐，避免非驱逐销毁后的残留旧态注回下次冷启动）。
   */
  hydrateLocalKeys(appId: string): void {
    const compressed = sessionStorage.getItem(`${SNAP_KEY_PREFIX}${appId}`)
    if (!compressed) return
    const consume = () => {
      sessionStorage.removeItem(`${SNAP_KEY_PREFIX}${appId}`)
      this.snapshotPool.delete(appId)
    }
    let parsed: Snapshot | null = null
    try {
      parsed = JSON.parse(decompressFromUTF16(compressed) ?? 'null') as Snapshot | null
    } catch {
      this.requireHost().capture(new Error(`快照损坏丢弃: ${appId}`), { appId, phase: 'runtime' })
      consume()
      return
    }
    if (!parsed) return
    const manifest = this.requireHost().manifest(appId)
    const currentVersion = manifest?.version ?? 0
    if (parsed.version !== currentVersion) {
      if (manifest?.migrate) {
        const data = manifest.migrate(parsed.data, parsed.version) // 纯函数、沙箱外执行
        this.requireHost().hydrateLocal(appId, data)
        consume()
        return
      }
      this.requireHost().capture(new Error(`快照版本漂移丢弃: ${appId} ${parsed.version} -> ${currentVersion}`), {
        appId, phase: 'runtime',
      })
      consume()
      return
    }
    this.requireHost().hydrateLocal(appId, parsed.data)
    consume()
  }

  /**
   * 应用维度账本清理（C5.2 wiring，Q4/Q5 决策兑现）：KillSwitch destroyByAppId 路径
   * 调用——销毁后清快照池账本 + sessionStorage 残留（禁用的应用不应在重挂载时注水旧态）。
   * 注意驱逐路径（evict）不走此方法：驱逐先快照后销毁，快照是暖启动资产（§5.5）。
   */
  destroyLedger(appId: string): void {
    sessionStorage.removeItem(`${SNAP_KEY_PREFIX}${appId}`)
    this.snapshotPool.delete(appId)
  }
}

/**
 * 保活服务（C5.2 wiring，Q3/Q8/Q12 决策固化）：Cordis Service 形态的全局单例。
 * - 探测心跳自持（Q18）：水位轮询 + visibilitychange 监听在本服务构造时接线，
 *   ctx.effect 托管清理——lifecycle 只消费 probe/snapshot/hydrate 三个动作
 * - 编排委托（ADR-0054）：lifecycle 构造时 bindHost 注入编排回调（C1.2 setReconnect 同 pattern）
 */
export class KeepAliveService extends Service<KeepAliveConfig> {
  static provide = 'keepAlive'
  static inject = ['state', 'deps', 'monitor']

  private readonly core: KeepAliveCore

  constructor(ctx: Context, config: KeepAliveConfig = {}) {
    super(ctx, 'keepAlive')
    this.core = new KeepAliveCore(config)
    // 水位轮询兜底（ADR-0057）：30s 低频；操作触发检查为主。非 Chromium（无 memory API）
    // 不启用轮询（优雅退化）。host 未绑定时 enforceBudget 抛错 -> 空转跳过
    if (this.core.hasMemoryApi()) {
      const timer = setInterval(() => {
        if (!this.bound) return
        void this.core.enforceBudget().catch(() => {})
      }, config.pollMs ?? 30000)
      ctx.effect(() => () => clearInterval(timer))
    }
    // 后台标签页 TTL 计时暂停（§5.4 尾条）
    const onVisibility = () => this.core.onVisibility(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    ctx.effect(() => () => document.removeEventListener('visibilitychange', onVisibility))
  }

  private bound = false

  /** lifecycle 编排回调绑定（lifecycle 构造时调用） */
  bindHost(host: KeepAliveHost): void {
    this.core.bindHost(host)
    this.bound = true
  }

  /** 预算检查入口（Q2 接口：操作触发为主，ADR-0057） */
  probe(): Promise<void> {
    return this.core.enforceBudget()
  }

  /** local 键空间快照（Q2 接口；retireCurrent state 模式 + 驱逐路径） */
  snapshot(appId: string): ReturnType<KeepAliveCore['snapshotLocalKeys']> {
    return this.core.snapshotLocalKeys(appId)
  }

  /** 快照注水（Q2 接口；mountOnce pre-plugin 暖启动） */
  hydrate(appId: string): void {
    this.core.hydrateLocalKeys(appId)
  }

  /** 应用维度账本清理（KillSwitch 路径） */
  destroyLedger(appId: string): void {
    this.core.destroyLedger(appId)
  }
}

declare module 'cordis' {
  interface Context {
    keepAlive: KeepAliveService
  }
}
