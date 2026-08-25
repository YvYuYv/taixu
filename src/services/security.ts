import { Service, type Context } from 'cordis'
import createDOMPurify from 'dompurify'
import '../events'

/** 权限规则：本地可判定（ADR-0051），deny-by-default */
export interface PermissionRule {
  appId: string
  /** 允许的能力，支持 `net:fetch` / `net:fetch:https://origin` 精确项与 `net:*`/`*` 通配（基线 §四.6、security §3.2） */
  allow: string[]
  /** 显式拒绝（§五 deny 一票否决：顺序无关，deny 命中即拒——优先于任何 allow） */
  deny?: string[]
}

/** 权限裁决结果：单点查询族，不经事件调度，直接服务方法返回（ADR-0028） */
export interface PermissionVerdict {
  allowed: boolean
  /** 拒绝原因（超时 fail-closed 的裁决失败包络，ADR-0024） */
  reason?: 'deny-rule' | 'adjudication-timeout'
  rule?: string
}

export interface SecurityConfig {
  rules?: PermissionRule[]
  /** 允许明文 http（默认 false：https-only，security §3.2） */
  allowInsecure?: boolean
  /** query 敏感键黑名单追加项（route-adaptation §3.2；默认 token/_t/sign） */
  queryBlacklist?: string[]
  /** 网络违规 (appId, rule) 限流窗口 ms（默认 5000；非网络类全量，security §8） */
  violationThrottleMs?: number
  /** 裁决超时 ms（默认 5000；超时视为失败拒绝，ADR-0024） */
  adjudicationTimeoutMs?: number
  /** SRI 签名清单（url -> integrity 哈希；§8.1 就位 seam，deps 加载接线在后续票） */
  integrityManifest?: Record<string, string>
  /** HTML 净化配置（§3.3 真 sanitize）：不良标签/属性黑名单（真实传入 DOMPurify FORBID_*） */
  sanitize?: { dangerousTags?: string[]; dangerousAttributes?: string[] }
}

/** isolate 白名单（ADR-0010）：仅 router-view / monitor；其余标签属越权隔离（拦截） */
const ISOLATE_WHITELIST = new Set(['router-view', 'monitor'])

/** isolate 标签白名单查询（框架入口守卫用；ADR-0010"仅允许两处"） */
export function isIsolateAllowed(tag: string): boolean {
  return ISOLATE_WHITELIST.has(tag)
}

/** 网络违规类规则前缀（security §8 采样与限流：仅此类按 (appId, rule) 去重） */
const NETWORK_RULE_PREFIX = 'net:'

/**
 * 安全服务：权限唯一实现（基线 §四.6）。
 *
 * - security 零业务依赖、最先可用（ADR-0054）
 * - 裁决规则只本地可判定、不做跨调用缓存（ADR-0039/0051）
 * - deny-by-default：无规则命中即拒绝（含"未注册类型"——不因未注册默认放行）
 * - 违规上报经 security/violation 事件（由 monitor 旁听，不 inject monitor，ADR-0054）；
 *   网络违规类按 (appId, rule) 限流去重（§8）
 */
export class SecurityService extends Service {
  static provide = 'security'

  private rules: PermissionRule[]
  private cfg: SecurityConfig
  /** 网络违规限流账本：`${appId}::${rule}` -> 窗口内已上报时刻（超量时回收过期项） */
  private networkViolationAt = new Map<string, number>()

  constructor(ctx: Context, config: SecurityConfig = {}) {
    super(ctx, 'security')
    this.rules = config.rules ?? []
    this.cfg = config
  }

  /** 权限裁决：单点查询（基线 §2.4.1），本地可判定、不缓存（ADR-0039/0051）；deny 一票否决（§五，顺序无关） */
  check(appId: string, action: string): PermissionVerdict {
    for (const rule of this.rules) {
      if (rule.appId !== appId && rule.appId !== '*') continue
      for (const pattern of rule.deny ?? []) {
        if (matchAction(pattern, action)) return { allowed: false, reason: 'deny-rule', rule: pattern }
      }
    }
    for (const rule of this.rules) {
      if (rule.appId !== appId && rule.appId !== '*') continue
      for (const pattern of rule.allow) {
        if (matchAction(pattern, action)) return { allowed: true, rule: pattern }
      }
    }
    return { allowed: false, reason: 'deny-rule' }
  }

