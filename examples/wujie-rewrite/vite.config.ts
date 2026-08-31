import { defineConfig } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// Pages 子路径部署：base 相对化（产物放 docs/demo/host/）
export default defineConfig({
  base: './',
  build: {
    outDir: '../../docs/demo',
    emptyOutDir: false, // apps 产物先于 host 构建，勿清空
    rollupOptions: {
      input: { host: resolve(root, 'host/index.html') },
    },
  },
})
