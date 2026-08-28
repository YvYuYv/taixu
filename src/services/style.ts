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
import { createFontRegistry, type FontRegistryHandle, type FontFaceRule } from './style/fontRegistry'

export interface StyleAsset {
  /** 样式文件标识（HMR 定位键，style-isolation §七） */
  file: string
  css: string
}

export type { FontFaceRule }

export interface StyleConfig {
  /** Constructable Stylesheet 工厂注入（测试/宿主；缺省能力检测 CSSStyleSheet） */
  sheetFactory?: () => CSSStyleSheetLike
}

export class StyleService extends Service<StyleConfig> {
  static provide = 'style'

  /** 字体 registry 账本（C14-D）：fontRegistry Map + appFonts Map + registerFontFace +
   *   hoistFontFaces + releaseFonts + fontHash 子系统已抽离到 style/fontRegistry.ts；
   *   style 改持 fontRegistry 引用。 */
  private fontRegistry: FontRegistryHandle

  constructor(ctx: Context, config: StyleConfig = {}) {
    super(ctx, 'style')
    this.sheetFactory = config.sheetFactory
    // C14-D：fontRegistry 子系统抽离到 style/fontRegistry.ts；style 改持 fontRegistry 引用
    this.fontRegistry = createFontRegistry()
    // 应用销毁：字体引用计数回收（零引用移除文档级节点）
    ctx.on('app/disposed', (e) => this.fontRegistry.release(e.appId), { global: true })
  }

  /**
   * @font-face 提升（§3.3）：注入**文档级** style 节点（Shadow DOM 内 @font-face 不生效），
   * family 重写为 `tx-{appId}-{family}`（家族名撞车隔离）；同 family+src 哈希去重
   * （复用节点，避免多应用重复下载/FOUT）。返回重写后的 family（应用侧使用）。
   * C14-D：thin delegate 到 fontRegistry.registerFontFace。
   */
  registerFontFace(ctx: Context, rule: FontFaceRule): string {
    const appId = ctx.fiber.name
    if (!appId) throw new Error('style.registerFontFace: cannot attribute to anonymous fiber')
    return this.fontRegistry.registerFontFace(rule, appId)
  }

  /**
   * CSS 文本内的 @font-face 提升改写（§3.3 构建期行为的运行时等价物）：
   * 抽出全部 @font-face 块注册为文档级（family 前缀重写），返回改写后的 CSS
   * （原 @font-face 块移除、其余规则原样）。
   * C14-D：thin delegate 到 fontRegistry.hoistFontFaces。
   */
  hoistFontFaces(ctx: Context, css: string): string {
    const appId = ctx.fiber.name
    if (!appId) throw new Error('style.hoistFontFaces: cannot attribute to anonymous fiber')
    return this.fontRegistry.hoistFontFaces(css, appId)
  }

  /** 字体 registry 查询（DevTools/诊断：当前文档级字体清单）——
   * C14-D：thin delegate 到 fontRegistry.entries。 */
  fontRegistryEntries(): Array<{ appId: string; family: string; refs: number }> {
    return this.fontRegistry.entries()
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


  // ---- CSS-in-JS 运行时补丁 + z-index 分层（§4.4/§4.2）----

  /**
   * CSS-in-JS 运行时补丁（§4.4，命名空间路线）：MutationObserver 观察 head 新
   * style 节点——未打标（第三方运行时注入 emotion/styled-components 等）归属
   * 当前应用：打标 + §3.1 等价选择器前缀重写（scope = [data-cordis-app]）。
   * 已注册即扫既有未打标节点；观察挂 ctx.effect（dispose 自动断开）。
   * 性能敏感应用建议改走 Shadow 路线（§4.4 尾条）。
   */
  observeRuntimeStyles(ctx: Context): void {
    const appId = ctx.fiber.name
    if (!appId) throw new Error('style.observeRuntimeStyles: cannot attribute to anonymous fiber (app plugin must declare name)')
    const scope = `[data-cordis-app="${appId}"]`
    const rewrite = (el: HTMLStyleElement) => {
      if (el.dataset.cordisApp) return // 已归因（显式通道）：不动
      el.dataset.cordisApp = appId
      el.textContent = prefixSelectors(el.textContent ?? '', scope)
      this.ctx.monitor.count('cssinjs_patched', 1, { appId })
    }
    // 只观察**注册后**的注入（"观测 style 注入"）：既有未打标节点可能是宿主/主应用
    // 样式——无归因证据不捕（误归因会以错误 scope 重写宿主样式）
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n instanceof HTMLStyleElement) rewrite(n)
        }
      }
    })
    mo.observe(document.head, { childList: true })
    ctx.effect(() => () => mo.disconnect())
  }

  /**
   * z-index 分层 registry（§4.2）：`--tx-z-{layer}` token 写文档级 :root（唯一写点；
   * 宿主生命周期，不随应用卸载）；弹层经 zIndexVar 取值而非裸数字。
   */
  setZLayers(layers: Record<string, number>): void {
    for (const [layer, value] of Object.entries(layers)) {
      document.documentElement.style.setProperty(`--tx-z-${layer}`, String(value))
    }
  }

  /** 弹层取值面：返回 token 引用（未定义层由 CSS 变量缺省语义兜底） */
  zIndexVar(layer: string): string {
    return `var(--tx-z-${layer})`
  }
}

/**
 * 选择器前缀重写（§4.4 运行时路径，§3.1 构建期等价语义的最小实现）：
 * 顶层与一层 @media/@supports 嵌套内的选择器加 scope 前缀；html/body/:root
 * 语义重写为 scope 本身；@keyframes/@font-face 块原样保留（keyframes 名是
 * 文档级命名空间，重写需构建期配合——如实边界）。
 */
export function prefixSelectors(css: string, scope: string): string {
  const out: string[] = []
  let i = 0
  const takeBlock = (): string => {
    // 消费到匹配的 '}'（一层嵌套深度）
    let depth = 1
    const start = i
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    return css.slice(start, i - 1)
  }
  while (i < css.length) {
    const ch = css[i] as string
    if (ch === '@') {
      const atStart = i
      while (i < css.length && css[i] !== '{') i++
      const prelude = css.slice(atStart, i + 1)
      const name = prelude.slice(1).split(/[{(]/)[0]?.trim() ?? ''
      i++ // 进块
      const body = takeBlock()
      if (/^(media|supports|layer|container)/i.test(name)) {
        out.push(prelude + prefixSelectors(body, scope) + '}') // 条件块内递归前缀
      } else {
        out.push(prelude + body + '}') // keyframes/font-face：原样（如实边界）
      }
      continue
    }
    if (ch === '}' || /\s/.test(ch)) {
      out.push(ch)
      i++
      continue
    }
    const selStart = i
    while (i < css.length && css[i] !== '{') i++
    const rawSel = css.slice(selStart, i).trim()
    if (!rawSel) continue
    i++ // 进块
    const body = takeBlock()
    const prefixed = rawSel
      .split(',')
      .map((part) => {
        const t = part.trim()
        if (!t) return part
        if (/^(html|body|:root)$/i.test(t)) return scope // html/body/:root 语义重写
        return `${scope} ${t}`
      })
      .join(', ')
    out.push(`${prefixed}{${body}}`)
  }
  return out.join('')
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
