/**
 * 子应用独立构建（对齐 wujie 示例的「子应用独立工程、独立产物」语义）：
 * 每个 app 用 esbuild 打成自包含 ESM（default export = taixu Plugin），
 * 产物（app.mjs + 预览页 index.html）输出到 docs/demo/apps/<name>/，
 * 宿主运行时经动态 import 加载 —— 独立构建、独立部署、运行时集成。
 */
import { build } from 'esbuild'
import { mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outRoot = join(root, '../../docs/demo/apps')

const apps = [
  { name: 'react17', entry: 'apps/react17/main.tsx' },
  { name: 'vue3', entry: 'apps/vue3/main.ts' },
  { name: 'vite', entry: 'apps/vite/main.ts' },
]

for (const app of apps) {
  const outdir = join(outRoot, app.name)
  mkdirSync(outdir, { recursive: true })
  await build({
    entryPoints: [join(root, app.entry)],
    bundle: true,
    format: 'esm',
    outfile: join(outdir, 'app.mjs'),
    minify: true,
    jsx: 'automatic',
    sourcemap: false,
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  copyFileSync(join(root, app.entry.replace(/main\.(tsx|ts)$/, 'index.html')), join(outdir, 'index.html'))
  console.log(`✓ ${app.name} -> docs/demo/apps/${app.name}/app.mjs`)
}
