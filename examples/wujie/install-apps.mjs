/**
 * 各子应用独立安装依赖（React 16/17 多版本、Vue 3、Vite 各自隔离 node_modules；
 * vue2 复用根 node_modules 的 vue@2.7，无需本地安装；angular12 单独 install/build）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

const projects = [
  'apps/react16',
  'apps/react17',
  'apps/vue3',
  'apps/vite',
  'apps/angular12',
  'hosts/main-vue',
]

for (const dir of projects) {
  if (existsSync(join(root, dir, 'node_modules'))) {
    console.log(`✓ ${dir}（node_modules 已存在，跳过）`)
    continue
  }
  console.log(`… npm install ${dir}`)
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: join(root, dir),
    stdio: 'inherit',
  })
  if (r.status !== 0) {
    console.error(`✗ ${dir} 安装失败`)
    process.exit(r.status ?? 1)
  }
}
