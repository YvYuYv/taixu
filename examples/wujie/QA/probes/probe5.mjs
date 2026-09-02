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
    const L = (el) => {
      if (!el) return 'null'
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).join('.') : ''
      const tagName = el.tagName.toLowerCase()
      const head = tagName + (cls ? '.' + cls : '')
      return head + ' [' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' +
        s.display + '/' + s.position + ' bg=' + s.backgroundColor + ' c=' + s.color + ' fs=' + s.fontSize +
        ' fw=' + s.fontWeight + ' pad=' + s.padding + ' ff=' + s.fontFamily.slice(0, 26)
    }
    const root = document.querySelector('#app') ?? document.querySelector('#root') ?? document.body.firstElementChild
    const lines = ['ROOT: ' + L(root)]
    for (const c of root.children) {
      lines.push(' |- ' + L(c))
      for (const g of [...c.children].slice(0, 4)) lines.push(' |    \\- ' + L(g))
    }
    const side = [...root.children].find((e) => e.querySelectorAll('a').length >= 6)
    const menu = []
    if (side) {
      for (const el of side.children) {
        if (el.tagName === 'A') {
          menu.push({ d: 0, t: el.textContent.trim().split(/\s+/)[0], href: el.getAttribute('href'), active: el.className.includes('active') })
        } else if (el.classList.contains('sub-menu')) {
          for (const a of el.querySelectorAll('a')) {
            menu.push({ d: 1, t: a.textContent.trim().split(/\s+/)[0], href: a.getAttribute('href'), active: a.className.includes('active') })
          }
        } else if (el.querySelector('a')) {
          const top = el.querySelector(':scope > a')
          if (top) menu.push({ d: 0, t: top.textContent.trim().split(/\s+/)[0], href: top.getAttribute('href'), active: top.className.includes('active') })
          for (const a of el.querySelectorAll('a')) {
            if (a !== top) menu.push({ d: 1, t: a.textContent.trim().split(/\s+/)[0], href: a.getAttribute('href'), active: a.className.includes('active') })
          }
        }
      }
    }
    return { url: location.href, title: document.title, lines, menu, sideKids: side ? side.children.length : 0 }
  })

  console.log('########## ' + tag + ' | ' + out.title + ' | ' + out.url)
  console.log(out.lines.join('\n'))
  console.log('MENU(' + out.menu.length + ', sideKids=' + out.sideKids + '):')
  console.log(out.menu.map((m) => '  '.repeat(m.d) + m.t + (m.active ? '*' : '') + (m.href ? ' -> ' + m.href : '')).join('\n'))
  await page.close()
}

await browser.close()
