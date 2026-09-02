/**
 * gap 报告生成：拿官方站基线（suite.official-*.json）与 taixu 重写版（suite.taixu-*.json）
 * 逐个用例对比，按「菜单结构 / 布局样式 / 子应用内容 / 运行时错误」四个维度输出差异清单。
 *
 * 用法：node compare.mjs   → gap-report.md
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { CASES, FEATURES, STYLE_ANCHORS, roleOf } from './lib/cases.mjs'

/**
 * P0 功能点：属于页面**核心交互**，缺一项即视为功能阉割。
 * 其余（UI 库版本、仓库地址、Popper/Floating 等扩展演示）判 P1。
 */
const P0_FEATURES = new Set([
  '① 打开弹窗',
  '② 下拉选择器',
  '③ 气泡卡片',
  '① 路由同步',
  '② 读取 window.location.host',
  '③ 修改 window.location.href',
  '① 宿主注入方法（= props.jump）',
  '② 宿主全局方法（= window.parent）',
  '③ bus 去中心化事件',
  '计数 +/- 交互',
  '跳转其它应用',
  '跳回验证状态保留',
  '接收消息展示',
  '发送消息按钮',
  '富文本编辑器可用',
  '子应用嵌套（应用内再挂应用）',
  'angular 子应用渲染',
  '多应用同屏（≥4 个子应用）',
  '场景1 基本功能测试',
  '场景2 多参数测试',
  '场景3 访问全局变量',
  '场景4 复杂表达式',
  '场景5 事件对象访问',
  '场景6 多个内联事件',
])

/**
 * 内容量骤降告警。
 *
 * 功能点判定是「能力级」的——单条同义正则命中就算覆盖，因此**抓不到"页面被整体简化"**：
 * 官方一页是三个缺陷回归场景的集合（2028 字），重写版只剩一个裸编辑器（168 字），
 * 「富文本编辑器可用」照样通过。字数比是补上这个盲区的廉价交叉信号。
 *
 * 阈值说明（按实测量级分布定，勿随意调低）：
 * - MIN_REF_LEN=300：参考侧太短的页（首页、state 页等）字数波动大，不判。
 * - SHRINK_RATIO=0.5：重写侧不足参考侧一半才报。实测「文案更精炼但内容对齐」的页比值
 *   在 0.54~0.63（rich-text 补前是 0.08、通信页补前 0.23），0.5 能分开这两类。
 *
 * 这是**待人工确认**的信号而非确定缺陷，故判 P1：文案更精炼是合法的。
 */
const MIN_REF_LEN = Number(process.env.MIN_REF_LEN ?? 300)
const SHRINK_RATIO = Number(process.env.SHRINK_RATIO ?? 0.5)

const PAIRS = [
  ['official-vue', 'taixu-vue', 'Vue 宿主'],
  ['official-react', 'taixu-react', 'React 宿主'],
]

const load = (t) => (existsSync(`suite.${t}.json`) ? JSON.parse(readFileSync(`suite.${t}.json`, 'utf8')) : null)
/** 字体/布局根探针（node probe-font.mjs 生成；缺失时回退逐页采集值） */
const fonts = existsSync('font-probe.json') ? JSON.parse(readFileSync('font-probe.json', 'utf8')) : null

/** 文本切成中文/英文 token（用于内容覆盖对比） */
function tokens(text) {
  const s = (text || '').replace(/\s+/g, ' ')
  const set = new Set()
  for (const m of s.matchAll(/[一-龥]{2,6}/g)) set.add(m[0])
  for (const m of s.matchAll(/[A-Za-z][A-Za-z0-9._-]{2,}/g)) set.add(m[0])
  return set
}

const L = []
const say = (s = '') => L.push(s)

say('# wujie 官方示例 × taixu 重写版 —— 一比一还原差异报告')
say()
say('> 生成方式：同一份用例清单（`QA/lib/cases.mjs`，取自 wujie 官方菜单树）分别跑 4 个目标，')
say('> 全部走 SPA 点击导航（官方站深链会让子应用 html 请求 404，只能从首页点击进入）。')
say(`> 生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}`)
say()

