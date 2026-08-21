/**
 * 主缝测试：保活挂起 + SuspendScope + 消息队列（08 号票）。
 *
 * 主缝 = createCordis + lifecycle.requestSuspend/Resume/switch + 沙箱代理 + bus。
 * 语义源：lifecycle-management.md §五（挂起语义/裁决/SuspendScope/三模式）、
 * communication-protocol.md §5.5（挂起队列 ADR-0008/0015/0021）；
 * ADR-0018/0031/0035（仲裁分级）、ADR-0020（默认挂起）、ADR-0033（样式摘除）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp, fiberStateName } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  document.body.textContent = ''
})

/** 计时应用（定时器冻结用；定时器经 instance.sandbox.proxy 排程） */
function timerApp(appId: string) {
  return defineApp(appId, () => ({ name: appId, apply() {} }))
}

describe('挂起语义（§5.1）', () => {
  it('requestSuspend：容器摘离渲染树、fiber 仍 ACTIVE、app/suspend 事件、状态派生 suspended', async () => {
    const events: string[] = []
    const host = createCordis({ apps: [defineApp('a', () => ({ name: 'a', apply() {} }))] })
    await settle()
    host.on('app/suspend', (e) => events.push(`${e.reason}:${e.instanceId.slice(0, 1)}`), { global: true })
    const instance = await host.lifecycle.mount('a', 'main')
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('active')

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    expect(document.body.contains(instance.container)).toBe(false) // DOM 摘离
    expect(fiberStateName(instance.fiber.state)).toBe('ACTIVE') // 挂起不销毁 fiber（§5.1）
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('suspended')
    expect(events).toHaveLength(1)

    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    expect(document.body.contains(instance.container)).toBe(true) // 还回
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('active')
  })

  it('鉴权：应用只能挂起自己的实例（root 例外，ADR-0035）', async () => {
    const host = createCordis({
      apps: [defineApp('a', () => ({ name: 'a', apply() {} })), defineApp('b', () => ({ name: 'b', apply() {} }))],
    })
    await settle()
    const ia = await host.lifecycle.mount('a', 'main')
    await host.lifecycle.mount('b', 'side')
    const bCtx = host.lifecycle.getInstances().find((i) => i.appId === 'b')!.ctx

    await expect(host.lifecycle.requestSuspend(bCtx, ia.instanceId, 'keepalive', 'command')).rejects.toThrow(/denied/)
    expect(host.lifecycle.getAppState(ia.instanceId)).toBe('active') // 未被恶意挂起
    await host.lifecycle.requestSuspend(host, ia.instanceId, 'system', 'system') // root 例外
    expect(host.lifecycle.getAppState(ia.instanceId)).toBe('suspended')
  })

  it('仲裁：挂起取并集；恢复分级解除（命令恢复解除不了路由挂起，ADR-0018/0031）', async () => {
    const host = createCordis({ apps: [defineApp('a', () => ({ name: 'a', apply() {} }))] })
    await settle()
    const instance = await host.lifecycle.mount('a', 'main')

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'navigation', 'route')
    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'system') // 并集
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('suspended')

    // 低优先级恢复（命令）解除不了高优先级挂起（路由）
    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('suspended')

    // 高优先级恢复（路由）解除全部低优先级挂起
    await host.lifecycle.requestResume(host, instance.instanceId, 'route')
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('active')
  })

  it('默认挂起：switch 未配置 keepalive 也走挂起（回程零冷启动，ADR-0020）', async () => {
    const host = createCordis({
      apps: [defineApp('a', () => ({ name: 'a', apply() {} })), defineApp('b', () => ({ name: 'b', apply() {} }))],
    })
    await settle()
    await host.lifecycle.switch('main', 'a')
    const first = host.lifecycle.getInstances().find((i) => i.appId === 'a')!
    expect(host.lifecycle.getAppState(first.instanceId)).toBe('active')

    await host.lifecycle.switch('main', 'b')
    expect(host.lifecycle.getAppState(first.instanceId)).toBe('suspended') // 默认挂起而非销毁
    const second = host.lifecycle.getInstances().find((i) => i.appId === 'b')!
    expect(host.lifecycle.getAppState(second.instanceId)).toBe('active')
    expect(host.lifecycle.getInstances()).toHaveLength(2) // 两实例都在

    // 回程零冷启动：切回已挂起应用 = 恢复既有实例，不重新挂载
    const back = await host.lifecycle.switch('main', 'a')
    expect(back.instanceId).toBe(first.instanceId) // 同一实例（恢复，非新事务）
    expect(host.lifecycle.getAppState(first.instanceId)).toBe('active')
    expect(host.lifecycle.getAppState(second.instanceId)).toBe('suspended') // 原应用让位挂起
    expect(host.lifecycle.getInstances()).toHaveLength(2) // 无实例增殖
  })
})

