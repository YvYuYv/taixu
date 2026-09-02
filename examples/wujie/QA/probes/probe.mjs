import { chromium } from 'playwright-core'

const URL_ = process.argv[2] ?? 'https://wujie-micro.github.io/demo-main-vue/react16-sub/home'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(URL_, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => console.log('goto:', e.message.slice(0,80)))
await page.waitForTimeout(3000)

const out = await page.evaluate(() => {
  const iframes = [...document.querySelectorAll('iframe')].map(f => ({
    src: (f.src || '').slice(0, 70), id: f.id, cls: f.className,
    w: Math.round(f.getBoundingClientRect().width), h: Math.round(f.getBoundingClientRect().height),
    srcdoc: !!f.getAttribute('srcdoc'),
  }))
  const wujieApps = [...document.querySelectorAll('wujie-app')].map(e => {
    const sr = e.shadowRoot
    return {
      tag: e.tagName, name: e.getAttribute('name'), id: e.id,
      hasShadow: !!sr,
      shadowChildren: sr ? [...sr.children].map(c => c.tagName + (c.id ? '#'+c.id : '') + (c.className ? '.'+c.className : '')).join(' | ') : null,
      shadowText: sr ? sr.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null,
      rect: [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)],
    }
  })
  const allShadowHosts = [...document.querySelectorAll('*')].filter(e => e.shadowRoot)
    .map(e => e.tagName.toLowerCase() + (e.id ? '#'+e.id : '') + (e.className && typeof e.className === 'string' ? '.'+e.className.split(' ')[0] : ''))
  return {
    url: location.href,
    iframeCount: iframes.length, iframes,
    wujieApps, allShadowHosts: allShadowHosts.slice(0, 10),
    bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
  }
})
console.log(JSON.stringify(out, null, 1))

// 尝试通过 iframe 拿内容
for (const f of page.frames()) {
  if (f === page.mainFrame()) continue
  try {
    const t = await f.evaluate(() => document.body?.innerText.replace(/\s+/g,' ').slice(0, 200) ?? '')
    console.log('FRAME', f.url().slice(0, 60), '=>', JSON.stringify(t))
  } catch (e) { console.log('FRAME ERR', f.url().slice(0,40), e.message.slice(0,60)) }
}
await browser.close()
