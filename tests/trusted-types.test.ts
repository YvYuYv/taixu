/**
 * 主缝测试：Trusted Types 纵深（security §3.1，F8）。
 *
 * `require-trusted-types-for 'script'` 下 HTML sink 只接受 `TrustedHTML`，赋 string 会抛
 * TypeError——故框架净化结果必须经 policy 包装才能落 sink；且**顺序不可颠倒**
 * （先净化、后包装：policy 的 createHTML 是恒等函数，净化仍是 sanitizeHTML 的职责）。
 *
 * jsdom 无 `window.trustedTypes`，故用替身注入模拟宿主 TT 能力；能力缺失时的降级路径
 * （返回 string，行为与启用 TT 前一致）同样有断言覆盖。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'
import { __resetTrustedTypesCache, toTrustedHTML, htmlPolicy } from '../src/services/security/trustedTypes'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

/** TT 替身：记录 createHTML 入参与策略名，产物带 toString（jsdom sink 会 String() 化） */
function installTrustedTypes(opts: { allowPolicy?: boolean } = {}) {
  const policyNames: string[] = []
  const htmlInputs: string[] = []
  const trustedTypes = {
    createPolicy(name: string, rules: { createHTML?: (html: string) => string }) {
      policyNames.push(name)
      if (opts.allowPolicy === false) throw new Error(`policy "${name}" not allowed by CSP`)
      return {
        createHTML(html: string) {
          const out = rules.createHTML ? rules.createHTML(html) : html
          htmlInputs.push(out)
          return { __brand: 'TrustedHTML', value: out, toString: () => out }
        },
      }
    },
  }
  vi.stubGlobal('trustedTypes', trustedTypes)
  __resetTrustedTypesCache()
  return { policyNames, htmlInputs }
}

/** 适配器直测（兜底包装面：覆盖 DOMPurify 未返回 TrustedHTML 的情形，如降级转义路径） */
describe('toTrustedHTML 适配器（F8 兜底面）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    __resetTrustedTypesCache()
  })

  it('TT 可用：string 入参包装为 TrustedHTML；同名策略缓存复用', () => {
    const { policyNames } = installTrustedTypes()
    const wrapped = toTrustedHTML('<b>x</b>')
    expect((wrapped as { __brand?: string }).__brand).toBe('TrustedHTML')
    toTrustedHTML('<b>y</b>') // 第二次：命中缓存（createPolicy 不重复调用）
    expect(policyNames).toEqual(['taixu#html'])
    expect(htmlPolicy('taixu#html')).toBe(htmlPolicy('taixu#html')) // 同一实例
  })

  it('TT 不可用：原样返回 string（降级，不改写内容）', () => {
    expect(toTrustedHTML('<b>x</b>')).toBe('<b>x</b>')
    expect(htmlPolicy()).toBeNull()
  })
})

describe('Trusted Types 纵深（F8，security §3.1）', () => {
  beforeEach(() => {
    document.body.textContent = ''
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    __resetTrustedTypesCache() // 缓存跨用例隔离（策略单例）
  })

  it('能力缺失（默认 jsdom）：返回净化后的 string，行为与启用 TT 前一致', async () => {
    const host = createCordis({ apps: [defineApp('tt-app', () => ({ name: 'tt-app', apply() {} }))] })
    await settle()
    const out = host.security.sanitizeToTrustedHTML('<b>ok</b><script>bad()</script>')
    expect(typeof out).toBe('string') // 降级：不是 TrustedHTML
    expect(out).toContain('<b>ok</b>')
    expect(out).not.toContain('script') // 净化仍然生效
  })

  it('TT 可用：净化在前、包装在后（DOMPurify 内建 TT 时不再二次包装）', async () => {
    const { policyNames, htmlInputs } = installTrustedTypes()
    const host = createCordis({ apps: [defineApp('tt-app', () => ({ name: 'tt-app', apply() {} }))] })
    await settle()

    const out = host.security.sanitizeToTrustedHTML('<b onclick="x()">ok</b><script>bad()</script>')
    // DOMPurify 检测到 trustedTypes 会自建 'dompurify' 策略并返回 TrustedHTML：
    // 此时框架不再二次包装（避免把 TrustedHTML 当 string 再喂 createHTML）
    expect(policyNames).toContain('dompurify')
    expect(typeof out).not.toBe('string') // TT 可用 -> 非 string（TrustedHTML）
    expect(String(out)).toContain('<b>ok</b>')
    expect(String(out)).not.toContain('script') // 净化生效
    expect(String(out)).not.toContain('onclick')
    void htmlInputs
  })

  it('策略名可配置；同名策略只创建一次（createPolicy 重复调用会抛）', async () => {
    const { policyNames } = installTrustedTypes()
    const host = createCordis({
      security: { trustedTypes: { policyName: 'host#html' } },
      apps: [defineApp('tt-app', () => ({ name: 'tt-app', apply() {} }))],
    })
    await settle()
    // 走兜底包装面（未经 DOMPurify 的 TrustedHTML 结果）：直接调底层适配器
    host.security.sanitizeToTrustedHTML('<i>a</i>')
    host.security.sanitizeToTrustedHTML('<i>b</i>')
    expect(policyNames.filter((n) => n === 'host#html')).toEqual(['host#html']) // 缓存命中：只建一次
  })

  it('策略创建失败（CSP 未允许该名）：降级为净化 string，不抛', async () => {
    installTrustedTypes({ allowPolicy: false })
    const host = createCordis({ apps: [defineApp('tt-app', () => ({ name: 'tt-app', apply() {} }))] })
    await settle()
    const out = host.security.sanitizeToTrustedHTML('<b>ok</b><script>bad()</script>')
    expect(typeof out).toBe('string')
    expect(out).toContain('<b>ok</b>')
    expect(out).not.toContain('script') // 降级不削弱净化
  })

  it('应用 innerHTML 写点：TT 可用时落 sink 的是已净化结果（不触发 TT 违规）', async () => {
    installTrustedTypes()
    const host = createCordis({
      apps: [
        defineApp('tt-app', () => ({ name: 'tt-app', inject: ['bus'], apply() {} })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('tt-app', 'main')
    await settle()

    // 沙箱 document（应用侧 HTML 写点全过净化 + TT 包装）
    const doc = (inst.sandbox!.proxy as unknown as { document: Document }).document
    const div = doc.createElement('div') as unknown as { innerHTML: unknown }
    div.innerHTML = '<b>ok</b><script>bad()</script>'
    expect(String(div.innerHTML)).toContain('<b>ok</b>')
    expect(String(div.innerHTML)).not.toContain('script') // 净化后落 sink
  })

  it('iframe srcdoc（框架自身写点）：TT 可用时经 policy 包装', async () => {
    const { htmlInputs } = installTrustedTypes()
    const host = createCordis({ apps: [] })
    await settle()
    // jsdom 内 iframe 不真加载 -> handshake 必然超时；但 srcdoc 在创建期已赋值，
    // 本例只断言框架自身写点走了 TT 包装（超时失败本身也被显式吞掉）
    await host.sandbox
      .createIframeSandbox('tt-app', { handshakeTimeoutMs: 30 })
      .catch(() => undefined)
    expect(htmlInputs.some((h) => h.includes('<!doctype html>'))).toBe(true) // 常量文档也包装
  })
})
