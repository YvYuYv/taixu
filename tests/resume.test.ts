/**
 * 主缝测试：恢复三通道收口（09 号票）。
 *
 * 主缝 = createCordis + lifecycle.requestSuspend/Resume + state/router/bus 事件探针。
 * 语义源：state-sharing §4.3（挂起不推送、恢复一次性 state/sync，ADR-0023）、
 * route-adaptation §三/§77（恢复重放一次 outlet/changed，ADR-0056）、
 * communication-protocol §七（回放 span link，ADR-0030）、ADR-0031（分级恢复覆盖）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp, parseTraceparent } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  document.body.textContent = ''
})

describe('state 通道：挂起不推送、恢复一次性 sync（ADR-0023）', () => {
  it('挂起期间 watch 回调不触发；恢复收到 state/sync {keys: {value, version}}', async () => {
    const seen: unknown[] = []
    const syncs: Array<Record<string, { value: unknown; version: number }>> = []
    const host = createCordis({
      permissions: [{ appId: 's-app', allow: ['state:read:shared:cfg'] }],
      apps: [defineApp('s-app', () => ({
        name: 's-app',
        inject: ['state'],
        apply(ctx: Context) {
          ctx.state.watch(ctx, 'shared:cfg', (v) => seen.push(v))
          ctx.on('state/sync', (e) => syncs.push(e.keys), { global: true })
        },
      }))],
    })
    await settle()
    const instance = await host.lifecycle.mount('s-app', 'main')
    await settle()
    expect(seen).toHaveLength(1) // 首跑同步

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'keepalive', 'route')
    host.state.set('shared:cfg', { theme: 'dark' }) // 挂起期间变更
    await settle()
    expect(seen).toHaveLength(1) // 不推送（拉模型，ADR-0023）
    expect(syncs).toHaveLength(0)

    await host.lifecycle.requestResume(host, instance.instanceId, 'route')
    await settle()
    expect(syncs).toHaveLength(1) // 恢复一次性 sync
    expect(syncs[0]!['shared:cfg']).toEqual({ value: { theme: 'dark' }, version: 1 })
  })
})

describe('router 通道：恢复重放一次 outlet/changed（ADR-0056）', () => {
  it('恢复后该槽位恰好重放一次，应用与正常导航同路径响应', async () => {
    let hits = 0
    const host = createCordis({
      routes: [{ basePath: '/r', appId: 'r-app' }],
      apps: [defineApp('r-app', () => ({
        name: 'r-app',
        apply(ctx: Context) {
          ctx.on('outlet/changed:main', () => hits++)
        },
      }))],
    })
    await settle()
    await host.router.navigate({ path: '/r' }, { outlet: 'main' })
    await settle()
    const instance = await host.lifecycle.mount('r-app', 'main')
    await settle()
    const before = hits

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'navigation', 'route')
    await host.lifecycle.requestResume(host, instance.instanceId, 'route')
    await settle()
    expect(hits).toBe(before + 1) // 恰好重放一次（无第二套恢复机制）
  })
})

describe('恢复时序：state/sync -> outlet 重放 -> 消息回放（三通道统一收口）', () => {
  it('主缝探针观察三通道顺序无交错', async () => {
    const log: string[] = []
    const host = createCordis({
      permissions: [{ appId: 'ord-app', allow: ['state:read:shared:cfg'] }],
      routes: [{ basePath: '/o', appId: 'ord-app' }],
      apps: [defineApp('ord-app', () => ({
        name: 'ord-app',
        inject: ['state', 'bus'],
        apply(ctx: Context) {
          ctx.state.watch(ctx, 'shared:cfg', () => {})
          ctx.on('state/sync', () => log.push('state-sync'), { global: true })
          ctx.on('outlet/changed:main', () => log.push('outlet'))
          ctx.on('message/receive', (e) => {
            if (e.message.type !== 'bus/overflow') log.push(`msg:${e.message.payload as string}`)
          })
        },
      }))],
    })
    await settle()
    await host.router.navigate({ path: '/o' }, { outlet: 'main' })
    const instance = await host.lifecycle.mount('ord-app', 'main')
    await settle()
    log.length = 0

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'keepalive', 'route')
    host.state.set('shared:cfg', { v: 1 }) // 挂起期间三通道各自积压
    host.bus.send(host, { type: 'evt:x', payload: 'queued', target: 'ord-app' })
    await host.lifecycle.requestResume(host, instance.instanceId, 'route')
    await settle()

    expect(log).toEqual(['state-sync', 'outlet', 'msg:queued']) // 统一时序（§09），无交错
  })
})

describe('回放 span link（ADR-0030）', () => {
  it('回放消息 traceId 保持、spanId 换新（挂起前后链路可关联，时长只计真实处理）', async () => {
    const originals: string[] = []
    const replayed: string[] = []
    const host = createCordis({
      apps: [defineApp('tr-app', () => ({
        name: 'tr-app',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.on('message/receive', (e) => {
            if (e.message.type === 'evt:x') replayed.push(e.message.traceparent!)
          })
        },
      }))],
    })
    await settle()
    host.on('message/send', (e) => originals.push(e.message.traceparent!), { global: true })
    const instance = await host.lifecycle.mount('tr-app', 'main')
    await settle()

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'keepalive', 'route')
    host.bus.send(host, { type: 'evt:x', payload: 'p', target: 'tr-app' })
    await host.lifecycle.requestResume(host, instance.instanceId, 'route')
    await settle()

    expect(originals).toHaveLength(1)
    expect(replayed).toHaveLength(1)
    const orig = parseTraceparent(originals[0]!)
    const relinked = parseTraceparent(replayed[0]!)
    expect(orig).not.toBeNull()
    expect(relinked).not.toBeNull()
    expect(relinked!.traceId).toBe(orig!.traceId) // traceId 关联保持（span link 语义）
    expect(relinked!.spanId).not.toBe(orig!.spanId) // 新 span：不计队列滞留时长
  })
})

describe('分级恢复覆盖语义（ADR-0031）', () => {
  it('路由挂起不被命令恢复解除；路由恢复解除全部；已 active 的恢复幂等', async () => {
    const host = createCordis({ apps: [defineApp('p-app', () => ({ name: 'p-app', apply() {} }))] })
    await settle()
    const instance = await host.lifecycle.mount('p-app', 'main')

    await host.lifecycle.requestSuspend(host, instance.instanceId, 'navigation', 'route')
    await host.lifecycle.requestResume(host, instance.instanceId, 'command') // 低优先级恢复
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('suspended') // 解除不了路由挂起

    await host.lifecycle.requestResume(host, instance.instanceId, 'route') // 高优先级恢复
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('active')
    await host.lifecycle.requestResume(host, instance.instanceId, 'route') // 幂等
    expect(host.lifecycle.getAppState(instance.instanceId)).toBe('active')
  })
})