let totalGaps = 0
const bySeverity = { P0: [], P1: [], P2: [] }
/** 功能点缺口聚合：name → { sev, where:Set<string> }（同名跨用例只算一条） */
const featureGaps = new Map()

for (const [offId, txId, label] of PAIRS) {
  const off = load(offId)
  const tx = load(txId)
  say(`\n---\n`)
  say(`## ${label}：\`${offId}\` vs \`${txId}\``)
  say()
  if (!off || !tx) {
    say(`> ⚠️ 缺少 ${!off ? offId : txId} 的采集数据，跳过。先跑 \`node run-suite.mjs <target>\`。`)
    continue
  }

  const offPages = new Map(off.pages.map((p) => [p.id, p]))
  const txPages = new Map(tx.pages.map((p) => [p.id, p]))

  // ---------- 1. 布局与样式锚点 ----------
  const oHome = offPages.get('home')
  const tHome = txPages.get('home')
  say('### 1. 布局与计算样式锚点（首页实测）')
  say()
  say('| 锚点 | 官方期望 | 官方实测 | taixu 实测 | 判定 |')
  say('| --- | --- | --- | --- | --- |')
  const rows = [
    ['侧栏宽度', STYLE_ANCHORS.navWidth, oHome?.nav?.rect?.[2], tHome?.nav?.rect?.[2]],
    ['内容区起点 x', STYLE_ANCHORS.navWidth, oHome?.content?.rect?.[0], tHome?.content?.rect?.[0]],
    ['侧栏字号', STYLE_ANCHORS.navFontSize, oHome?.nav?.fontSize, tHome?.nav?.fontSize],
    ['侧栏内边距', STYLE_ANCHORS.navPadding, oHome?.nav?.padding, tHome?.nav?.padding],
    ['菜单项内边距', STYLE_ANCHORS.navItemPadding, oHome?.nav?.itemPadding, tHome?.nav?.itemPadding],
    ['body 字号', STYLE_ANCHORS.bodyFontSize, oHome?.bodyFontSize, tHome?.bodyFontSize],
  ]
  for (const [name, want, a, b] of rows) {
    const aOk = String(a) === String(want)
    const bOk = String(b) === String(want)
    const mark = bOk ? '✅' : '❌'
    if (!bOk) {
      totalGaps++
      bySeverity.P2.push(`${label} ${name}：期望 ${want}，实测 ${b}`)
    }
    say(`| ${name} | \`${want}\` | ${aOk ? '✅' : '⚠️'} \`${a}\` | ${mark} \`${b}\` | ${bOk ? '一致' : '**不一致**'} |`)
  }
  // 字体族走独立探针（font-probe.json）：承载元素两侧不同名（官方 react 宿主用 .app，
  // taixu 用 #root），逐页 CAPTURE 抓 #app/#root 会把官方的 antd reset 误判成差异
  const oFont = (fonts?.[offId]?.fontFamily || oHome?.fontFamily || '').split(',')[0].trim()
  const tFont = (fonts?.[txId]?.fontFamily || tHome?.fontFamily || '').split(',')[0].trim()
  const fontOk = oFont === tFont
  if (!fontOk) {
    totalGaps++
    bySeverity.P2.push(`${label} 字体族：官方 \`${oFont}\` vs taixu \`${tFont}\``)
  }
  say(`| 字体族 | \`${STYLE_ANCHORS.fontFamily}\` | \`${oFont}\` | \`${tFont}\` | ${fontOk ? '✅ 一致' : '⚠️ 不一致'} |`)
  say()

  // ---------- 2. 菜单结构 ----------
  // 用 itemsFull（折叠分组已临时展开读取）+ 归一化（去空白与折叠箭头 ▴）——
  // 否则官方 v-show（DOM 里有）与 taixu v-if（DOM 里没有）不可比
  const norm = (i) => `${i.depth}:${(i.text || '').replace(/[\s▴▼]+/g, '')}`
  const oItems = (off.menuFull ?? oHome?.nav?.items ?? []).map(norm)
  const tItems = (tx.menuFull ?? tHome?.nav?.items ?? []).map(norm)
  const onlyOff = oItems.filter((x) => !tItems.includes(x))
  const onlyTx = tItems.filter((x) => !oItems.includes(x))
  say('### 2. 侧栏菜单结构')
  say()
  say(`- 官方 ${oItems.length} 项 / taixu ${tItems.length} 项`)
  if (onlyOff.length) {
    totalGaps += onlyOff.length
    bySeverity.P1.push(`${label} 菜单缺项：${onlyOff.join('、')}`)
    say(`- ❌ **taixu 缺失**：${onlyOff.map((x) => `\`${x}\``).join('、')}`)
  } else {
    say('- ✅ 官方菜单项在 taixu 侧全部存在')
  }
  if (onlyTx.length) say(`- ➕ taixu 扩展（官方无）：${onlyTx.map((x) => `\`${x}\``).join('、')}`)
  say()
  say('<details><summary>菜单项明细</summary>')
  say()
  say('| # | 官方 | taixu |')
  say('| --- | --- | --- |')
  const n = Math.max(oItems.length, tItems.length)
  for (let i = 0; i < n; i++) {
    const a = oItems[i] ?? '—'
    const b = tItems[i] ?? '—'
    say(`| ${i + 1} | \`${a}\` | ${a === b ? `\`${b}\`` : `**\`${b}\`**`} |`)
  }
  say()
  say('</details>')
  say()

  // ---------- 3. 逐用例：功能点覆盖 ----------
  // 判定口径：能力级（FEATURES 同义正则），而非逐字 token 重合——
  // taixu 文案刻意解释自身语义（同文档/bus/保活），逐字比对会大面积误报。
  say('### 3. 逐用例：功能点覆盖')
  say()
  say('| 用例 | 官方 | taixu | 内容字数（官方/taixu） | taixu 未覆盖的功能点 |')
  say('| --- | --- | --- | --- | --- |')
  let featureMissTotal = 0
  let contentEmpty = 0
  let shrinkWarn = 0
  for (const c of off.cases.map((id) => CASES.find((x) => x.id === id)).filter(Boolean)) {
    const o = offPages.get(c.id)
    const t = txPages.get(c.id)
    if (!t) {
      totalGaps++
      bySeverity.P0.push(`${label} 用例 \`${c.id}\`：taixu 侧未采集（用例缺失）`)
      say(`| \`${c.id}\` | — | — | — | **用例缺失** |`)
      continue
    }
    const role = roleOf(c)
    // 官方侧该页本身不可用（github.io 部署 404 / wujie 报错）→ 无法作为比对基准，跳过
    if (!o || o.subText.length === 0) {
      say(`| \`${c.id}\` | ⚠️ 官方侧无内容 | — | 0 / ${t.subText.length} | 不可比对（官方站该页不可用） |`)
      continue
    }
    const feats = FEATURES[role] ?? []
    const hits = (p) => feats.filter((f) => f.any.some((re) => re.test(p?.subText ?? '')))
    const oHit = hits(o)
    const tHit = hits(t)
    const miss = oHit.filter((f) => !tHit.some((x) => x.name === f.name))
    if (t.subText.length === 0 && (o?.subText.length ?? 0) > 0) {
      contentEmpty++
      totalGaps++
      bySeverity.P0.push(`${label} 用例 \`${c.id}\`：taixu 子应用内容为空`)
    }
    for (const f of miss) {
      featureMissTotal++
      totalGaps++
      const sev = P0_FEATURES.has(f.name) ? 'P0' : 'P1'
      // 同名功能点跨用例/跨宿主重复出现 → 汇总时聚成一条，只列受影响范围
      if (!featureGaps.has(f.name)) featureGaps.set(f.name, { sev, where: new Set() })
      featureGaps.get(f.name).where.add(`${label} \`${c.id}\``)
    }
    // 内容量骤降交叉告警：功能点全过但字数掉一半以上 → 页面可能被简化，需人工确认
    const oLen = o?.subText.length ?? 0
    const tLen = t.subText.length
    const shrunk = oLen >= MIN_REF_LEN && tLen / oLen < SHRINK_RATIO
    if (shrunk) {
      shrinkWarn++
      totalGaps++
      bySeverity.P1.push(
        `${label} 用例 \`${c.id}\`：内容量骤降 ${oLen} → ${tLen} 字（比值 ${(tLen / oLen).toFixed(2)}）` +
          ` —— 功能点判定已通过，需人工确认是文案精炼还是页面被简化`,
      )
    }
    const mark = (n, total) => (total === 0 ? '—' : `${n}/${total}`)
    say(
      `| \`${c.id}\` | ${mark(oHit.length, feats.length)} | ${mark(tHit.length, feats.length)} |` +
        ` ${oLen} / ${tLen}${shrunk ? ' ⚠️' : ''} |` +
        ` ${miss.length ? miss.map((f) => `\`${f.name}\``).join('、') : shrunk ? '（见内容量告警）' : '—'} |`,
    )
  }
  say()
  say(`功能点缺失合计：**${featureMissTotal}** 项；内容为空用例：**${contentEmpty}** 个`)
  say(
    shrinkWarn
      ? `⚠️ 内容量骤降告警：**${shrinkWarn}** 处（功能点判定已通过，但字数不足参考侧 ${SHRINK_RATIO} 倍，需人工确认）`
      : `✅ 无内容量骤降告警（无页面在功能点通过的前提下字数不足参考侧 ${SHRINK_RATIO} 倍）`,
  )
  say()

  // ---------- 4. 运行时错误 ----------
  const oErr = off.pages.reduce((s, p) => s + (p.errors?.length ?? 0), 0)
  const tErr = tx.pages.reduce((s, p) => s + (p.errors?.length ?? 0), 0)
  say('### 4. 运行时错误')
  say()
  say(`- 官方站点累计 ${oErr} 条（含 wujie 自身的子应用 html 404 与降级告警）`)
  say(`- taixu 累计 ${tErr} 条`)
  const tErrs = [...new Set(tx.pages.flatMap((p) => p.errors ?? []))]
  if (tErrs.length) {
    say()
    say('```')
    for (const e of tErrs.slice(0, 15)) say(e.slice(0, 200))
    say('```')
  } else {
    say('- ✅ taixu 侧无运行时错误')
  }
}

