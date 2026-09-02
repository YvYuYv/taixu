import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// vite 子应用：lib mode 产出自包含 ESM（app.mjs，default export = taixu Plugin），
// 与其它 esbuild 子应用产物同形态——宿主侧无感知（构建工具差异化演示）。
export default defineConfig({
  root,
  plugins: [],
  // lib mode 不注入 Node 全局：依赖产物（vue/@taixu/core）里的 process.env.NODE_ENV
  // dev/prod 分支需在此定义为 production（浏览器无 process）
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
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
