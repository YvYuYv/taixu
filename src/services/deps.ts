/**
 * deps 服务：资源加载与入口解析 + 共享依赖仲裁 + 预加载/容灾（heterogeneous §三/§七/§十）。
 */
import { AppDisabledError, DependencyConflictError } from '../errors'
import { Service, type Context } from 'cordis'
import '../events'

/** 快照载荷（lifecycle §5.5，ADR-0029/0034）：data = local:{appId}: 键空间序列化 */
export interface Snapshot {
  version: number
  data: Record<string, unknown>
}

/** 应用清单条目（宿主经 createCordis({ apps }) 声明） */
export interface AppManifestEntry {
  appId: string
  /** 入口工厂：返回 Cordis 插件（函数/对象/类） */
  entry: () => unknown
  /** 应用状态版本（快照注水的版本裁决基准，ADR-0034） */
  version?: number
  /**
   * 保活声明（ADR-0020 / lifecycle §5.3 三模式）：缺省/true = dom 模式（容器摘离缓存）；
   * 'state' = 销毁 DOM 仅留状态快照；'memory' = 销毁 DOM 与状态仅留模块缓存；false = 直接 dispose
   */
  keepAlive?: boolean | 'dom' | 'state' | 'memory'
  /** Shadow DOM 路线（style-isolation §4.1）：容器挂 open shadowRoot（天然样式边界） */
  shadow?: boolean
  /** 快照版本迁移纯函数（无副作用、沙箱外执行，ADR-0034）；缺省 = 漂移即丢弃 */
  migrate?: (data: Record<string, unknown>, fromVersion: number) => Record<string, unknown>
}

/** 共享模块条目（§七 registry） */
export interface SharedModule {
  version: string
  module: unknown
  /** 私有副本标记（fallback 路径，ADR-0038 双实例显式管理） */
  private?: boolean
  /** 引用计数（应用卸载 release 归零即释放） */
  refCount: number
}

/** negotiate 调用面（§七：声明来自 cordis.dependencies.json 清单，逐调用传入） */
export interface NegotiateOptions {
  /** singleton 共享：无满足版本时硬失败（不塞旧版本，不私有副本） */
  singleton?: boolean
  /** strict：版本不满足直接失败（不做任何 fallback，§七 react-dom 例） */
  strict?: boolean
  /** acceptsDuplicate 白名单：仅允许无全局单例假设的库（如 lodash）走私有副本 */
  acceptsDuplicate?: boolean
  /** 私有副本供给（fallback 才调用；框架类未声明 acceptsDuplicate 时禁止） */
  privateLoader?: () => Promise<unknown>
  /** 归因（告警 appId；缺省 host） */
  appId?: string
}

/** 容灾加载选项（§十 ResilientLoader） */
export interface ResilientLoadOptions {
  /** 每源重试次数（默认 0；指数退避基数经 deps.retryBackoffMs 配置） */
  retries?: number
  signal?: AbortSignal
  /** 归因（DEPLOY_SKEW 告警 appId；缺省 host） */
  appId?: string
}

export interface DepsConfig {
  apps?: AppManifestEntry[]
  /** 容灾重试退避基数 ms（默认 200；测试注 0） */
  retryBackoffMs?: number
}

// -- 轻量 SemVer（§七：satisfies 含 ^/~/>=/精确与预发布后缀；不引 node-semver 全量包） --

/** 版本解析：主.次.修[-预发布] -> 可比较数组（预发布 < 正式版） */
function parseVersion(v: string): number[] {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!m) return [-1, -1, -1]
  const core = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (m[4] === undefined) return [...core, 1] // 正式版 > 预发布
  return [...core, 0]
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 4; i++) {
    if (pa[i]! < pb[i]!) return -1
    if (pa[i]! > pb[i]!) return 1
  }
  return 0
}

/**
 * range 满足判定（AND 组合）：`^x.y.z`（同主版本且 >=）`~x.y.z`（同主.次且 >=）
 * `>=x.y.z` 与精确。已知盲区（轻量裁剪，§七 允许不引 node-semver）：预发布之间
 * 不逐标识符比较（alpha/beta 判等）；OR（`||`）组合不支持。
 */
export function satisfies(version: string, range: string): boolean {
  return range.split(/\s+/).filter(Boolean).every((part) => {
    const pv = parseVersion(version)
    const caret = part.match(/^\^(\d+)\.(\d+)\.(\d+)$/)
    if (caret) {
      return pv[0] === Number(caret[1]) && compareVersions(version, part.slice(1)) >= 0
    }
    const tilde = part.match(/^~(\d+)\.(\d+)\.(\d+)$/)
    if (tilde) {
      return (
        pv[0] === Number(tilde[1]) &&
        pv[1] === Number(tilde[2]) &&
        compareVersions(version, part.slice(1)) >= 0
      )
    }
    const gte = part.match(/^>=(\d+\.\d+\.\d+)$/)
    if (gte) return compareVersions(version, gte[1]!) >= 0
    return compareVersions(version, part) === 0
  })
}

