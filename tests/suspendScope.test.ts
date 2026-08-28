/**
 * SuspendScope 真身登记面测试（C1.1 落地）
 *
 * 5 类注册面 × {freeze, unfreeze} = 10 case + reconnect 1 case = 11 total
 * 验证从 sandbox 闭包抽离后 5 类资源登记的本地化语义
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { SuspendScope, suspendRegistry } from '../src/suspend'

/** 测试用 fake timer API（注入到 SuspendScope 构造选项） — 每个 spy 显式命名以便 expect */
function makeFakeTimers() {
  const queue: Array<{ id: number; at: number; cb: () => void }> = []
  let seq = 0
  const rawSetTimeoutSpy = vi.fn((cb: () => void) => {
    const id = ++seq
    queue.push({ id, at: 0, cb })
    return id as unknown as ReturnType<typeof setTimeout>
  }) as unknown as typeof setTimeout
  const rawSetIntervalSpy = vi.fn((cb: () => void) => {
    const id = ++seq
    queue.push({ id, at: 1, cb })
    return id as unknown as ReturnType<typeof setInterval>
  }) as unknown as typeof setInterval
  const rawClearTimeoutSpy = vi.fn() as unknown as typeof clearTimeout
  const rawClearIntervalSpy = vi.fn() as unknown as typeof clearInterval
  return {
    queue,
    rawSetTimeout: rawSetTimeoutSpy,
    rawSetInterval: rawSetIntervalSpy,
    rawClearTimeout: rawClearTimeoutSpy,
    rawClearInterval: rawClearIntervalSpy,
    rawSetTimeoutSpy,
    rawSetIntervalSpy,
    rawClearTimeoutSpy,
    rawClearIntervalSpy,
    advanceTo: (idx: number) => {
      const item = queue[idx]
      if (item) item.cb()
    },
  }
}

