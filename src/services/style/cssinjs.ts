/**
 * Style CSS-in-JS 运行时补丁（style-isolation §4.4 命名空间路线）：
 *
 * observeRuntimeStyles + prefixSelectors 从 style.ts 抽离——
 * MutationObserver 观察 head 新 style 节点 + 未打标节点归因 + selector 前缀重写。
 * 与 inject / injectShadow / fontRegistry 完全无共享；prefixSelectors 是纯函数
 * （CSS selector 重写，不接触 ctx/DOM）。
 *
 * **C14-F 抽离动机**：style.ts 内 CSS-in-JS 运行时补丁（observeRuntimeStyles +
 * prefixSelectors）约 70 行；抽离后 style 状态机密度收敛到 inject / injectShadow /
 * fontRegistry 本职。
 *
 * **架构边界**：style.inject cssInJsPatcher 实例（非 cordis service 形态）——
 * 无 service 抽象必要，保持轻量模块 + 函数对象工厂 pattern（C7-A leakDetector 同节奏）。
 */

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

export interface CssInJsPatcherHandle {
  /** 补丁单个 style 节点（未打标则归因 + selector 前缀重写） */
  patch(el: HTMLStyleElement): boolean
  /** 观察 root 下新 style 节点（MutationObserver）；返回 disconnect 函数 */
  observe(root: HTMLElement, onPatched?: (el: HTMLStyleElement) => void): () => void
  /** 释放资源 */
  destroy(): void
}

/** 创建 CSS-in-JS 补丁器（无 cordis service 形态——轻量闭包工厂） */
export function createCssInJsPatcher(scope: string): CssInJsPatcherHandle {
  const observers: MutationObserver[] = []

  function patch(el: HTMLStyleElement): boolean {
    if (el.dataset.cordisApp) return false // 已归因（显式通道）：不动
    el.dataset.cordisApp = scope.match(/data-cordis-app="([^"]+)"/)?.[1] ?? ''
    el.textContent = prefixSelectors(el.textContent ?? '', scope)
    return true
  }

  return {
    patch,

    observe(root, onPatched) {
      // 只观察**注册后**的注入（"观测 style 注入"）：既有未打标节点可能是宿主/主应用
      // 样式——无归因证据不捕（误归因会以错误 scope 重写宿主样式）
      const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const n of m.addedNodes) {
            if (n instanceof HTMLStyleElement) {
              if (patch(n)) onPatched?.(n)
            }
          }
        }
      })
      mo.observe(root, { childList: true })
      observers.push(mo)
      return () => mo.disconnect()
    },

    destroy() {
      for (const mo of observers) mo.disconnect()
      observers.length = 0
    },
  }
}
