import { chromium } from 'playwright-core'

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
for (const url of [
  'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-vue/',
  'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-vue/#/react16/home',
  'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-vue/#/all',
  'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-react/',
  'https://taixu-micro.github.io/taixu/demo-wujie/hosts/main-react/#/react16/home',
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(6000)
  const out = await page.evaluate(() => {
    const root = document.querySelector('#app') ?? document.querySelector('#root') ?? document.body.firstElementChild
    const L = (el) => {
      if (!el) return 'null'
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).join('.') : ''
      const ds = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).join(' ')
      return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (ds ? ' [' + ds + ']' : '') +
        ' [' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']'
    }
    const lines = ['ROOT: ' + L(root)]
    const walk = (el, d) => {
      if (d > 4) return
      for (const c of el.children) {
        lines.push(' '.repeat(d) + '\\__ ' + L(c))
        walk(c, d + 1)
      }
    }
    walk(root, 1)
    const outlets = [...document.querySelectorAll('[data-tx-outlet], [data-taixu-outlet], .tx-outlet, [data-app-id]')]
      .map((e) => L(e))
    return {
      url: location.href,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
      treeLines: lines.slice(0, 80).join('\n'),
      outlets,
    }
  })
  console.log('====', url, '\n', out.bodyText)
  console.log(out.treeLines)
  if (out.outlets.length) console.log('OUTLETS:\n' + out.outlets.join('\n'))
  await page.close()
}
await browser.close()
