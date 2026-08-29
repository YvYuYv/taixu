/**
 * 状态服务（state-sharing.md §二--§五）：
 * - 三层键空间（§三）：`global:` / `shared:` / `local:{appId}:` 键前缀（非三个平行 Map），
 *   `state/changed` 的 key 携带全限定键
 * - 唯一写入管线（§4.1）：权限校验（security，deny-by-default；接线点就位，全链 fail-closed
 *   在 11 号票验收）-> 版本推进（版本与值在 commit 内原子推进）-> 单次通知
 * - 深层响应式代理（§4.2）：同 (key, version) 下同引用；深层写入走唯一管线（path 全限定）
 * - watch（§4.3，ADR-0001）：ctx.on 托管订阅 + 键过滤 + 首跑送当前值，dispose 自动退订
 * - local: 隔离（§三，ADR-0003）：键前缀 + 归属校验（禁 `ctx.isolate('state')`）
 * - local: 使用条款（ADR-0029/0034/0044）：JSON 可序列化（驱逐快照前提）、
 *   禁 token/密码/PII 键名（快照落 sessionStorage 同源可读）
 * - 挂起感知（ADR-0023）：经 app/suspend/app/resume 事件（root 注册、global 监听），
 *   不 inject lifecycle；挂起不推送、恢复按 watch 键集合一次性 state/sync（拉模型）
 */
import { Service, type Context } from 'cordis'
import '../events'
import {
  SENSITIVE_KEY_PATTERN,
  isPlainObject,
  assertJsonSerializable,
  instanceIdAppId,
  watchedValue,
  matchKey,
} from './state/helpers'
import { REJECT_RESOLVER, type ConflictResolver } from './state/conflict'
import { createTimeTravel, type TimeTravelHandle } from './state/timeTravel'

interface StoredValue {
  value: unknown
  version: number
  updatedAt: number
  updatedBy: string
}

/** watch 记录：挂起/恢复需要按应用归因（instanceId 前缀 = appId，lifecycle §2.1） */
interface WatchRecord {
  appId: string | null // null = root/系统观察者，不受应用挂起影响
  key: string
  /** C3 wiring Q11：是否短路 self-write 回调（filterSelfWrite 模式） */
  filterSelfWrite: boolean
}

export interface WatchOptions {
  /** 归因应用（挂起不推送/恢复 sync 的键集合来源） */
  appId?: string
  /** C3 wiring Q11：显式 opt-in 自身写短路（adapter helper 默认 false） */
  filterSelfWrite?: boolean
}

export interface GetOptions {
  appId?: string
}

export interface SetOptions {
  appId?: string
}

/** 持久化配置（§7.1）：防抖批量、敏感排除、schema 版本化迁移 */
export interface PersistConfig {
  /** 持久化键模式列表（与 sensitiveKeys 求差集；缺省 ['shared:*']） */
  keys?: string[]
  /** 防抖 ms（默认 500；测试注小值） */
  debounceMs?: number
  /** schema 版本（默认 1；与存储键名 cordis-state:v{N} 绑定） */
  schemaVersion?: number
  /** 逐级迁移链：旧 schema -> 新（失败丢弃并上报） */
  migrate?: (data: Record<string, unknown>, fromSchema: number) => Record<string, unknown>
}

/** 跨 tab 通道抽象（§7.2）：缺省 BroadcastChannel -> storage 事件 -> 禁用；测试可注入内存总线 */
export interface CrossTabChannel {
  post(message: unknown): void
  subscribe(listener: (message: unknown) => void): () => void
}

