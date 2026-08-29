/**
 * hydration payload 读取（route-adaptation §六 SSR 水合，F5-02）。
 *
 * payload 形态（spec §3.1）：`<script type="application/json" id="tx-hydration">`，
 * 内容 `{ url: string; outlets?: Record<string, string> }`——`outlets` 与
 * `__tx_outlets` 同形（与 URL 矩阵、popstate 快照三处同构，零新契约）。
 *
 * 职责边界（单一源原则）：本模块**只读不接**——宿主把 `payload.url` 传给
 * `RouterConfig.initialUrl`（F5-01 的唯一源），矩阵由同一 parsers 实现解析；
 * `payload.outlets` 仅供服务端/诊断对账，不作为客户端第二解析源（否则重新引入
 * 双源竞态）。query 不进 payload（敏感 query 不落 HTML，security §3.2 同源顾虑）。
 */

export interface HydrationPayload {
  /** 服务端据以解析的权威 URL（诊断与 mismatch 校验用） */
  url: string
  /** 服务端解析出的槽位矩阵（`__tx_outlets` 同形；对账用，不作为客户端解析源） */
  outlets?: Record<string, string>
}

/**
 * 读取 hydration payload（宿主启动期调用一次）：
 * - 元素缺失 / 非法 JSON / 形态不符（`url` 非非空 string）→ 返回 `null`
 *   （**fail-closed**：调用方回落 `window.location`，启动不阻断——水合是优化不是
 *   正确性强依赖，CSP 拦截 JSON script 时静默回落）
 */
export function readHydrationPayload(doc: Document = document): HydrationPayload | null {
  const el = doc.getElementById('tx-hydration')
  if (!el?.textContent) return null
  try {
    const raw = JSON.parse(el.textContent) as Partial<HydrationPayload>
    if (typeof raw.url !== 'string' || raw.url === '') return null
    return raw.outlets ? { url: raw.url, outlets: raw.outlets } : { url: raw.url }
  } catch {
    return null
  }
}

/**
 * 水合一致性校验（spec §3.3）：payload.url 与当前 location 不一致（用户跳转 / 深链 /
 * 部署重写）→ **以客户端 URL 为准**（页面实际地址不可违背），返回 `location.href`
 * 供宿主改传 `initialUrl` 并上报 violation；一致返回 `null`。
 */
export function hydrationMismatch(
  payload: HydrationPayload,
  location: { href: string } = globalThis.location,
): string | null {
  return payload.url !== location.href ? location.href : null
}
