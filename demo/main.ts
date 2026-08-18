/**
 * 最小宿主演示（01 号票）：
 * createCordis() 拉起 monitor + security 基础层，挂一个探针应用，
 * 把探针回报与宿主旁听的事件渲染到页面。
 */
import { createCordis, createProbeApp, fiberStateName } from '../src'

const reportEl = document.querySelector<HTMLUListElement>('#probe-report')!
const eventsEl = document.querySelector<HTMLUListElement>('#host-events')!

function li(text: string) {
  const el = document.createElement('li')
  el.textContent = text
  return el
}

const host = createCordis()

// 宿主旁听：monitor/report、security/violation、app/*（基线 §2.4，global 注册）
host.on('monitor/report', ({ metric }) => {
  eventsEl.appendChild(li(`monitor/report: ${String(metric.message)} (appId=${String(metric.appId)})`))
}, { global: true })
host.on('security/violation', (v) => {
  eventsEl.appendChild(li(`security/violation: ${v.rule} (appId=${v.appId})`))
}, { global: true })
host.on('app/ready', (p) => {
  eventsEl.appendChild(li(`app/ready: ${p.appId}`))
}, { global: true })

// 探针应用：回报 fiber 状态变迁与可注入服务
const probe = createProbeApp('demo-probe', (r) => {
  if (r.type === 'services') reportEl.appendChild(li(`注入服务: ${r.available.join(', ')}`))
  if (r.type === 'fiber-state') reportEl.appendChild(li(`fiber 状态: ${r.state}`))
  if (r.type === 'cleaned') reportEl.appendChild(li('effect 已清理'))
})

const fiber = host.plugin(probe)
fiber.await().then(() => {
  reportEl.appendChild(li(`fiber.await -> ${fiberStateName(fiber.state)}`))
  // 演示 monitor 唯一错误入口（appId 归因）
  host.monitor.capture(new Error('演示错误：一切正常'), { appId: 'demo-probe', phase: 'runtime' })
})
