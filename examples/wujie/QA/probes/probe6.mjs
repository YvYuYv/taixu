import { chromium } from 'playwright-core'

const targets = [
  ['taixu-vue', 'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-vue/'],
  ['taixu-react', 'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-react/'],
]

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })

for (const [tag, url] of targets) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(6000)

  const out = await page.evaluate(() => {
    const L = (el) => {
      if (!el) return 'null'
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).join('.') : ''
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
        ' [' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' +
        s.display + '/' + s.position + ' bg=' + s.backgroundColor + ' c=' + s.color + ' fs=' + s.fontSize +
        ' fw=' + s.fontWeight + ' pad=' + s.padding + ' ff=' + s.fontFamily.slice(0, 26)
    }
    const root = document.querySelector('#app') ?? document.querySelector('#root') ?? document.body.firstElementChild
    const lines = ['ROOT: ' + L(root)]
    for (const c of root.children) {
      lines.push(' |- ' + L(c))
      for (const g of [...c.children].slice(0, 5)) lines.push(' |    \\- ' + L(g))
    }
    const anchors = [...document.querySelectorAll('a,button')].filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const menu = anchors.slice(0, 40).map((a) => a.tagName.toLowerCase() + ':' + a.textContent.trim().replace(/\s+/g, ' ').slice(0, 24))
    return {
      url: location.href,
      title: document.title,
      lines,
      menu,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
      shadowHosts: [...document.querySelectorAll('*')].filter((e) => e.shadowRoot).length,
      outletCandidates: [...document.querySelectorAll('[data-tx-outlet],[data-taixu-outlet],.tx-outlet')].map((e) => L(e)),
    }
  })

  console.log('########## ' + tag + ' | ' + out.title + ' | ' + out.url)
  console.log(out.lines.join('\n'))
  console.log('bodyText: ' + out.bodyText)
  console.log('shadowHosts: ' + out.shadowHosts)
  if (out.outletCandidates.length) console.log('outlets:\n' + out.outletCandidates.join('\n'))
  console.log('MENU(' + out.menu.length + '): ' + JSON.stringify(out.menu))
  if (errs.length) console.log('pageerrors: ' + JSON.stringify([...new Set(errs)].slice(0, 4)))
  await page.close()
}

await browser.close()