describe('SuspendScope 冻结（§5.2，ADR-0013/0027/0032/0048）', () => {
  it('定时器冻结：挂起不触发，恢复续期（保留剩余时长）', async () => {
    const host = createCordis({ apps: [timerApp('t-app')] })
    await settle()
    const instance = await host.lifecycle.mount('t-app', 'main')
    const fired: number[] = []

    // 经应用侧视角的沙箱代理排程（应用拿到的就是包装版）
    const sb = instance.sandbox!
    const setTimeoutFn = sb.proxy.setTimeout as (cb: () => void, ms: number) => number
    setTimeoutFn(() => fired.push(1), 80)
    await sleep(20) // 走了 20ms，剩 60ms

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    await sleep(120) // 挂起期间远超剩余时长
    expect(fired).toEqual([]) // 冻结：未触发

    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    await sleep(100) // 恢复后续期（~60ms 后应触发）
    expect(fired).toEqual([1])
  })

  it('事件监听冻结：挂起期间 DOM 事件不触发回调（监听保留，非清理）', async () => {
    const host = createCordis({ apps: [defineApp('l-app', () => ({ name: 'l-app', apply() {} }))] })
    await settle()
    const instance = await host.lifecycle.mount('l-app', 'main')
    const hits: number[] = []
    const addEL = instance.sandbox!.proxy.addEventListener as typeof window.addEventListener
    const handler = () => hits.push(1)
    addEL.call(window, 'probe-evt', handler as EventListener)

    window.dispatchEvent(new Event('probe-evt'))
    expect(hits).toEqual([1])

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    window.dispatchEvent(new Event('probe-evt'))
    expect(hits).toEqual([1]) // 冻结：不触发

    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    window.dispatchEvent(new Event('probe-evt'))
    expect(hits).toEqual([1, 1]) // 恢复：监听仍在（保留非清理）
  })

  it('诚实边界：fetch 不冻结（文档声明的不冻结清单）', async () => {
    // 语义断言：挂起不拦截 fetch（§5.2 不冻结项）--沙箱 proxy.fetch 在挂起期间仍可调用
    const host = createCordis({ apps: [defineApp('f-app', () => ({ name: 'f-app', apply() {} }))] })
    await settle()
    const instance = await host.lifecycle.mount('f-app', 'main')
    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    // 沙箱 proxy 上没有 fetch 冻结包装（injectSlot.fetch 为 scopedFetch 直通）
    expect(typeof instance.sandbox!.injectSlot.fetch).toBe('function')
    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
  })
})

describe('样式摘除（ADR-0033）', () => {
  it('挂起时 head 内应用样式一并摘除、恢复还回（不留幽灵样式）', async () => {
    const host = createCordis({ apps: [defineApp('s-app', () => ({ name: 's-app', apply() {} }))] })
    await settle()
    const instance = await host.lifecycle.mount('s-app', 'main')
    const el = document.createElement('style')
    el.dataset.cordisApp = 's-app'
    el.textContent = '.x{}'
    document.head.appendChild(el)

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    expect(document.head.contains(el)).toBe(false) // 摘除缓存

    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    expect(document.head.contains(el)).toBe(true) // 还回零闪烁
    el.remove()
  })
})

