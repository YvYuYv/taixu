import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const root = dirname(fileURLToPath(import.meta.url))

/** 读 node_modules 里实际安装的版本（逐级向上找，兼容 pnpm/npm workspaces） */
function installedVersion(pkg: string): string {
  for (let dir = root; ; dir = dirname(dir)) {
    try {
      return JSON.parse(readFileSync(resolve(dir, 'node_modules', pkg, 'package.json'), 'utf8')).version
    } catch {
      const parent = dirname(dir)
      if (parent === dir) return 'unknown'
    }
  }
}

// vite 子应用：lib mode 产出自包含 ESM（app.mjs，default export = taixu Plugin），
// 与其它 esbuild 子应用产物同形态——宿主侧无感知（构建工具差异化演示）。
export default defineConfig({
  root,
  plugins: [],
  // lib mode 不注入 Node 全局：依赖产物（vue/@taixu/core）里的 process.env.NODE_ENV
  // dev/prod 分支需在此定义为 production（浏览器无 process）
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    // 首页展示「当前 vite 版本」（对齐官方 vite 子应用首页）——构建期注入，避免运行时依赖 vite。
    // 读 node_modules 里的**实际安装**版本，而不是 package.json 的声明范围（^5.2.0 → 5.4.21 这类偏差）
    __VITE_VERSION__: JSON.stringify(installedVersion('vite')),
  },
  build: {
    lib: {
      entry: resolve(root, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'app.mjs',
    },
    outDir: resolve(root, '../../dist/apps/vite'),
    emptyOutDir: true,
    minify: true,
    target: 'es2020',
  },
})
