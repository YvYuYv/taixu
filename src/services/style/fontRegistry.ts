/**
 * Style fontRegistry 子系统（style-isolation §3.3 @font-face 提升）：
 *
 * fontRegistry Map + appFonts Map + registerFontFace + hoistFontFaces + releaseFonts +
 * fontHash helper 从 style.ts 抽离——自洽子系统（无 ctx 依赖），
 * 与 inject / injectShadow / observeRuntimeStyles / setZLayers 完全无共享。
 *
 * **C14-D 抽离动机**：style.ts 6 个状态字段中 @font-face 提升子系统
 * （fontRegistry + appFonts + registerFontFace + hoistFontFaces + releaseFonts + fontHash）
 * 约 100 行；抽离后 style 状态机密度收敛到 inject / injectShadow / observeRuntimeStyles 本职。
 *
 * **架构边界**：style.inject fontRegistry 实例（非 cordis service 形态）——
 * 无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern（C7-A leakDetector 同节奏）。
 */

/** @font-face 描述（§3.3 提升注入文档级；family 经 `tx-{appId}-` 前缀重写防撞车） */
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

export interface FontRegistryHandle {
  /** @font-face 提升（§3.3）：注入**文档级** style 节点；返回重写后的 family */
  registerFontFace(rule: FontFaceRule, appId: string): string
  /** CSS 文本内的 @font-face 提升改写（§3.3 构建期行为的运行时等价物） */
  hoistFontFaces(css: string, appId: string): string
  /** 字体 registry 查询（DevTools/诊断：当前文档级字体清单） */
  entries(): Array<{ appId: string; family: string; refs: number }>
  /** 应用字体引用回收（app/disposed）：零引用移除文档级节点 */
  release(appId: string): void
  /** 释放资源 */
  destroy(): void
}

/** 创建 fontRegistry 账本（无 cordis service 形态——轻量闭包工厂） */
export function createFontRegistry(): FontRegistryHandle {
  const fontRegistry = new Map<string, FontEntry>()
  const appFonts = new Map<string, Set<string>>()

  return {
    registerFontFace(rule, appId) {
      if (!appId) throw new Error('style.registerFontFace: cannot attribute to anonymous fiber')
      const prefixed = `tx-${appId}-${rule.family}`
      const key = fontHash(appId, rule.family, rule.declarations)
      const existing = fontRegistry.get(key)
      if (existing) {
        existing.refs.add(appId) // 去重复用（同节点不再注入）
      } else {
        const node = document.createElement('style')
        node.dataset.cordisApp = appId
        node.dataset.txFont = rule.family
        node.textContent = `@font-face { font-family: "${prefixed}"; ${rule.declarations} }`
        document.head.appendChild(node)
        fontRegistry.set(key, { node, refs: new Set([appId]) })
      }
      const keys = appFonts.get(appId) ?? new Set<string>()
      keys.add(key)
      appFonts.set(appId, keys)
      return prefixed
    },

    hoistFontFaces(css, appId) {
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
        this.registerFontFace({ family: familyMatch[1] as string, declarations }, appId)
        out = out.replace(block, '') // 移除原块（已提升）
      }
      return out
    },

    entries() {
      return [...fontRegistry.entries()].map(([key, e]) => ({
        appId: key.split(':')[0] as string,
        family: e.node.dataset.txFont ?? '',
        refs: e.refs.size,
      }))
    },

    release(appId) {
      const keys = appFonts.get(appId)
      if (!keys) return
      appFonts.delete(appId)
      for (const key of keys) {
        const entry = fontRegistry.get(key)
        if (!entry) continue
        entry.refs.delete(appId)
        if (entry.refs.size === 0) {
          entry.node.remove() // 无引用：移除（避免字体常驻）
          fontRegistry.delete(key)
        }
      }
    },

    destroy() {
      fontRegistry.clear()
      appFonts.clear()
    },
  }
}
