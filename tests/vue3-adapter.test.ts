/**
 * 主缝测试：Vue 3 参考适配器 + 样式节点登记（04 号票）。
 *
 * 主缝 = createCordis() + defineApp(defineCordisApp({ rootComponent })) + lifecycle.mount()。
 * 语义源：style-isolation.md §六（样式生命周期/双通道登记 ADR-0033/0042）、
 * heterogeneous-loading.md §四（适配器：mount/unmount 包成一次 effect）。
 */
import { describe, it, expect } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createCordis, defineApp, defineCordisApp } from '../src'

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

const HelloApp = defineComponent({
  setup() {
    const count = ref(0)
    return () => h('div', { class: 'hello-app' }, [`count: ${count.value}`])
  },
})

/** 清点全局 DOM 残留（style/link/script 与应用容器） */
function domResidue(): number {
  return (
    document.querySelectorAll('style, link[rel="stylesheet"], script').length +
    document.querySelectorAll('[id^="tx-"]').length
  )
}

describe('defineCordisApp：Vue 3 参考适配器', () => {
  it('一行声明接入：rootComponent 渲染进槽位容器', async () => {
    const host = createCordis({
      apps: [defineApp('hello-app', () => defineCordisApp({ appId: 'hello-app', rootComponent: HelloApp }))],
    })
    await settle()
    const before = domResidue()
    const instance = await host.lifecycle.mount('hello-app', 'main')
    await settle() // Vue 渲染异步

    const el = instance.container.querySelector('.hello-app')
    expect(el).not.toBeNull()
    expect(el?.textContent).toBe('count: 0')

    await host.lifecycle.destroy(instance.instanceId, 'test')
    await settle()
    expect(domResidue()).toBe(before) // 卸载零残留
  })

  it('主缝断言：挂载/卸载全程 DOM 与监听零残留', async () => {
    // 应用经 ctx.effect 注册 document 监听 + 适配器渲染 DOM --
    // dispose 后两者必须随 effect 回收（jsdom 无 getEventListeners，以探测事件派发验证）
    let heard = 0
    const ListeningApp = defineComponent({
      setup() {
        return () => h('div', { class: 'listening-app' }, 'x')
      },
    })
    const host = createCordis({
      apps: [
        defineApp('listening-app', () => {
          const plugin = defineCordisApp({ appId: 'listening-app', rootComponent: ListeningApp })
          const origApply = plugin.apply.bind(plugin)
          return {
            ...plugin,
            apply(ctx: import('cordis').Context) {
              const onPing = () => {
                heard++
              }
              document.addEventListener('ping-probe', onPing)
              ctx.effect(() => () => document.removeEventListener('ping-probe', onPing))
              origApply(ctx as never, undefined as never)
            },
          }
        }),
      ],
    })
    await settle()
    const instance = await host.lifecycle.mount('listening-app', 'main')
    await settle()
    document.dispatchEvent(new Event('ping-probe'))
    expect(heard).toBe(1) // 挂载态监听在

    await host.lifecycle.destroy(instance.instanceId, 'test')
    await settle()
    document.dispatchEvent(new Event('ping-probe'))
    expect(heard).toBe(1) // dispose 后监听已解绑（计数不增）= 监听零残留
    expect(domResidue()).toBe(0)
  })

  it('mount/unmount 包成一次 effect：dispose 自动回收（无第二套生命周期）', async () => {
    const host = createCordis({
      apps: [defineApp('hello-app', () => defineCordisApp({ appId: 'hello-app', rootComponent: HelloApp }))],
    })
    await settle()
    const instance = await host.lifecycle.mount('hello-app', 'main')
    await settle()
    expect(instance.container.querySelector('.hello-app')).not.toBeNull()

    // 经 lifecycle.destroy（fiber dispose -> effect 逆序）触发 unmount，非适配器自毁
    await host.lifecycle.destroy(instance.instanceId, 'test')
    await settle()
    expect(document.querySelector('.hello-app')).toBeNull()
  })

  it('Vue 渲染错误经 app.config.errorHandler 统一转发 monitor.capture（appId 归因）', async () => {
    const captured: Array<{ appId?: string; phase?: string }> = []
    // setup 抛错从根组件直冒 app.config.errorHandler（无中间 onErrorCaptured 拦截--
    // 返回 false 的 onErrorCaptured 会吞掉错误，errorHandler 收不到，那是应用的裁决权）
    const Boom = defineComponent({
      setup() {
        throw new Error('vue render boom')
      },
      render() {
        return h('div')
      },
    })
    const host = createCordis({
      apps: [defineApp('boom-vue', () => defineCordisApp({ appId: 'boom-vue', rootComponent: Boom }))],
      recovery: { maxRetries: 0 },
    })
    await settle()
    host.on('monitor/report', (p) => captured.push({ appId: p.metric.appId, phase: p.metric.phase }), { global: true })

    const instance = await host.lifecycle.mount('boom-vue', 'main')
    await settle()
    await host.lifecycle.destroy(instance.instanceId, 'test')
    expect(captured.some((c) => c.appId === 'boom-vue' && c.phase === 'runtime')).toBe(true)
  })
})