export interface StateConfig {
  persist?: PersistConfig
  /** 跨 tab 同步（缺省启用：BroadcastChannel 不可用时降级 storage 事件，再不可用禁用） */
  crossTab?: { channel?: CrossTabChannel; enabled?: boolean }
  /** 敏感键追加模式（永不持久化/跨 tab；默认 token/password/passwd/secret/credential/pii 子串） */
  sensitiveKeys?: string[]
  /**
   * 版本冲突消解策略（§4.5，F2）：`setIfMatch` 版本不匹配时调用。
   * 缺省 `REJECT_RESOLVER` = 抛 VERSION_CONFLICT（P0 行为，向后兼容）；
   * 宿主可注入 `lwwResolver()` / `mergeResolver()` / 自定义实现。
   */
  conflict?: ConflictResolver
  /**
   * 时间旅行（state-sharing §八，F10）：history 环形缓冲 + `travelTo(version)`。
   * **默认关闭（生产安全默认）**——规范明示 travelTo 仅开发模式提供；宿主开发环境
   * 显式开启。capacity 默认 500。
   */
  timeTravel?: { enabled?: boolean; capacity?: number }
}

/** 跨 tab 同步消息（§7.2：版本仲裁 + 回声过滤的字段基础） */
interface StateSyncMessage {
  key: string
  value: unknown
  version: number
  source: string
  schema: number
}

export class StateService extends Service<StateConfig> {
  static provide = 'state'
  // 基线 §2.3：state inject security（写入/读取裁决）+ monitor；不 inject lifecycle
  static inject = ['security', 'monitor']

  /** 冲突消解器（§4.5）：构造期从 config 固定，运行期不可换（避免策略竞态） */
  private readonly conflictResolver: ConflictResolver
  /** 时间旅行账本（§八，F10）：null = 未启用（生产默认，commit 零记账开销） */
  private readonly timeTravel: TimeTravelHandle | null
  private store = new Map<string, StoredValue>()
  /** 深层代理缓存：root key -> { proxy, version }（版本推进换代际，身份稳定 §4.2） */
  private proxyCache = new Map<string, { proxy: unknown; version: number; ownerAppId: string | null }>()
  /** watch 归因记录：恢复时按应用 watch 键集合派发 state/sync（ADR-0023） */
  private watchers = new Map<Context, WatchRecord[]>()
  /** 挂起中的应用 appId 集合（instanceId 前缀解析；ADR-0023） */
  private suspendedApps = new Set<string>()
  /**
   * bindLocal 上下文标记（C3 wiring）：自身写引发的 watch 回环不视为"外部"变更。
   * 仅在 bindLocal 的 set 函数体内短暂为 true（同步），emit → watch listener
   * 同步分发（cordis emit 同步触发 listener），listener 内同栈帧可见 selfWriting。
   */
  private selfWriting = false