  /**
   * 异步裁决（§5.1-2，ADR-0024/0028）：并发裁决不进 serial 管线；
   * 超时 fail-closed——5s 未决即拒绝（reason 载荷）并上报，连续超时升级（detail 携带计数）。
   * 本地规则（ADR-0051）下 check 是内存同步查询、微秒级，超时结构上不可达；
   * 本包装为裁决路径的就位不变量（未来异步策略源接入即受此约束）。
   */
  adjudicate(appId: string, action: string): Promise<PermissionVerdict> {
    const timeoutMs = this.cfg.adjudicationTimeoutMs ?? 5000
    let timer: ReturnType<typeof setTimeout> | undefined
    const verdict = Promise.resolve(this.check(appId, action)).then((v) => {
      if (v.allowed) this.consecutiveTimeouts = 0 // 成功裁决清零（连续超时升级的计数语义）
      return v
    })
    const timeout = new Promise<PermissionVerdict>((resolve) => {
      timer = setTimeout(() => {
        this.consecutiveTimeouts += 1
        this.reportViolation(appId, 'adjudication-timeout', { action, timeoutMs, consecutive: this.consecutiveTimeouts })
        resolve({ allowed: false, reason: 'adjudication-timeout' })
      }, timeoutMs)
    })
    return Promise.race([verdict, timeout]).finally(() => clearTimeout(timer))
  }

  /** 连续裁决超时计数（成功裁决清零；升级语义随 violation detail 下发） */
  private consecutiveTimeouts = 0

  /**
   * URL 白名单（§3.2）：协议门（https-only，http 需 allowInsecure；data:/blob:/javascript:/file:
   * 一律拒绝）+ origin 授权（精确源 `net:fetch:{origin}` 同步判定；粗授权 `net:fetch` 经
   * adjudicate——超时 fail-closed ADR-0024）。`new URL` 解析天然覆盖协议相对 URL（`//evil.com`）。
   */
  async sanitizeURL(appId: string, url: string): Promise<string | null> {
    let parsed: URL
    try {
      parsed = new URL(url, document.baseURI)
    } catch {
      return null
    }
    const insecureOk = parsed.protocol === 'http:' && this.cfg.allowInsecure === true
    if (parsed.protocol !== 'https:' && !insecureOk) {
      return null // data:/blob:/javascript:/file: 及未允许的 http: 一律拒绝
    }
    if (this.check(appId, `net:fetch:${parsed.origin}`).allowed) return parsed.href
    const coarse = await this.adjudicate(appId, 'net:fetch') // 粗授权放行全部 https 源（受超时约束）
    return coarse.allowed ? parsed.href : null
  }

  /**
   * HTML 净化（§3.3 真 sanitize）：DOMPurify 实例化净化（非实体转义——旧实现废除）；
   * `dangerousTags/dangerousAttributes` 配置真实传入（FORBID_TAGS/FORBID_ATTR），
   * 叠加默认危险面（script/style/iframe/frame/object/embed + on* 事件属性由 DOMPurify 内建拦截）。
   */
  sanitizeHTML(html: string): string {
    const purifier = createDOMPurify(globalThis as unknown as Parameters<typeof createDOMPurify>[0])
    return purifier.sanitize(html, {
      FORBID_TAGS: [...(this.cfg.sanitize?.dangerousTags ?? [])],
      FORBID_ATTR: [...(this.cfg.sanitize?.dangerousAttributes ?? [])],
      ADD_TAGS: ['style'], // 应用样式注入是合法路径（style-isolation 显式通道 + 记账管理）
    }) as string
  }

  /** query 敏感参数过滤（route-adaptation §3.2）：黑名单键剥离（默认 token/_t/sign + 配置追加） */
  sanitizeQuery(query: Record<string, string>): Record<string, string> {
    const blacklist = new Set(['token', '_t', 'sign', ...(this.cfg.queryBlacklist ?? [])])
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(query)) {
      if (!blacklist.has(k.toLowerCase())) out[k] = v
    }
    return out
  }

  /** 违规上报：通知族事件，宿主/monitor 旁听（fire-and-forget）；网络类按 (appId, rule) 限流去重（§8） */
  reportViolation(appId: string, rule: string, detail: unknown): void {
    if (rule.startsWith(NETWORK_RULE_PREFIX)) {
      const key = `${appId}::${rule}`
      const now = Date.now()
      const window = this.cfg.violationThrottleMs ?? 5000
      const last = this.networkViolationAt.get(key)
      if (last !== undefined && now - last < window) return // 窗口内同键去重
      if (this.networkViolationAt.size > 512) this.pruneViolationLedger(now, window)
      this.networkViolationAt.set(key, now)
    }
    this.ctx.emit('security/violation', { appId, rule, detail })
  }

  /** 限流账本回收（窗口外条目清理；防长生命周期无界增长） */
  private pruneViolationLedger(now: number, window: number): void {
    for (const [key, at] of this.networkViolationAt) {
      if (now - at >= window) this.networkViolationAt.delete(key)
    }
  }

  /** SRI 签名查询（§8.1 就位 seam：url -> integrity；deps 子资源加载在后续票接线） */
  lookupSri(url: string): string | undefined {
    return this.cfg.integrityManifest?.[url]
  }
}

/** 通配匹配：`*` 全量、`net:*`/`shared:cart.*` 前缀族（冒号/点分通配一体，state-sharing §4.1-2）、`net:fetch` 精确 */
function matchAction(pattern: string, action: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith(':*') || pattern.endsWith('.*')) return action.startsWith(pattern.slice(0, -1))
  return pattern === action
}

declare module 'cordis' {
  interface Context {
    security: SecurityService
  }
}
