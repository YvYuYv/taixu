/**
 * 示例站点「行为 + 样式」基线采集器（Playwright 驱动，官方 wujie 站与 taixu 重写站通用）。
 *
 * 用法：
 *   NODE_PATH=<workspace>/node_modules node capture.mjs \
 *     --site official-vue --base https://wujie-micro.github.io/demo-main-vue \
 *     --entry /home --out ./baseline.official-vue.json [--shots]
 *
 * 设计要点：
 *   - 路由自动发现：从入口页收集站内 a[href]，去重后逐个 goto（history 与 hash 路由皆适用）
 *   - shadow DOM 穿透：wujie 把子应用渲染进 shadowRoot，采集器递归穿透收集文本/样式/几何
 *   - 输出稳定指纹：文本、可交互元素、关键容器 computed style、几何、wujie 特征（iframe/shadowRoot 数）
 *   - 可选截图：--shots 时按路由落盘视口截图，供人工比对界面样式
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const site = arg('site', 'site')
const base = arg('base', '').replace(/\/$/, '')
const entry = arg('entry', '/')
const outFile = arg('out', `./baseline.${site}.json`)
const shotsDir = arg('shots-dir', './shots')
const wait = Number(arg('wait', '2500'))
const limit = Number(arg('limit', '0'))
const CHROME = arg('chrome', process.env.CHROME_PATH ?? '')

if (!base) {
  console.error('缺少 --base')
  process.exit(1)
}

const root = dirname(fileURLToPath(import.meta.url))
const shotRoot = join(root, shotsDir, site)
if (flag('shots')) mkdirSync(shotRoot, { recursive: true })

// ---------- 页面内采集函数（在浏览器上下文执行，穿透 shadow DOM） ----------
const COLLECT = () => {
  const all = (root, sel) => [...root.querySelectorAll(sel)]
  const deep = (node, out = []) => {
    for (const el of node.querySelectorAll('*')) {
      out.push(el)
      if (el.shadowRoot) deep(el.shadowRoot, out)
    }
    return out
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

  const nodes = deep(document)
  const texts = []
  for (const el of nodes) {
    if (el.children.length > 0) continue
    const t = clean(el.textContent)
    if (t && t.length <= 80 && visible(el)) texts.push(t)
  }

  const actions = []
  for (const el of nodes) {
    if (!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) continue
    if (!visible(el)) continue
    const label = clean(el.textContent) || el.getAttribute('placeholder') || el.getAttribute('aria-label') || ''
    if (!label) continue
    actions.push({ tag: el.tagName, text: label.slice(0, 40), href: el.getAttribute('href') ?? undefined })
  }

  const styleOf = (el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 40),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      bg: cs.backgroundColor,
      color: cs.color,
      font: `${cs.fontFamily.split(',')[0].replace(/["']/g, '')} ${cs.fontSize}/${cs.lineHeight}`,
      weight: cs.fontWeight,
      display: cs.display,
      border: cs.borderTopWidth === '0px' ? 'none' : `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
    }
  }

  // 关键容器：宿主根 + 子应用根（shadowRoot 首层 / wujie-app / data-tx-* 槽位）
  const containers = []
  const candidates = [
    ...all(document, '#app > *, #root > *, .main, .content, main'),
    ...all(document, 'wujie-app'),
    ...all(document, '[data-tx-outlet], [data-tx-app]'),
  ]
  for (const el of candidates) {
    if (!visible(el)) continue
    containers.push(styleOf(el))
    if (el.shadowRoot && el.shadowRoot.firstElementChild) containers.push({ ...styleOf(el.shadowRoot.firstElementChild), inShadow: true })
    if (containers.length >= 8) break
  }

  const navs = []
  for (const el of all(document, 'nav a, aside a, header a, [class*=nav] a, [class*=menu] a, [class*=side] a, [class*=Side] a, [class*=Menu] a')) {
    if (!visible(el)) continue
    navs.push({ text: clean(el.textContent).slice(0, 30), href: el.getAttribute('href') })
  }

  // 菜单树：定位侧栏容器（含多个链接的窄条容器），递归提取层级文本
  const menuTree = []
  const containerCandidates = nodes.filter((el) => {
    if (el.getRootNode() !== document) return false
    if (!visible(el)) return false
    const r = el.getBoundingClientRect()
    return el.querySelectorAll('a').length >= 3 && r.width <= 320 && r.height >= 200
  })
  const aside = containerCandidates.sort((a, b) => b.querySelectorAll('a').length - a.querySelectorAll('a').length)[0]
  if (aside) {
    // 形态 A（官方 wujie）：顶层 <a> + 兄弟 <div class=sub-menu> 扁平结构
    // 形态 B（taixu 宿主）：嵌套 <ul>/<li>
    const firstText = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && clean(n.textContent)) return clean(n.textContent)
      }
      return clean(el.textContent)
    }
    for (const child of aside.children) {
      if (child.tagName === 'A') {
        menuTree.push({
          depth: 0,
          text: firstText(child).slice(0, 24),
          href: child.getAttribute('href') ?? undefined,
          alive: /\u4fdd\u6d3b|alive/i.test(child.textContent),
          caret: !!child.querySelector('i, .anticon, [class*=caret], [class*=arrow]'),
          active: /active/i.test(child.className),
        })
      } else if (child.querySelectorAll(':scope > a').length) {
        // 子菜单容器（紧跟在顶层 a 之后）
        menuTree.push({
          depth: 1,
          group: true,
          expanded: getComputedStyle(child).display !== 'none',
          items: [...child.querySelectorAll(':scope > a')].map((a) => ({
            text: clean(a.textContent).slice(0, 24),
            href: a.getAttribute('href') ?? undefined,
            active: /active/i.test(a.className),
          })),
        })
      } else if (child.children.length) {
        const walk = (el, depth) => {
          for (const c of el.children) {
            const a = c.tagName === 'A' ? c : c.querySelector(':scope > a')
            if (a) {
              menuTree.push({ depth, text: firstText(c).slice(0, 24), href: a.getAttribute('href') ?? undefined, active: /active/i.test(a.className) })
            } else if (c.children.length) walk(c, depth)
          }
        }
        walk(child, 0)
      }
    }
  }

  const headings = all(document, 'h1,h2,h3,h4').filter(visible).map((el) => `${el.tagName}:${clean(el.textContent).slice(0, 60)}`)
  for (const el of nodes) {
    if (/^H[1-4]$/.test(el.tagName) && el.getRootNode() !== document && visible(el)) {
      headings.push(`${el.tagName}(shadow):${clean(el.textContent).slice(0, 60)}`)
    }
  }

  return {
    url: location.href,
    title: document.title,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyFont: `${getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '')} ${getComputedStyle(document.body).fontSize}`,
    themeColor: getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim() || undefined,
    iframeCount: document.querySelectorAll('iframe').length,
    shadowRootCount: nodes.filter((el) => el.shadowRoot).length,
    headings: [...new Set(headings)].slice(0, 12),
    texts: [...new Set(texts)].slice(0, 60),
    actions: actions.slice(0, 40),
    navs: navs.slice(0, 60),
    menuTree: menuTree.slice(0, 80),
    containers,
  }
}

// ---------- 路由发现 ----------
async function discoverRoutes(page, entryUrl) {
  await page.goto(entryUrl, { waitUntil: 'load' })
  await page.waitForTimeout(wait)
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  )
  const set = new Set()
  for (const h of hrefs) {
    if (!h) continue
    if (/^https?:\/\//.test(h)) {
      if (h.includes('wujie-micro.github.io') && /demo-main-(vue|react)/.test(h)) continue // 跨主应用跳转，单独处理
      continue
    }
    if (h.startsWith('#')) {
      set.add(new URL(h.replace(/^#\/?/, '#/') || '#/', entryUrl).href)
      continue
    }
    try {
      set.add(new URL(h, entryUrl).href)
    } catch {
      /* ignore */
    }
  }
  const list = [...set].sort()
  return limit > 0 ? list.slice(0, limit) : list
}

