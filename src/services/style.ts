/**
 * 样式登记服务（style-isolation.md §六，ADR-0033/0042 显式通道）：
 * - `ctx.style.inject({ file, css })`：注入打标 style 节点（data-cordis-app 供 HMR 定位）
 * - 移除挂调用方 fiber effect（dispose 逆序自动回收）
 * - 自动兜底通道（沙箱 InjectedNodesTracker）在 js-sandbox 侧，本服务只管显式 API
 *
 * 非核心八服务（基线 §2.2 之外的辅助服务），不参与 ADR-0054 依赖方向约束。
 */
import { Service, type Context } from 'cordis'
import '../events'

export interface StyleAsset {
  /** 样式文件标识（HMR 定位键，style-isolation §七） */
  file: string
  css: string
}

/**
 * @font-face 描述（§3.3 提升注入文档级；family 经 `tx-{appId}-` 前缀重写防撞车）
 */
export interface FontFaceRule {
  family: string
  /** 原 CSS 声明体（src/weight/style 等，如 `src: url(x.woff2) format('woff2'); font-weight: 700;`） */
  declarations: string
}

/** 字体 registry 条目（family+src 哈希去重，多应用引用计数复用） */
interface FontEntry {
  node: HTMLStyleElement
  refs: Set<string>
}

/** family+declarations 内容哈希（去重键；FNV-1a——短字符串、无密码学诉求） */
function fontHash(appId: string, family: string, declarations: string): string {
  const s = `${family}|${declarations}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${appId}:${(h >>> 0).toString(36)}`
}

export interface StyleConfig {
  /** Constructable Stylesheet 工厂注入（测试/宿主；缺省能力检测 CSSStyleSheet） */
  sheetFactory?: () => CSSStyleSheetLike
}

export class StyleService extends Service<StyleConfig> {
  static provide = 'style'

  /** 字体 registry（§3.3：family+src 哈希去重，重复注册复用同一 @font-face 节点） */
  private fontRegistry = new Map<string, FontEntry>()
  /** 应用 -> 已注册字体哈希（dispose 时引用计数递减回收） */
  private appFonts = new Map<string, Set<string>>()

  constructor(ctx: Context, config: StyleConfig = {}) {
    super(ctx, 'style')
    this.sheetFactory = config.sheetFactory
    // 应用销毁：字体引用计数回收（零引用移除文档级节点）
    ctx.on('app/disposed', (e) => this.releaseFonts(e.appId), { global: true })
  }

  /**
   * @font-face 提升（§3.3）：注入**文档级** style 节点（Shadow DOM 内 @font-face 不生效），
   * family 重写为 `tx-{appId}-{family}`（家族名撞车隔离）；同 family+src 哈希去重
   * （复用节点，避免多应用重复下载/FOUT）。返回重写后的 family（应用侧使用）。
   */
  registerFontFace(ctx: Context, rule: FontFaceRule): string {
    const appId = ctx.fiber.name
    if (!appId) throw new Error('style.registerFontFace: cannot attribute to anonymous fiber')
    const prefixed = `tx-${appId}-${rule.family}`
    const key = fontHash(appId, rule.family, rule.declarations)
    const existing = this.fontRegistry.get(key)
    if (existing) {
      existing.refs.add(appId) // 去重复用（同节点不再注入）
    } else {
      const node = document.createElement('style')
      node.dataset.cordisApp = appId
      node.dataset.txFont = rule.family
      node.textContent = `@font-face { font-family: "${prefixed}"; ${rule.declarations} }`
      document.head.appendChild(node)
      this.fontRegistry.set(key, { node, refs: new Set([appId]) })
    }
    const keys = this.appFonts.get(appId) ?? new Set<string>()
    keys.add(key)
    this.appFonts.set(appId, keys)
    return prefixed
  }

  /**
   * CSS 文本内的 @font-face 提升改写（§3.3 构建期行为的运行时等价物）：
   * 抽出全部 @font-face 块注册为文档级（family 前缀重写），返回改写后的 CSS
   * （原 @font-face 块移除、其余规则原样）。
   */
  hoistFontFaces(ctx: Context, css: string): string {
    let out = css
    const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? []
    for (const block of blocks) {
      const familyMatch = block.match(/font-family\s*:\s*["']?([^;"']+)["']?/)
      if (!familyMatch) continue
      const declarations = block
        .replace(/@font-face\s*\{/, '')
        .replace(/\}$/, '')
        .replace(/font-family\s*:\s*["']?[^;"']+["']?\s*;?/, '')
        .trim()
      this.registerFontFace(ctx, { family: familyMatch[1] as string, declarations })
      out = out.replace(block, '') // 移除原块（已提升）
    }
    return out
  }

  /** 字体 registry 查询（DevTools/诊断：当前文档级字体清单） */
  fontRegistryEntries(): Array<{ appId: string; family: string; refs: number }> {
    return [...this.fontRegistry.entries()].map(([key, e]) => ({
      appId: key.split(':')[0] as string,
      family: e.node.dataset.txFont ?? '',
      refs: e.refs.size,
    }))
  }

