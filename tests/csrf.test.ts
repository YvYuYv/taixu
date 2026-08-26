/**
 * 主缝测试：CSRF double-submit 客户端侧（security §七，P1）。
 * 写请求从受控 cookie（__Host-csrf，服务端登录下发）读取 token 附加 X-CSRF-Token
 * ——客户端不自造 token（废除旧版 crypto 自造存 sessionStorage）；GET 不附加；
 * 无 token 诚实降级不附加；不覆盖应用已设头/credentials；scopedFetch 唯一链路接线。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

let fetches: { url: string; init?: RequestInit }[] = []
const rawFetch = globalThis.fetch

beforeEach(() => {
  document.body.textContent = ''
  document.cookie = 'test-csrf=; Max-Age=0' // 清残留
  fetches = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetches.push({ url: String(input), init })
    return new Response('{}', { status: 200 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = rawFetch
})

describe('CSRF double-submit（§七）', () => {
  it('写请求附加 X-CSRF-Token（读 __Host-csrf cookie）；GET 不附加；已有头不覆盖', async () => {
    document.cookie = 'test-csrf=tok-123; path=/'
    const host = createCordis({ security: { csrfCookieName: 'test-csrf' } })
    await settle()

    const get = host.security.applyCsrf('https://api.example.com/x')
    expect(get?.headers).toBeUndefined() // GET：不附加

    const post = host.security.applyCsrf('https://api.example.com/x', { method: 'POST' })!
    expect(new Headers(post.headers).get('X-CSRF-Token')).toBe('tok-123')

    const keep = host.security.applyCsrf('https://api.example.com/x', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'app-set' },
    })!
    expect(new Headers(keep.headers).get('X-CSRF-Token')).toBe('app-set') // 应用已设：不覆盖

    const del = host.security.applyCsrf('https://api.example.com/x', { method: 'DELETE' })!
    expect(new Headers(del.headers).get('X-CSRF-Token')).toBe('tok-123') // DELETE 同为写请求
  })

  it('无 cookie 诚实降级：不附加（服务端 double-submit 将拒绝——客户端不伪造）', async () => {
    const host = createCordis({ security: { csrfCookieName: 'test-csrf' } })
    await settle()
    const post = host.security.applyCsrf('https://api.example.com/x', { method: 'POST' })
    expect(new Headers(post?.headers).get('X-CSRF-Token')).toBeNull()
  })

  it('Request 对象：方法/自身头保留 + token 合并（不丢 method/body/headers）', async () => {
    document.cookie = 'test-csrf=tok-123; path=/'
    const host = createCordis({ security: { csrfCookieName: 'test-csrf' } })
    await settle()

    const req = new Request('https://api.example.com/put', {
      method: 'PUT',
      headers: { 'X-Custom': 'v' },
    })
    const init = host.security.applyCsrf(req)!
    const headers = new Headers(init.headers)
    expect(headers.get('X-CSRF-Token')).toBe('tok-123')
    expect(headers.get('X-Custom')).toBe('v') // 自身头保留
    expect(init.method).toBeUndefined() // method 仍由 Request 承载（init 不夺走）
  })

  it('scopedFetch 唯一链路接线：授权应用 POST 自动附 token，credentials 保留应用设置', async () => {
    document.cookie = 'test-csrf=tok-123; path=/'
    const host = createCordis({
      security: { csrfCookieName: 'test-csrf' },
      permissions: [
        { appId: 'csrf-app', allow: ['net:fetch'] },
      ],
      apps: [
        defineApp('csrf-app', () => ({
          name: 'csrf-app',
          apply() {},
        })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('csrf-app', 'main')
    await settle()

    // 应用侧经 scopedFetch（唯一 fetch 链路，ADR-0005）：宿主经 security 裁决后附加 token
    const scoped = host.lifecycle.scopedFetch('csrf-app')
    await scoped('https://api.example.com/data', { method: 'POST', credentials: 'include' })
    expect(fetches).toHaveLength(1)
    const headers = new Headers(fetches[0]!.init?.headers)
    expect(headers.get('X-CSRF-Token')).toBe('tok-123') // 自动附加
    expect(fetches[0]!.init?.credentials).toBe('include') // 不覆盖 credentials（§七尾条）
    await host.lifecycle.destroy(inst.instanceId, 't')
  })
})
