/**
 * Router URL 序列化（route-adaptation §4.2 commit / §3.1 URL 矩阵）：
 *
 * commit 的 URL 回写逻辑（全量槽位状态合并序列化）从 router.ts 抽离——
 * 纯函数（outlets Map + isWidget 回调 -> URL string + state 快照），无副作用。
 * history 写入（replaceState / pushState）保留在 router（副作用边界）。
 *
 * **C15-B 抽离动机**：router.commit（~28 行）中 URL 序列化部分是纯函数性质，
 * 与 navigate / guard / popstate 无共享；抽离后 commit 逻辑收敛到 history
 * 写入副作用 + lastCommitted 记账本职。
 */

import { RESERVED_PREFIX, MAIN_CHANNEL, MAIN_RESERVED_KEY, HASH_CHANNEL_KEY } from './parsers'

/** history.state 槽位快照（§4.2）：commit 写入、popstate 恢复 */
export interface HistorySnapshot {
  __tx_outlets?: Record<string, string>
  /** scroll restoration（§六表）：window + 各槽位容器 scrollTop，restore 时应用 */
  __tx_scroll?: Record<string, number>
}

/** 槽位状态的通道内表示 */
export interface OutletState {
  path: string
  query: Record<string, string>
}

export interface CommitUrlResult {
  /** 序列化后的 href（pathname + search + hash） */
  href: string
  /** history.state 快照（全量槽位路径 + scroll restoration） */
  stateSnapshot: HistorySnapshot
}

/**
 * URL 序列化（§4.2 commit / §3.1-4 全量槽位重写）：
 * - pathname = main 槽位 path（history 导航时保留浏览器写入）
 * - query = 业务参数保留 + 非 widget 槽位 `__tx_{name}` 通道
 * - hash = widget 槽位 URL-encoded `槽位=路径` 映射（`w=` 键，§3.1-3）
 * - stateSnapshot = 全量槽位路径 + scroll 快照（§六表）
 */
export function commitUrl(
  outlets: Map<string, OutletState>,
  isWidget: (outlet: string) => boolean,
  options: { history?: boolean },
  scrollSnapshot: Record<string, number>,
): CommitUrlResult {
  const stateSnapshot: HistorySnapshot = { __tx_outlets: {}, __tx_scroll: scrollSnapshot }
  const url = new URL(window.location.href)
  const main = outlets.get(MAIN_CHANNEL)
  if (main && !options.history) url.pathname = main.path
  // 业务 query 保留，仅更新 query 通道槽位参数
  const params = new URLSearchParams(url.search)
  for (const key of [...params.keys()]) {
    if (key.startsWith(RESERVED_PREFIX) && key !== MAIN_RESERVED_KEY) params.delete(key)
  }
  if (main) for (const [k, v] of Object.entries(main.query)) params.set(k, v)
  // hash 通道值 = URL-encoded 的 `槽位=路径` 映射（§3.1-3：w=__tx_widget%3D%2Fhome，多浮窗 & 连接）
  const hashPairs: string[] = []
  for (const [name, state] of outlets) {
    stateSnapshot.__tx_outlets![name] = state.path
    if (name === MAIN_CHANNEL) continue
    if (isWidget(name)) hashPairs.push(encodeURIComponent(`${RESERVED_PREFIX}${name}=${state.path}`))
    else params.set(`${RESERVED_PREFIX}${name}`, state.path)
  }
  url.search = params.toString() ? `?${params}` : ''
  url.hash = hashPairs.length ? `#${HASH_CHANNEL_KEY}=${hashPairs.join('&')}` : url.hash
  const href = url.pathname + (url.search || '') + (url.hash || '')
  return { href, stateSnapshot }
}
