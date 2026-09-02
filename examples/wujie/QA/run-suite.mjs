/**
 * 统一用例执行器：同一份用例（lib/cases.mjs）跑 4 个目标，产出 suite.<target>.json。
 *
 * 用法：CHROME_PATH=... node run-suite.mjs <target> [--shots] [--only <caseId>]
 *
 * 导航方式：全部走 **SPA 点击**（不直接 goto 深链）。
 *   原因：wujie 官方站深链会让子应用 html 请求 404（`/react16-sub/home` 直接访问时
 *   wujie 去取 `//wujie-micro.github.io/demo-react16/home`），只能从首页点击进入。
 *   taixu 侧同样用点击，保证两侧走完全相同的交互路径。
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { CASES, TARGETS } from './lib/cases.mjs'

const targetId = process.argv[2]
const T = TARGETS[targetId]
if (!T) {
  console.error('用法: node run-suite.mjs <' + Object.keys(TARGETS).join('|') + '> [--shots] [--only <id>]')
  process.exit(1)
}
const SHOTS = process.argv.includes('--shots')
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

const CAPTURE = `() => {
  const navSel = ${JSON.stringify(T.navSel)}
  const contentSel = ${JSON.stringify(T.contentSel)}
  const impl = ${JSON.stringify(T.impl)}
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
  const nav = document.querySelector(navSel)
  const content = document.querySelector(contentSel)
  // 字体族声明在应用根（#app / #root）上而非 body——读 body 拿到的是 UA 默认字体，比不出东西
  const rootEl = document.querySelector('#app, #root') || document.body
  const navA = nav && nav.querySelector('a')
  const cs = (el) => (el ? getComputedStyle(el) : null)
  // 子应用内容：wujie 在 wujie-app 的 shadowRoot 内；taixu 在同文档的 .txh-content 直接子 section
  let subText = ''
  let subCount = 0
  if (impl === 'wujie') {
    const apps = [...document.querySelectorAll('wujie-app')]
    subCount = apps.length
    subText = apps.map((a) => (a.shadowRoot && a.shadowRoot.querySelector('body') ? a.shadowRoot.querySelector('body').innerText : '')).join('\\n')
  } else {
    const secs = [...document.querySelectorAll('.txh-content > section:not(.hidden)')]
    subCount = secs.length
    subText = secs.map((s) => s.innerText).join('\\n')
  }
  return {
    url: location.href,
    title: document.title,
    nav: {
      rect: rect(nav),
      items: nav ? [...nav.querySelectorAll('a')].map((a) => ({
        text: (a.textContent || '').replace(/\\s+/g, ' ').trim(),
        href: a.getAttribute('href') || '',
        active: /(^| )active|router-link-active( |$)/.test(a.className || ''),
        depth: a.closest('.sub-menu, .txh-submenu') ? 1 : 0,
      })) : [],
      fontSize: cs(nav) && cs(nav).fontSize,
      padding: cs(nav) && cs(nav).padding,
      itemPadding: cs(navA) && cs(navA).padding,
      itemFontSize: cs(navA) && cs(navA).fontSize,
    },
    content: { rect: rect(content), overflow: cs(content) && cs(content).overflow },
    bodyFontSize: getComputedStyle(document.body).fontSize,
    fontFamily: getComputedStyle(rootEl).fontFamily,
    headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + (h.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60)),
    subCount,
    subText: subText.replace(/\\s+/g, ' ').trim(),
    bodyText: (document.body.innerText || '').replace(/\\s+/g, ' ').trim(),
    wujieAppCount: document.querySelectorAll('wujie-app').length,
  }
}`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
const shotsDir = `shots/${targetId}`
if (SHOTS) mkdirSync(shotsDir, { recursive: true })

const cases = CASES.filter((c) => c.hosts.includes(T.flavor) && (!ONLY || c.id === ONLY))

/** 单条用例：开新 context → 进首页 → SPA 点击导航 → 等稳定 → 抓快照 */
async function runCase(c, i) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)))
  page.on('response', (r) => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url()}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200))
  })

  await page.goto(T.entry, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector(`${T.navSel} a`, { timeout: 30000 })
  await page.waitForTimeout(2500)

  if (c.top) {
    // 顶层链接定位：按 href 末段匹配，且排除子菜单内的链接
    const topLink = `(() => {
      const links = [...document.querySelectorAll(${JSON.stringify(T.navSel)} + ' a')]
      return links.find((a) => !a.closest('.sub-menu, .txh-submenu') &&
        (a.getAttribute('href') || '').replace(/^#/, '').replace(/\\?.*$/, '').endsWith('/${c.top}'))
    })()`

    if (c.sub) {
      // 1) 点展开箭头（.main-icon）
      const expanded = await page.evaluate(`(() => { const a = ${topLink}; const i = a && a.querySelector('.main-icon'); if (!i) return false; i.click(); return true })()`)
      if (!expanded) errors.push(`nav: 顶层菜单 "${c.top}" 的展开箭头未找到`)
      await page.waitForTimeout(500)
      // 2) 子项必须在**该顶层链接紧跟的兄弟容器**内查找——全局匹配会命中其它分组的隐藏子菜单
      const clicked = await page.evaluate(
        `(() => {
          const a = ${topLink}
          let box = a && a.nextElementSibling
          if (!box || !(box.matches('.sub-menu') || box.matches('.txh-submenu'))) return false
          const el = [...box.querySelectorAll('a')].find((x) => (x.textContent || '').trim() === ${JSON.stringify(c.subLabel ?? c.sub)})
          if (!el) return false
          el.click()
          return true
        })()`,
      )
      if (!clicked) errors.push(`nav: 子菜单项 "${c.subLabel ?? c.sub}" 未找到（${c.top} 下）`)
    } else {
      const ok = await page.evaluate(`(() => { const a = ${topLink}; if (!a) return false; a.click(); return true })()`)
      if (!ok) errors.push(`nav: 顶层菜单 "${c.top}" 未找到`)
    }
    // 等待内容稳定：子应用文本长度连续两次一致即认为停稳（最长 10s）
    const readLen = `(() => {
      const secs = [...document.querySelectorAll('.txh-content > section:not(.hidden)')]
      const apps = [...document.querySelectorAll('wujie-app')]
      const t = ${T.impl === 'wujie'}
        ? apps.map((a) => (a.shadowRoot && a.shadowRoot.querySelector('body') ? a.shadowRoot.querySelector('body').innerText : '')).join('')
        : secs.map((s) => s.innerText).join('')
      return t.length
    })()`
    let last = -1
    for (let k = 0; k < 20; k++) {
      await page.waitForTimeout(500)
      const len = await page.evaluate(readLen)
      if (len > 0 && len === last) break
      last = len
    }
  }

  const snap = await page.evaluate(eval(CAPTURE))
  const shot = SHOTS ? `${shotsDir}/${String(i).padStart(2, '0')}__${c.id.replace(/\//g, '_')}.png` : null
  if (shot) await page.screenshot({ path: shot })
  await ctx.close()

  return { id: c.id, ...snap, errors: [...new Set(errors)], shot }
}

