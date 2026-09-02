import { chromium } from 'playwright-core'
const targets = [
  ['vue', 'https://wujie-micro.github.io/demo-main-vue/home'],
  ['react', 'https://wujie-micro.github.io/demo-main-react/#/home'],
]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
for (const [tag, url] of targets) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(5000)
  const out = await page.evaluate(() => {
    const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect()
      return { tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').split(' ')[0],
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        display: s.display, position: s.position, bg: s.backgroundColor, color: s.color, fs: s.fontSize, fw: s.fontWeight,
        pad: s.padding, border: s.borderWidth + ' ' + s.borderColor, radius: s.borderRadius, font: s.fontFamily.slice(0, 40) } }
    // 顶层布局：找 body 的直接/二级骨架
    const skeleton = (() => {
      const root = document.querySelector('#app') ?? document.querySelector('#root') ?? document.body.firstElementChild
      if (!root) return null
      const walk = (el, d) => (d > 2 ? [] : [{ ...cs(el), kids: el.children.length,
        children: [...el.children].slice(0, 6).map(c => walk(c, d + 1)) }])
      return walk(root, 0)
    })()
    const sidebar = [...document.querySelectorAll('div,aside,nav')]
      .filter(e => e.querySelectorAll('a').length >= 8 && e.getBoundingClientRect().width <= 320 && e.getBoundingClientRect().height > 300)[0]
    return {
      url: location.href, title: document.title,
      bodyStyle: cs(document.body),
      skeleton,
      sidebarStyle: cs(sidebar),
      sidebarFirstLink: cs(sidebar?.querySelector('a')),
      sidebarHtml: sidebar ? sidebar.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '').slice(0, 900) : null,
      shadowHostCount: [...document.querySelectorAll('*')].filter(e => e.shadowRoot).length,
    }
  })
  console.log('##########', tag)
  console.log(JSON.stringify(out, null, 1).slice(0, 4200))
  await page.close()
}
await browser.close()
