/**
 * deps 最小加载（heterogeneous-loading §三，本票裁剪版）：
 * - manifest 校验（应用清单存在性 + 入口形状）
 * - 入口直载（单版本直载；importmap/共享仲裁矩阵不在本票，见 spec Out of Scope）
 * - AbortSignal 全程透传："结果作废 + 未开始的阶段不再开始"（lifecycle §2.2-3）
 */
import { AppDisabledError } from '../errors'
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
  /** 快照版本迁移纯函数（无副作用、沙箱外执行，ADR-0034）；缺省 = 漂移即丢弃 */
  migrate?: (data: Record<string, unknown>, fromVersion: number) => Record<string, unknown>
}

export interface DepsConfig {
  apps?: AppManifestEntry[]
}

/**
 * deps 服务：资源加载与入口解析。
 * 完整形态（manifest fetch/SRI/importmap/共享仲裁）见 heterogeneous-loading §六/§七。
 */
export class DepsService extends Service<DepsConfig> {
  static provide = 'deps'
  static inject = ['security', 'monitor']

  private appConfig: DepsConfig

  constructor(ctx: Context, config: DepsConfig = {}) {
    super(ctx, 'deps')
    this.appConfig = config
  }

  /** 清单查询（lifecycle 快照版本裁决用；未声明返回 undefined） */
  manifest(appId: string): AppManifestEntry | undefined {
    return this.appConfig.apps?.find((a: AppManifestEntry) => a.appId === appId)
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
   * - 哈希经 arrayBuffer 整体摘要（废除 String.fromCharCode(...bytes) 大资源栈溢出
   *   ——分块读取的关切在编解码不在摘要本身）
   */
  async loadScript(url: string): Promise<void> {
    const security = this.ctx.security
    // 信任链边界（§8.1）：本实现消费宿主注入的哈希清单，**清单本身的 CI 签名/
    // 公钥验签不在运行时**——前提是清单经宿主受控通道（构建产物/CI）下发，与
    // 应用源不同源不同权；同 CDN 拉取未签名清单即"形同虚设"（spec 反例）
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
