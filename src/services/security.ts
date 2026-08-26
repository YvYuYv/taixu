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
  /** KillSwitch 指令验签（§十：签名通道，deny-by-default——未配置验签器时一切急停指令拒绝） */
  verifyKillCommand?: (appId: string, action: 'disable' | 'enable', signature: string) => boolean
  /** CSRF token cookie 名（§七 double-submit：服务端登录下发，默认 __Host-csrf；宿主侧配置——测试环境因 __Host- 前缀要求 Secure 而注入替名） */
  csrfCookieName?: string
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
    this.restoreDisabled() // KillSwitch 会话恢复（§十：刷新仍生效）
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

  // -- Kill Switch（§十：急停）--

  /** 已禁用应用账本（sessionStorage 持久化：刷新仍生效，管理员显式恢复） */
  private disabledApps = new Set<string>()
  private static DISABLED_KEY = '__tx_disabled_apps'

  /** 禁用查询（deps.loadApp 加载路径强制消费，§十） */
  isAppDisabled(appId: string): boolean {
    return this.disabledApps.has(appId)
  }

  /**
   * CSRF double-submit 客户端侧（§七）：写请求（POST/PUT/PATCH/DELETE）从受控
   * cookie 读取 token 附加 `X-CSRF-Token`——token 由服务端登录下发
   * （`Set-Cookie: __Host-csrf`），**客户端不自造**（废除旧版 crypto 自造存
   * sessionStorage：无服务端校验不构成防护）。无 token 诚实降级不附加（服务端
   * double-submit 将拒绝）；应用已设头不覆盖；不动 credentials（§七尾条：
   * 保留应用自身设置）。
   */
  applyCsrf(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase()
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
      return init // 读请求：不附加
    }
    const token = this.readCookie(this.cfg.csrfCookieName ?? '__Host-csrf')
    if (!token) return init // 诚实降级：无 token 不伪造（服务端拒绝由其 double-submit 裁决）
    // Request 对象：克隆其自身头合并 token（init.headers 会整体覆盖 Request 头——直接
    // 只传 token 会丢应用头；init.method 不设，method/body 仍由 Request 承载）
    // 头合并：Request 对象 + init.headers 同时在场时按 fetch 语义 init 覆盖 Request——
    // 合并两者（Request 头为底，init 头叠加），再附 token
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    if (!(input instanceof Request)) {
      const only = new Headers(init?.headers)
      only.forEach((v, k) => headers.set(k, v))
    } else if (init?.headers) {
      const extra = new Headers(init.headers)
      extra.forEach((v, k) => headers.set(k, v))
    }
    if (headers.has('X-CSRF-Token')) return init // 应用已带（如自管 token 流程）：不覆盖
    headers.set('X-CSRF-Token', token)
    return { ...init, headers }
  }

  /** SRI 清单是否配置（§8.1：未配置 = 宿主显式退出 SRI，加载不校验） */
  hasIntegrityManifest(): boolean {
    return Object.keys(this.cfg.integrityManifest ?? {}).length > 0
  }

  /** SRI 期望哈希查询（§8.1：构建期 manifest url -> 'sha256-<base64>'；未列入返回 undefined） */
  integrityEntry(url: string): string | undefined {
    return this.cfg.integrityManifest?.[url]
  }

  /** cookie 读取（§七：受控存储=服务端 SameSite cookie；缺失/损坏返回 null 诚实降级） */
  private readCookie(name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 配置名中的正则元字符转义
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
    if (!m) return null
    try {
      return decodeURIComponent(m[1] as string)
    } catch {
      return null // 损坏编码（裸 % 等）：不炸 fetch 链路，按无 token 降级
    }
  }

  /**
   * 急停（§十）：签名指令通道（monitor 告警通道复用语义——不是任意应用可调的全局函数；
   * 旧版 `window.__CORDIS_RUNTIME__.unmountApp` 全局句柄已废除）。强制执行点两处：
   * deps.loadApp 前检查（AppDisabledError）+ 运行实例销毁（lifecycle 旁听
   * security/killswitch 事件，security 不 inject lifecycle——依赖方向 ADR-0054）。
   */
  async disableApp(appId: string, reason: string, signature: string): Promise<boolean> {
    // deny-by-default：验签器未配置/不通过 = 伪造指令（§十 签名通道）
    if (this.cfg.verifyKillCommand?.(appId, 'disable', signature) !== true) {
      this.reportViolation('host', 'killswitch-forged', { appId, reason })
      return false
    }
    this.disabledApps.add(appId)
    this.persistDisabled()
    this.ctx.emit('security/killswitch', { appId, action: 'disable', reason })
    return true
  }

  /** 管理员显式恢复（§十：禁用不会自动过期，只有 enable 指令解除；同样经签名通道） */
  async enableApp(appId: string, signature: string): Promise<boolean> {
    if (this.cfg.verifyKillCommand?.(appId, 'enable', signature) !== true) {
      this.reportViolation('host', 'killswitch-forged', { appId, reason: 'enable' })
      return false
    }
    this.disabledApps.delete(appId)
    this.persistDisabled()
    this.ctx.emit('security/killswitch', { appId, action: 'enable', reason: 'admin-restore' })
    return true
  }

  /** 持久化（§十：sessionStorage——刷新仍生效；仅存 appId 清单，无敏感载荷） */
  private persistDisabled(): void {
    try {
      sessionStorage.setItem(SecurityService.DISABLED_KEY, JSON.stringify([...this.disabledApps]))
    } catch {
      // 存储不可用（隐私模式等）：内存态仍生效，本会话内禁用有效（诚实降级）
    }
  }

  /** 会话恢复（构造期）：残留禁用清单入账（at-line 加载路径强制即生效） */
  private restoreDisabled(): void {
    try {
      const raw = sessionStorage.getItem(SecurityService.DISABLED_KEY)
      if (!raw) return
      for (const appId of JSON.parse(raw) as string[]) this.disabledApps.add(appId)
    } catch {
      // 损坏清单：丢弃（fail-open 仅影响"禁用记忆"这一半，§十 加载路径强制与
      // 安全规则本身不受影响；无法从损坏数据推断禁用集合，保留即臆造）
    }
  }

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
   * 叠加默认危险面（script/style 等 + on* 事件属性由 DOMPurify 内建拦截）——应用样式走
   * StyleService 显式通道（style-isolation），不经 innerHTML 注入。
   */
  sanitizeHTML(html: string): string {
    const purifier = createDOMPurify(globalThis as unknown as Parameters<typeof createDOMPurify>[0])
    return purifier.sanitize(html, {
      FORBID_TAGS: [...(this.cfg.sanitize?.dangerousTags ?? [])],
      FORBID_ATTR: [...(this.cfg.sanitize?.dangerousAttributes ?? [])],
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
