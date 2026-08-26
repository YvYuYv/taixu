/**
 * 主缝测试：SRI 资源完整性校验执行（security §8.1，P1）。
 * deps.loadScript：fetch 取源 -> SHA-256 哈希对照 integrityManifest
 * （deny-by-default：清单非空时未列入即拒）；失败 reject + violation + SRI_MISMATCH
 * 告警（注册规则才派发）且不注入；清单未配置 = 宿主显式退出（不校验加载）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCordis, type CreateCordisOptions } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

async function sha256B64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  let bin = ''
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b)
  return btoa(bin)
}

const SOURCE = 'console.log("app entry")'
const URL_ = 'https://cdn.example.com/entry.js'

const rawFetch = globalThis.fetch

beforeEach(() => {
  document.body.textContent = ''
  document.head.textContent = ''
  globalThis.fetch = (async () => new Response(SOURCE, { status: 200 })) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = rawFetch
})

function mk(overrides: CreateCordisOptions = {}): CreateCordisOptions {
  return { ...overrides }
}

describe('SRI 校验执行（§8.1）', () => {
  it('清单命中且哈希匹配：校验通过并注入执行；未列入（清单非空）deny-by-default 拒绝', async () => {
    const integrity = `sha256-${await sha256B64(SOURCE)}`
    const host = createCordis(
      mk({ security: { integrityManifest: { [URL_]: integrity } } }),
    )
    await settle()

    await host.deps.loadScript(URL_)
    const node = document.head.querySelector<HTMLScriptElement>('script')!
    expect(node).toBeTruthy()
    expect(node.textContent).toBe(SOURCE)

    await expect(host.deps.loadScript('https://cdn.example.com/other.js')).rejects.toThrow(/integrity/)
    expect(document.head.querySelectorAll('script').length).toBe(1) // 未列入：不注入
  })

  it('哈希不匹配：reject + sri-mismatch violation + SRI_MISMATCH 告警（已注册规则）；不注入', async () => {
    const violations: string[] = []
    const alerts: string[] = []
    const host = createCordis(
      mk({
        security: { integrityManifest: { [URL_]: 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' } },
        monitor: { alertRules: { SRI_MISMATCH: {} } },
      }),
    )
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })

    await expect(host.deps.loadScript(URL_)).rejects.toThrow(/integrity mismatch/)
    expect(violations).toContain('sri-mismatch')
    expect(alerts).toEqual(['SRI_MISMATCH'])
    expect(document.head.querySelector('script')).toBeNull() // 不注入
  })

  it('清单未配置：宿主显式退出 SRI（不校验加载，无 violation）', async () => {
    const violations: string[] = []
    const host = createCordis(mk())
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    await host.deps.loadScript(URL_) // 无清单：直接加载
    expect(document.head.querySelector('script')!.textContent).toBe(SOURCE)
    expect(violations).toEqual([])
  })
})
