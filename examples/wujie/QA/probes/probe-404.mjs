import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
for (const host of ['main-vue', 'main-react']) {
  const page = await browser.newPage()
  const bad = []
  page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`))
  page.on('requestfailed', (r) => bad.push(`FAILED ${r.url()} ${r.failure()?.errorText}`))
  await page.goto(`http://localhost:7700/hosts/${host}/#/home`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await page.goto(`http://localhost:7700/hosts/${host}/?x=1#/all`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  console.log(host, '=>', bad.length ? bad : '(no 404)')
  await page.close()
}
await browser.close()