/**
 * deps 服务：资源加载与入口解析。
 */
export class DepsService extends Service<DepsConfig> {
  static provide = 'deps'
  static inject = ['security', 'monitor']

  private appConfig: DepsConfig
  /** 共享依赖 registry（§七）：name -> 已注册版本条目 */
  private shared = new Map<string, SharedModule[]>()

  constructor(ctx: Context, config: DepsConfig = {}) {
    super(ctx, 'deps')
    this.appConfig = config
  }

  /** 清单查询（lifecycle 快照版本裁决用；未声明返回 undefined） */
  manifest(appId: string): AppManifestEntry | undefined {
    return this.appConfig.apps?.find((a: AppManifestEntry) => a.appId === appId)
  }

  /** 已注册共享版本查询（测试/DevTools 观测面） */
  sharedVersions(name: string): string[] {
    return (this.shared.get(name) ?? []).map((c) => c.version)
  }

  /** 共享模块注册（§七：宿主/适配层将可用版本入账；MF remote 同经此注册，§7.1） */
  registerShared(name: string, entry: { version: string; module: unknown }): void {
    const list = this.shared.get(name) ?? []
    if (list.some((c) => c.version === entry.version)) {
      throw new Error(`shared "${name}@${entry.version}" already registered`)
    }
    list.push({ ...entry, refCount: 0 })
    this.shared.set(name, list)
  }

  /**
   * 共享依赖仲裁（§七 Dependency Negotiation Matrix）：
   * 1. 最高满足版本（修复"取注册顺序第一个满足者"——同会话不同实例、故障不可复现）
   * 2. singleton/strict 无满足版本：硬失败（DependencyConflictError + DEP_CONFLICT；
   *    旧版"强制塞旧版本+console.warn"废除——^3 的应用被塞 2.7 运行时才炸）
   * 3. acceptsDuplicate 白名单（仅无全局单例假设的库）：私有副本 fallback
   *    （DEP_NEGOTIATION_FALLBACK；框架类禁止——split-brain：两份 Vue 的
   *    provide/inject、两份 React 的 invalid hook call；双实例共存须走 iframe 沙箱 ADR-0038）
   */
  async negotiate(name: string, range: string, options: NegotiateOptions = {}): Promise<SharedModule> {
    const candidates = this.shared.get(name) ?? []
    // 1. 最高满足版本
    const matched = candidates
      .filter((c) => satisfies(c.version, range))
      .sort((a, b) => compareVersions(b.version, a.version))
    if (matched[0]) {
      matched[0].refCount++
      return matched[0]
    }
    // 2. singleton/strict：无 fallback 路径，硬失败
    // 3. 私有副本 fallback（acceptsDuplicate 声明 + privateLoader 就位才可用）
    if (!options.singleton && !options.strict && options.acceptsDuplicate && options.privateLoader) {
      this.ctx.monitor.trigger({ type: 'DEP_NEGOTIATION_FALLBACK', appId: options.appId ?? 'host', detail: { name, range } })
      // 同 range 私有副本复用（去重）：重入不叠加 registry 条目
      const sentinel = `${range}#private`
      const existing = (this.shared.get(name) ?? []).find((c) => c.private && c.version === sentinel)
      if (existing) {
        existing.refCount++
        return existing
      }
      const module = await options.privateLoader()
      const entry: SharedModule = { version: sentinel, module, private: true, refCount: 1 }
      const list = this.shared.get(name) ?? []
      list.push(entry)
      this.shared.set(name, list)
      return entry
    }
    // singleton/strict 或未声明 acceptsDuplicate（框架类默认）：硬失败并引导宿主调整版本矩阵
    this.ctx.monitor.trigger({
      type: 'DEP_CONFLICT',
      appId: options.appId ?? 'host',
      detail: { name, range, available: candidates.map((c) => c.version) },
    })
    throw new DependencyConflictError(name, range, candidates.map((c) => c.version))
  }

  /** 应用卸载注销（§七）：refCount 归零释放模块引用 */
  release(name: string, version: string): void {
    const list = this.shared.get(name)
    if (!list) return
    const mod = list.find((c) => c.version === version)
    if (!mod) return
    mod.refCount--
    if (mod.refCount <= 0) list.splice(list.indexOf(mod), 1)
  }

