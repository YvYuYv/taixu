/**
 * 主缝测试：KillSwitch 急停（security §十）。
 * 签名指令通道（deny-by-default：未配置验签器/伪造签名一律拒绝 + violation）；
 * 禁用后加载路径强制（AppDisabledError，不重试）；运行实例销毁；
 * sessionStorage 持久化（刷新仍生效）；管理员显式恢复。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
  sessionStorage.clear()
})

describe('KillSwitch（§十）', () => {
  it('未配置验签器 = fail-closed：指令拒绝 + killswitch-forged violation；应用不受影响', async () => {
    const violations: string[] = []
    const host = createCordis({
      apps: [defineApp('k-app', () => ({ name: 'k-app', apply() {} }))],
    })
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })

    expect(await host.security.disableApp('k-app', 'ops', 'sig')).toBe(false)
    expect(violations).toContain('killswitch-forged')
    expect(host.security.isAppDisabled('k-app')).toBe(false)

    const inst = await host.lifecycle.mount('k-app', 'main') // 未禁用：正常挂载
    expect(host.lifecycle.getAppState(inst.instanceId)).toBe('active')
  })

  it('伪造签名拒绝；有效签名禁用：运行实例销毁 + 再挂载抛 AppDisabledError（不重试）', async () => {
    const violations: string[] = []
    const disposed: string[] = []
    // 假 HMAC：appId+action 哈希（测试注入；生产为受控密钥 HMAC）
    const sign = (appId: string, action: string) => `${appId}:${action}:ok`
    const host = createCordis({
      security: { verifyKillCommand: (appId, action, signature) => signature === sign(appId, action) },
      apps: [defineApp('k-app', () => ({ name: 'k-app', apply() {} }))],
    })
    await settle()
    host.on('security/violation', (e) => violations.push(e.rule), { global: true })
    host.on('app/disposed', (e) => disposed.push(e.appId), { global: true })

    expect(await host.security.disableApp('k-app', 'ops', 'wrong-sig')).toBe(false) // 伪造
    expect(violations).toContain('killswitch-forged')

    const inst = await host.lifecycle.mount('k-app', 'main')
    await settle()
    expect(await host.security.disableApp('k-app', '应急下线', sign('k-app', 'disable'))).toBe(true)
    await settle()
    expect(disposed).toEqual(['k-app']) // 运行实例销毁
    expect(host.lifecycle.getAppState(inst.instanceId)).toBe('disposed')
    expect(host.security.isAppDisabled('k-app')).toBe(true)

    await expect(host.lifecycle.mount('k-app', 'main')).rejects.toThrow(/disabled/) // 加载路径强制
  })

  it('持久化：新宿主（同会话）禁用仍生效；enableApp 显式恢复后可挂载', async () => {
    const sign = (appId: string, action: string) => `${appId}:${action}:ok`
    const mk = () =>
      createCordis({
        security: { verifyKillCommand: (appId, action, signature) => signature === sign(appId, action) },
        apps: [defineApp('k-app', () => ({ name: 'k-app', apply() {} }))],
      })
    const host1 = mk()
    await settle()
    expect(await host1.security.disableApp('k-app', 'ops', sign('k-app', 'disable'))).toBe(true)

    const host2 = mk() // 刷新（同 sessionStorage）
    await settle()
    expect(host2.security.isAppDisabled('k-app')).toBe(true) // 持久化生效
    await expect(host2.lifecycle.mount('k-app', 'main')).rejects.toThrow(/disabled/)

    expect(await host2.security.enableApp('k-app', sign('k-app', 'enable'))).toBe(true)
    const inst = await host2.lifecycle.mount('k-app', 'main') // 恢复后可挂载
    expect(host2.lifecycle.getAppState(inst.instanceId)).toBe('active')
  })
})
