import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
for (const [i, hash] of [['dialog', '#/vue2-sub/dialog'], ['dialog2', '#/vue2-sub/dialog'], ['richtext', '#/vue2-sub/rich-text'], ['home', '#/vue2-sub/home']].entries()) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:7700/hosts/main-vue/?p=' + i + hash, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const out = await page.evaluate(() => {
    const host = document.getElementById('outlet-main')
    const inner = host?.querySelector('div')
    return {
      html: (inner?.innerHTML ?? '').slice(0, 600),
      text: (host?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 300),
    }
  })
  console.log('====', hash)
  console.log('  text:', out.text)
  console.log('  html:', out.html)
  await page.close()
}
await browser.close()
