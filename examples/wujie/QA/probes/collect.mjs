// 通用采集器：同一份 manifest 跑任意目标，输出可比对 JSON。
// 适配：
//   - official: 子应用渲染在 <wujie-app>.shadowRoot<body>
//   - taixu:    子应用渲染在 div.txh-content > section（非 .hidden）
//   - 导航：先点顶级展开子菜单，再点子项

import { chromium } from 'playwright-core'

const LAUNCH = {
  executablePath: process.env.CHROME_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1440, height: 900 },
}

const STYLE_KEYS = [
  'display', 'position', 'backgroundColor', 'color', 'fontSize', 'fontWeight',
  'padding', 'margin', 'borderRadius', 'fontFamily', 'lineHeight', 'textAlign',
  'flexDirection', 'alignItems', 'justifyContent', 'gap', 'gridTemplateColumns',
]

// 注入到每个新页面的工具集（addInitScript）。
// 工具对象名 window.__txq，collect.mjs 之外任何 evaluate 都通过 window.__txq.xxx() 调用。
const HELPERS = `
window.__txq = {
  styleOf: function (el) {
    if (!el) return null
    var s = getComputedStyle(el)
    var r = el.getBoundingClientRect()
    var out = { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
    var keys = ${JSON.stringify(STYLE_KEYS)}
    for (var i = 0; i < keys.length; i++) out[keys[i]] = s[keys[i]]
    return out
  },
  collectInline: function (el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    var cls = (typeof el.className === 'string') ? el.className.split(' ').filter(Boolean).join('.') : ''
    return {
      tag: el.tagName.toLowerCase() + (cls ? '.' + cls : ''),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
    }
  },
  collectSnapshot: function (el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    var cls = (typeof el.className === 'string') ? el.className.split(' ').filter(Boolean).join('.') : ''
    var ds = []
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i]
      if (a.name.indexOf('data-') === 0) ds.push(a.name + '=' + a.value)
    }
    return {
      tag: el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (ds.length ? ' [' + ds.join(' ') + ']' : ''),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      style: window.__txq.styleOf(el),
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 400),
      children: Array.prototype.slice.call(el.children).slice(0, 8).map(window.__txq.collectInline).filter(Boolean),
    }
  },
  collectSubApps: function () {
    var out = []
    var hosts = document.querySelectorAll('wujie-app')
    for (var i = 0; i < hosts.length; i++) {
      var wj = hosts[i]
      var sr = wj.shadowRoot
      if (!sr) continue
      var body = sr.querySelector('body')
      out.push({
        kind: 'wujie',
        name: wj.getAttribute('name'),
        id: wj.id || null,
        rect: [Math.round(wj.getBoundingClientRect().width), Math.round(wj.getBoundingClientRect().height)],
        hasBody: !!body,
        bodyText: body ? body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 600) : null,
        elCount: sr.querySelectorAll('*').length,
        styleTagCount: sr.querySelectorAll('style').length,
      })
    }
    var content = document.querySelector('.txh-content')
    if (content) {
      var secs = content.querySelectorAll(':scope > section:not(.hidden)')
      for (var j = 0; j < secs.length; j++) {
        var sec = secs[j]
        out.push({
          kind: 'taixu',
          name: sec.getAttribute('data-tx-app'),
          id: sec.id || null,
          rect: [Math.round(sec.getBoundingClientRect().width), Math.round(sec.getBoundingClientRect().height)],
          text: sec.innerText.replace(/\\s+/g, ' ').trim().slice(0, 600),
          childCount: sec.querySelectorAll('*').length,
          firstChildTag: sec.firstElementChild ? sec.firstElementChild.tagName.toLowerCase() : null,
        })
      }
    }
    return out
  },
  collectNav: function () {
    var root = document.querySelector('#app') || document.querySelector('#root') || document.body.firstElementChild
    var cands = root ? root.querySelectorAll('div,aside,nav') : []
    var aside = null
    for (var i = 0; i < cands.length; i++) {
      var e = cands[i]
      if ((e.querySelectorAll('a').length >= 6 || e.querySelectorAll('.txh-route').length >= 6)) {
        aside = e; break
      }
    }
    if (!aside) return { ok: false, items: [] }
    var items = []
    var seen = {}
    var addItem = function (el, depth) {
      var t = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
      if (!t) return
      var k = depth + '|' + t
      if (seen[k]) return
      seen[k] = true
      var r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return
      items.push({ depth: depth, text: t, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] })
    }
    var as = aside.querySelectorAll('a')
    for (var k = 0; k < as.length; k++) addItem(as[k], 0)
    var subas = aside.querySelectorAll('div.sub-menu a')
    for (var m = 0; m < subas.length; m++) addItem(subas[m], 1)
    var rows = aside.querySelectorAll('.txh-row')
    for (var n = 0; n < rows.length; n++) {
      addItem(rows[n], 0)
      var cs = rows[n].querySelectorAll('a, button, [role=button]')
      for (var p = 0; p < cs.length; p++) addItem(cs[p], 1)
    }
    return { ok: true, items: items, asideStyle: window.__txq.styleOf(aside), asideRect: [Math.round(aside.getBoundingClientRect().width), Math.round(aside.getBoundingClientRect().height)] }
  },
  collectTopbar: function () {
    var root = document.querySelector('#app') || document.querySelector('#root') || document.body.firstElementChild
    var cands = root ? root.querySelectorAll('div,aside,nav') : []
    var aside = null
    for (var i = 0; i < cands.length; i++) {
      var e = cands[i]
      if ((e.querySelectorAll('a').length >= 6 || e.querySelectorAll('.txh-route').length >= 6)) {
        aside = e; break
      }
    }
    var items = []
    var all = document.querySelectorAll('a, button')
    for (var i = 0; i < all.length; i++) {
      var a = all[i]
      if (aside && aside.contains(a)) continue
      var r = a.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.y > 200) continue
      items.push({ text: (a.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 24), x: Math.round(r.x), y: Math.round(r.y) })
    }
    return items.slice(0, 20)
  },
  clickMenu: function (topLevel, sub) {
    var norm = function (s) { return (s || '').replace(/\\s+/g, '').toLowerCase() }
    var findByText = function (root, text) {
      var t = norm(text)
      var all = root.querySelectorAll('a, .txh-route, .txh-row, [role=button], button, div')
      for (var i = 0; i < all.length; i++) {
        var el = all[i]
        if (el.children.length > 3) continue
        var txt = norm(el.innerText || el.textContent || '')
        if (txt === t || (t.length >= 2 && (txt.indexOf(t) === 0 || (txt.indexOf(t) >= 0 && txt.length < t.length + 8)))) {
          var r = el.getBoundingClientRect()
          if (r.width > 0) return el
        }
      }
      return null
    }
    var top = findByText(document, topLevel)
    if (!top) return { ok: false, reason: 'topLevel not found: ' + topLevel }
    top.click()
    if (!sub) return { ok: true, clicked: 'top' }
    return { ok: true, clicked: 'top', needSub: sub }
  },
  clickSub: function (subText) {
    var norm = function (s) { return (s || '').replace(/\\s+/g, '').toLowerCase() }
    var t = norm(subText)
    var all = document.querySelectorAll('a, .txh-row, [role=button], button, div')
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      if (el.children.length > 3) continue
      var txt = norm(el.innerText || el.textContent || '')
      if (txt === t || (t.length >= 2 && txt.indexOf(t) === 0)) {
        var r = el.getBoundingClientRect()
        if (r.width > 0) { el.click(); return { ok: true, clicked: 'sub' } }
      }
    }
    return { ok: false, reason: 'sub not found: ' + subText }
  },
}
`

