/**
 * 冻结回归基线：把当前 suite.taixu-*.json 存成 baseline/taixu-*.json（进版本控制）。
 *
 * 用法：node freeze-baseline.mjs [--force]
 *
 * 什么时候用：
 *   刚跑完 run-suite 且人工确认「当前就是想要的形态」时，把这一版冻结成基线。
 *   之后 compare.mjs --baseline 就以它为参考侧，任何回退都会红。
 *
 * 注意：
 *   - 基线存的是**采集快照**（逐页文本 / 计算样式 / 菜单结构），不是源码 diff，
 *     所以「文案改写导致字数骤降」这类退化也能抓到。
 *   - 有意为之的改动（新增示例页、改文案）改完后要重新冻结，否则 CI 会一直红——
 *     这是有意为之的设计：让你显式确认一次「这次改动是对的」。
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const TARGETS = ['taixu-vue', 'taixu-react']

if (!process.argv.includes('--force') && existsSync('baseline')) {
  console.error('baseline/ 已存在。确认要覆盖就加 --force（覆盖前建议先 git diff 看一眼变化）。')
  process.exit(1)
}

mkdirSync('baseline', { recursive: true })

for (const t of TARGETS) {
  const src = `suite.${t}.json`
  if (!existsSync(src)) {
    console.error(`✗ 缺少 ${src}。先跑：node run-suite.mjs ${t}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(src, 'utf8'))
  // 剔除时间戳：否则每次冻结都产生无意义 diff
  const { capturedAt, ...rest } = data
  const pages = data.pages.length
  // home 是宿主自己的首页，本就没有子应用内容——与 run-suite.mjs 的 ok() 口径保持一致
  const empty = data.pages.filter((p) => p.subText.length === 0 && p.id !== 'home').length
  const errors = data.pages.reduce((s, p) => s + (p.errors?.length ?? 0), 0)
  if (!process.argv.includes('--force') && (empty > 0 || errors > 0)) {
    console.error(
      `✗ ${src} 状态不佳：${empty} 页无内容、${errors} 条运行时错误。\n` +
        `  把有问题的状态冻结成基线等于把 bug 固化。确认要强制冻结就加 --force。`,
    )
    process.exit(1)
  }
  writeFileSync(`baseline/${t}.json`, JSON.stringify({ ...rest, frozenFrom: capturedAt }, null, 2))
  console.log(`✓ baseline/${t}.json  (${pages} 页, ${empty} 页无内容, ${errors} 条错误)`)
}

console.log('\n→ 基线已冻结。CI 会用 `node compare.mjs --baseline` 拿它做门禁。')
