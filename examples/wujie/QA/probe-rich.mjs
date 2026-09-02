/**
 * 单点探针：只看 taixu-vue 的 vue2/rich-text 页渲染结果（含控制台错误）。
 * 用法：CHROME_PATH=... node probe-rich.mjs
 */
import { chromium } from 'playwright-core'
import { TARGETS } from './lib/cases.mjs'

const T = TARGETS['taixu-vue']
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

await p.goto(T.entry, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// 走 SPA 点击：vue2 分组 → 富文本
await p.click('text=vue2')
await p.waitForTimeout(600)
const links = await p.$$('nav a')
for (const a of links) {
  if ((await a.innerText()).replace(/\s/g, '') === '富文本') {
    await a.click()
    break
  }
}
await p.waitForTimeout(1200)

const text = await p.evaluate(() => {
  const s = document.querySelector('.txh-content > section:not(.hidden)')
  return s ? s.innerText : '(no section)'
})
const editors = await p.evaluate(() => document.querySelectorAll('.txv2-editor').length)
console.log('editors:', editors)
console.log('errors:', errors.length ? errors : 'none')
console.log('---')
console.log(text.slice(0, 1800))

await b.close()
