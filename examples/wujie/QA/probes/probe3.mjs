import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
await page.goto('https://wujie-micro.github.io/demo-main-vue/home', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(4000)

const dump = async (label) => {
  const out = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('*')].filter(e => e.shadowRoot)
    return {
      url: location.href,
      hosts: hosts.map(h => {
        const sr = h.shadowRoot
        const body = sr.querySelector('body')
        return {
          rect: [Math.round(h.getBoundingClientRect().width), Math.round(h.getBoundingClientRect().height)],
          elCount: sr.querySelectorAll('*').length,
          bodyText: body ? body.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : null,
        }
      }),
    }
  })
  console.log('==', label, out.url)
  for (const h of out.hosts) console.log('   host', JSON.stringify(h.rect), 'els=' + h.elCount, '|', JSON.stringify(h.bodyText))
}

await dump('home(initial)')

// 点击侧栏 react16
const clicked = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find(a => a.textContent.trim().startsWith('react16'))
  if (a) { a.click(); return a.textContent.trim() }
  return null
})
console.log('clicked:', clicked)
await page.waitForTimeout(5000)
await dump('after click react16')
console.log('errors:', JSON.stringify([...new Set(errs)].slice(0, 6), null, 1))
await browser.close()
