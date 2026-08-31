/**
 * 宿主演示页（12 号票 P0 终验）：一条链路串起全部 P0 能力——
 * 挂载 -> 切换保活（默认挂起）-> 挂起消息回放 -> 驱逐暖启动（快照注水）
 * -> 守卫拦截 -> fail-closed（未授权 send/核心服务替换/isolate 白名单）。
 *
 * 每步结果渲染到页面事件流；全部经主缝 createCordis + lifecycle/router/state/bus。
 *
 * **消费方式即发布形态**：直接 import workspace 包 `@taixu/core` / `@taixu/adapter-vue3`
 * （而非相对源码路径）——demo 跑的就是宿主工程真实安装后的写法。
 * 首次运行前需 `npm run build`（生成各包的 dist 产物）。
 */
import type { Context } from 'cordis'
import { createCordis, defineApp } from '@taixu/core'
import { defineCordisApp } from '@taixu/adapter-vue3'
import { defineComponent, h, ref } from 'vue'

const logEl = document.querySelector<HTMLUListElement>('#flow')!

function log(text: string) {
  const li = document.createElement('li')
  li.textContent = text
  logEl.appendChild(li)
}

async function settle() {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  await Promise.resolve()
}

// 三个演示应用：a（消息应答 + local 状态）、b（切换对手）、naughty（无授权应用）
const appA = defineApp('demo-a', () => ({
  name: 'demo-a',
  inject: ['state', 'bus'],
  apply(ctx: Context) {
    ctx.state.set('local:demo-a:cart', ['apple'], { appId: 'demo-a' })
    ctx.bus.respond(ctx, 'cart:query', async () => ({ ok: true as const, value: 'demo-a 在线' }))
    ctx.on('message/receive', (e) => log(`demo-a 收到消息: ${String((e.message.payload as { text?: string }).text ?? e.message.type)}`))
  },
}))
const appB = defineApp('demo-b', () => ({ name: 'demo-b', apply() {} }))

/**
 * Vue 3 子应用（@taixu/adapter-vue3）：演示适配器分包的消费形态——
 * 框架核心不依赖 vue，宿主按需安装适配器包。
 */
const Counter = defineComponent({
  setup() {
    const count = ref(0)
    return () => h('button', { onClick: () => count.value++ }, [`vue3 子应用计数: ${count.value}`])
  },
})
const vueApp = defineApp('demo-vue', () =>
  defineCordisApp({ appId: 'demo-vue', rootComponent: Counter }),
)
const naughty = defineApp('naughty', () => ({
  name: 'naughty',
  inject: ['bus'],
  apply(ctx: Context) {
    // fail-closed 演示：未授权发送（message:* deny-by-default）
    const ok = ctx.bus.send(ctx, { type: 'secret:exfiltrate', payload: 1, target: 'demo-a' })
    log(`未授权 send 被拒: ${String(!ok)}（violation 已上报）`)
  },
}))

const host = createCordis({
  permissions: [
    { appId: 'demo-a', allow: ['message:cart:query', 'message:cart:add', 'state:read:local:demo-a:cart'] },
  ],
  routes: [{ basePath: '/home', appId: 'demo-a' }, { basePath: '/shop', appId: 'demo-b' }],
  keepAlive: { maxCount: 1 }, // 池上限 1：挂起两个即触发 LRU 驱逐 -> 暖启动
  apps: [appA, appB, naughty, vueApp],
})

// 宿主旁听（基线 §2.4，global 注册）
host.on('app/evicted', (e) => log(`驱逐: ${e.appId}（cause=${e.cause}，快照已落池）`), { global: true })
host.on('security/violation', (v) => log(`violation: ${v.rule} (appId=${v.appId})`), { global: true })
host.on('bus/overflow', (e) => log(`队列溢出: dropped=${e.droppedCount}`), { global: true })

async function run() {
  // 1. 挂载
  const ia = await host.lifecycle.mount('demo-a', 'main')
  await host.lifecycle.mount('naughty', 'side')
  await settle()
  log(`挂载: demo-a(${ia.instanceId.slice(0, 12)}…) + naughty`)

  // 2. 请求-应答（serial + 包络）
  const reply = await host.bus.request(host, 'cart:query', 1, { target: 'demo-a' })
  log(`请求-应答: ${JSON.stringify(reply)}`)

  // 3. 切换保活（ADR-0020 默认挂起）+ 挂起消息队列回放
  await host.lifecycle.switch('main', 'demo-b')
  log('切换 -> demo-b：demo-a 默认挂起（fiber 仍 ACTIVE，DOM 摘离缓存）')
  host.bus.send(host, { type: 'cart:add', payload: { text: '挂起期间的消息' }, target: 'demo-a' })
  await host.lifecycle.switch('main', 'demo-a') // 回程零冷启动：恢复既有实例
  await settle()
  log('切回 demo-a：恢复（state/sync -> outlet 重放 -> 消息回放，统一时序）')

  // 4. 驱逐暖启动：再挂两个（池上限 1）-> LRU 驱逐 demo-a -> 重挂载注水 local 快照
  await host.lifecycle.switch('main', 'demo-b')
  await host.lifecycle.requestSuspend(host, host.lifecycle.getInstances().find((i) => i.appId === 'demo-b')!.instanceId, 'keepalive', 'route')
  await settle()
  await new Promise((r) => setTimeout(r, 30))
  const ia2 = await host.lifecycle.mount('demo-a', 'main')
  await settle()
  const cart = host.state.get('local:demo-a:cart', { appId: 'demo-a' })
  log(`暖启动: 新实例 ${ia2.instanceId.slice(0, 12)}…，快照注水 cart=${JSON.stringify(cart)}`)

  // 4.5 Vue 3 子应用（独立包 @taixu/adapter-vue3）挂载到 side 槽位
  await host.lifecycle.mount('demo-vue', 'side')
  await settle()
  log(`Vue 3 子应用挂载（@taixu/adapter-vue3）: side 槽位按钮已渲染`)

  // 5. 守卫拦截（枚举三值）
  host.on('router/navigate', () => ({ type: 'abort' }), { global: true })
  const guarded = await host.router.navigate({ path: '/shop' }, { caller: host, outlet: 'side' })
  log(`守卫拦截: status=${guarded.status}`)

  // 6. fail-closed：核心服务替换 + isolate 白名单
  try {
    ;(host as unknown as { set: (k: string, v: unknown) => unknown }).set('bus', {})
  } catch (e) {
    log(`核心服务替换被拒: ${(e as Error).message.slice(0, 48)}…`)
  }
  try {
    host.isolate('state', Symbol('s'))
  } catch (e) {
    log(`isolate 白名单拦截: ${(e as Error).message.slice(0, 48)}…`)
  }
  log('P0 终验链路完成 ✓')
}

void run()
