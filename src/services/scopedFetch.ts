/**
 * scopedFetch 工厂（ADR-0005 唯一 fetch 链路；11 号票全链路接线）。
 *
 * C5-C 抽离：原 lifecycle.ts 内嵌的 18 行工厂迁出——lifecycle 既不是 fetch 的
 * 安全 owner 也不是网络 owner，本模块是两者的编排：
 * - security 管裁决：sanitizeURL 一体裁决（协议门 + origin 授权，粗授权经
 *   adjudicate 超时 fail-closed，ADR-0024/0051）+ CSRF double-submit（§七）
 * - bus 管链路执行：runNetwork 网络拦截链（§6.2，tracing -> 自定义中间件 ->
 *   monitor -> 原生 fetch）
 *
 * 形态：纯函数模块（非 Cordis Service——无状态、无生命周期、无账本）。
 * ADR-0005 约束的是"应用 fetch 必须走裁决 + 链路"这一数据流，与工厂所在文件无关。
 */
import type { Context } from 'cordis'

/** scopedFetch（ADR-0005 唯一 fetch 链路；公开面：宿主/测试可用同一链路取应用 fetch） */
export function createScopedFetch(ctx: Context, appId: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    const sanitized = await ctx.security.sanitizeURL(appId, url)
    if (sanitized === null) {
      ctx.security.reportViolation(appId, 'net:fetch', { url })
      throw new Error(`scopedFetch: net:fetch denied for ${appId} (${url})`)
    }
    // CSRF double-submit（security §七）：写请求附加 X-CSRF-Token（token 读服务端
    // __Host-csrf cookie，客户端不自造；不动 credentials）；Request 原样透传路径
    // 同样经 init 合并头（method/body 仍由 Request 承载）
    const withCsrf = ctx.security.applyCsrf(input, init)
    // 网络拦截链（security §6.2）：security 裁决已前置（拒绝不进链）；
    // 链内 = tracing -> 自定义中间件 -> monitor -> 原生 fetch
    const finalInput = input instanceof Request ? input : sanitized
    return ctx.bus.runNetwork(appId, finalInput, withCsrf, (i, ini) => globalThis.fetch(i, ini))
  }
}
