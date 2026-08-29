/**
 * 主缝测试：DevTools 聚合 + 命令通道 + HMR（monitoring §十 / lifecycle §5.5 ADR-0037，P1）。
 * snapshot 复用各服务查询面（唯一数据源）；execute 走各服务既有入口（deny-by-default）；
 * HMR：css-only 热替换（同节点替换文本/constructable replaceSync）、fiber 重跑暖启动
 * （apply 重执行、local: 键空间不丢）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Context } from 'cordis'
import { createCordis, defineApp, type CSSStyleSheetLike } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => {
  document.body.textContent = ''
  document.head.textContent = ''
  sessionStorage.clear()
})

class FakeSheet implements CSSStyleSheetLike {
  css = ''
  replaceCount = 0
  replaceSync(css: string) {
    this.css = css
    this.replaceCount++
  }
}

describe('DevTools（§十）', () => {
  it('snapshot 只读聚合：实例/指标/DLQ/字体（复用各服务查询面）', async () => {
    const host = createCordis({
      permissions: [{ appId: 'dt-app', allow: ['state:read:shared:x', 'state:write:shared:x'] }],
      apps: [
        defineApp('dt-app', () => ({
          name: 'dt-app',
          inject: ['style', 'state'],
          apply(ctx: Context) {
            ctx.style.inject(ctx, { file: 'a.css', css: '.a{}' })
            ctx.state.set('shared:x', 1, { appId: 'dt-app' })
          },
        })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('dt-app', 'main')
    await settle()

    host.monitor.capture(new Error('dt-boom'), { appId: 'dt-app', phase: 'runtime' })
    const snap = host.devtools.snapshot()
    expect(snap.instances).toEqual([{ appId: 'dt-app', instanceId: inst.instanceId, state: 'active' }])
    expect(snap.metrics['state_change']).toBeTruthy() // 指标（monitor 采集复用）
    expect(snap.deadLetters).toEqual([])
    expect(snap.fonts).toEqual([])
    // 错误清单（§十，F4）：stack 直出（capture 入库前已过 sourcemap 管线，未配管线即原始栈）
    expect(snap.errors).toEqual([
      { message: 'dt-boom', appId: 'dt-app', phase: 'runtime', stack: expect.stringContaining('dt-boom') },
    ])
    expect(snap.leakSuspects).toEqual([])

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('命令通道：instance/destroy 走 lifecycle 既有入口；未知命令显式拒绝', async () => {
    const host = createCordis({
      apps: [defineApp('cmd-app', () => ({ name: 'cmd-app', apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('cmd-app', 'main')
    await settle()

    await host.devtools.execute({ type: 'instance/destroy', instanceId: inst.instanceId })
    expect(host.lifecycle.getAppState(inst.instanceId)).toBe('disposed')

    await expect(host.devtools.execute({ type: 'nonsense' } as never)).rejects.toThrow(/unsupported command/)
  })
})

describe('HMR（ADR-0037 / style-isolation §七）', () => {
  it('css-only 热替换：同节点替换 textContent（不叠加）；目标缺失显式错误', async () => {
    const host = createCordis({
      apps: [defineApp('hmr-app', () => ({ name: 'hmr-app', inject: ['style'], apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('hmr-app', 'main')
    await settle()
    host.style.inject(inst.ctx, { file: 'btn.css', css: '.btn{color:red}' })
    const node = document.head.querySelector<HTMLStyleElement>('style[data-cordis-app="hmr-app"][data-file="btn.css"]')!

    host.hmr.cssUpdate({ appId: 'hmr-app', file: 'btn.css', css: '.btn{color:blue}' })
    expect(node.textContent).toBe('.btn{color:blue}') // 同节点替换
    expect(document.head.querySelectorAll('style[data-file="btn.css"]').length).toBe(1) // 不叠加

    // 活实例 + 未注入 file：走同 file 重注入语义（新节点，HMR 首注入）
    host.hmr.cssUpdate({ appId: 'hmr-app', file: 'new.css', css: '.n{}' })
    expect(document.head.querySelector('style[data-cordis-app="hmr-app"][data-file="new.css"]')).toBeTruthy()

    await host.lifecycle.destroy(inst.instanceId, 't')
    await settle()
    expect(() => host.hmr.cssUpdate({ appId: 'hmr-app', file: 'ghost.css', css: '' })).toThrow(/no style target/)
  })

  it('Shadow 路线 constructable：cssUpdate 经同 file 重注入走 replaceSync', async () => {
    const host = createCordis({
      style: { sheetFactory: () => new FakeSheet() },
      apps: [defineApp('hmr-cs', () => ({ name: 'hmr-cs', inject: ['style'], apply() {} }), { shadow: true })],
    })
    await settle()
    const inst = await host.lifecycle.mount('hmr-cs', 'main')
    await settle()
    host.style.inject(inst.ctx, { file: 'x.css', css: '.x{}' })
    host.hmr.cssUpdate({ appId: 'hmr-cs', file: 'x.css', css: '.x{color:green}' })
    const root = inst.container.getRootNode() as ShadowRoot
    expect(root.querySelectorAll('style').length).toBe(0) // 仍是 constructable（未降级加节点）

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('fullReload：fiber 重跑（apply 重执行 = 整应用重挂载）；local 键空间暖启动不丢', async () => {
    let applyRuns = 0
    const host = createCordis({
      permissions: [{ appId: 'reload-app', allow: ['state:write:local:reload-app:x', 'state:read:local:reload-app:x'] }],
      apps: [
        defineApp('reload-app', () => ({
          name: 'reload-app',
          inject: ['state'],
          apply(ctx: Context) {
            applyRuns++
            if (applyRuns > 1) {
              ctx.state.set('local:reload-app:x', applyRuns, { appId: 'reload-app' }) // 重跑可见旧值延续
            }
          },
        })),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('reload-app', 'main')
    await settle()
    host.state.set('local:reload-app:x', 42, { appId: 'reload-app' }) // host 同义授权写

    await host.hmr.fullReload(inst.instanceId)
    await settle()
    await settle()

    expect(applyRuns).toBe(2) // effect 回滚 + 重新执行
    expect(host.lifecycle.getAppState(inst.instanceId)).toBe('active') // 同实例仍活
    expect(host.state.get('local:reload-app:x')).toBe(2) // 键空间持久（暖启动）且 apply 可写
  })
})
