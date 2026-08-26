/**
 * 主缝测试：共享依赖仲裁 + 预加载 + 容灾（heterogeneous §七/§十，P1）。
 * negotiate 最高满足版本（非注册顺序第一）；refCount/release 归零释放；
 * singleton/strict 冲突 fail-fast（DependencyConflictError + DEP_CONFLICT）；
 * acceptsDuplicate 私有副本 fallback（DEP_NEGOTIATION_FALLBACK，框架类禁止）；
 * preload modulepreload+crossorigin；resilientLoad 多源重试 + 404 偏斜告警。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, DependencyConflictError } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
  document.head.textContent = ''
})

describe('共享依赖仲裁（§七）', () => {
  it('最高满足版本胜出（非注册顺序第一）；refCount 计数与 release 归零释放', async () => {
    const host = createCordis({})
    await settle()
    host.deps.registerShared('lodash', { version: '4.17.10', module: { v: '4.17.10' } })
    host.deps.registerShared('lodash', { version: '4.17.21', module: { v: '4.17.21' } })

    const m1 = await host.deps.negotiate('lodash', '^4.17.0')
    expect((m1.module as { v: string }).v).toBe('4.17.21') // 最高满足版本
    expect(m1.refCount).toBe(1)
    const m2 = await host.deps.negotiate('lodash', '^4.0.0')
    expect(m2.refCount).toBe(2) // 同模块复用计数

    host.deps.release('lodash', '4.17.21')
    host.deps.release('lodash', '4.17.21')
    expect(host.deps.sharedVersions('lodash')).toEqual(['4.17.10']) // 归零释放
  })

  it('singleton 无满足版本：fail-fast（DependencyConflictError + DEP_CONFLICT 告警，非塞旧版本）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      monitor: { alertRules: { DEP_CONFLICT: {} } },
      security: {
        // cordis.dependencies.json 清单形状（§七）
        integrityManifest: {},
      },
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })
    host.deps.registerShared('vue', { version: '2.7.16', module: { v: 2 } })

    await expect(host.deps.negotiate('vue', '^3.2.0', { singleton: true })).rejects.toThrow(DependencyConflictError)
    expect(alerts).toEqual(['DEP_CONFLICT'])
    // 旧版缺陷不复现：不强制塞 2.7 运行时
  })

  it('acceptsDuplicate 私有副本 fallback（DEP_NEGOTIATION_FALLBACK）；框架类禁止私有副本（fail-fast）', async () => {
    const alerts: string[] = []
    const host = createCordis({ monitor: { alertRules: { DEP_NEGOTIATION_FALLBACK: {} } } })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })

    const privateCopy = { v: '4.17.21-private' }
    const mod = await host.deps.negotiate('lodash', '^4.99.0', {
      acceptsDuplicate: true,
      privateLoader: async () => privateCopy,
    })
    expect(mod.module).toBe(privateCopy) // fallback 私有副本
    expect(mod.private).toBe(true)
    expect(alerts).toEqual(['DEP_NEGOTIATION_FALLBACK'])

    // 框架类（无 acceptsDuplicate 声明）：禁止私有副本 -> 硬失败
    await expect(
      host.deps.negotiate('vue', '^3.0.0', { privateLoader: async () => ({}) }),
    ).rejects.toThrow(DependencyConflictError)
    expect(alerts).toEqual(['DEP_NEGOTIATION_FALLBACK']) // 不新增（冲突告警需 DEP_CONFLICT 规则）
  })
})

describe('预加载与容灾（§十）', () => {
  it('preload：modulepreload + crossorigin=anonymous 并行链接', async () => {
    const host = createCordis({})
    await settle()
    host.deps.preload(['https://cdn.example.com/a.js', 'https://cdn.example.com/b.js'])
    await settle()
    const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')]
    expect(links).toHaveLength(2)
    expect(links.every((l) => l.crossOrigin === 'anonymous')).toBe(true)
    expect(links.map((l) => l.href)).toEqual(['https://cdn.example.com/a.js', 'https://cdn.example.com/b.js'])
  })

  it('resilientLoad：多源重试退避；主源耗尽切换备源成功', async () => {
    const host = createCordis({ deps: { retryBackoffMs: 0 } })
    await settle()
    let calls = 0
    const raw = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('primary')) {
        calls++
        throw new TypeError('network down')
      }
      return new Response('ok', { status: 200 })
    }) as typeof fetch
    try {
      const res = await host.deps.resilientLoad(['https://cdn1.example.com/primary.js', 'https://cdn2.example.com/backup.js'], { retries: 1 })
      expect(res).toBe('ok')
      expect(calls).toBe(2) // 主源重试 1 次（初始 + 1 重试）后切换
    } finally {
      globalThis.fetch = raw
    }
  })

  it('全源耗尽 404：DEPLOY_SKEW 告警（版本偏斜提示刷新，基线 §五唯一策略）', async () => {
    const alerts: string[] = []
    const host = createCordis({
      deps: { retryBackoffMs: 0 },
      monitor: { alertRules: { DEPLOY_SKEW: {} } },
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })
    const raw = globalThis.fetch
    globalThis.fetch = (async () => new Response('gone', { status: 404 })) as typeof fetch
    try {
      await expect(
        host.deps.resilientLoad(['https://cdn1.example.com/x.js'], { retries: 0 }),
      ).rejects.toThrow(/404/)
      expect(alerts).toEqual(['DEPLOY_SKEW'])
    } finally {
      globalThis.fetch = raw
    }
  })
})
