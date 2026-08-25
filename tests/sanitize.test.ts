/**
 * 主缝测试：HTML 真 sanitize（security §3.3，B-安全）——DOMPurify + 沙箱 document HTML 写点接线。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createCordis, defineApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

beforeEach(() => { document.body.textContent = '' })

describe('security.sanitizeHTML（§3.3）', () => {
  it('事件属性/脚本净除、良性标记保留；dangerousTags/dangerousAttributes 配置真实生效', async () => {
    const host = createCordis({
      security: { sanitize: { dangerousTags: ['marquee'], dangerousAttributes: ['data-track'] } },
      apps: [defineApp('s1', () => ({ name: 's1', apply() {} }))],
    })
    await settle()
    // 事件属性净除 + 良性保留
    expect(host.security.sanitizeHTML('<img src="x" onerror="alert(1)"><b>ok</b>')).toBe('<img src="x"><b>ok</b>')
    // 脚本净除
    expect(host.security.sanitizeHTML('<script>evil()</script><i>keep</i>')).toBe('<i>keep</i>')
    // 配置真实传入：自定黑名单生效
    expect(host.security.sanitizeHTML('<marquee>x</marquee><b>y</b>')).toBe('x<b>y</b>') // 标签净除、内容保留（DOMPurify FORBID 语义）
    expect(host.security.sanitizeHTML('<span data-track="z">t</span>')).toBe('<span>t</span>')
  })
})

describe('沙箱 document HTML 写点接线', () => {
  it('应用经 innerHTML/insertAdjacentHTML 写入的内容全过净化（XSS 纵深）', async () => {
    const host = createCordis({ apps: [defineApp('s2', () => ({ name: 's2', apply() {} }))] })
    await settle()
    const instance = await host.lifecycle.mount('s2', 'main')
    const doc = instance.sandbox!.proxy.document as Document

    const div = doc.createElement('div')
    div.innerHTML = '<img src=x onerror=alert(1)><b>ok</b>'
    expect(div.innerHTML).toBe('<img src="x"><b>ok</b>') // 事件属性净除

    const host2 = doc.body
    host2.insertAdjacentHTML('beforeend', '<script>evil()</script><i>keep</i>')
    expect(host2.querySelector('script')).toBeNull() // 脚本未注入
    expect(host2.querySelector('i')?.textContent).toBe('keep')
  })
})
