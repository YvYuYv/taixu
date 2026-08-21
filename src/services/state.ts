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
}

export interface WatchOptions {
  /** 归因应用（挂起不推送/恢复 sync 的键集合来源） */
  appId?: string
}

export interface GetOptions {
  appId?: string
}

export interface SetOptions {
  appId?: string
}

/** local: 键使用条款：敏感键名黑名单（ADR-0044：快照落 sessionStorage 同源可读） */
const SENSITIVE_KEY_PATTERN = /(token|password|passwd|secret|credential|pii)/i

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
}

/** local: 值必须 JSON 可序列化（深层扫描：函数/symbol/DOM/循环引用即拒，序列化不丢真） */
function assertJsonSerializable(key: string, value: unknown): void {
  const seen = new Set<unknown>()
  const scan = (v: unknown): void => {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') {
        throw new Error(`state: value for "${key}" is not JSON-serializable (local: keys must support eviction snapshots)`)
      }
      return
    }
    if (seen.has(v)) {
      throw new Error(`state: value for "${key}" contains a circular reference (not JSON-serializable)`)
    }
    seen.add(v)
    // DOM 节点（nodeType 存在且非 plain object）
    if (typeof (v as { nodeType?: number }).nodeType === 'number' && !isPlainObject(v)) {
      throw new Error(`state: value for "${key}" contains a DOM node (not JSON-serializable)`)
    }
    if (Array.isArray(v)) {
      for (const item of v) scan(item)
      return
    }
    if (!isPlainObject(v)) {
      throw new Error(`state: value for "${key}" contains a ${Object.prototype.toString.call(v)} (not JSON-serializable)`)
    }
    for (const child of Object.values(v)) scan(child)
  }
  scan(value)
}

export class StateService extends Service<Record<never, never>> {
  static provide = 'state'
  // 基线 §2.3：state inject security（写入/读取裁决）+ monitor；不 inject lifecycle
  static inject = ['security', 'monitor']

  private store = new Map<string, StoredValue>()
  /** 深层代理缓存：root key -> { proxy, version }（版本推进换代际，身份稳定 §4.2） */
  private proxyCache = new Map<string, { proxy: unknown; version: number; ownerAppId: string | null }>()
  /** watch 归因记录：恢复时按应用 watch 键集合派发 state/sync（ADR-0023） */
  private watchers = new Map<Context, WatchRecord[]>()
  /** 挂起中的应用 appId 集合（instanceId 前缀解析；ADR-0023） */
  private suspendedApps = new Set<string>()

  constructor(ctx: Context, _config: Record<never, never> = {}) {
    super(ctx, 'state')
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

  /** watch（§4.3，ADR-0001）：ctx.on 托管 + 键过滤 + 首跑当前值；dispose 自动退订 */
  watch(ctx: Context, key: string, fn: (value: unknown) => void, options: WatchOptions = {}): void {
    // 归因：显式 appId > 调用方 fiber 名（应用插件名）；root ctx（fiber 名 'root'）= 系统观察者不受应用挂起影响
    const fiberName = ctx.fiber.name
    const record: WatchRecord = { appId: options.appId ?? (fiberName !== 'root' ? fiberName : null), key }
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
    ctx.on('state/changed', (payload) => {
      if (!matchKey(key, payload.key, payload.path)) return // 键过滤（前缀/点分路径，双向）
      if (record.appId && this.suspendedApps.has(record.appId)) return // 挂起不推送（ADR-0023）
      if (record.appId && !this.canRead(payload.key, record.appId)) return // 投递也过读权限（fail-closed）
      // 子路径观察者取子路径值（根提交整体替换子树，按 watched 键下钻）
      fn(watchedValue(key, payload.key, payload.value))
    })
    // 首跑送当前值：同样过读权限（无授权即抛，不留旁路）；子路径经根存储下钻
    fn(this.get(key, { appId: record.appId ?? undefined }))
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

/** instanceId -> appId（lifecycle §2.1：`${appId}:${uuid}`） */
function instanceIdAppId(instanceId: string): string {
  const idx = instanceId.indexOf(':')
  return idx === -1 ? instanceId : instanceId.slice(0, idx)
}

/** 子路径观察者的取值：watched 为 changedKey 的子路径时下钻，否则原值 */
function watchedValue(watched: string, changedKey: string, value: unknown): unknown {
  if (!watched.startsWith(`${changedKey}.`)) return value
  let cursor: unknown = value
  for (const seg of watched.slice(changedKey.length + 1).split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[seg]
  }
  return cursor
}

/**
 * 键过滤（§4.3，双向）：
 * - watch('shared:cart') 收 'shared:cart' 与 'shared:cart.items'（子路径）
 * - watch('shared:cart.items') 收根键 'shared:cart' 提交（根提交整体替换子树，子路径观察者需刷新）
 */
function matchKey(watched: string, changedKey: string, changedPath?: string): boolean {
  const target = changedPath ?? changedKey
  return (
    watched === target ||
    target.startsWith(`${watched}.`) ||
    watched.startsWith(`${changedKey}.`)
  )
}

declare module 'cordis' {
  interface Context {
    state: StateService
  }
}
