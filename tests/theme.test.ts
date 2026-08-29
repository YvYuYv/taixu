/**
 * 主题服务（style-isolation §五，F7）+ 样式冲突检测（§八，F7）。
 *
 * 主缝 = createCordis({ theme }) + host.theme.setTheme/patchTheme/current +
 * devtools.scanStyleConflicts()。
 *
 * 语义源：
 * - §五 主题共享：文档级 `:root` 的 `--tx-*` 是唯一写点（生命周期 = 宿主）；应用消费
 *   `var(--tx-primary)` 自动响应；配置即初始主题；prefers-color-scheme 由 ThemeService 内聚
 * - §八 验证与 DevTools：冲突检测扫描文档级规则的选择器命中数（跨应用命中 -> 告警）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createCordis, defineApp, type ThemeTokens } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
  document.documentElement.removeAttribute('style')
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})

/** 读回 :root 上的主题变量 */
function cssVar(name: string): string {
  return document.documentElement.style.getPropertyValue(`--tx-${name}`)
}

describe('主题服务（F7，style-isolation §五）', () => {
  it('配置即初始主题：构造期写入 :root 的 --tx-*（应用无需等待）', async () => {
    const host = createCordis({
      theme: { tokens: { primary: '#07c160', radius: '4px' } },
      apps: [],
    })
    await settle()
    expect(cssVar('primary')).toBe('#07c160') // 键自动加 --tx- 前缀
    expect(cssVar('radius')).toBe('4px')
    expect(host.theme.current()).toEqual({ primary: '#07c160', radius: '4px' })
  })

  it('setTheme 全量替换 / patchTheme 增量覆盖 / current 只读副本', async () => {
    const host = createCordis({ theme: { tokens: { primary: '#111', bg: '#fff' } }, apps: [] })
    await settle()

    host.theme.patchTheme({ primary: '#222' }) // 增量：bg 保留
    expect(cssVar('primary')).toBe('#222')
    expect(cssVar('bg')).toBe('#fff')

    host.theme.setTheme({ primary: '#333' } as ThemeTokens) // 全量：bg 消失
    expect(cssVar('primary')).toBe('#333')
    expect(host.theme.current()).toEqual({ primary: '#333' })

    const snapshot = host.theme.current()
    snapshot.primary = 'MUTATED'
    expect(host.theme.current().primary).toBe('#333') // current() 是副本，外部改动不污染
  })

  it('reset 回到配置初始态（丢弃运行期改动）', async () => {
    const host = createCordis({ theme: { tokens: { primary: '#init' } }, apps: [] })
    await settle()
    host.theme.setTheme({ primary: '#changed', extra: 'x' })
    expect(cssVar('primary')).toBe('#changed')

    host.theme.reset()
    expect(host.theme.current()).toEqual({ primary: '#init' })
    expect(cssVar('primary')).toBe('#init')
  })

  it('prefers-color-scheme：followSystem 时 dark 集叠加在 base 之上，切换自动重算', async () => {
    let dark = false
    const listeners = new Set<() => void>()
    const mql = {
      get matches() {
        return dark
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }
    vi.stubGlobal('matchMedia', (q: string) => (q.includes('dark') ? mql : { matches: false }))

    const host = createCordis({
      theme: {
        tokens: { primary: '#base' },
        dark: { primary: '#dark', bg: '#000' },
        light: { primary: '#light' },
        followSystem: true,
      },
      apps: [],
    })
    await settle()
    expect(cssVar('primary')).toBe('#light') // 系统 light：base + light 集
    expect(cssVar('bg')).toBe('')

    dark = true
    for (const fn of listeners) fn() // 系统切到 dark
    expect(cssVar('primary')).toBe('#dark') // dark 集覆盖 base
    expect(cssVar('bg')).toBe('#000')

    dark = false
    for (const fn of listeners) fn()
    expect(cssVar('primary')).toBe('#light')
  })

  it('未配置 followSystem：不受系统配色影响（默认不跟随）', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const host = createCordis({
      theme: { tokens: { primary: '#fixed' }, dark: { primary: '#dark' } },
      apps: [],
    })
    await settle()
    expect(cssVar('primary')).toBe('#fixed') // dark 集未生效
  })

  it('应用可消费主题变量（CSS 变量自动响应，无需事件广播）', async () => {
    const host = createCordis({
      theme: { tokens: { primary: '#07c160' } },
      apps: [defineApp('t-app', () => ({ name: 't-app', apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('t-app', 'main')
    await settle()
    const probe = document.createElement('div')
    probe.className = 'themed'
    inst.container.appendChild(probe)
    const style = document.createElement('style')
    style.textContent = '.themed { color: var(--tx-primary); }'
    document.head.appendChild(style)

    // jsdom 不解析 var()（级联实现不完整）——断言写点与消费写法，
    // 真实浏览器的 CSS 变量特性保证应用自动响应（无需事件广播）
    expect(getComputedStyle(document.documentElement).getPropertyValue('--tx-primary')).toBe('#07c160')
    expect(style.textContent).toContain('var(--tx-primary)') // 应用侧消费写法

    // 主题变更同写点推进：应用无需重新挂载即可响应
    host.theme.patchTheme({ primary: '#ff0000' })
    expect(getComputedStyle(document.documentElement).getPropertyValue('--tx-primary')).toBe('#ff0000')
    style.remove()
  })
})

describe('样式冲突检测（F7，style-isolation §八）', () => {
  it('同一选择器命中多个应用 = 跨应用冲突上报', async () => {
    const host = createCordis({
      apps: [
        defineApp('a-app', () => ({ name: 'a-app', apply() {} })),
        defineApp('b-app', () => ({ name: 'b-app', apply() {} })),
      ],
    })
    await settle()
    const a = await host.lifecycle.mount('a-app', 'main')
    const b = await host.lifecycle.mount('b-app', 'side')
    await settle()

    // 两个应用容器内都有 .leaked（模拟文档级样式无隔离的典型症状）
    for (const inst of [a, b]) {
      const el = document.createElement('div')
      el.className = 'leaked'
      inst.container.appendChild(el)
    }
    const style = document.createElement('style')
    style.textContent = '.leaked { color: red; }'
    document.head.appendChild(style)

    const conflicts = host.devtools.scanStyleConflicts()
    const hit = conflicts.find((c) => c.selector === '.leaked')
    expect(hit).toBeTruthy()
    expect(hit!.apps.sort()).toEqual(['a-app', 'b-app'])
    expect(hit!.hitCount).toBe(2)

    style.remove()
  })

  it('单应用命中不算冲突；分组规则（@media）内规则也下探', async () => {
    const host = createCordis({ apps: [defineApp('s-app', () => ({ name: 's-app', apply() {} }))] })
    await settle()
    const inst = await host.lifecycle.mount('s-app', 'main')
    await settle()
    const el = document.createElement('div')
    el.className = 'only-one'
    inst.container.appendChild(el)

    const style = document.createElement('style')
    style.textContent = '@media screen { .only-one { color: red } } .single { color: blue }'
    document.head.appendChild(style)

    // 只命中一个应用 -> 无冲突（含 @media 内规则与顶层规则）
    expect(host.devtools.scanStyleConflicts()).toEqual([])
    style.remove()
  })

  it('无挂载实例：直接返回空（不扫描、不抛）', async () => {
    const host = createCordis({ apps: [] })
    await settle()
    expect(host.devtools.scanStyleConflicts()).toEqual([])
  })
})