export async function collect(targetSpec, opts = {}) {
  const { base, entry, routes, label } = targetSpec
  const browser = await chromium.launch(LAUNCH)
  const page = await browser.newPage()
  const consoleErrs = []
  page.on('pageerror', (e) => consoleErrs.push('pageerror:' + String(e).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push('console:' + m.text().slice(0, 160)) })
  await page.addInitScript(HELPERS)

  const out = {
    target: label,
    base,
    capturedAt: new Date().toISOString(),
    entry,
    home: null,
    routes: [],
    consoleErrs: [],
  }

  await page.goto(base + entry, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(5000)

  out.home = await page.evaluate(() => {
    const root = document.querySelector('#app') ?? document.querySelector('#root') ?? document.body.firstElementChild
    return {
      title: document.title,
      url: location.href,
      rootSnapshot: window.__txq.collectSnapshot(root),
      nav: window.__txq.collectNav(),
      topbar: window.__txq.collectTopbar(),
      subApps: window.__txq.collectSubApps(),
      bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
    }
  })

  if (opts.shots) {
    const shotPath = opts.shotsDir + '/' + label + '__home.png'
    await page.screenshot({ path: shotPath })
    out.home.shot = shotPath
  }
  out.consoleErrs.push(...consoleErrs.splice(0).slice(0, 20))

  for (const route of routes) {
    // 优先直接 URL 导航（避开菜单点击脆弱性——taixu 折叠子项 v-if 不在 DOM）
    const fullUrl = base + (route.path ?? entry)
    let gotoOk = true
    try {
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (e) {
      gotoOk = false
      out.routes.push({ id: route.id, ok: false, error: 'goto: ' + String(e).slice(0, 100), expected: route.expected })
    }
    if (!gotoOk) continue

    // 等待子应用渲染：official 走 wujie shadowRoot body 文本；taixu 走 .txh-content > section 文本
    const start = Date.now()
    let lastSig = ''
    while (Date.now() - start < 8000) {
      const sig = await page.evaluate(() => {
        const subs = [...document.querySelectorAll('wujie-app')]
          .filter((w) => w.shadowRoot?.querySelector('body')?.innerText?.trim().length).length
        const taixuSec = document.querySelector('.txh-content > section:not(.hidden)')
        const taixuText = taixuSec ? taixuSec.innerText.replace(/\s+/g, ' ').trim().length : 0
        return location.href + '|s=' + subs + '|t=' + taixuText
      })
      if (sig !== lastSig && Date.now() - start > 700) break
      lastSig = sig
      await page.waitForTimeout(200)
    }

    const snap = await page.evaluate(() => {
      const root = document.querySelector('#app') ?? document.querySelector('#root') ?? document.body.firstElementChild
      const content = document.querySelector('.txh-content') ?? root
      return {
        url: location.href,
        title: document.title,
        contentSnapshot: window.__txq.collectSnapshot(content),
        subApps: window.__txq.collectSubApps(),
        bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 800),
        activeNavTexts: [...document.querySelectorAll('a.active, .router-link-active, .txh-route.active, .router-link-exact-active')]
          .map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)),
      }
    })
    if (opts.shots) {
      const shotPath = opts.shotsDir + '/' + label + '__' + route.id.replace(/[\/\\]/g, '_') + '.png'
      await page.screenshot({ path: shotPath })
      snap.shot = shotPath
    }
    out.routes.push({ id: route.id, ok: true, ...snap, expected: route.expected })
  }

  out.consoleErrs.push(...consoleErrs.splice(0).slice(0, 40))
  await browser.close()
  return out
}