// ---------- 汇总 ----------
say('\n---\n')
say('## 汇总')
say()
const distinct = bySeverity.P0.length + bySeverity.P1.length + bySeverity.P2.length + featureGaps.size
say(`逐页命中 **${totalGaps}** 处，去重后 **${distinct}** 类问题（同名功能点跨用例/跨宿主只算一类）。`)
say()

// 先按功能点聚合（同名跨用例只列一次 + 影响范围），再列其余逐项差异
for (const [sev, title] of [
  ['P0', 'P0 · 功能缺失（必须修）'],
  ['P1', 'P1 · 功能点/结构不一致'],
  ['P2', 'P2 · 样式数值偏差'],
]) {
  const feats = [...featureGaps.entries()].filter(([, g]) => g.sev === sev)
  const others = bySeverity[sev]
  say(`### ${title}（${feats.length + others.length}）`)
  say()
  if (!feats.length && !others.length) say('- 无')
  for (const [name, g] of feats) {
    const where = [...g.where]
    say(`- **${name}** —— ${where.length} 处：${where.slice(0, 8).join('、')}${where.length > 8 ? ` 等 ${where.length} 处` : ''}`)
  }
  for (const x of others) say(`- ${x}`)
  say()
}

writeFileSync('gap-report.md', L.join('\n'))
console.log(L.join('\n'))
console.log(`\n→ gap-report.md (${totalGaps} 处差异)`)
