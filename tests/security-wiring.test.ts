/**
 * 主缝测试：安全全链路 fail-closed 接线（11 号票）。
 *
 * 主缝 = createCordis({ permissions, apps }) + 各消费点（bus/state/router/scopedFetch）
 * 行为断言。语义源：security.md §3.2（URL 白名单）、§5.1（裁决三不变量 ADR-0024/0039/0051）、
 * §8 采样与限流（网络违规 (appId, rule) 去重）、ADR-0010（isolate 白名单）、
 * route-adaptation §3.2（sanitizeQuery）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  document.body.textContent = ''
})

describe('bus 消费点：deny-by-default（未注册类型拒绝）', () => {
  it('未授权类型不投递 + security/violation 上报', async () => {
    const violations: Array<{ appId: string; rule: string }> = []
    const host = createCordis({
      apps: [defineApp('b-app', () => ({
        name: 'b-app',
        inject: ['bus'],
        apply(ctx: Context) {
          ctx.on('message/receive', () => { throw new Error('must not deliver') })
        },
      }))],
    })
    await settle()
    host.on('security/violation', (e) => violations.push({ appId: e.appId, rule: e.rule }), { global: true })
    const sender = defineApp('sender', () => ({ name: 'sender', apply() {} }))
    void sender

    // root（宿主）向未授权目标类型发送——宿主之外的应用发送需 message:* 授权；
    // 这里以应用视角：应用 ctx 调 send
    const appCtx = host.lifecycle.mount
    void appCtx
    // 经挂载的应用实例 ctx 发送（source 派生为应用 appId，无授权）
    const instance = await host.lifecycle.mount('b-app', 'main')
    await settle()
    const ok = host.bus.send(instance.ctx, { type: 'evt:secret', payload: 1, target: 'b-app' })
    expect(ok).toBe(false) // deny-by-default：message:evt:secret 未授权
    expect(violations).toContainEqual({ appId: 'b-app', rule: 'message-send' })
  })
})

describe('router 消费点：守卫前置（导航资源）', () => {
  it('未授权应用导航被拒（守卫管线之前）+ violation；授权后放行', async () => {
    const violations: string[] = []
    const host = createCordis({
      permissions: [{ appId: 'nav-ok', allow: ['route:navigate'] }],
      routes: [{ basePath: '/n', appId: 'nav-ok' }],
      apps: [defineApp('nav-no', () => ({ name: 'nav-no', apply() {} })), defineApp('nav-ok', () => ({ name: 'nav-ok', apply() {} }))],
    })
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })
    const ino = await host.lifecycle.mount('nav-no', 'main')
    await host.lifecycle.mount('nav-ok', 'o1') // 授权应用（挂载取得 ctx）
    await settle()

    // 未授权应用经 caller 归因导航：守卫前置拒绝
    const denied = await host.router.navigate({ path: '/n' }, { caller: ino.ctx, outlet: 'main' })
    expect(denied.status).toBe('denied')
    expect(violations).toContain('route:navigate')
    expect(host.router.current('main').path).toBe('/')

    // 授权应用放行
    const iok = host.lifecycle.getInstances().find((i) => i.appId === 'nav-ok')!.ctx
    const ok = await host.router.navigate({ path: '/n' }, { caller: iok, outlet: 'main' })
    expect(ok.status).toBe('ok')
    // root（宿主）不受限
    const rootNav = await host.router.navigate({ path: '/' }, { caller: host, outlet: 'main' })
    expect(rootNav.status).toBe('ok')
  })
})

describe('scopedFetch 消费点：URL 白名单 + 权限裁决', () => {
  it('无 net:fetch 拒绝；origin 限定授权只放行白名单源；http/data: 一律拒绝', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const host = createCordis({
        permissions: [{ appId: 'f-app', allow: ['net:fetch:https://api.a.com'] }],
        apps: [defineApp('f-app', () => ({ name: 'f-app', apply() {} })), defineApp('g-app', () => ({ name: 'g-app', apply() {} }))],
      })
      await settle()
      const fi = await host.lifecycle.mount('f-app', 'main')
      const gi = await host.lifecycle.mount('g-app', 'o1')
      const fFetch = fi.sandbox!.injectSlot.fetch!
      const gFetch = gi.sandbox!.injectSlot.fetch!

      await expect(fFetch('https://api.a.com/v1')).resolves.toBeInstanceOf(Response) // 白名单源放行
      await expect(fFetch('https://evil.com/x')).rejects.toThrow(/denied|rejected/) // 越源拒绝
      await expect(fFetch('http://api.a.com/x')).rejects.toThrow(/denied|rejected/) // 明文 http 拒绝
      await expect(fFetch('data:text/html,x')).rejects.toThrow(/denied|rejected/) // data: 协议拒绝
      await expect(gFetch('https://api.a.com/v1')).rejects.toThrow(/denied|rejected/) // 无 net:fetch 拒绝
      expect(fetchMock).toHaveBeenCalledTimes(1) // 唯一放行的那次到达原生 fetch
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('sanitizeQuery：敏感参数过滤（route-adaptation §3.2）', () => {
  it('导航 query 剥离 token/_t/sign 黑名单键，业务参数保留', async () => {
    const host = createCordis({
      routes: [{ basePath: '/q', appId: 'q-app' }],
      apps: [defineApp('q-app', () => ({ name: 'q-app', apply() {} }))],
    })
    await settle()
    await host.router.navigate({ path: '/q', query: { tab: 'x', token: 'leak', _t: '1', sign: 's' } }, { caller: host, outlet: 'main' })
    const q = host.router.current('main').query
    expect(q).toEqual({ tab: 'x' }) // 黑名单键剥离、业务参数保留
    expect(new URL(window.location.href).searchParams.get('token')).toBeNull() // URL 不泄漏
  })
})

describe('violation 审计与限流（security §8）', () => {
  it('非网络违规全量上报；网络违规按 (appId, rule) 限流去重', async () => {
    const events: Array<{ appId: string; rule: string }> = []
    const host = createCordis({
      apps: [defineApp('v-app', () => ({ name: 'v-app', apply() {} }))],
    })
    await settle()
    host.on('security/violation', (e) => events.push({ appId: e.appId, rule: e.rule }), { global: true })

    host.security.reportViolation('v-app', 'net:fetch', { url: 'https://a/1' })
    host.security.reportViolation('v-app', 'net:fetch', { url: 'https://a/2' }) // 同键窗口内去重
    host.security.reportViolation('v-app', 'net:websocket', { url: 'wss://a' }) // 不同规则不去重
    host.security.reportViolation('v-app', 'state-read', { key: 'shared:x' })
    host.security.reportViolation('v-app', 'state-read', { key: 'shared:y' }) // 非网络类全量

    expect(events.filter((e) => e.rule === 'net:fetch')).toHaveLength(1) // (appId, rule) 去重
    expect(events.filter((e) => e.rule === 'net:websocket')).toHaveLength(1)
    expect(events.filter((e) => e.rule === 'state-read')).toHaveLength(2) // 全量
  })
})

describe('isolate 白名单（ADR-0010）', () => {
  it('非白名单 isolate 标签告警上报；白名单（router-view/monitor）静默', async () => {
    const violations: Array<{ appId: string; rule: string; detail: unknown }> = []
    const host = createCordis({ apps: [defineApp('i-app', () => ({ name: 'i-app', apply() {} }))] })
    await settle()
    host.on('security/violation', (e) => violations.push({ appId: e.appId, rule: e.rule, detail: e.detail }), { global: true })

    host.isolate('router-view', Symbol('rv')) // 白名单
    host.isolate('monitor', Symbol('mo')) // 白名单
    expect(() => host.isolate('state', Symbol('st'))).toThrow(/not whitelisted/) // 拦截（ADR-0010）
    expect(violations).toHaveLength(1)
    expect(violations[0]!.rule).toBe('isolate-non-whitelisted')
    expect(violations[0]!.detail).toMatchObject({ tag: 'state' })
  })
})

describe('审计补面（终检覆盖率）', () => {
  it('限流窗口过后同键再次上报可穿透（账本窗口语义 + 回收前提）', async () => {
    const events: string[] = []
    const host = createCordis({
      security: { violationThrottleMs: 30 },
      apps: [defineApp('p2', () => ({ name: 'p2', apply() {} }))],
    })
    await settle()
    host.on('security/violation', (e) => events.push(e.rule), { global: true })
    host.security.reportViolation('p2', 'net:fetch', { url: 'https://a' })
    host.security.reportViolation('p2', 'net:fetch', { url: 'https://a' }) // 窗口内去重
    expect(events).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 50)) // 窗口过期
    host.security.reportViolation('p2', 'net:fetch', { url: 'https://a' })
    expect(events).toHaveLength(2) // 窗口外穿透
  })

  it('SRI 签名查询：integrityManifest 命中返回、未命中 undefined（§8.1 seam）', async () => {
    const host = createCordis({
      security: { integrityManifest: { 'https://cdn/x.js': 'sha384-abc' } },
      apps: [defineApp('s2', () => ({ name: 's2', apply() {} }))],
    })
    await settle()
    expect(host.security.integrityEntry('https://cdn/x.js')).toBe('sha384-abc')
    expect(host.security.integrityEntry('https://cdn/other.js')).toBeUndefined()
  })

  it('allowInsecure 配置：明文 http 经粗授权放行（§3.2 策略开关）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const host = createCordis({
        security: { allowInsecure: true },
        permissions: [{ appId: 'h-app', allow: ['net:fetch'] }],
        apps: [defineApp('h-app', () => ({ name: 'h-app', apply() {} }))],
      })
      await settle()
      const i = await host.lifecycle.mount('h-app', 'main')
      await expect(i.sandbox!.injectSlot.fetch!('http://api.insecure/x')).resolves.toBeInstanceOf(Response)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

/**
 * 网络面覆盖面（F3，security §六 + js-sandbox §3.6）：
 * XHR / WebSocket / EventSource 与 fetch **共用 `net:fetch:{origin}` 授权面**——
 * 宿主一套规则覆盖全部网络出口（此前 XHR/ES 只有记账、不裁决，`networkAccess`
 * 类承诺对 fetch 之外的网络面无法兑现）。
 */