  /** 应用字体引用回收（app/disposed）：零引用移除文档级节点 */
  private releaseFonts(appId: string): void {
    const keys = this.appFonts.get(appId)
    if (!keys) return
    this.appFonts.delete(appId)
    for (const key of keys) {
      const entry = this.fontRegistry.get(key)
      if (!entry) continue
      entry.refs.delete(appId)
      if (entry.refs.size === 0) {
        entry.node.remove() // 无引用：移除（避免字体常驻）
        this.fontRegistry.delete(key)
      }
    }
  }

  /**
   * 显式注入：Shadow DOM 路线（§4.1）——应用容器在 shadowRoot 内时注入 shadow
   * （天然边界；挂起随宿主摘除自动缓存，无幽灵样式）；优先 Constructable
   * Stylesheets（adoptedStyleSheets 替换式更新零重排；能力缺失检测降级 style 节点）。
   * 非shadow应用照旧注入 head 并打标（data-cordis-app 供 HMR 定位）；
   * 同 file 重复注入 = 真热替换语义（style 节点替换文本 / constructable 走 replaceSync）。
   */
  inject(ctx: Context, asset: StyleAsset): HTMLStyleElement | CSSStyleSheetLike {
    // fail-closed：匿名 fiber（无插件名）无法归因，拒绝注入而非挂到共享 unknown 槽
    const appId = ctx.fiber.name
    if (!appId) throw new Error('style.inject: cannot attribute to anonymous fiber (app plugin must declare name)')

    // Shadow 路线判定：容器经 lifecycle 唯一路径创建，getRootNode 即边界事实。
    // lifecycle 未注入可用（cordis inject 语义下取值抛错）时按非 shadow 路线走 head
    //（style 不 inject lifecycle——懒取保持依赖方向，ADR-0054）
    let container: HTMLElement | null = null
    try {
      const lifecycle = (this.ctx as Context & { lifecycle?: import('./lifecycle').LifecycleService }).lifecycle
      container = lifecycle?.containerOf(ctx) ?? null
    } catch {
      container = null
    }
    const containerRoot = container?.getRootNode()
    if (container && containerRoot instanceof ShadowRoot) {
      return this.injectShadow(ctx, containerRoot, appId, asset)
    }

    const selector = `style[data-cordis-app="${appId}"][data-file="${asset.file}"]`
    const existing = document.querySelector<HTMLStyleElement>(selector)
    if (existing) {
      existing.textContent = asset.css // HMR css-only 路径（style-isolation §七）
      return existing
    }
    const el = document.createElement('style')
    el.dataset.cordisApp = appId
    el.dataset.file = asset.file
    el.textContent = asset.css
    document.head.appendChild(el)
    ctx.effect(() => () => el.remove()) // dispose 逆序移除
    return el
  }

  /** constructable sheet 结构面（能力检测/测试注入共用同一形状） */
  private readonly sheetFactory?: () => CSSStyleSheetLike

  /** shadow 内已注入记账（HMR 热替换定位）：root -> file -> sheet/节点 */
  private shadowInjected = new WeakMap<ShadowRoot, Map<string, HTMLStyleElement | CSSStyleSheetLike>>()

  /** Shadow 注入（§4.1）：Constructable 优先，能力缺失降级 style 节点入 shadowRoot */
  private injectShadow(
    ctx: Context,
    root: ShadowRoot,
    appId: string,
    asset: StyleAsset,
  ): HTMLStyleElement | CSSStyleSheetLike {
    const ledger = this.shadowInjected.get(root) ?? new Map()
    this.shadowInjected.set(root, ledger)
    const existing = ledger.get(asset.file)
    if (existing) {
      if ('replaceSync' in existing) existing.replaceSync(asset.css) // HMR：替换式更新零重排
      else (existing as HTMLStyleElement).textContent = asset.css
      return existing
    }
    const Ctor = this.sheetFactory ?? (typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype ? () => new CSSStyleSheet() : undefined)
    if (Ctor) {
      const sheet = Ctor()
      sheet.replaceSync(asset.css)
      // jsdom 等环境 adoptedStyleSheets 可能不可迭代/未定义：以数组重赋（构造面自洽）
      const current = Array.isArray(root.adoptedStyleSheets) ? [...root.adoptedStyleSheets] : []
      root.adoptedStyleSheets = [...current, sheet as CSSStyleSheet]
      ledger.set(asset.file, sheet)
      ctx.effect(() => () => {
        root.adoptedStyleSheets = (Array.isArray(root.adoptedStyleSheets) ? root.adoptedStyleSheets : []).filter(
          (sh) => sh !== (sheet as CSSStyleSheet),
        )
        ledger.delete(asset.file)
      })
      return sheet
    }
    // 降级：style 节点入 shadowRoot（scoped；随宿主摘除自动缓存）
    const el = document.createElement('style')
    el.dataset.cordisApp = appId
    el.dataset.file = asset.file
    el.textContent = asset.css
    root.appendChild(el)
    ledger.set(asset.file, el)
    ctx.effect(() => () => {
      el.remove()
      ledger.delete(asset.file)
    })
    return el
  }
}

/** Constructable Stylesheet 最小结构面（§4.1；jsdom 缺失——测试经 sheetFactory 注入） */
export interface CSSStyleSheetLike {
  replaceSync(css: string): void
}

declare module 'cordis' {
  interface Context {
    style: StyleService
  }
}