  constructor(ctx: Context, config: StateConfig = {}) {
    super(ctx, 'state')
    this.conflictResolver = config.conflict ?? REJECT_RESOLVER // §4.5 P0 默认 reject
    this.timeTravel =
      config.timeTravel?.enabled === true
        ? createTimeTravel(config.timeTravel.capacity ?? 500) // §八：默认 500 条
        : null
    // 挂起感知（§4.3）：root 注册 + global 监听，不 inject lifecycle（基线 §2.3）
    ctx.on('app/suspend', (e) => {
      this.suspendedApps.add(instanceIdAppId(e.instanceId))
    }, { global: true })
    ctx.on('app/resume', (e) => {
      const appId = instanceIdAppId(e.instanceId)
      this.suspendedApps.delete(appId)
      this.emitSync(appId, e.instanceId)
    }, { global: true })
    // 应用 dispose：Local 键空间整体回收（§三：state 服务按归属批量删除）
    ctx.on('app/disposed', (e) => {
      const appId = instanceIdAppId(e.instanceId)
      const prefix = `local:${appId}:`
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key)
          this.proxyCache.delete(key)
        }
      }
    }, { global: true })
    this.cfg = config
    this.tabId = crypto.randomUUID()
    this.restorePersisted() // 静默恢复（§7.1：不触发 state/changed，订阅者经 watch 首跑取值）
    this.initCrossTab()
    // 清理托管（§7.2 修复：destroy 不只关 channel——防抖定时器一并回收）
    ctx.effect(() => () => {
      clearTimeout(this.flushTimer)
      this.offChannel?.()
    })
  }

  private cfg: StateConfig
  private tabId: string
  /** 持久化防抖定时器 */
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private channel: CrossTabChannel | null = null
  private offChannel: (() => void) | null = null

  /** 敏感键判定（§六：默认子串黑名单 + 配置追加模式；永不持久化/跨 tab） */
  private isSensitiveKey(key: string): boolean {
    if (SENSITIVE_KEY_PATTERN.test(key)) return true
    for (const pattern of this.cfg.sensitiveKeys ?? []) {
      if (pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : pattern === key) return true
    }
    return false
  }

  /** 持久化键判定（§7.1）：命中配置模式且非敏感 */
  private shouldPersist(key: string): boolean {
    if (!this.cfg.persist) return false
    if (this.isSensitiveKey(key)) return false
    const patterns = this.cfg.persist.keys ?? ['shared:*']
    return patterns.some((p) => (p.endsWith('*') ? key.startsWith(p.slice(0, -1)) : p === key))
  }

  /** commit 后置钩子（§4.1：持久化/跨 tab 挂钩；远端应用走 applyRemote 不回流） */
  private onCommitHook(key: string, value: unknown, version: number, source: string): void {
    if (this.shouldPersist(key)) {
      clearTimeout(this.flushTimer)
      this.flushTimer = setTimeout(() => this.flushPersisted(), this.cfg.persist?.debounceMs ?? 500)
    }
    if (this.channel && source !== `tab:${this.tabId}`) {
      this.channel.post({ key, value, version, source: this.tabId, schema: this.cfg.persist?.schemaVersion ?? 1 } satisfies StateSyncMessage)
    }
  }

  /** 防抖批量落盘（§7.1：schema 版本化 + savedAt；sensitive 已在键判定排除） */
  private flushPersisted(): void {
    const schema = this.cfg.persist?.schemaVersion ?? 1
    const data: Record<string, unknown> = {}
    const versions: Record<string, number> = {}
    for (const [key, entry] of this.store) {
      if (this.shouldPersist(key)) {
        data[key] = entry.value
        versions[key] = entry.version
      }
    }
    localStorage.setItem(`cordis-state:v${schema}`, JSON.stringify({ schema, savedAt: Date.now(), data, versions }))
  }

  /** 静默恢复（§7.1）：迁移链升级（失败丢弃 + monitor 上报）；不触发 state/changed */
  private restorePersisted(): void {
    if (!this.cfg.persist) return
    const schema = this.cfg.persist.schemaVersion ?? 1
    const raw = localStorage.getItem(`cordis-state:v${schema}`)
    if (!raw) return
    let parsed: { schema: number; data: Record<string, unknown>; versions?: Record<string, number> }
    try {
      parsed = JSON.parse(raw)
    } catch {
      this.ctx.monitor.capture(new Error('state: 持久化数据损坏丢弃'), { phase: 'runtime' })
      return
    }
    let data = parsed.data
    if (parsed.schema !== schema) {
      if (!this.cfg.persist.migrate) {
        this.ctx.monitor.capture(new Error(`state: 持久化 schema 漂移丢弃 ${parsed.schema} -> ${schema}`), { phase: 'runtime' })
        return
      }
      try {
        data = this.cfg.persist.migrate(parsed.data, parsed.schema)
      } catch (error) {
        this.ctx.monitor.capture(error instanceof Error ? error : new Error(String(error)), { phase: 'runtime' })
        return
      }
    }
    for (const [key, value] of Object.entries(data)) {
      const version = parsed.versions?.[key] ?? 1
      this.store.set(key, { value, version, updatedAt: Date.now(), updatedBy: 'restore' })
    }
  }

  /** 跨 tab 初始化（§7.2）：BroadcastChannel -> storage 事件 -> 禁用；消息版本仲裁 + 回声过滤 */
  private initCrossTab(): void {
    if (this.cfg.crossTab?.enabled === false) return
    if (this.cfg.crossTab?.channel) {
      this.channel = this.cfg.crossTab.channel
    } else if (typeof BroadcastChannel === 'function') {
      const bc = new BroadcastChannel('cordis-state')
      this.channel = {
        post: (msg) => bc.postMessage(msg),
        subscribe: (fn) => {
          bc.addEventListener('message', (e) => fn((e as MessageEvent).data))
          return () => bc.close()
        },
      }
    } else {
      // 降级：storage 事件（真实浏览器跨文档触发；同文档/无 BC 环境不启用——诚实禁用）
      return
    }
    this.offChannel = this.channel.subscribe((msg) => this.onRemoteMessage(msg as StateSyncMessage))
  }

  /** 远端消息（§7.2）：回声过滤 -> 敏感跳过 -> 版本仲裁 -> applyRemote（通知本地订阅者） */
  private onRemoteMessage(msg: StateSyncMessage): void {
    if (msg?.source === this.tabId) return // 回声过滤
    if (!msg || typeof msg.key !== 'string') return
    if (this.isSensitiveKey(msg.key)) return // 敏感键不同步
    const current = this.store.get(msg.key)
    if (current && current.version >= msg.version) return // 版本仲裁：旧消息丢弃
    this.applyRemote(msg.key, msg.value, msg.version, msg.source)
  }

  /** 远端应用（§7.2）：绕过本地权限（源端已校验），但必须通知本地订阅者（修复 setSilent 失明） */
  private applyRemote(key: string, value: unknown, version: number, source: string): void {
    const old = this.store.get(key)
    this.store.set(key, { value, version, updatedAt: Date.now(), updatedBy: `tab:${source}` })
    this.proxyCache.delete(key)
    this.ctx.emit('state/changed', {
      key, value, old: old?.value, path: key, source: `tab:${source}`, version,
    })
  }

  /** 读（§4.1：读也校验——旧版只校验写）；无 appId = 系统/root 访问；子路径经根存储下钻 */
  get(key: string, options: GetOptions = {}): unknown {
    if (options.appId) this.assertReadable(key, options.appId)
    const exact = this.store.get(key)
    const entry = exact ?? this.resolveStored(key)
    if (entry === undefined) return undefined
    // 深层代理：plain object/array 包装（版本内同引用）；Map/Set/Date 原样（§4.2）
    if (isPlainObject(entry.value) || Array.isArray(entry.value)) {
      return this.deepProxy(key, entry.value, entry.version, options.appId)
    }
    return entry.value
  }

  /** 子路径读取：沿点分段从已存储的根键下钻（'shared:cfg.ui.theme' -> store['shared:cfg'].ui.theme） */
  private resolveStored(subPath: string): StoredValue | undefined {
    const segments = subPath.split('.')
    for (let i = segments.length - 1; i > 0; i--) {
      const rootKey = segments.slice(0, i).join('.')
      const entry = this.store.get(rootKey)
      if (!entry) continue
      let value: unknown = entry.value
      for (let j = i; j < segments.length; j++) {
        if (value === null || typeof value !== 'object') return undefined
        value = (value as Record<string, unknown>)[segments[j] as string]
      }
      return { ...entry, value }
    }
    return undefined
  }

  /** 写（§4.1）：权限校验 -> commit（版本原子推进 + 单次通知） */
  set(key: string, value: unknown, options: SetOptions = {}): number {
    this.assertWritable(key, options.appId)
    if (key.startsWith('local:')) {
      assertJsonSerializable(key, value)
      this.assertNotSensitive(key, options.appId)
    }
    return this.commit(key, value, { source: options.appId ?? 'system', path: key })
  }

  /** local: 键空间导出（lifecycle §5.5 驱逐快照；系统身份，ADR-0029） */
  dumpLocal(appId: string): Record<string, unknown> {
    const prefix = `local:${appId}:`
    const out: Record<string, unknown> = {}
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) out[key] = entry.value
    }
    return out
  }

  /**
   * bindLocal（C3 wiring 决策 Q1+Q2+Q3+Q4+Q11）：adapter 公用的 set/get helper，
   * 把"自身写不重渲染"的差异化策略统一上提到 state 层（adapter 不再各写一套）。
   *
   * - 接口（Q1）：`{ get(): T, set(v: T): void }`
   * - 短路机制（Q2）：set 调用走 commit，state 内 selfWriting 标记开启；
   *   watch 回调同栈帧检测 source === appId 静默。
   * - 仅 application（Q3）：host 自写仍视为外部变更（system 不短路）。
   * - 不挂 ctx（Q11）：adapter 内部 helper，state 公共面仍由 ctx.state.set 主导。
   *
   * C3.2 调整：去 prefix 限制——三 adapter（Vue3/Vue2/React）都消费同一 helper；
   * 应用侧选择 key 范围（shared vs local）即可，`local:` 空间仍走 state.set/get 权限边界。
   */
  bindLocal<T>(ctx: Context, key: string, appId: string): { get(): T; set(v: T): void } {
    return {
      get: () => this.get(key, { appId }) as T,
      set: (v: T) => {
        this.selfWriting = true
        try {
          this.set(key, v, { appId })
        } finally {
          this.selfWriting = false
        }
      },
    }
  }

  /**
   * 按键集合快照（lifecycle §5.3 state 模式 / ADR-0023 恢复兜底）：返回 `{value, version}`；
   * 未存储键 version=0、value undefined（如实缺失，不伪装）。系统身份（宿主/编排层用）。
   */
  snapshot(keys: string[]): Record<string, { value: unknown; version: number }> {
    const out: Record<string, { value: unknown; version: number }> = {}
    for (const key of keys) {
      const entry = this.store.get(key)
      out[key] = { value: entry?.value, version: entry?.version ?? 0 }
    }
    return out
  }

  /** local: 键空间注水（lifecycle §5.5 pre-plugin() 阶段；系统身份走唯一写管线） */
  hydrateLocal(appId: string, data: Record<string, unknown>): void {
    const prefix = `local:${appId}:`
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith(prefix)) continue // 隐私边界（ADR-0044）：只注 local 层
      this.commit(key, value, { source: 'hydrate', path: key })
    }
  }

  /** 深层写入（§4.2 set trap 同款路径）：唯一管线 + path 全限定 + 真实 old；权限按全限定 path 裁决（通配一体） */
  setDeep(key: string, path: string, value: unknown, options: SetOptions & { old?: unknown } = {}): number {
    // 路径归一：接受相对（'ui.theme'）与全限定（'global:cfg.ui.theme'）两种形式
    const relPath = path.startsWith(`${key}.`) ? path.slice(key.length + 1) : path
    const fullPath = `${key}.${relPath}`
    this.assertWritable(fullPath, options.appId)
    if (key.startsWith('local:')) {
      assertJsonSerializable(key, value)
      this.assertNotSensitive(key, options.appId)
    }
    const root = this.store.get(key)
    const shallow = structuredClone(root?.value ?? {})
    const segments = relPath.split('.')
    let cursor: Record<string, unknown> = shallow as Record<string, unknown>
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i] as string
      if (i === segments.length - 1) {
        const old = options.old !== undefined ? options.old : cursor[seg] // trap 直传真实 prev（代理视图已被本地变更）
        cursor[seg] = value
        return this.commit(key, shallow, { source: options.appId ?? 'system', path: fullPath, old })
      }
      if (!isPlainObject(cursor[seg])) cursor[seg] = {}
      cursor = cursor[seg] as Record<string, unknown>
    }
    throw new Error(`state: invalid deep path "${path}"`)
  }

  /**
   * 时间旅行查询面（§八，F10）：history 环形缓冲只读快照（时间序，最旧在前）。
   * 未启用返回空数组。devtools/宿主经此消费——不新增采集循环（唯一数据源是 commit 钩子）。
   */
  history(): { key: string; version: number; source: string; ts: number; value: unknown }[] {
    return this.timeTravel?.entries().slice() ?? []
  }

  /**
   * 时间旅行回滚（§八，F10）：把 `version` 对应的键恢复为其当时值——经**同一 commit
   * 管线**提交（source = 'time-travel'，通知/持久化/跨 tab 语义与普通写入一致；
   * 回滚本身也入账，可"再旅行回未来"）。
   *
   * **生产禁用**（规范明示"仅开发模式"）：未启用 `timeTravel` 即抛错——不是静默
   * no-op（静默会让宿主误以为回滚成功）。
   * @returns 回滚后的新版本号
   */
  travelTo(version: number): number {
    if (!this.timeTravel) {
      throw new Error('state: travelTo requires timeTravel.enabled (dev-only feature, disabled in production by default)')
    }
    const entry = this.timeTravel.find(version)
    if (!entry) throw new Error(`state: no history entry for version ${version}`)
    return this.commit(entry.key, entry.value, { source: 'time-travel', path: entry.key })
  }

  /**
   * 乐观并发 CAS（§4.5）：版本匹配走唯一提交管线（版本+值原子推进）；
   * 不匹配则交由 `ConflictResolver`（四策略：reject / last-write-wins / merge / custom）。
   * P0 默认 `REJECT_RESOLVER` = 抛 VERSION_CONFLICT（与引入策略前的既有行为一致）；
   * 非 reject 策略的消解值经**同一 commit 管线**提交（版本原子推进，通知/持久化/跨
   * tab 语义与普通写入一致）。权限与 set 同一裁决（CAS 不绕过，消解也不绕过）。
   */
  setIfMatch(key: string, expected: number, value: unknown, options: SetOptions = {}): number {
    this.assertWritable(key, options.appId)
    if (key.startsWith('local:')) {
      assertJsonSerializable(key, value)
      this.assertNotSensitive(key, options.appId)
    }
    const current = this.store.get(key)
    if (current?.version !== expected) {
      const source = options.appId ?? 'system'
      const resolution = this.conflictResolver.resolve({
        key,
        local: { value, version: expected, source },
        remote: { value: current?.value, version: current?.version ?? 0, source: current?.updatedBy ?? 'system' },
      })
      if (resolution.strategy === 'reject') {
        throw new Error(
          `state: VERSION_CONFLICT on "${key}" (expected ${expected}, current ${current?.version ?? 0})`,
        )
      }
      return this.commit(key, resolution.value, { source, path: key })
    }
    return this.commit(key, value, { source: options.appId ?? 'system', path: key })
  }

  /**
   * 真原子批写（§4.4）：只克隆涉及根键 -> mutator 在副本上执行（异常 = 零通知零污染，
   * 真状态与订阅者完全无感）-> 成功后逐键走 commit（每键恰好一次通知）。
   */
  batch<T>(keys: string[], mutator: (draft: Record<string, unknown>) => T, options: SetOptions = {}): T {
    for (const key of keys) this.assertWritable(key, options.appId) // 前置统一校验（任一失败整批不动）
    const originals = new Map<string, unknown>()
    const drafts: Record<string, unknown> = {}
    for (const key of keys) {
      const current = this.store.get(key)?.value
      originals.set(key, current)
      drafts[key] = current === undefined ? undefined : structuredClone(current)
    }
    let result: T
    try {
      result = mutator(drafts)
    } catch (error) {
      throw error // 副本丢弃：真状态与订阅者零感知（异常原样上抛）
    }
    for (const key of keys) {
      const next = drafts[key]
      if (!Object.is(next, originals.get(key))) {
        this.commit(key, next, { source: options.appId ?? 'system', path: key })
      }
    }
    return result
  }

  /** watch（§4.3，ADR-0001）：ctx.on 托管 + 键过滤 + 首跑当前值；dispose 自动退订 */
  watch(ctx: Context, key: string, fn: (value: unknown) => void, options: WatchOptions = {}): () => void {
    // 归因：显式 appId > 调用方 fiber 名（应用插件名）；root ctx（fiber 名 'root'）= 系统观察者不受应用挂起影响
    const fiberName = ctx.fiber.name
    const record: WatchRecord = {
      appId: options.appId ?? (fiberName !== 'root' ? fiberName : null),
      key,
      // C3 wiring Q11：短路 self-write 仅在显式 opt-in（adapter helper 默认走框架自身 same-value 短路）
      filterSelfWrite: options.filterSelfWrite === true,
    }
    const list = this.watchers.get(ctx) ?? []
    list.push(record)
    this.watchers.set(ctx, list)
    // 归因登记（非退订表：ADR-0023 恢复 sync 需按应用聚合 watch 键集合；
    // 退订本身由 ctx.on 托管，本清理只回收归因数据）
    ctx.effect(() => () => {
      const records = this.watchers.get(ctx)
      if (!records) return
      const idx = records.indexOf(record)
      if (idx !== -1) records.splice(idx, 1)
      if (records.length === 0) this.watchers.delete(ctx)
    })
    const off = ctx.on('state/changed', (payload) => {
      if (!matchKey(key, payload.key, payload.path)) return // 键过滤（前缀/点分路径，双向）
      if (record.appId && this.suspendedApps.has(record.appId)) return // 挂起不推送（ADR-0023）
      if (record.appId && !this.canRead(payload.key, record.appId)) return // 投递也过读权限（fail-closed）
      // C3 wiring：bindLocal 上下文（self-writing flag）静默自身写回环
      // （仅 record.filterSelfWrite true 时启用；公共 watch 默认不过滤以保留框架 same-value 行为）
      if (record.filterSelfWrite && this.selfWriting && record.appId && payload.source === record.appId) return
      // 子路径观察者取子路径值（根提交整体替换子树，按 watched 键下钻）
      fn(watchedValue(key, payload.key, payload.value))
    })
    // 首跑送当前值：同样过读权限（无授权即抛，不留旁路）；子路径经根存储下钻
    fn(this.get(key, { appId: record.appId ?? undefined }))
    // 组件级退订句柄（state-sharing §六：框架 hook 组件卸载经 effect 归还——
    // 应用级订阅仍随 fiber dispose 托管，本句柄供 hook 提前归还；闭包捕获各自
    // off，同 fn 多订阅互不干扰）
    return off
  }

  /** 唯一提交路径（§4.1）：版本与值原子推进 + 单次通知 */
  private commit(key: string, value: unknown, meta: { source: string; path: string; old?: unknown }): number {
    const old = this.store.get(key)
    const version = (old?.version ?? 0) + 1
    this.store.set(key, { value, version, updatedAt: Date.now(), updatedBy: meta.source })
    // 代理缓存换代（身份稳定：新版本 -> 新代理代际）
    this.proxyCache.delete(key)
    this.ctx.emit('state/changed', {
      key,
      value,
      old: meta.old ?? old?.value,
      path: meta.path,
      source: meta.source,
      version,
    })
    this.onCommitHook(key, value, version, meta.source) // 持久化/跨 tab 钩子（§七）
    this.timeTravel?.record(key, version, meta.source, value) // §八 时间旅行入账（F10）
    return version
  }

  /** 写权限（§4.1）：local: owner 自动授予（§三）；其余 deny-by-default 走 security */
  private assertWritable(key: string, appId?: string): void {
    if (!appId) return // 系统写入（root/宿主）
    if (this.isLocalOwner(key, appId)) return
    if (!this.canWrite(key, appId)) {
      this.ctx.security.reportViolation(appId, 'state-write', { key })
      throw new Error(`state: write denied for "${key}" (appId: ${appId})`)
    }
  }

  /** 读权限断言：deny-by-default 抛错（§4.1 读也校验） */
  private assertReadable(key: string, appId: string): void {
    if (this.isLocalOwner(key, appId)) return
    if (!this.canRead(key, appId)) {
      this.ctx.security.reportViolation(appId, 'state-read', { key })
      throw new Error(`state: read denied for "${key}" (appId: ${appId})`)
    }
  }

  private canRead(key: string, appId: string): boolean {
    return this.ctx.security.check(appId, `state:read:${key}`).allowed
  }

  private canWrite(key: string, appId: string): boolean {
    return this.ctx.security.check(appId, `state:write:${key}`).allowed
  }

  /** local: 归属校验（§三，ADR-0003）：键前缀 local:{appId}: 且调用方为该 appId */
  private isLocalOwner(key: string, appId: string): boolean {
    if (!key.startsWith(`local:${appId}:`)) {
      if (key.startsWith('local:')) {
        // 跨应用访问他人 local 空间：归属校验拒绝
        this.ctx.security.reportViolation(appId, 'state-local-owner', { key })
        throw new Error(`state: local keyspace "${key}" does not belong to appId "${appId}"`)
      }
      return false
    }
    return true
  }

  /** 敏感键名校验（ADR-0044）：token/密码/PII 键名写入即拒并上报 */
  private assertNotSensitive(key: string, appId?: string): void {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      this.ctx.security.reportViolation(appId ?? 'system', 'state-sensitive-key', { key })
      throw new Error(`state: sensitive key "${key}" rejected (local: keys must not hold token/password/PII)`)
    }
  }

  /** 深层代理（§4.2）：身份稳定（版本内缓存）+ receiver 正确传递 + 深层写入走唯一管线（带调用方归因） */
  private deepProxy(key: string, target: object, rootVersion: number, ownerAppId?: string): unknown {
    const owner = ownerAppId ?? null
    const cached = this.proxyCache.get(key)
    if (cached && cached.version === rootVersion && cached.ownerAppId === owner) return cached.proxy

    const proxy = new Proxy(target, {
      get: (obj, prop, receiver) => {
        const value = Reflect.get(obj, prop, receiver)
        if (isPlainObject(value) || Array.isArray(value)) {
          return this.deepProxy(`${key}.${String(prop)}`, value, rootVersion, ownerAppId) // 子代理同样缓存
        }
        return value
      },
      set: (obj, prop, next, receiver) => {
        const prev = Reflect.get(obj, prop, receiver)
        if (prev === next) return true
        // 深层写入经唯一提交路径（权限+版本+通知），path 全限定、old 为真实 prev、
        // 归因带 proxy 的持有者 appId（get(key,{appId}) 传递）--写入管线不可绕过（§二）
        this.setDeep(key, `${key}.${String(prop)}`, next, { appId: ownerAppId, old: prev })
        return Reflect.set(obj, prop, next, receiver) // 本地视图同步（store 已由 commit 换代）
      },
    })
    this.proxyCache.set(key, { proxy, version: rootVersion, ownerAppId: owner })
    return proxy
  }

  /** 恢复同步（ADR-0023）：按该应用 watch 键集合派发一次性 state/sync（拉模型） */
  private emitSync(appId: string, instanceId: string): void {
    const keys: Record<string, { value: unknown; version: number }> = {}
    for (const records of this.watchers.values()) {
      for (const r of records) {
        if (r.appId !== appId) continue
        const entry = this.store.get(r.key)
        keys[r.key] = { value: entry?.value, version: entry?.version ?? 0 }
      }
    }
    this.ctx.emit('state/sync', { instanceId, keys })
  }
}

/** state 服务尾注（helpers 已迁出至 state/helpers.ts —— C11-A） */

declare module 'cordis' {
  interface Context {
    state: StateService
  }
}
