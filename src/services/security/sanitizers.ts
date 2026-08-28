/**
 * Security sanitizers（security §3.2 URL 白名单 + §七 CSRF cookie + §3.3 isolate 白名单）：
 *
 * 4 个 helper + 1 个常量从 security.ts 顶层/内部抽离——零 Cordis 依赖。
 *
 * **C10-A 抽离动机**：原 security.ts 8 类关注面混在一处（权限裁决 / 急停 / sanitizeURL /
 *   sanitizeHTML / sanitizeQuery / CSRF / 违规限流 / SRI lookup）；helpers 与 service 类
 *   解耦后易于独立单测与同类复用。
 *
 * **C10-A + 删除 lookupSri**：deps.loadScript 与 SRI 校验路径走 `security.integrityEntry`
 *   （早于 lookupSri 命名），lookupSri 是重复同签名同 body 的冗余函数。删除 lookupSri，
 *   保留 integrityEntry。
 */

import '../../events'

/** isolate 白名单（ADR-0010）：仅 router-view / monitor；其余标签属越权隔离（拦截） */
const ISOLATE_WHITELIST = new Set(['router-view', 'monitor'])

/** isolate 标签白名单查询（框架入口守卫用；ADR-0010"仅允许两处"） */
export function isIsolateAllowed(tag: string): boolean {
  return ISOLATE_WHITELIST.has(tag)
}

/**
 * 通配匹配（security §四.6/§3.2，state-sharing §4.1-2）：
 * `*` 全量、`net:*`/`shared:cart.*` 前缀族（冒号/点分通配一体）、`net:fetch` 精确。
 */
export function matchAction(pattern: string, action: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith(':*') || pattern.endsWith('.*')) return action.startsWith(pattern.slice(0, -1))
  return pattern === action
}

/**
 * cookie 读取（§七：受控存储=服务端 SameSite cookie；
 * 缺失/损坏返回 null 诚实降级）。元字符转义保护配置注入安全。
 */
export function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 配置名中的正则元字符转义
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
  if (!m) return null
  try {
    return decodeURIComponent(m[1] as string)
  } catch {
    return null // 损坏编码（裸 % 等）：不炸 fetch 链路，按无 token 降级
  }
}
