import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] ?? './shots-compare'
mkdirSync(OUT, { recursive: true })

const targets = [
  ['official-vue', 'https://wujie-micro.github.io/demo-main-vue/home'],
  ['official-react', 'https://wujie-micro.github.io/demo-main-react/#/home'],
  ['taixu-vue', 'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-vue/'],
  ['taixu-react', 'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-react/'],
]

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
for (const [tag, url] of targets) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: OUT + '/' + tag + '.png' })
  console.log('shot ' + tag)
  await page.close()
}
await browser.close()
