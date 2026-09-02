/**
 * 全量构建：6 个子应用独立构建（独立工程、独立产物）+ 2 个宿主打包。
 *
 * 产物布局（serve 根目录）：
 *   dist/apps/<name>/app.mjs        子应用自包含 ESM（default export = taixu Plugin）
 *   dist/hosts/main-react/          React 18 宿主（index.html + main.js + style.css）
 *   dist/hosts/main-vue/            Vue 3 宿主
 *
 * 构建工具矩阵（差异化演示）：
 *   react16/react17/vue2/vue3 + 宿主 → esbuild（vue2 复用根 node_modules 的 vue@2.7）
 *   vite                             → Vite lib mode（真实 Vite 工程）
 *   angular12                        → ng build（application builder，standalone + AOT）
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')

const esbuildApps = [
  { name: 'react16', entry: 'apps/react16/src/main.tsx', jsx: 'transform' },
  { name: 'react17', entry: 'apps/react17/src/main.tsx', jsx: 'automatic' },
  { name: 'vue2', entry: 'apps/vue2/main.ts', jsx: undefined },
  { name: 'vue3', entry: 'apps/vue3/main.ts', jsx: undefined },
]

// ---------- 子应用 ----------
mkdirSync(join(dist, 'apps'), { recursive: true })

for (const app of esbuildApps) {
  await build({
    entryPoints: [join(root, app.entry)],
    bundle: true,
    format: 'esm',
    outfile: join(dist, 'apps', app.name, 'app.mjs'),
    minify: true,
    ...(app.jsx ? { jsx: app.jsx } : {}),
    sourcemap: false,
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  console.log(`✓ apps/${app.name}/app.mjs`)
}

// vite 子应用：真实 Vite 工程（lib mode 产出 app.mjs 到 dist/apps/vite）
{
  const r = spawnSync('npm', ['run', 'build'], { cwd: join(root, 'apps/vite'), stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('✗ apps/vite 构建失败')
    process.exit(r.status ?? 1)
  }
  console.log('✓ apps/vite/app.mjs')
}

// angular 子应用：ng build（AOT）→ main.js → 合成 app.mjs
{
  const r = spawnSync('npm', ['run', 'build'], { cwd: join(root, 'apps/angular12'), stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('✗ apps/angular12 构建失败')
    process.exit(r.status ?? 1)
  }
  const ngDist = join(root, 'apps/angular12/dist/browser')
  const mainJs = existsSync(join(ngDist, 'main.js'))
    ? join(ngDist, 'main.js')
    : join(root, 'apps/angular12/dist/main.js')
  const outdir = join(dist, 'apps/angular12')
  mkdirSync(outdir, { recursive: true })
  // main.js 以副作用把 Plugin 挂到 globalThis；这里合成 default export
  const code = readFileSync(mainJs, 'utf8')
  writeFileSync(
    join(outdir, 'app.mjs'),
    `${code}\nexport default globalThis.__TX_ANGULAR12_PLUGIN__;\n`,
  )
  // 若 ng 产出其它 chunk（如 polyfills），一并拷贝（同目录相对引用）
  for (const f of existsSync(ngDist) ? readdirSync(ngDist) : []) {
    if (f !== 'main.js') copyFileSync(join(ngDist, f), join(outdir, f))
  }
  console.log('✓ apps/angular12/app.mjs')
}

// ---------- 宿主 ----------
const hosts = [
  {
    name: 'main-react',
    entry: 'hosts/main-react/main.tsx',
    jsx: 'automatic',
    extras: [['hosts/main-react/index.html', 'index.html'], ['hosts/main-react/style.css', 'style.css']],
  },
  {
    name: 'main-vue',
    entry: 'hosts/main-vue/main.ts',
    jsx: undefined,
    extras: [
      ['hosts/main-vue/index.html', 'index.html'],
      ['hosts/main-react/style.css', 'style.css'],
    ],
  },
]

for (const host of hosts) {
  const outdir = join(dist, 'hosts', host.name)
  mkdirSync(outdir, { recursive: true })
  await build({
    entryPoints: [join(root, host.entry)],
    bundle: true,
    format: 'esm',
    outfile: join(outdir, 'main.js'),
    minify: true,
    ...(host.jsx ? { jsx: host.jsx } : {}),
    sourcemap: false,
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  for (const [src, dest] of host.extras) copyFileSync(join(root, src), join(outdir, dest))
  console.log(`✓ hosts/${host.name}/`)
}

console.log('\n全部构建完成 → dist/')
