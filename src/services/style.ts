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

export class StyleService extends Service<Record<never, never>> {
  static provide = 'style'

  constructor(ctx: Context, _config: Record<never, never> = {}) {
    super(ctx, 'style')
  }

  /**
   * 显式注入：在 head 挂 style 节点并打标；移除挂调用方 fiber effect。
   * 同 file 重复注入 = 真热替换语义（替换文本，不叠加节点）。
   */
  inject(ctx: Context, asset: StyleAsset): HTMLStyleElement {
    // fail-closed：匿名 fiber（无插件名）无法归因，拒绝注入而非挂到共享 unknown 槽
    const appId = ctx.fiber.name
    if (!appId) throw new Error('style.inject: cannot attribute to anonymous fiber (app plugin must declare name)')
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
}

declare module 'cordis' {
  interface Context {
    style: StyleService
  }
}