describe('样式双通道登记（ADR-0033/0042）', () => {
  it('显式 API：ctx.style.inject 注册 style/link，dispose 逆序移除', async () => {
    const StyledApp = defineCordisApp({
      appId: 'styled-app',
      rootComponent: HelloApp,
      styles: [{ file: 'main.css', css: '.styled-app { color: red }' }],
    })
    const host = createCordis({ apps: [defineApp('styled-app', () => StyledApp)] })
    await settle()
    const instance = await host.lifecycle.mount('styled-app', 'main')
    await settle()

    // 注入并打标（style-isolation §七：dataset.cordisApp 供 HMR 定位）
    const styleEl = document.querySelector<HTMLStyleElement>('style[data-cordis-app="styled-app"]')
    expect(styleEl).not.toBeNull()
    expect(styleEl?.textContent).toContain('.styled-app')

    await host.lifecycle.destroy(instance.instanceId, 'test')
    await settle()
    expect(document.querySelector('style[data-cordis-app="styled-app"]')).toBeNull()
  })

  it('自动兜底：经沙箱 document.head.appendChild 的样式节点自动登记、dispose 移除', async () => {
    // 第三方库在挂载后经沙箱 document 代理注入 head 样式（对库透明，ADR-0042）
    const host = createCordis({
      apps: [defineApp('rogue-lib-app', () => defineCordisApp({ appId: 'rogue-lib-app', rootComponent: HelloApp }))],
    })
    await settle()
    const instance = await host.lifecycle.mount('rogue-lib-app', 'main')
    const rogueStyle = document.createElement('style')
    rogueStyle.textContent = '.rogue { color: blue }'
    const doc = instance.sandbox!.proxy.document as unknown as Document
    doc.head.appendChild(rogueStyle)
    await settle()
    // 已记账：经沙箱代理的注入被 tracker 捕获
    expect(instance.sandbox!.injectedNodes()).toContain(rogueStyle)

    await host.lifecycle.destroy(instance.instanceId, 'test')
    await settle()
    expect(document.head.contains(rogueStyle)).toBe(false) // dispose 连带移除记账节点
  })
})

describe('重跑语义（服务替换/HMR 预演）', () => {
  it('unmount 校验容器已清空，防重跑双挂载', async () => {
    let mounts = 0
    const Counting = defineComponent({
      setup() {
        mounts++
        return () => h('div', { class: 'counting-app' }, 'x')
      },
    })
    const host = createCordis({
      apps: [defineApp('counting-app', () => defineCordisApp({ appId: 'counting-app', rootComponent: Counting }))],
    })
    await settle()

    const i1 = await host.lifecycle.mount('counting-app', 'main')
    await settle()
    expect(mounts).toBe(1)
    await host.lifecycle.destroy(i1.instanceId, 'test')

    // 重跑 = 新挂载事务（同槽位，容器复用同一宿主节点）
    const i2 = await host.lifecycle.mount('counting-app', 'main')
    await settle()
    expect(mounts).toBe(2)
    // 容器内只有一个应用根（无双挂载残留）
    const roots = i2.container.querySelectorAll('.counting-app')
    expect(roots.length).toBe(1)
    await host.lifecycle.destroy(i2.instanceId, 'test')
  })
})
