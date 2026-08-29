/**
 * SSR 水合阶段 1（route-adaptation §六，F5）：
 * - 01 解析源可注入：`initialUrl` 替代 window.location 成为矩阵初始化唯一源
 *   （杜绝 hydration 与 location 双源竞态 → 应用挂载两次）
 * - 02/03 后续票：payload 读取校验 + 首次 watch 直取（见 .scratch/ssr-hydration/issues/）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp, type MountIntent } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
  window.history.replaceState(null, '', '/')
})

describe('hydration 阶段 1：解析源可注入（F5-01）', () => {
  it('注入 initialUrl：矩阵按注入 URL 解析（location 不同也不影响），单一源无竞态', async () => {
    // 宿主把 SSR 解析出的水合 URL 交给 router——location 停留在 '/'
    window.history.replaceState(null, '', '/different')
    const intents: MountIntent[] = []
    const host = createCordis({
      router: { initialUrl: 'https://host.example.com/app-a?__tx_side=/app-b' },
      routes: [
        { basePath: '/app-a', appId: 'app-a' },
        { basePath: '/app-b', appId: 'app-b' },
      ],
      apps: [
        defineApp('app-a', () => ({ name: 'app-a', apply() {} })),
        defineApp('app-b', () => ({ name: 'app-b', apply() {} })),
      ],
      onResolve: (intent) => intents.push(intent),
    })
    await settle()
    await host.lifecycle.mount('app-a', 'main')
    await settle()

    // main 槽位按注入 URL 的 pathname 解析（而非 location 的 /different）
    expect(intents.some((i) => i.appId === 'app-a')).toBe(true)
    expect(intents.some((i) => i.appId === 'app-b')).toBe(true) // __tx_side 槽位同源解析
    expect(intents).toHaveLength(2) // 恰好一次：单一源 = 无 hydration/location 双源竞态
  })

  it('未注入：回落 window.location（既有行为不变）', async () => {
    window.history.replaceState(null, '', '/app-a')
    const intents: MountIntent[] = []
    createCordis({
      routes: [{ basePath: '/app-a', appId: 'app-a' }],
      apps: [defineApp('app-a', () => ({ name: 'app-a', apply() {} }))],
      onResolve: (intent) => intents.push(intent),
    })
    await settle()
    expect(intents).toEqual([expect.objectContaining({ appId: 'app-a', outlet: 'main' })])
  })
})

/**
 * F5-02 · payload 读取与一致性校验：框架提供 `readHydrationPayload` /
 * `hydrationMismatch` 纯 helper（只读不接——宿主把 payload.url 传给 initialUrl，
 * 保持 F5-01 的单一源原则）；payload 形态不符 / 非法 JSON 一律 null（fail-closed
 * 回落 location，启动不阻断）。
 */
import { readHydrationPayload, hydrationMismatch } from '../src'

describe('hydration payload 读取（F5-02）', () => {
  it('合法 payload：读出 url/outlets；形态不符 / 非法 JSON / 缺元素 -> null（fail-closed）', () => {
    const script = document.createElement('script')
    script.type = 'application/json'
    script.id = 'tx-hydration'
    script.textContent = JSON.stringify({ url: 'https://h.com/a', outlets: { main: '/a' } })
    document.body.appendChild(script)
    expect(readHydrationPayload()).toEqual({ url: 'https://h.com/a', outlets: { main: '/a' } })

    script.textContent = '{"outlets":{}}' // 缺 url（形态不符）
    expect(readHydrationPayload()).toBeNull()
    script.textContent = 'not-json' // 非法 JSON（含 CSP 拦截等异常路径）
    expect(readHydrationPayload()).toBeNull()
    script.remove()
    expect(readHydrationPayload()).toBeNull() // 元素缺失
  })

  it('mismatch：payload.url 与 location 不一致 -> 以客户端 URL 为准；一致 -> null', () => {
    const payload = { url: 'https://h.com/stale' }
    const fake = { href: 'https://h.com/fresh' }
    expect(hydrationMismatch(payload, fake)).toBe('https://h.com/fresh') // 客户端为准
    expect(hydrationMismatch(payload, { href: 'https://h.com/stale' })).toBeNull()
  })

  it('端到端：宿主读 payload -> mismatch 以客户端为准 -> 传 initialUrl，意图恰好一次', async () => {
    const script = document.createElement('script')
    script.type = 'application/json'
    script.id = 'tx-hydration'
    script.textContent = JSON.stringify({ url: 'https://h.com/app-a' })
    document.body.appendChild(script)
    window.history.replaceState(null, '', '/app-a') // 客户端实际地址

    const payload = readHydrationPayload()!
    const mismatch = hydrationMismatch(payload, window.location)
    const intents: MountIntent[] = []
    createCordis({
      // mismatch -> 以客户端 URL 为准（而非 payload.url）
      router: { initialUrl: mismatch ?? payload.url },
      routes: [{ basePath: '/app-a', appId: 'app-a' }],
      apps: [defineApp('app-a', () => ({ name: 'app-a', apply() {} }))],
      onResolve: (intent) => intents.push(intent),
    })
    await settle()
    script.remove()
    expect(mismatch).toBe(window.location.href) // 不一致被捕获
    expect(intents).toEqual([expect.objectContaining({ appId: 'app-a', outlet: 'main' })]) // 恰好一次
  })
})
