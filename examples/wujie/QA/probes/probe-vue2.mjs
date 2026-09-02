import { chromium } from 'playwright-core'

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.message).slice(0, 300)}`))
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`))
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`)
})

for (const hash of ['#/vue2-sub/rich-text', '#/vue2', '#/vue3-sub/inline-event']) {
  logs.length = 0
  await page.goto('http://localhost:7700/hosts/main-vue/' + hash, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  const out = await page.evaluate(() => {
    const sec = document.querySelector('.txh-content > section:not(.hidden)')
    return {
      active: sec?.id,
      text: (sec?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 200),
      outletChildren: [...(document.getElementById('outlet-main')?.children ?? [])].map(
        (e) => e.tagName + '.' + (e.className || '') + '#' + (e.id || ''),
      ),
    }
  })
  console.log('====', hash)
  console.log('  active:', out.active, '| outlet children:', JSON.stringify(out.outletChildren))
  console.log('  text:', out.text)
  console.log('  logs:', logs.slice(0, 15).join('\n         ') || '(none)')
}
await browser.close()
