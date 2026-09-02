/**
 * taixu 侧断言（修复验证）：同一套用例跑 main-vue / main-react 两个宿主。
 * 用法：CHROME_PATH=... BASE=http://localhost:7700 node verify-fix.mjs
 *
 * 注意：taixu 是 hash 路由，两次仅 hash 不同的 goto() 属同文档导航、不会重载，
 * 必须用 ?r=<n> 破缓存强制整页重载，否则测到的是上一个路由的残留状态。
 */
import { chromium } from 'playwright-core'

const BASE = process.env.BASE ?? 'http://localhost:7700'
const HOSTS = ['main-vue', 'main-react']

/** 用例：[路由, 期望可见的槽位, 期望出现的关键词（任一命中即算内容就位）] */
const CASES = [
  ['home', null, ['极速 🚀', '强大 💪', '简单 🤞']],
  ['react16', 'outlet-main-wrap', ['react16 示例', '当前 React 版本', '16.13.1']],
  ['react16-sub/dialog', 'outlet-main-wrap', ['弹窗处理', 'Open Modal']],
  ['react16-sub/location', 'outlet-main-wrap', ['路由', '当前路由']],
  ['react16-sub/communication', 'outlet-main-wrap', ['通信处理', 'props']],
  ['react16-sub/nest', 'outlet-main-wrap', ['子应用嵌套']],
  ['react16-sub/font', 'outlet-main-wrap', ['字体处理']],
  ['react17', 'outlet-main-wrap', ['react17']],
  ['react17-sub/state', 'outlet-main-wrap', ['子应用保活']],
  ['vue2', 'outlet-main-wrap', ['vue2']],
  ['vue2-sub/rich-text', 'outlet-main-wrap', ['富文本']],
  ['vue3', 'outlet-main-wrap', ['vue3']],
  ['vue3-sub/inline-event', 'outlet-main-wrap', ['行内事件']],
  // 官方 vue3/vite 子应用的 contact 路由即「通信」页（wujie 原样命名）。
  // 断言只取「导航能力」——标题措辞会随对齐官方文案微调（宿主导航能力 / 宿主注入的导航能力），
  // 写死整句会让一次文案改动就误报 FAIL。
  ['vue3-sub/contact', 'outlet-main-wrap', ['导航能力']],
  ['vite', 'outlet-main-wrap', ['vite']],
  ['vite-sub/contact', 'outlet-main-wrap', ['导航能力']],
  ['angular12', 'outlet-main-wrap', ['angular']],
  ['all', 'all-wrap', ['react16', 'vue2']],
  ['postmessage', 'pm-wrap', ['主应用', '发送消息给vue2子应用']],
]

/** 布局与样式锚点（对齐 wujie 官方 main-vue / main-react 的 CSS） */
const LAYOUT = { navWidth: 210, navFontSize: '20px', navPadding: '30px 0px', itemPadding: '10px 30px', bodyFont: '20px' }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] })
let fail = 0
const rows = []

for (const host of HOSTS) {
  console.log(`\n########## ${host} ##########`)
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 160)))
  page.on('response', (r) => {
    if (r.status() >= 400) errs.push(`http ${r.status()}: ${r.url()}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160))
  })

  for (let i = 0; i < CASES.length; i++) {
    const [route, slot, keywords] = CASES[i]
    if (host === 'main-react' && route === 'postmessage') {
      console.log(`  ${route.padEnd(24)} SKIP  官方 react 宿主无此页（1:1 保留缺失）`)
      continue
    }
    const url = `${BASE}/hosts/${host}/?r=${i}#/${route}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page
      .waitForFunction(
        () => {
          const sec = document.querySelector('.txh-content > section:not(.hidden)')
          return !!sec && (sec.innerText || '').trim().length > 0
        },
        { timeout: 15000 },
      )
      .catch(() => {})
    await page.waitForTimeout(1500)

    const out = await page.evaluate(() => {
      const r = (el) => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]
      }
      const nav = document.querySelector('.txh-nav')
      const content = document.querySelector('.txh-content')
      const navA = nav?.querySelector('a')
      const vis = document.querySelector('.txh-content > section:not(.hidden)')
      return {
        nav: r(nav),
        content: r(content),
        navFS: nav && getComputedStyle(nav).fontSize,
        navPad: nav && getComputedStyle(nav).padding,
        itemPad: navA && getComputedStyle(navA).padding,
        bodyFS: getComputedStyle(document.body).fontSize,
        slot: vis?.id ?? null,
        text: (vis?.innerText ?? document.body.innerText).replace(/\s+/g, ' ').trim(),
        outletCount: document.getElementById('outlet-main')?.children.length ?? 0,
        homeH1: document.querySelector('.txh-header')?.innerText.replace(/\s+/g, ' ').trim(),
        homeH2: document.querySelector('.txh-subtitle')?.innerText.trim(),
        tools: [...document.querySelectorAll('.button-list .txh-switch, .button-list .docs')].map((e) =>
          e.textContent.trim(),
        ),
        cards: [...document.querySelectorAll('.txh-cards .title')].map((e) => e.textContent.trim()),
      }
    })

    const problems = []
    if (out.nav?.[2] !== LAYOUT.navWidth) problems.push(`nav宽 ${out.nav?.[2]}≠${LAYOUT.navWidth}`)
    if (out.content?.[0] !== LAYOUT.navWidth) problems.push(`content起点 ${out.content?.[0]}≠${LAYOUT.navWidth}`)
    if (out.navFS !== LAYOUT.navFontSize) problems.push(`nav字号 ${out.navFS}≠${LAYOUT.navFontSize}`)
    if (out.navPad !== LAYOUT.navPadding) problems.push(`nav内边距 ${out.navPad}≠${LAYOUT.navPadding}`)
    if (out.itemPad !== LAYOUT.itemPadding) problems.push(`菜单项内边距 ${out.itemPad}≠${LAYOUT.itemPadding}`)
    if (out.bodyFS !== LAYOUT.bodyFont) problems.push(`body字号 ${out.bodyFS}≠${LAYOUT.bodyFont}`)
    if (slot && out.slot !== slot) problems.push(`槽位 ${out.slot}≠${slot}`)
    if (slot === 'outlet-main-wrap' && out.outletCount > 1)
      problems.push(`主槽位残留 ${out.outletCount} 个容器（切换未替换旧应用）`)
    if (keywords.length && !keywords.some((k) => out.text.includes(k)))
      problems.push(`内容无关键词 [${keywords.join('|')}]`)

    const ok = problems.length === 0
    if (!ok) fail++
    rows.push({ host, route, ok, problems })
    console.log(
      `  ${route.padEnd(24)} ${ok ? 'PASS' : 'FAIL'} slot=${out.slot} outletChildren=${out.outletCount}` +
        ` text="${out.text.slice(0, 70)}"${ok ? '' : '\n      ✗ ' + problems.join('; ')}`,
    )
    if (route === 'home') {
      console.log(
        `     h1="${out.homeH1}" h2="${out.homeH2}"\n     tools=${JSON.stringify(out.tools)} cards=${JSON.stringify(out.cards)}`,
      )
    }
  }
  const uniq = [...new Set(errs)]
  if (uniq.length) {
    console.log('  JS 错误:', uniq.slice(0, 6))
  } else {
    console.log('  JS 错误: 无')
  }
  await page.close()
}

await browser.close()
console.log(`\n==== ${fail === 0 ? '全部通过' : `${fail} / ${rows.length} 用例未通过`} ====`)
process.exit(fail === 0 ? 0 : 1)
