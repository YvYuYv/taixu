/**
 * Router parsers（route-adaptation §三 URL 矩阵 + §4.3 守卫契约工具集）：
 *
 * 5 个顶层 helpers + 5 个常量从 router.ts 顶层抽离。语义全部从原位拷出——
 * 边界精确，行为零变。
 *
 * **C8-A 抽离动机**：原 router.ts 顶部 50 行 helpers 与常量散布，与 service 类本体混在一起
 *   难以单测；抽离后保持"薄顶层 + 厚逻辑"形态，与 C5-A keepAlive.ts / C7-A leakDetector.ts
 *   同节奏。
 */

import type { GuardResult } from '../../events'

/** 保留字前缀（§3.1-1）：`__tx_` 全框架槽位参数统一前缀 */
export const RESERVED_PREFIX = '__tx_'
export const MAIN_CHANNEL = 'main'
export const MAIN_RESERVED_KEY = `${RESERVED_PREFIX}${MAIN_CHANNEL}`
/** hash 通道键（§3.1-3：URL-encoded 槽位=路径 映射） */
export const HASH_CHANNEL_KEY = 'w'
/** 对齐 vue-router 的 8 次上限（§4.3） */
export const REDIRECT_LOOP_CAP = 8

/**
 * 模板字面量事件键族（ADR-0047/0050）：interface 只能声明代表性键
 * （events.ts 的 'outlet/changed:main'），全部槽位键经本窄化 helper 落键
 */
export function outletEventKey(outlet: string): 'outlet/changed:main' {
  return `outlet/changed:${outlet}` as 'outlet/changed:main'
}

/** 守卫结果形状校验（结果契约 ADR-0002/0012）：只允许枚举三值（proceed/redirect/abort）+ undefined */
export function isValidGuardResult(v: unknown): v is GuardResult {
  if (v === undefined) return true
  if (typeof v !== 'object' || v === null) return false
  const t = (v as { type?: unknown }).type
  if (t === 'proceed' || t === 'abort') return true
  if (t === 'redirect') return typeof (v as { to?: unknown }).to === 'string'
  return false
}

/** 路径段边界前缀匹配（§3.3）：`/app1/mod` 不命中 `/app1/module-a` */
export function segmentPrefixMatch(basePath: string, path: string): boolean {
  if (path === basePath || path === basePath + '/') return true
  return path.startsWith(basePath + '/')
}

/** 剔除 `__tx_*` 保留字参数（应用可见 query 不含框架参数，§3.2） */
export function stripReserved(search: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(search)) {
    if (!k.startsWith(RESERVED_PREFIX)) out[k] = v
  }
  return out
}