/**
 * 菜单全量结构 —— **独立一趟**采集，不夹在用例流程里。
 *
 * 为什么不放在每个用例里「展开→读→复原」：
 * 1. 官方的展开箭头 `<a-icon @click.native="handleFlag">` 嵌在 router-link 内且**没有 stop 修饰符**，
 *    点它会连带触发父级 `<a>` 的路由跳转；在用例流程里点一圈箭头等于把页面导航到别处，
 *    抓到的内容就成了别的页面（实测 30+ 页内容全部变成同一份）。
 * 2. 官方折叠用 `v-show`（DOM 里有、只是 display:none），taixu 用 `v-if`（DOM 里没有）——
 *    判定「是否已展开」的口径在两侧不同，放在用例里很容易写歪。
 *
 * 单独开一个页面：进首页 → 逐个点箭头展开全部 → 读结构 → 直接丢弃该页面（无需复原）。
 */
async function collectMenu() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(T.entry, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector(`${T.navSel} a`, { timeout: 30000 })
  await page.waitForTimeout(2500)
  // 展开：反复点每个箭头，直到它后面的分组容器存在且可见（v-show 与 v-if 都覆盖）
  for (let round = 0; round < 3; round++) {
    await page.evaluate(`(() => {
      const nav = document.querySelector(${JSON.stringify(T.navSel)})
      for (const i of nav.querySelectorAll('.main-icon')) {
        const a = i.closest('a')
        const box = a && a.nextElementSibling
        const expanded = box && (box.matches('.sub-menu') || box.matches('.txh-submenu')) && getComputedStyle(box).display !== 'none'
        if (!expanded) i.click()
      }
    })()`)
    await page.waitForTimeout(400)
  }
  const items = await page.evaluate(`(() => {
    const nav = document.querySelector(${JSON.stringify(T.navSel)})
    return [...nav.querySelectorAll('a')].map((a) => ({
      text: (a.textContent || '').replace(/[\\s▴▼]+/g, ''),
      href: a.getAttribute('href') || '',
      depth: a.closest('.sub-menu, .txh-submenu') ? 1 : 0,
    }))
  })()`)
  await ctx.close()
  console.log(`  菜单结构：${items.length} 项（顶层 ${items.filter((i) => i.depth === 0).length}）`)
  return items
}

const menuFull = await collectMenu()

const pages = []
let fail = 0

for (let i = 0; i < cases.length; i++) {
  const c = cases[i]
  let rec = await runCase(c, i)
  const ok = () => rec.subText.length > 0 || c.id === 'home'
  // 官方站为 github.io 静态部署，子应用 html 偶发 404 → 空内容重试最多 2 次
  for (let attempt = 1; !ok() && attempt <= 2; attempt++) {
    console.log(`  ${String(i + 1).padStart(2)}/${cases.length} ${c.id.padEnd(24)} retry#${attempt}（上次 subText=${rec.subText.length}）`)
    rec = await runCase(c, i)
  }
  if (!ok()) fail++
  pages.push(rec)
  console.log(
    `  ${String(i + 1).padStart(2)}/${cases.length} ${c.id.padEnd(24)} ${ok() ? 'ok ' : '?? '}` +
      `sub=${rec.subCount} subText=${rec.subText.length} url=${rec.url.split('/').slice(-2).join('/')}` +
      (rec.errors.length ? ` err=${rec.errors.length}` : ''),
  )
}

await browser.close()
const out = `suite.${targetId}.json`
writeFileSync(
  out,
  JSON.stringify(
    { target: targetId, ...T, viewport: { width: 1440, height: 900 }, capturedAt: new Date().toISOString(), menuFull, cases: pages.map((p) => p.id), pages },
    null,
    2,
  ),
)
console.log(`\n→ ${out}  (${pages.length} 页, ${fail} 页无子应用内容)`)