describe('SuspendScope · 5 类注册面 + freeze/unfreeze（lifecycle §5.2）', () => {
  let timers: ReturnType<typeof makeFakeTimers>
  let scope: SuspendScope
  let reconnectLog: Array<{ url: string }>

  beforeEach(() => {
    vi.useFakeTimers()
    timers = makeFakeTimers()
    reconnectLog = []
    scope = new SuspendScope('app-x', {
      rawSetTimeout: timers.rawSetTimeout,
      rawSetInterval: timers.rawSetInterval,
      rawClearTimeout: timers.rawClearTimeout,
      rawClearInterval: timers.rawClearInterval,
      reconnectSocket: (d) => {
        reconnectLog.push({ url: d.url })
      },
    })
    // 清空全局注册表，保证测试隔离
    suspendRegistry.resume('app-x')
  })

  afterEach(() => {
    suspendRegistry.resume('app-x')
    vi.useRealTimers()
  })

  // ---- 5 类注册面 × freeze/unfreeze ----

  // (1) registerTimer 普通注册 → 递增 id 分配
  it('registerTimer：分配递增 id（与 timerSeq + 1 对齐）', () => {
    const id1 = scope.registerTimer('timeout', () => {})
    const id2 = scope.registerTimer('interval', () => {})
    expect(id2).toBe(id1 + 1)
    expect(scope.timerCount()).toBe(2)
  })

  // (2) registerTimer + freeze → 保留剩余时长
  it('registerTimer + freeze：保留已流逝时长（账本持有 + rawClearTimeout 被调）', () => {
    scope.registerTimer('timeout', () => {}, 100)
    vi.advanceTimersByTime(40) // 流逝 40ms（剩余 60ms）
    scope.freeze()
    expect(timers.rawClearTimeoutSpy).toHaveBeenCalledTimes(1)
    expect(scope.isFrozen()).toBe(true)
    expect(scope.timerCount()).toBe(1) // 账本保留
  })

  // (3) registerTimer + freeze/unfreeze → 续期（rawSetTimeout 再次被调）
  it('registerTimer + unfreeze：续期（以冻结时剩余时长重排；rawSetTimeout 二次触发）', () => {
    scope.registerTimer('timeout', () => {}, 100)
    vi.advanceTimersByTime(40)
    scope.freeze()
    scope.unfreeze()
    expect(timers.rawSetTimeoutSpy).toHaveBeenCalledTimes(2) // 初次注册 + 续期
    expect(scope.isFrozen()).toBe(false)
  })

  // (4) registerListener 注册 wrap listener（不同引用）
  it('registerListener：返回 wrapped listener（与原引用不同）', () => {
    const orig = () => {}
    const wrapped = scope.registerListener(orig)
    expect(wrapped).not.toBe(orig)
    // 同 listener 再注册：返回 cached wrapped
    expect(scope.registerListener(orig)).toBe(wrapped)
  })

  // (5) registerListener + freeze 门控（wrapped 不触发回调）
  it('registerListener + freeze：wrapped 在挂起期不触发回调', () => {
    const cb = vi.fn()
    suspendRegistry.suspend('app-x')
    const wrapped = scope.registerListener(cb)
    ;(wrapped as (ev: Event) => void)(new Event('click'))
    expect(cb).not.toHaveBeenCalled()
  })

  // (6) registerListener + unfreeze 解门控
  it('registerListener + unfreeze：解门控后 wrapped 触发回调', () => {
    const cb = vi.fn()
    const wrapped = scope.registerListener(cb)
    suspendRegistry.suspend('app-x')
    ;(wrapped as (ev: Event) => void)(new Event('click'))
    expect(cb).not.toHaveBeenCalled()
    suspendRegistry.resume('app-x')
    ;(wrapped as (ev: Event) => void)(new Event('click'))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  // (7) registerObserver wrap Ctor（构造时返回 wrap class）
  it('registerObserver：返回 wrap 后的构造器（不暴露 raw）', () => {
    class FakeObserver {
      public cb: ((...a: unknown[]) => void) | undefined
      constructor(cb: (...a: unknown[]) => void) {
        this.cb = cb
        FakeObserver.lastRaw = new.target
      }
      trigger(...a: unknown[]): void {
        this.cb?.(...a)
      }
      static lastRaw: unknown
    }
    const Wrapped = scope.registerObserver(FakeObserver as unknown as new (cb: (...a: unknown[]) => void) => object)
    expect(Wrapped).not.toBe(FakeObserver)
    expect(typeof Wrapped).toBe('function')
  })

  // (8) registerObserver + freeze 门控
  it('registerObserver + freeze：挂起期 super callback 不透传到业务 callback', () => {
    const cb = vi.fn()
    class FakeObserver {
      public trigger: ((...a: unknown[]) => void) | undefined
      constructor(t: (...a: unknown[]) => void) {
        this.trigger = t
      }
    }
    const Wrapped = scope.registerObserver(FakeObserver as unknown as new (cb: (...a: unknown[]) => void) => object)
    const instance = new (Wrapped as unknown as new (cb: (...a: unknown[]) => void) => { trigger: (...a: unknown[]) => void })(cb)
    suspendRegistry.suspend('app-x')
    instance.trigger('arg-1')
    expect(cb).not.toHaveBeenCalled()
  })

  // (9) registerObserver + unfreeze 解门控
  it('registerObserver + unfreeze：解门控后业务 callback 正常触发', () => {
    const cb = vi.fn()
    class FakeObserver {
      public trigger: ((...a: unknown[]) => void) | undefined
      constructor(t: (...a: unknown[]) => void) {
        this.trigger = t
      }
    }
    const Wrapped = scope.registerObserver(FakeObserver as unknown as new (cb: (...a: unknown[]) => void) => object)
    const instance = new (Wrapped as unknown as new (cb: (...a: unknown[]) => void) => { trigger: (...a: unknown[]) => void })(cb)
    suspendRegistry.suspend('app-x')
    instance.trigger('skipped')
    suspendRegistry.resume('app-x')
    instance.trigger('arrived')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('arrived')
  })

  // (10) registerSocket + freeze → close(1000) + closedDescriptors 含描述符
  it('registerSocket + freeze：活跃 socket close(1000) 并入 closedDescriptors', () => {
    const closeFn = vi.fn()
    const handle = {
      url: 'wss://example.com/ws',
      protocols: ['chat'],
      close: closeFn,
      readyState: () => 1, // OPEN
    }
    scope.registerSocket(handle)
    expect(scope.socketCount()).toBe(1)
    scope.freeze()
    expect(closeFn).toHaveBeenCalledWith(1000)
    expect(scope.closedSockets()).toHaveLength(1)
    expect(scope.closedSockets()[0]?.url).toBe('wss://example.com/ws')
    expect(scope.closedSockets()[0]?.protocols).toEqual(['chat'])
  })

  // (11) reconnectSocket callback 在 unfreeze 时被调（多次按描述符序）
  it('unfreeze：reconnectSocket 按 closedDescriptors 序逐条调用', () => {
    const closeFn = vi.fn()
    const handle1 = {
      url: 'wss://a/ws',
      protocols: undefined,
      close: closeFn,
      readyState: () => 1,
    }
    const handle2 = {
      url: 'wss://b/ws',
      protocols: undefined,
      close: closeFn,
      readyState: () => 1,
    }
    scope.registerSocket(handle1)
    scope.registerSocket(handle2)
    scope.freeze()
    expect(reconnectLog).toHaveLength(0)
    scope.unfreeze()
    expect(reconnectLog).toEqual([
      { url: 'wss://a/ws' },
      { url: 'wss://b/ws' },
    ])
  })
})