describe('挂起队列（§5.5，ADR-0008/0015/0021）', () => {
  it('挂起期间消息入队不投递；恢复回放保全序', async () => {
    const got: string[] = []
    const host = createCordis({
      apps: [defineApp('q-app', () => ({
        name: 'q-app',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.on('message/receive', (e) => got.push(e.message.payload as string))
        },
      }))],
    })
    await settle()
    const instance = await host.lifecycle.mount('q-app', 'main')
    await settle()

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    host.bus.send(host, { type: 'evt:x', payload: 'm1', target: 'q-app' })
    host.bus.send(host, { type: 'evt:x', payload: 'm2', target: 'q-app' })
    await settle()
    expect(got).toEqual([]) // 不投递

    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    await settle()
    expect(got).toEqual(['m1', 'm2']) // 回放全序
  })

  it('溢出：上限截断丢最旧 + bus/overflow 上报（droppedCount）', async () => {
    const got: string[] = []
    const overflows: number[] = []
    const host = createCordis({
      bus: { queueLimit: 3 },
      apps: [defineApp('o-app', () => ({
        name: 'o-app',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.on('message/receive', (e) => {
            if (e.message.type === 'bus/overflow') overflows.push((e.message.payload as { droppedCount: number }).droppedCount)
            else got.push(e.message.payload as string)
          })
        },
      }))],
    })
    await settle()
    host.on('bus/overflow', (e) => overflows.push(e.droppedCount), { global: true })
    const instance = await host.lifecycle.mount('o-app', 'main')
    await settle()

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    for (let i = 0; i < 5; i++) host.bus.send(host, { type: 'evt:x', payload: `m${i}`, target: 'o-app' })
    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    await settle()

    expect(got).toEqual(['m2', 'm3', 'm4']) // FIFO 丢最旧（上限 3）
    expect(overflows).toContain(2) // droppedCount = 2
  })

  it('同键合并：coalesceKey 相同的新消息替换旧消息（状态快照语义）', async () => {
    const got: string[] = []
    const host = createCordis({
      apps: [defineApp('c-app', () => ({
        name: 'c-app',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.on('message/receive', (e) => {
            if (e.message.type === 'bus/overflow') return // 溢出通知消息（ADR-0021）不入业务断言
            got.push(e.message.payload as string)
          })
        },
      }))],
    })
    await settle()
    const instance = await host.lifecycle.mount('c-app', 'main')
    await settle()

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    host.bus.send(host, { type: 'evt:snap', payload: 'v1', target: 'c-app', metadata: { coalesceKey: 'snap' } })
    host.bus.send(host, { type: 'evt:other', payload: 'keep', target: 'c-app' })
    host.bus.send(host, { type: 'evt:snap', payload: 'v2', target: 'c-app', metadata: { coalesceKey: 'snap' } }) // 合并替换
    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
    await settle()

    expect(got).toEqual(['keep', 'v2']) // 同键移除旧值、最新值入队尾（§5.5：时间序）
  })
})

describe('WS 重连（§5.2-3，ADR-0017）', () => {
  it('挂起 close(1000) 记描述符；恢复框架自动重建连接（订阅由应用重建）', async () => {
    const host = createCordis({ apps: [defineApp('w-app', () => ({ name: 'w-app', apply() {} }))] })
    await settle()
    const instance = await host.lifecycle.mount('w-app', 'main')
    const WS = instance.sandbox!.proxy.WebSocket as new (url: string) => object
    void new WS('ws://localhost:1/channel') // 应用建连（进断连名单）

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command')
    expect(instance.sandbox!.closedSockets()).toEqual([{ url: 'ws://localhost:1/channel', protocols: undefined }])

    await host.lifecycle.requestResume(host, instance.instanceId, 'command') // 恢复：框架重建连接
    await host.lifecycle.requestSuspend(host, instance.instanceId, 'system', 'command') // 再次冻结：重建的连接又入名单
    expect(instance.sandbox!.closedSockets()).toHaveLength(2) // 描述符含重建连接（可再次冻结 = 真重建）
    await host.lifecycle.requestResume(host, instance.instanceId, 'command')
  })
})
