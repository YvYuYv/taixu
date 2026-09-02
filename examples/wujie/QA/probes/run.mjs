#!/usr/bin/env node
// CLI 入口：跑单一目标的采集
// 用法：node run.mjs <target> [--shots] [--out <path>]
//   target ∈ { official-vue, official-react, taixu-vue, taixu-react }
import { collect } from './lib/collect.mjs'
import { TARGETS } from './lib/routes.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const arg = (k, dflt) => {
  const i = process.argv.indexOf(k)
  return i >= 0 ? process.argv[i + 1] : dflt
}
const has = (k) => process.argv.includes(k)

const target = process.argv[2]
if (!target || !TARGETS[target]) {
  console.error('usage: node run.mjs <official-vue|official-react|taixu-vue|taixu-react> [--shots] [--out <path>]')
  process.exit(1)
}
const spec = TARGETS[target]
const shots = has('--shots')
const outPath = arg('--out', `./baseline.${target}.json`)
const shotsDir = arg('--shots-dir', `./shots/${target}`)
if (shots) mkdirSync(shotsDir, { recursive: true })

console.log(`[run] target=${target} base=${spec.base} entry=${spec.entry} routes=${spec.routes.length} shots=${shots}`)
const t0 = Date.now()
const data = await collect(spec, { shots, shotsDir })
data.elapsedMs = Date.now() - t0
writeFileSync(outPath, JSON.stringify(data, null, 2))
console.log(`[run] wrote ${outPath} in ${data.elapsedMs}ms; routes ok=${data.routes.filter(r=>r.ok).length}/${data.routes.length}; consoleErrs=${data.consoleErrs.length}`)
