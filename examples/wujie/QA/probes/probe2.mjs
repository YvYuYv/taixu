import { chromium } from 'playwright-core'
const URL_ = process.argv[2] ?? 'https://wujie-micro.github.io/demo-main-vue/react16-sub/home'
const WAIT = Number(process.argv[3] ?? 5000)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 160)) })
page.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 160)))
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('goto:', e.message.slice(0,80)))
await page.waitForTimeout(WAIT)
const out = await page.evaluate(() => {
  const hosts = [...document.querySelectorAll('*')].filter(e => e.shadowRoot)
  return hosts.map(h => {
    const sr = h.shadowRoot
    const docEl = sr.querySelector('html') ?? sr.firstElementChild
    const body = sr.querySelector('body')
    const mainRoot = body?.firstElementChild
    return {
      hostTag: h.tagName.toLowerCase() + '.' + (h.className || ''),
      hostRect: [Math.round(h.getBoundingClientRect().width), Math.round(h.getBoundingClientRect().height)],
      hasDocEl: !!docEl, hasBody: !!body,
      bodyText: body ? body.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) : null,
      rootTag: mainRoot ? mainRoot.tagName.toLowerCase() + (mainRoot.id ? '#'+mainRoot.id : '') + (typeof mainRoot.className === 'string' && mainRoot.className ? '.'+mainRoot.className.split(' ')[0] : '') : null,
      elCount: sr.querySelectorAll('*').length,
      styleTags: sr.querySelectorAll('style').length,
      linkTags: sr.querySelectorAll('link').length,
    }
  })
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
