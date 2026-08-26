/**
 * 主缝测试：共享依赖清单通道 + DEP_VERSION_SPLIT + manifest 偏斜比对（heterogeneous §七/§十 余项，P1）。
 * 清单通道：createCordis deps.shared（cordis.dependencies.json 形状）注入声明，
 * negotiate 逐调用 options 缺省时从清单解析（singleton/strict/acceptsDuplicate）；
 * DEP_VERSION_SPLIT：同依赖多主版本注册在案 -> 升级提示告警（默认策略，ADR-0038）；
 * resilientLoad 404：onSkew 重取清单比对——entry 变更才 DEPLOY_SKEW（不变更 = 普通故障不误报）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCordis, DependencyConflictError } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

const rawFetch = globalThis.fetch

beforeEach(() => {
  document.body.textContent = ''
  document.head.textContent = ''
})
afterEach(() => {
  globalThis.fetch = rawFetch
})

describe('清单通道（§七 cordis.dependencies.json）', () => {
  it('声明从清单解析：singleton 冲突 fail-fast；acceptsDuplicate 走私有副本 fallback', async () => {
    const alerts: string[] = []
    const host = createCordis({
      deps: {
        // cordis.dependencies.json 形状（进 manifest 签名范围——宿主受控通道）
        shared: {
          vue: { range: '^3.2.0', singleton: true },
          lodash: { range: '^4.17.0', acceptsDuplicate: true },
        },
      },
      monitor: { alertRules: { DEP_CONFLICT: {}, DEP_NEGOTIATION_FALLBACK: {} } },
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })
    host.deps.registerShared('vue', { version: '2.7.16', module: { v: 2 } })

    // 清单声明 singleton：无 per-call options 也 fail-fast
    await expect(host.deps.negotiate('vue', '^3.0.0')).rejects.toThrow(DependencyConflictError)
    expect(alerts).toContain('DEP_CONFLICT')

    // 清单声明 acceptsDuplicate + privateLoader：fallback
    const copy = { private: true }
    const mod = await host.deps.negotiate('lodash', '^4.99.0', { privateLoader: async () => copy })
    expect(mod.module).toBe(copy)
    expect(alerts).toContain('DEP_NEGOTIATION_FALLBACK')

    // per-call options 覆盖清单（调用面声明优先）
    host.deps.registerShared('pinia', { version: '2.1.0', module: {} })
    const m = await host.deps.negotiate('pinia', '^2.0.0', { strict: false }) // 清单无 pinia
    expect(m.version).toBe('2.1.0')
  })

  it('DEP_VERSION_SPLIT：同依赖多主版本注册在案 -> 升级提示告警（默认策略，ADR-0038）', async () => {
    const alerts: string[] = []
    const host = createCordis({ monitor: { alertRules: { DEP_VERSION_SPLIT: {} } } })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })

    host.deps.registerShared('vue', { version: '2.7.16', module: { v: 2 } })
    host.deps.registerShared('vue', { version: '3.5.13', module: { v: 3 } })

    const m = await host.deps.negotiate('vue', '^3.2.0') // 满足 ^3：正常返回
    expect(m.version).toBe('3.5.13')
    expect(alerts).toEqual(['DEP_VERSION_SPLIT']) // 但版本分裂在案 -> 升级提示（非故障）

    // 无分裂（单主版本）不告警
    alerts.length = 0
    host.deps.registerShared('lodash', { version: '4.17.21', module: {} })
    await host.deps.negotiate('lodash', '^4.0.0')
    expect(alerts).toEqual([])
  })
})

describe('manifest 偏斜比对（§十）', () => {
  it('404 耗尽：onSkew 重取清单 entry 变更才 DEPLOY_SKEW；未变更 = 普通故障不误报', async () => {
    const alerts: string[] = []
    const skewResults: boolean[] = []
    const host = createCordis({
      deps: { retryBackoffMs: 0 },
      monitor: { alertRules: { DEPLOY_SKEW: {} } },
    })
    await settle()
    host.on('monitor/alert', (e) => alerts.push(e.alert.message), { global: true })

    const fail404 = () => {
      globalThis.fetch = (async () => new Response('gone', { status: 404 })) as typeof fetch
    }

    // entry 变更（部署滚动）：DEPLOY_SKEW
    fail404()
    await expect(
      host.deps.resilientLoad(['https://cdn.example.com/old.js'], {
        retries: 0,
        onSkew: async () => {
          skewResults.push(true)
          return true // 重取清单：entry 已变更
        },
      }),
    ).rejects.toThrow(/404/)
    expect(alerts).toEqual(['DEPLOY_SKEW'])

    // entry 未变更（非偏斜 404）：不告警（避免误报提示刷新）
    fail404()
    await expect(
      host.deps.resilientLoad(['https://cdn.example.com/x.js'], {
        retries: 0,
        onSkew: async () => false, // 清单重取：entry 未变
      }),
    ).rejects.toThrow(/404/)
    expect(alerts).toEqual(['DEPLOY_SKEW']) // 不新增
    expect(skewResults).toEqual([true])
  })
})
