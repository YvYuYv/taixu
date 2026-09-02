/**
 * 轻量探针：读首页的「布局根」字体族，输出 font-probe.json 供 compare.mjs 使用。
 *
 * 为什么独立跑：承载字体/布局的元素在两侧**不同名**——
 *   - vue 宿主：flex 与字体直接声明在 `#app` 上（两侧同名，可直接比）
 *   - react 宿主：官方声明在 `.app` 上，`#root` 只是 React 挂载点（display:block + antd 字体栈）；
 *     taixu 声明在 `#root` 上。逐页 CAPTURE 抓 `#app, #root` 会把官方的 antd reset 当成差异。
 * 统一取「` .app` 优先，回退 #app/#root」，才是同一口径。
 */
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
import { TARGETS } from './lib/cases.mjs'

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
const out = {}
for (const [id, T] of Object.entries(TARGETS)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(T.entry, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector(`${T.navSel} a`, { timeout: 30000 })
  await page.waitForTimeout(2500)
  const rec = await page.evaluate(`(() => {
    // 布局根：官方 react 宿主用 .app，vue 宿主与 taixu 用 #app / #root
    const el = document.querySelector('.app') || document.querySelector('#app, #root') || document.body
    return {
      selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
      fontFamily: getComputedStyle(el).fontFamily,
      color: getComputedStyle(el).color,
      display: getComputedStyle(el).display,
      flexDirection: getComputedStyle(el).flexDirection,
    }
  })()`)
  out[id] = rec
  console.log(id.padEnd(15), JSON.stringify(rec))
  await ctx.close()
}
await browser.close()
writeFileSync('font-probe.json', JSON.stringify(out, null, 2))
console.log('\n→ font-probe.json')
