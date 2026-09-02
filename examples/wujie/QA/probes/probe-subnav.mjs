/**
 * 子菜单点击诊断：观察「点展开箭头 → 点子项」后 URL 的逐跳变化。
 * 用法：CHROME_PATH=... node probe-subnav.mjs [target] [caseId ...]
 */
import { chromium } from 'playwright-core'
import { CASES, TARGETS } from './lib/cases.mjs'

const targetId = process.argv[2] ?? 'official-vue'
const T = TARGETS[targetId]
const ids = process.argv.slice(3)
const cases = CASES.filter((c) => c.sub && (!ids.length || ids.includes(c.id)))

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })

for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)))
  page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 120)))

  await page.goto(T.entry, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector(`${T.navSel} a`, { timeout: 30000 })
  await page.waitForTimeout(2500)

  const topLink = `(() => {
    const links = [...document.querySelectorAll(${JSON.stringify(T.navSel)} + ' a')]
    return links.find((a) => !a.closest('.sub-menu, .txh-submenu') &&
      (a.getAttribute('href') || '').replace(/^#/, '').replace(/\\?.*$/, '').endsWith('/${c.top}'))
  })()`

  // 展开前：子菜单容器是否可见
  const before = await page.evaluate(`(() => {
    const a = ${topLink}
    const box = a && a.nextElementSibling
    return {
      hasTop: !!a,
      boxClass: box ? box.className : null,
      boxDisplay: box ? getComputedStyle(box).display : null,
      links: box ? [...box.querySelectorAll('a')].map((x) => (x.textContent || '').trim() + '->' + (x.getAttribute('href') || '')) : [],
    }
  })()`)

  await page.evaluate(`(() => { const a = ${topLink}; const i = a && a.querySelector('.main-icon'); if (i) i.click() })()`)
  await page.waitForTimeout(500)

  const after = await page.evaluate(`(() => {
    const a = ${topLink}
    const box = a && a.nextElementSibling
    return box ? getComputedStyle(box).display : null
  })()`)

  await page.evaluate(`(() => {
    const a = ${topLink}
    const box = a && a.nextElementSibling
    const el = box && [...box.querySelectorAll('a')].find((x) => (x.textContent || '').trim() === ${JSON.stringify(c.subLabel ?? c.sub)})
    if (el) el.click()
  })()`)

  const trail = []
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(500)
    trail.push(
      await page.evaluate(`(() => {
        const apps = [...document.querySelectorAll('wujie-app')]
        const secs = [...document.querySelectorAll('.txh-content > section:not(.hidden)')]
        const len = ${T.impl === 'wujie'}
          ? apps.map((a) => (a.shadowRoot && a.shadowRoot.querySelector('body') ? a.shadowRoot.querySelector('body').innerText : '')).join('').length
          : secs.map((s) => s.innerText).join('').length
        return location.pathname + location.search + location.hash + ' | n=' + (apps.length || secs.length) + ' len=' + len
      })()`),
    )
  }

  console.log(`\n==== ${c.id}`)
  console.log('  before:', JSON.stringify(before))
  console.log('  boxDisplay after caret click:', after)
  for (const [k, t] of trail.entries()) console.log(`   t=${((k + 1) * 0.5).toFixed(1)}s  ${t}`)
  if (errs.length) console.log('  errors:', [...new Set(errs)].slice(0, 4))
  await ctx.close()
}
await browser.close()
