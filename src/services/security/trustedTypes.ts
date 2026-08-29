/**
 * Trusted Types 适配（security §3.1，F8）：`require-trusted-types-for 'script'` 下
 * HTML sink（`innerHTML` / `outerHTML` / `insertAdjacentHTML` / `srcdoc` /
 * `document.write` 等）只接受 `TrustedHTML`，赋 string 会抛 TypeError——
 * 框架自身的净化结果（DOMPurify 产物）必须经 policy 包装才能落 sink。
 *
 * 形态：**零状态纯模块**（无 ctx、无服务依赖）+ 单例缓存
 * （`createPolicy` 同名重复调用会抛错，故策略只建一次并缓存）。
 *
 * 能力缺失降级：`window.trustedTypes` 不存在（Firefox/Safari/jsdom）时所有函数
 * 返回原 string——框架行为与启用 TT 前完全一致（TT 是纵深，非必需依赖）。
 */

/** `window.trustedTypes` 的最小面（只取本模块用到的部分） */
export interface TrustedTypesLike {
  createPolicy(name: string, rules: { createHTML?: (html: string) => string }): TrustedTypePolicyLike
}

export interface TrustedTypePolicyLike {
  createHTML(html: string): unknown
}

/** 探测结果缓存：undefined = 未探测；null = 不可用 */
let cached: { available: boolean; policy: Map<string, TrustedTypePolicyLike> } | undefined

function env(): { tt: TrustedTypesLike | null } {
  const g = globalThis as unknown as { trustedTypes?: TrustedTypesLike }
  return { tt: typeof g.trustedTypes?.createPolicy === 'function' ? g.trustedTypes : null }
}

/** Trusted Types 是否可用（宿主环境能力探测，结果缓存） */
export function trustedTypesAvailable(): boolean {
  if (cached === undefined) cached = { available: env().tt !== null, policy: new Map() }
  return cached.available
}

/**
 * 取（并缓存）HTML 策略：`createPolicy` 同名重复调用会抛 TypeError，
 * 故按 name 缓存；任意异常（策略已存在/CSP 未允许该名）降级为 null（不包装）。
 */
export function htmlPolicy(policyName = 'taixu#html'): TrustedTypePolicyLike | null {
  if (cached === undefined) trustedTypesAvailable()
  const store = cached as { available: boolean; policy: Map<string, TrustedTypePolicyLike> }
  const hit = store.policy.get(policyName)
  if (hit !== undefined) return hit
  const tt = env().tt
  if (!tt) return null
  let policy: TrustedTypePolicyLike | null = null
  try {
    policy = tt.createPolicy(policyName, { createHTML: (html: string) => html })
  } catch {
    policy = null // CSP 未允许该策略名 / 已存在：降级为不包装
  }
  if (policy) store.policy.set(policyName, policy) // 只缓存成功项（失败下次可重试）
  return policy
}

/**
 * 包装为 TrustedHTML（TT 不可用或策略创建失败 → 返回原 string）。
 *
 * **前置约定**：入参必须是**已净化**的 HTML——policy 的 `createHTML` 是恒等函数
 * （不做净化），净化职责在 `security.sanitizeHTML`。把未净化内容传进来等于签名
 * 放行，TT 的纵深价值归零。
 *
 * @returns `TrustedHTML`（可用时）或原 string（降级时）——两种返回值都可直接落 sink
 */
export function toTrustedHTML(html: string, policyName?: string): unknown {
  const policy = htmlPolicy(policyName)
  if (!policy) return html
  try {
    return policy.createHTML(html)
  } catch {
    return html // 包装失败：降级为 string（不阻断渲染——TT 是纵深不是必需依赖）
  }
}

/** 测试用：重置策略缓存（宿主替换 trustedTypes 实现后调用） */
export function __resetTrustedTypesCache(): void {
  cached = undefined
}
