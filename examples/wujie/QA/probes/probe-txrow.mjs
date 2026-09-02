import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/Users/xiangzhi/.agent-browser/browsers/chrome-152.0.7977.64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', args: ['--no-sandbox'] })
for (const url of [
  'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-vue/',
  'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-react/',
]) {
  const page = await browser.newPage()
  await page.goto(url)
  await page.waitForTimeout(5000)
  // 1. 点 caret 展开 react16 子菜单
  await page.locator('.txh-row span', { hasText: '▾' }).first().click().catch(async () => {
    // main-react 用 NavLink span
    await page.locator('a span', { hasText: '▾' }).first().click()
  })
  await page.waitForTimeout(800)
  console.log('===', url)
  console.log('  after caret click, url:', page.url())
  // 2. 点 dialog 子项
  await page.locator('a.txh-route', { hasText: /^dialog$/ }).first().click().catch(async () => {
    await page.locator('a', { hasText: /^dialog$/ }).first().click()
  })
  await page.waitForTimeout(2500)
  console.log('  after dialog click, url:', page.url())
  const sec = await page.locator('.txh-content > section:not(.hidden)').count()
  const txt = await page.evaluate(() => {
    const s = document.querySelector('.txh-content > section:not(.hidden)')
    return s ? s.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : 'NO_ACTIVE_SECTION'
  })
  console.log('  active section count:', sec, '| text:', txt)
  await page.close()
}
await browser.close()
