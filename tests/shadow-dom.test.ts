/**
 * 主缝测试：Shadow DOM 路线（style-isolation §4.1/§4.2，P1）。
 * shadow 应用：容器挂 open shadowRoot；style.inject 注入 shadow（不进 head），
 * Constructable Stylesheets 优先（工厂注入）+ 能力缺失降级 style 节点；HMR 同 file
 * 热替换（replaceSync/替换文本）；Portal 容器（Shadow 外、容器旁，随实例销毁移除）。
 * 非 shadow 应用照旧 head 注入。
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
})

/** 假 Constructable Stylesheet（jsdom 缺失 CSSStyleSheet；经 style.sheetFactory 注入主缝） */
class FakeSheet implements CSSStyleSheetLike {
  static created: FakeSheet[] = []
  css = ''
  replaceCount = 0
  constructor() {
    FakeSheet.created.push(this)
  }
  replaceSync(css: string) {
    this.css = css
    this.replaceCount++
  }
}

describe('Shadow DOM 路线（§4.1）', () => {
  it('shadow 应用：容器在 open shadowRoot 内；样式注入 shadow 不进 head', async () => {
    const host = createCordis({
      apps: [defineApp('shadow-app', () => ({ name: 'shadow-app', inject: ['style'], apply() {} }), { shadow: true })],
    })
    await settle()
    const inst = await host.lifecycle.mount('shadow-app', 'main')
    await settle()

    const root = inst.container.getRootNode()
    expect(root).toBeInstanceOf(ShadowRoot)
    expect((root as ShadowRoot).mode).toBe('open')

    host.style.inject(inst.ctx, { file: 'app.css', css: '.btn{color:red}' })
    const shadowStyle = (root as ShadowRoot).querySelector('style[data-cordis-app="shadow-app"]')
    expect(shadowStyle).toBeTruthy() // 降级路径（jsdom 无 CSSStyleSheet）：style 节点入 shadow
    expect(shadowStyle!.textContent).toContain('.btn')
    expect(document.head.querySelector('style[data-cordis-app="shadow-app"]')).toBeNull() // 不进 head

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('非 shadow 应用照旧 head 注入（无回归）', async () => {
    const host = createCordis({
      apps: [defineApp('light-app', () => ({ name: 'light-app', inject: ['style'], apply() {} }))],
    })
    await settle()
    const inst = await host.lifecycle.mount('light-app', 'main')
    await settle()

    host.style.inject(inst.ctx, { file: 'app.css', css: '.a{}' })
    expect(document.head.querySelector('style[data-cordis-app="light-app"]')).toBeTruthy()
    expect(inst.container.getRootNode()).toBe(document)

    await host.lifecycle.destroy(inst.instanceId, 't')
  })

  it('Constructable 优先（工厂注入）：adoptedStyleSheets 更新零 style 节点；HMR 同 file replaceSync 不叠加', async () => {
    FakeSheet.created = []
    const host = createCordis({
      style: { sheetFactory: () => new FakeSheet() },
      apps: [defineApp('cs-app', () => ({ name: 'cs-app', inject: ['style'], apply() {} }), { shadow: true })],
    })
    await settle()
    const inst = await host.lifecycle.mount('cs-app', 'main')
    await settle()
    const root = inst.container.getRootNode() as ShadowRoot

    host.style.inject(inst.ctx, { file: 'a.css', css: '.x{}' })
    expect(FakeSheet.created).toHaveLength(1)
    expect(FakeSheet.created[0]!.css).toBe('.x{}')
    expect(root.querySelectorAll('style').length).toBe(0) // 零 style 节点

    host.style.inject(inst.ctx, { file: 'a.css', css: '.x{color:blue}' }) // HMR 热替换
    expect(FakeSheet.created).toHaveLength(1) // 不叠加
    expect(FakeSheet.created[0]!.replaceCount).toBe(2)
    expect(FakeSheet.created[0]!.css).toBe('.x{color:blue}')

    host.style.inject(inst.ctx, { file: 'b.css', css: '.y{}' }) // 不同 file 新 sheet
    expect(FakeSheet.created).toHaveLength(2)

    await host.lifecycle.destroy(inst.instanceId, 't') // effect 逆序移除
  })

  it('挂起摘除语义（§六）：shadow 样式随宿主摘除自动缓存；resume 还回零丢失', async () => {
    const host = createCordis({
      apps: [defineApp('susp-app', () => ({ name: 'susp-app', inject: ['style'], apply() {} }), { shadow: true })],
    })
    await settle()
    const inst = await host.lifecycle.mount('susp-app', 'main')
    await settle()
    const root = inst.container.getRootNode() as ShadowRoot
    host.style.inject(inst.ctx, { file: 'a.css', css: '.s{}' })
    const styleNode = root.querySelector('style[data-cordis-app="susp-app"]')!

    await host.lifecycle.requestSuspend(host, inst.instanceId, 'keepalive', 'route')
    await settle()
    expect(root.host.isConnected).toBe(false) // 宿主（连带 shadow 与其内样式）摘除缓存
    // 注：styleNode.isConnected 在 jsdom 对已摘除 shadow 树的报告不可靠，以宿主为准

    await host.lifecycle.requestResume(host, inst.instanceId, 'route') // 路由优先级恢复清除 route 挂起源
    await settle()
    expect(root.host.isConnected).toBe(true) // 还回：样式节点零丢失
    expect(root.querySelector('style[data-cordis-app="susp-app"]')).toBe(styleNode)
  })

  it('Portal 容器（§4.2）：Shadow 外、容器旁；同实例复用；销毁移除', async () => {
    let appCtx!: Context
    const host = createCordis({
      apps: [
        defineApp(
          'portal-app',
          () => ({
            name: 'portal-app',
            inject: ['lifecycle'],
            apply(ctx: Context) {
              appCtx = ctx
            },
          }),
          { shadow: true },
        ),
      ],
    })
    await settle()
    const inst = await host.lifecycle.mount('portal-app', 'main')
    await settle()

    const portal = host.lifecycle.getPortalContainer(appCtx)
    expect(portal.dataset.txPortal).toBe('portal-app')
    expect(portal.getRootNode()).toBe(document) // Shadow 外（文档级）
    const containerRoot = inst.container.getRootNode()
    expect(portal.previousSibling).toBe(containerRoot instanceof ShadowRoot ? containerRoot.host : inst.container) // 容器旁

    expect(host.lifecycle.getPortalContainer(appCtx)).toBe(portal) // 同实例复用

    await host.lifecycle.destroy(inst.instanceId, 't')
    expect(document.querySelector('[data-tx-portal="portal-app"]')).toBeNull() // 销毁移除
  })
})