// ---------- 主流程 ----------
const browser = await chromium.launch({
  executablePath: CHROME || undefined,
  headless: true,
})
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`)
})

const entryUrl = base + entry
const routes = await discoverRoutes(page, entryUrl)
console.log(`[${site}] 发现 ${routes.length} 条路由`)

const results = []
for (const url of routes) {
  const before = errors.length
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(wait)
  let data
  try {
    data = await page.evaluate(COLLECT)
  } catch (e) {
    data = { url, error: String(e).slice(0, 200) }
  }
  // wujie 把子应用渲染进 iframe（保活模式）；taixu 同文档渲染时 frames 为空
  data.frames = []
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue
    const fu = f.url()
    if (!fu || fu === 'about:blank') continue
    try {
      const fd = await f.evaluate(COLLECT)
      if (fd.texts?.length || fd.actions?.length || fd.headings?.length) {
        data.frames.push({ url: fu, texts: fd.texts, actions: fd.actions, headings: fd.headings, containers: fd.containers })
      }
    } catch (e) {
      data.frames.push({ url: fu, error: String(e).slice(0, 120) })
    }
  }
  data.routeErrors = errors.slice(before, errors.length)
  if (flag('shots')) {
    const name = url.replace(base, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'entry'
    await page.screenshot({ path: join(shotRoot, `${name}.png`) })
    data.shot = `${site}/${name}.png`
  }
  results.push(data)
  console.log(`  ✓ ${url.replace(base, '') || '/'} · texts=${data.texts?.length ?? 0} · actions=${data.actions?.length ?? 0}`)
}

await browser.close()

const out = {
  site,
  base,
  entry,
  capturedAt: new Date().toISOString(),
  viewport: [1280, 800],
  routes: results.length,
  pages: results,
}
const outPath = join(root, outFile)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`\n基线已写入 ${outFile}（${results.length} 页）`)
