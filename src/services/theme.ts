/**
 * 主题服务（style-isolation.md §五，F7）。
 *
 * - **唯一写点**：文档级 `:root` 的 `--tx-*` 自定义属性（样式生命周期 = 宿主，
 *   不随应用卸载——主题是宿主级关注面，不是应用级）
 * - **应用消费**：`var(--tx-primary)`；主题变更**自动响应**（CSS 自定义属性特性，
 *   无需事件广播——这也是规范把旧版 `theme/change` 事件与静态配置两套并存统一掉的原因）
 * - **配置即初始主题**（§五）：`createCordis({ theme: { tokens } })`
 * - **prefers-color-scheme 内聚**（§五）：dark/light token 集切换由本服务处理，
 *   不再有第二机制
 *
 * 依赖方向：零服务依赖（与 style 同层，L0）——不 inject 任何服务，也不旁观事件。
 * 非核心八服务（基线 §2.2 之外），不参与 ADR-0054 依赖方向约束。
 */
import { Service, type Context } from 'cordis'

/** 主题变量（键不带 `--tx-` 前缀，由本服务统一加） */
export type ThemeTokens = Record<string, string>

export interface ThemeConfig {
  /** 初始主题（配置即初始主题，§五） */
  tokens?: ThemeTokens
  /** dark token 集（prefers-color-scheme: dark 时叠加） */
  dark?: ThemeTokens
  /** light token 集（prefers-color-scheme: light 时叠加） */
  light?: ThemeTokens
  /** 跟随系统配色（默认 false；开启后 dark/light 集随系统切换叠加在 tokens 之上） */
  followSystem?: boolean
}

/** 当前生效的系统配色倾向（测试可注入替身 via matchMedia） */
type Scheme = 'dark' | 'light'

export class ThemeService extends Service<ThemeConfig> {
  static provide = 'theme'

  /** 当前生效 tokens（base + 系统配色叠加后的最终值） */
  private tokens: ThemeTokens = {}
  private readonly base: ThemeTokens
  private readonly dark: ThemeTokens
  private readonly light: ThemeTokens
  private readonly followSystem: boolean

  constructor(ctx: Context, config: ThemeConfig = {}) {
    super(ctx, 'theme')
    this.initial = { ...(config.tokens ?? {}) } // 配置初始态快照（reset 用）
    this.base = { ...this.initial }
    this.dark = { ...(config.dark ?? {}) }
    this.light = { ...(config.light ?? {}) }
    this.followSystem = config.followSystem ?? false

    // 配置即初始主题：构造期写入（宿主启动即可用，无需二次调用）
    this.apply(this.merge(this.base, this.followSystem ? this.schemeTokens() : {}))

    if (this.followSystem) {
      // 系统配色切换：matchMedia 变更重算（内聚处理——不再有第二机制，§五）
      const mql = safeMatchMedia('(prefers-color-scheme: dark)')
      if (mql) {
        const onChange = () => this.apply(this.merge(this.base, this.schemeTokens()))
        // addEventListener 优先（Safari <14 只有 addListener；此处能力检测后使用）
        if (typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', onChange)
          ctx.effect(() => () => mql.removeEventListener('change', onChange))
        }
      }
    }
    // 宿主销毁：主题变量随页面卸载，不做回滚（写点是文档级且生命周期=宿主）
  }

  /** 设置主题（全量替换 base 集；系统配色集仍按 followSystem 叠加） */
  setTheme(tokens: ThemeTokens): void {
    for (const key of Object.keys(this.base)) delete this.base[key]
    Object.assign(this.base, tokens)
    this.apply(this.merge(this.base, this.followSystem ? this.schemeTokens() : {}))
  }

  /** 增量设置（只覆盖给定键，其余保留）——局部换肤场景 */
  patchTheme(tokens: ThemeTokens): void {
    Object.assign(this.base, tokens)
    this.apply(this.merge(this.base, this.followSystem ? this.schemeTokens() : {}))
  }

  /** 当前生效 tokens（只读副本） */
  current(): ThemeTokens {
    return { ...this.tokens }
  }

  /** 复位到配置初始态（丢弃运行期 setTheme/patchTheme 的改动） */
  reset(): void {
    this.setTheme(this.initial)
  }

  /** 配置里的初始 tokens（构造期快照，reset 基准） */
  private readonly initial: ThemeTokens

  /** 写点：文档级 :root 的 --tx-*（唯一写点，§五） */
  private apply(tokens: ThemeTokens): void {
    this.tokens = tokens
    const root = document.documentElement
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(`--tx-${key}`, value)
    }
  }

  private merge(base: ThemeTokens, scheme: ThemeTokens): ThemeTokens {
    return { ...base, ...scheme }
  }

  private schemeTokens(): ThemeTokens {
    return this.preferredScheme() === 'dark' ? this.dark : this.light
  }

  private preferredScheme(): Scheme {
    const mql = safeMatchMedia('(prefers-color-scheme: dark)')
    return mql?.matches ? 'dark' : 'light'
  }
}

/** matchMedia 安全包装（jsdom/SSR 无此能力时返回 null——主题降级为不跟随系统） */
function safeMatchMedia(query: string): MediaQueryList | null {
  const g = globalThis as unknown as { matchMedia?: (q: string) => MediaQueryList }
  if (typeof g.matchMedia !== 'function') return null
  try {
    return g.matchMedia(query)
  } catch {
    return null
  }
}

declare module 'cordis' {
  interface Context {
    theme: ThemeService
  }
}