describe('网络面覆盖面：XHR/WebSocket 同受 net:fetch 裁决（F3，§3.6）', () => {
  it('XHR：白名单源正常 open；越源不 open + send 抛错（fail-closed）', async () => {
    const host = createCordis({
      permissions: [{ appId: 'x-app', allow: ['net:fetch:https://api.a.com'] }],
      apps: [defineApp('x-app', () => ({ name: 'x-app', apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('x-app', 'main')
    const XHR = inst.sandbox!.proxy.XMLHttpRequest as new () => XMLHttpRequest

    const allowed = new XHR()
    allowed.open('GET', 'https://api.a.com/v1')
    expect(allowed.readyState).toBe(1) // OPENED：白名单源真的 open 了

    const denied = new XHR()
    denied.open('GET', 'https://evil.com/x')
    expect(denied.readyState).toBe(0) // UNSENT：越源未 open（fail-closed）
    expect(() => denied.send()).toThrow(/denied/) // send 阶段抛错，应用侧症状明确
  })

  it('WebSocket：越源构造即拒（ws/wss 豁免 https-only 协议门，但仍受 origin 授权）', async () => {
    const host = createCordis({
      // ws://localhost:1 白名单：验证 ws 协议不被 https 门误杀（放行路径）
      permissions: [{ appId: 'w-app', allow: ['net:fetch:ws://localhost:1'] }],
      apps: [defineApp('w-app', () => ({ name: 'w-app', apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('w-app', 'main')
    const WS = inst.sandbox!.proxy.WebSocket as new (u: string) => WebSocket

    // 越源：构造即抛（super 之前，未真实连接）
    expect(() => new WS('ws://evil.example.com/sock')).toThrow(/denied/)

    // 白名单 ws 源：通过协议门 + 授权（连接失败由 jsdom 异步报错，此处吸收）
    const ok = new WS('ws://localhost:1/x')
    ok.onerror = () => {}
    ok.close()
  })
})
