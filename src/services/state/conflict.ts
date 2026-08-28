/**
 * 冲突消解策略（state-sharing.md §4.5，F2）：四策略接入 `setIfMatch` 的
 * 版本不匹配分支——P0 默认 `reject`（与既往行为一致），宿主可换 LWW / merge / custom。
 *
 * 形态：**零状态纯策略**（无 ctx、无服务依赖、无账本），与 state/helpers.ts 同层。
 * 策略对象是无状态单例（可跨实例共享），注册面在 `StateConfig.conflict`。
 *
 * 语义源 §4.5：
 * - `merge` 不再用 `new Set` 破坏数组顺序（按业务注册的 merge 函数，默认 concat + 去重保序）
 * - 四策略 = last-write-wins / merge / custom / reject
 */

/** 冲突上下文：local = 本次写入（期望版本），remote = 存储中的当前值 */
export interface StateConflict {
  key: string
  local: { value: unknown; version: number; source: string }
  remote: { value: unknown; version: number; source: string }
}

/**
 * 消解结果：`reject` = 不写入（抛 VERSION_CONFLICT）；
 * 其余策略携带最终值（经同一 commit 管线原子推进版本，§4.5）。
 */
export type ConflictResolution =
  | { strategy: 'reject'; reason?: string }
  | { strategy: 'lww' | 'merge' | 'custom'; value: unknown }

/** 冲突消解器（宿主可实现自定义策略，strategy 标记 'custom'） */
export interface ConflictResolver {
  resolve(conflict: StateConflict): ConflictResolution
}

/**
 * 默认策略 = reject（P0，向后兼容）：版本不匹配即失败，不做静默覆盖。
 * 与 §4.5 "交由 ConflictResolver" 前的既有行为一致。
 */
export const REJECT_RESOLVER: ConflictResolver = { resolve: () => ({ strategy: 'reject' }) }

/** last-write-wins：本地值无条件覆盖（版本冲突不阻断写入） */
export function lwwResolver(): ConflictResolver {
  return {
    resolve: (c) => ({ strategy: 'lww', value: c.local.value }),
  }
}

/**
 * 默认 merge 函数（§4.5）：
 * - 数组：remote ++ local 后**去重保序**（不用 `new Set` 打乱顺序）
 * - 纯对象：**递归**逐字段合并（remote 为底、local 覆盖；同名字段继续下探）
 *   ——仅浅合并会让数组字段被 local 整体覆盖、丢掉 remote 内容，与 §4.5
 *   "默认 concat + 去重保序"的意图相悖（state 值绝大多数是对象包数组）
 * - 其余（含类型不一致 / 深度超限）：回退 local（LWW 语义，不做猜测性合并）
 *
 * 递归带深度上限（防深层结构与潜在环引用把合并拖成 O(∞)）；超限回退 LWW。
 */
export function defaultMerge(local: unknown, remote: unknown): unknown {
  return mergeAt(local, remote, 0)
}

const MERGE_MAX_DEPTH = 8

function mergeAt(local: unknown, remote: unknown, depth: number): unknown {
  if (Array.isArray(local) && Array.isArray(remote)) return dedupeConcat(remote, local)
  if (depth < MERGE_MAX_DEPTH && isPlainObject(local) && isPlainObject(remote)) {
    const out: Record<string, unknown> = { ...remote }
    for (const key of Object.keys(local)) {
      out[key] = key in remote ? mergeAt(local[key], remote[key], depth + 1) : local[key]
    }
    return out
  }
  return local
}

/** remote 在前、local 在后，去重保序（§4.5：不用 new Set 破坏顺序） */
function dedupeConcat(remote: unknown[], local: unknown[]): unknown[] {
  const seen = new Set<unknown>()
  const out: unknown[] = []
  for (const item of [...remote, ...local]) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

/**
 * merge 策略：`merge` 函数可注入（业务自定义合并语义），缺省 `defaultMerge`。
 * key/冲突上下文一并透出，便于按键定制（例如计数器累加、集合并集）。
 */
export function mergeResolver(
  merge: (local: unknown, remote: unknown, conflict: StateConflict) => unknown = (l, r) => defaultMerge(l, r),
): ConflictResolver {
  return {
    resolve: (c) => ({ strategy: 'merge', value: merge(c.local.value, c.remote.value, c) }),
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
