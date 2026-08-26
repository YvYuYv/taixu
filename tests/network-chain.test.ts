/**
 * 主缝测试：网络拦截链（security §6.2 NetworkGateway 挂 bus 链，P1）。
 * scopedFetch 唯一链路内建链：tracing span -> monitor 指标 -> 原生 fetch；
 * 宿主/DevTools 经 bus.network.intercept(appId, mw) 注册自定义中间件（按注册序），
 * disposer 移除；security 裁决前置（拒绝路径不进链）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

const rawFetch = globalThis.fetch

beforeEach(() => {
  document.body.textContent = ''
  globalThis.fetch = (async (input: RequestInfo | URL) => new Response(`ok:${String(input)}`, { status: 200 })) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = rawFetch
})

function mkHost() {
  return createCordis({
    permissions: [{ appId: 'net-app', allow: ['net:fetch'] }],
    apps: [defineApp('net-app', () => ({ name: 'net-app', inject: ['router'], apply() {} }))],
  })
}

describe('网络拦截链（§6.2）', () => {
  it('内建链：tracing span + monitor net_ms 指标随 scopedFetch 产生', async () => {
    const host = mkHost()
    await settle()
    const inst = await host.lifecycle.mount('net-app', 'main')
    await settle()

    await host.lifecycle.scopedFetch('net-app')('https://api.example.com/data')
    await settle()

    const span = host.tracing.spans().find((s) => s.name === 'fetch:api.example.com/data')
    expect(span).toBeTruthy() // tracing 中间件
    expect(host.monitor.metricsSnapshot()['net_ms']).toMatchObject({ count: 1 }) // monitor 中间件

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('自定义中间件按注册序执行，可见请求与响应；disposer 移除后不再拦截', async () => {
    const order: string[] = []
    const host = mkHost()
    await settle()
    const inst = await host.lifecycle.mount('net-app', 'main')
    await settle()

    const off1 = host.bus.network.intercept('net-app', async (input, init, next) => {
      order.push('mw1:before')
      const res = await next(input, init)
      order.push('mw1:after')
      return res
    })
    host.bus.network.intercept('net-app', async (input, init, next) => {
      order.push('mw2:before')
      return next(input, init)
    })

    const res = await host.lifecycle.scopedFetch('net-app')('https://api.example.com/x')
    expect(await res.text()).toContain('ok:') // 响应透传
    expect(order).toEqual(['mw1:before', 'mw2:before', 'mw1:after']) // 注册序 + 包络序

    off1()
    order.length = 0
    await host.lifecycle.scopedFetch('net-app')('https://api.example.com/y')
    expect(order).toEqual(['mw2:before']) // mw1 已移除

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('应用销毁清理拦截链（§6.2 生命周期语义：中间件不滞留）', async () => {
    const seen: string[] = []
    const host = mkHost()
    await settle()
    const inst = await host.lifecycle.mount('net-app', 'main')
    await settle()
    host.bus.network.intercept('net-app', async (input, init, next) => {
      seen.push(String(input))
      return next(input, init)
    })
    await host.lifecycle.destroy(inst.instanceId, 't')
    await settle()

    await host.lifecycle.scopedFetch('net-app')('https://api.example.com/z') // 宿主侧调用仍可
    expect(seen).toEqual([]) // 应用已销毁：其中间件已清
  })

  it('security 裁决前置（fail-closed）：未授权应用的请求不进链、不产生 span', async () => {
    const host = createCordis({
      apps: [defineApp('denied-app', () => ({ name: 'denied-app', apply() {} }))],
    })
    await settle()

    await expect(
      host.lifecycle.scopedFetch('denied-app')('https://api.example.com/secret'),
    ).rejects.toThrow(/net:fetch denied/)
    expect(host.tracing.spans().find((s) => s.name.startsWith('fetch:'))).toBeUndefined()
    expect(host.monitor.metricsSnapshot()['net_ms']).toBeUndefined()
  })
})
