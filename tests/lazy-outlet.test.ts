/**
 * 主缝测试：懒 outlet（route-adaptation §六表 loadOnVisible，P1）。
 * 懒槽位的挂载意图延迟到宿主元素进入视口才派发（IntersectionObserver，
 * observer 挂 ctx.effect）；pending 期间多次导航只保留最新意图；
 * IO 能力缺失/宿主元素缺失时降级为立即派发（不阻塞挂载）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis } from '../src'

/** 假 IntersectionObserver（jsdom 无 IO；经 createCordis router.ioFactory 注入主缝） */
class FakeIO {
  static instances: FakeIO[] = []
  cb: (entries: { isIntersecting: boolean; target: Element }[], io: FakeIO) => void
  observed: Element[] = []
  disconnected = false
  constructor(cb: (entries: { isIntersecting: boolean; target: Element }[], io: FakeIO) => void, _opts?: unknown) {
    this.cb = cb
    FakeIO.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((e) => e !== el)
  }
  disconnect() {
    this.disconnected = true
  }
  trigger(el: Element, isIntersecting = true) {
    this.cb([{ isIntersecting, target: el }], this)
  }
}

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  document.body.textContent = ''
  FakeIO.instances = []
})

describe('懒 outlet（§六 loadOnVisible）', () => {
  it('懒槽位：导航命中不立即派发；进入视口才派发挂载意图（observer 观察宿主元素）', async () => {
    const side = document.createElement('div')
    side.id = 'side'
    document.body.appendChild(side)
    const intents: string[] = []
    const host = createCordis({
      routes: [{ basePath: '/side', appId: 'lazy-app' }],
      outlets: { side: '#side' },
      router: { lazyOutlets: ['side'], ioFactory: FakeIO },
      onResolve: (i) => intents.push(`${i.outlet}:${i.appId}`),
    })
    await settle()

    const res = await host.router.navigate({ path: '/side' }, { caller: host, outlet: 'side' })
    expect(res.status).toBe('ok')
    expect(intents).toEqual([]) // 不立即派发
    expect(FakeIO.instances).toHaveLength(1)
    expect(FakeIO.instances[0]!.observed).toEqual([side]) // 观察宿主元素（挂载容器尚不存在）

    FakeIO.instances[0]!.trigger(side) // 进入视口
    expect(intents).toEqual(['side:lazy-app']) // 才派发
  })

  it('pending 期间多次导航只保留最新意图；可见后不重复观察（一次性触发）', async () => {
    const side = document.createElement('div')
    side.id = 'side'
    document.body.appendChild(side)
    const intents: string[] = []
    const host = createCordis({
      routes: [
        { basePath: '/a', appId: 'app-a' },
        { basePath: '/b', appId: 'app-b' },
      ],
      outlets: { side: '#side' },
      router: { lazyOutlets: ['side'], ioFactory: FakeIO },
      onResolve: (i) => intents.push(i.appId),
    })
    await settle()

    await host.router.navigate({ path: '/a' }, { caller: host, outlet: 'side' })
    await host.router.navigate({ path: '/b' }, { caller: host, outlet: 'side' })
    FakeIO.instances[0]!.trigger(side)

    expect(intents).toEqual(['app-b']) // 只派最新意图（app-a 已被覆盖）

    FakeIO.instances[0]!.trigger(side) // 再触发（防重）
    await host.router.navigate({ path: '/a' }, { caller: host, outlet: 'side' })
    expect(intents).toEqual(['app-b', 'app-a']) // 已可见：后续导航立即派发
  })

  it('IO 能力缺失：降级为立即派发（不阻塞挂载）；observer 挂 ctx.effect（dispose 断开）', async () => {
    const side = document.createElement('div')
    side.id = 'side'
    document.body.appendChild(side)
    const intents: string[] = []
    const host = createCordis({
      routes: [{ basePath: '/side', appId: 'lazy-app' }],
      outlets: { side: '#side' },
      router: { lazyOutlets: ['side'] }, // 无 ioFactory 且 jsdom 无 IntersectionObserver
      onResolve: (i) => intents.push(i.appId),
    })
    await settle()

    await host.router.navigate({ path: '/side' }, { caller: host, outlet: 'side' })
    expect(intents).toEqual(['lazy-app']) // 降级：立即派发

    // effect 托管：fiber dispose 时 disconnect（用第二个 host 验证，避免干扰上面断言）
    const host2 = createCordis({
      routes: [{ basePath: '/side', appId: 'lazy-app' }],
      outlets: { side: '#side' },
      router: { lazyOutlets: ['side'], ioFactory: FakeIO },
    })
    await settle()
    await host2.router.navigate({ path: '/side' }, { caller: host2, outlet: 'side' })
    expect(FakeIO.instances.at(-1)!.disconnected).toBe(false)
    await host2.fiber.dispose()
    expect(FakeIO.instances.at(-1)!.disconnected).toBe(true)
  })
})
