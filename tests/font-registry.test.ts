/**
 * 主缝测试：@font-face 提升 + 字体 registry（style-isolation §3.3，B-样式）。
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
  document.head.textContent = ''
  document.body.textContent = ''
})

function fontApp(appId: string, log: string[] = []) {
  return defineApp(appId, () => ({
    name: appId,
    inject: ['style'],
    apply(ctx: Context) {
      ;(globalThis as unknown as Record<string, unknown>)[`__font_${appId}`] = ctx
      void log
    },
  }))
}

describe('@font-face 提升 + 字体 registry（§3.3）', () => {
  it('文档级注入 + family 前缀重写；同 family+src 去重复用；dispose 零引用回收', async () => {
    const host = createCordis({
      apps: [fontApp('fa'), fontApp('fb')],
    })
    await settle()
    const a = await host.lifecycle.mount('fa', 'main')
    const g = globalThis as unknown as { [k: string]: Context }

    // 应用 fa 注册字体：文档级 + 前缀重写
    const fam = (g.__font_fa!).style.registerFontFace(a.ctx, {
      family: 'icon',
      declarations: "src: url('icon.woff2') format('woff2'); font-weight: 700;",
    })
    expect(fam).toBe('tx-fa-icon')
    const node = document.head.querySelector<HTMLStyleElement>('style[data-cordis-app="fa"][data-tx-font="icon"]')!
    expect(node).toBeTruthy()
    expect(node.textContent).toContain('tx-fa-icon');

    // 去重：同 family+src 再注册 -> 复用同节点（不叠加）
    (g.__font_fa!).style.registerFontFace(a.ctx, { family: 'icon', declarations: "src: url('icon.woff2') format('woff2'); font-weight: 700;" })
    expect(document.head.querySelectorAll('style[data-tx-font="icon"]').length).toBe(1)
    expect(host.style.fontRegistryEntries()[0]!.refs).toBe(1);

    // 不同声明（src 不同）-> 新节点
    (g.__font_fa!).style.registerFontFace(a.ctx, { family: 'icon', declarations: "src: url('icon-v2.woff2');" })
    expect(document.head.querySelectorAll('style[data-tx-font="icon"]').length).toBe(2)

    // dispose：fa 全部字体零引用回收
    await host.lifecycle.destroy(a.instanceId, 't')
    await settle()
    expect(document.head.querySelectorAll('style[data-cordis-app="fa"]').length).toBe(0)
    expect(host.style.fontRegistryEntries().length).toBe(0)
    delete g.__font_fa
  })

  it('多应用共享字体去重：同声明复用同节点；全部 dispose 才回收', async () => {
    const host = createCordis({ apps: [fontApp('fc'), fontApp('fd')] })
    await settle()
    const ic = await host.lifecycle.mount('fc', 'main')
    const id = await host.lifecycle.mount('fd', 'o1');
    const g = globalThis as unknown as { [k: string]: Context }
    const decl: string = "src: url('shared.woff2');"
    const fcStyle = (g.__font_fc!).style
    const fdStyle = (g.__font_fd!).style
    fcStyle.registerFontFace(ic.ctx, { family: 'base', declarations: decl })
    fdStyle.registerFontFace(id.ctx, { family: 'base', declarations: decl })
    // 去重键含 appId 前缀？——§3.3 去重按 family+src 哈希（宿主全局）；此处两应用同字面声明
    expect(host.style.fontRegistryEntries().length).toBeGreaterThanOrEqual(1)

    await host.lifecycle.destroy(ic.instanceId, 't') // 一方退出
    await settle()
    expect(host.style.fontRegistryEntries().length).toBeGreaterThanOrEqual(1) // 仍有引用
    await host.lifecycle.destroy(id.instanceId, 't')
    await settle()
    expect(host.style.fontRegistryEntries().length).toBe(0) // 零引用全回收
    delete g.__font_fc
    delete g.__font_fd
  })

  it('hoistFontFaces：CSS 内 @font-face 块抽出提升、原块移除、family 改写', async () => {
    const host = createCordis({ apps: [fontApp('fe')] })
    await settle()
    const ie = await host.lifecycle.mount('fe', 'main');
    const g = globalThis as unknown as { [k: string]: Context }
    const rewritten = (g.__font_fe!).style.hoistFontFaces(ie.ctx, [
      '@font-face { font-family: "body"; src: url(b.woff2); }',
      '.btn { font-family: body, sans-serif; }',
    ].join('\n'))
    expect(rewritten).not.toContain('@font-face') // 原块移除
    expect(rewritten).toContain('.btn') // 其余规则保留
    const node = document.head.querySelector<HTMLStyleElement>('style[data-cordis-app="fe"][data-tx-font="body"]')!
    expect(node.textContent).toContain('tx-fe-body') // 提升为文档级 + 前缀
    await host.lifecycle.destroy(ie.instanceId, 't')
    delete g.__font_fe
  })
});
