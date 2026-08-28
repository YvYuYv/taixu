/**
 * State helpers（state-sharing §4.3 键路径 + §7.1 序列化）：
 *
 * 6 个 helper + 1 常量从 state.ts 顶层抽离——零 Cordis 依赖。
 *
 * **C11-A 抽离动机**：原 state.ts 600+ 行服务类本体与零依赖 helpers 混在一起；
 * helpers 可独立单测（不需构造 host）。抽离后保持"薄顶层 + 厚逻辑"形态
 * （C5-A keepAlive / C6-A tracing / C7-A leakDetector / C8-A router parsers /
 * C9-A deps semver / C10-A security sanitizers 同节奏）。
 */

/** local: 键使用条款：敏感键名黑名单（ADR-0044：快照落 sessionStorage 同源可读） */
export const SENSITIVE_KEY_PATTERN = /(token|password|passwd|secret|credential|pii)/i

/**
 * 是否纯对象（无原型链或 Object.prototype 顶层）—— 用于序列化扫描的识别边界：
 * DOM 节点（nodeType）不算 plain object（防误判）。
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
}

/**
 * local: 值必须 JSON 可序列化（深层扫描：函数/symbol/DOM/循环引用即拒，序列化不丢真）。
 * 抛出 Error 携带 key 与具体非可序列化类别。
 */
export function assertJsonSerializable(key: string, value: unknown): void {
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

/** instanceId -> appId（lifecycle §2.1：`${appId}:${uuid}`） */
export function instanceIdAppId(instanceId: string): string {
  const idx = instanceId.indexOf(':')
  return idx === -1 ? instanceId : instanceId.slice(0, idx)
}

/** 子路径观察者的取值：watched 为 changedKey 的子路径时下钻，否则原值 */
export function watchedValue(watched: string, changedKey: string, value: unknown): unknown {
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
export function matchKey(watched: string, changedKey: string, changedPath?: string): boolean {
  const target = changedPath ?? changedKey
  return (
    watched === target ||
    target.startsWith(`${watched}.`) ||
    watched.startsWith(`${changedKey}.`)
  )
}
