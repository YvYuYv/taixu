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
