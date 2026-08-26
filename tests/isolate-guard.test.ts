/**
 * 主缝测试：isolate 白名单守卫的覆盖面（ADR-0010，A5）。
 * 守卫以 own property 装在 root ctx；一切经 Object.create 原型链派生的 ctx
 * （extend/isolate 产物、应用 fiber ctx）取 isolate 均落到同一包装——无绕行面。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
})

describe('isolate 守卫覆盖面（ADR-0010，A5）', () => {
  it('派生 ctx（extend/isolate 产物与应用 fiber ctx）上的非白名单 isolate 全部被拦', async () => {
    const violations: string[] = []
    let appCtx!: Context
    const host = createCordis({
      apps: [
        defineApp('iso-guard-app', () => ({
          name: 'iso-guard-app',
          apply(ctx: Context) {
            appCtx = ctx
          },
        })),
      ],
    })
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    // root 直接调用
    expect(() => host.isolate('state' as never)).toThrow(/not whitelisted/)

    // extend 派生（Object.create 原型链）
    const derived = host.extend({ tag: 1 }) as Context
    expect(() => derived.isolate('evil' as never)).toThrow(/not whitelisted/)

    // 白名单 isolate 的产物（二级派生）上再调用
    const iso = host.isolate('router-view')
    expect(() => (iso as Context).isolate('monitor-clone' as never)).toThrow(/not whitelisted/)

    // 应用 fiber ctx（挂载事务产物）
    const inst = await host.lifecycle.mount('iso-guard-app', 'main')
    await settle()
    expect(() => appCtx.isolate('state' as never)).toThrow(/not whitelisted/)
    expect(appCtx.isolate('router-view')).toBeTruthy() // 白名单照常可用

    expect(violations.filter((r) => r === 'isolate-non-whitelisted').length).toBeGreaterThanOrEqual(4) // 全部留痕
    await host.lifecycle.destroy(inst.instanceId, 't')
  })
})