  /**
   * 动态脚本加载 + SRI 校验执行（security §8.1，P1）：fetch 取源 -> SHA-256
   * 哈希对照 integrityManifest -> 匹配才注入执行。
   * - 清单非空时 deny-by-default：未列入清单的 url 直接拒（不注入）
   * - 哈希不匹配：reject + sri-mismatch violation + SRI_MISMATCH 告警（注册规则才派发）
   * - 清单未配置：宿主显式退出 SRI，加载不校验（§8.1 期望哈希来自构建期清单——
   *   无清单强行"校验"无锚点，诚实降级为不校验）
   * - 覆盖面（§8.1）：本方法覆盖显式 loadScript 调用；入口 JS（P0 直载工厂）、
   *   CSS <link> 与动态 import 分块经此统一校验随 B-加载（共享仲裁/预加载）落地
   * - 信任链边界（§8.1）：本实现消费宿主注入的哈希清单，**清单本身的 CI 签名/
   *   公钥验签不在运行时**——前提是清单经宿主受控通道（构建产物/CI）下发，与
   *   应用源不同源不同权；同 CDN 拉取未签名清单即"形同虚设"（spec 反例）
   */
  async loadScript(url: string): Promise<void> {
    const security = this.ctx.security
    const text = await this.fetchText(url)
    if (security.hasIntegrityManifest()) {
      const expected = security.integrityEntry(url)
      if (!expected) {
        security.reportViolation('host', 'sri-unlisted', { url })
        throw new Error(`integrity: "${url}" not in manifest (deny-by-default, security §8.1)`)
      }
      const digest = await this.sha256Base64(text)
      if (`sha256-${digest}` !== expected) {
        security.reportViolation('host', 'sri-mismatch', { url })
        this.ctx.monitor.trigger({ type: 'SRI_MISMATCH', appId: 'host', detail: { url } })
        throw new Error(`integrity mismatch: ${url}`)
      }
    }
    const el = document.createElement('script')
    el.textContent = text // 文本注入（非 src 引用）：校验后的源即执行源，无二次取回窗口
    document.head.appendChild(el)
  }

  /**
   * 预加载（§十 Preloader）：`<link rel="modulepreload" crossorigin="anonymous">`
   * 并行注入（CORS CDN 避免双重下载——旧版只 preload 单入口无 crossorigin）。
   * idle 策略：requestIdleCallback 可用则空闲时注入（回调 try/catch，预加载失败不阻塞加载）。
   */
  preload(urls: string[]): void {
    const inject = () => {
      try {
        for (const url of urls) {
          // 去重：同 url 已 preload 不重复注入
          if (document.head.querySelector(`link[rel="modulepreload"][href="${url}"]`)) continue
          const link = document.createElement('link')
          link.rel = 'modulepreload'
          link.crossOrigin = 'anonymous'
          link.href = url
          document.head.appendChild(link)
        }
      } catch {
        // 预加载是优化不是正确性闸门：失败不阻塞后续加载
      }
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => inject())
    else inject()
  }

  /**
   * 容灾加载（§十 ResilientLoader）：多源轮换（主 CDN -> fallback CDN）×
   * 每源指数退避重试；全源耗尽抛最后错误。404（版本偏斜：部署后旧 HTML 引用
   * 已删除 chunk）触发 DEPLOY_SKEW 告警（基线 §五唯一策略：提示刷新）。
   */
  async resilientLoad(urls: string[], options: ResilientLoadOptions = {}): Promise<string> {
    const retries = options.retries ?? 0
    const backoff = this.appConfig.retryBackoffMs ?? 200
    let lastError: unknown
    let sawNotFound = false
    for (const src of urls) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        try {
          const res = await fetch(src)
          if (res.ok) return await res.text()
          if (res.status === 404) sawNotFound = true
          lastError = new Error(`load: ${src} HTTP ${res.status}`)
        } catch (e) {
          lastError = e
        }
        if (attempt < retries) await new Promise((r) => setTimeout(r, backoff * 2 ** attempt))
      }
    }
    if (sawNotFound) {
      // 版本偏斜：404 的权威解释（部署滚动期 chunk 已删）——上报，刷新提示由宿主承接
      this.ctx.monitor.trigger({ type: 'DEPLOY_SKEW', appId: options.appId ?? 'host', detail: { urls } })
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  /** 取源（fetch -> text；非 2xx 显式 reject——无静默吞错） */
  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`loadScript: ${url} HTTP ${res.status}`)
    return res.text()
  }

  /** SHA-256 base64（§8.1；SubtleCrypto 摘要） */
  private async sha256Base64(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    let bin = ''
    for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b) // 逐字节累加（不展开传参）
    return btoa(bin)
  }

  /**
   * 加载应用入口，解析为 Cordis 插件。
   * 本票：清单校验 + 工厂调用（直载）。signal 语义：加载已开始则作废结果，未开始则不再开始。
   */
  async loadApp(appId: string, options: { signal?: AbortSignal } = {}): Promise<unknown> {
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    // KillSwitch 加载路径强制执行点（security §十）：禁用应用加载即拒
    //（AppDisabledError 在 lifecycle recover 中按不可恢复处理，不空转重试）
    if (this.ctx.security.isAppDisabled(appId)) throw new AppDisabledError(appId)
    const entry = this.appConfig.apps?.find((a: AppManifestEntry) => a.appId === appId)
    if (!entry) {
      throw new Error(`manifest: app "${appId}" is not declared in host config`)
    }
    const plugin = await entry.entry()
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    return plugin
  }
}

declare module 'cordis' {
  interface Context {
    deps: DepsService
  }
}
