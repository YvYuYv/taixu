import { defineConfig } from 'vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// Pages 子路径部署（/taixu/demo/host/）：
// root 设为 host/ —— 产物 HTML 与 assets 同目录（docs/demo/host/），
// base './' 保证相对引用正确（资源不跑到上一级）
export default defineConfig({
  root: resolve(root, 'host'),
  base: './',
  build: {
    outDir: resolve(root, '../../docs/demo/host'),
    emptyOutDir: false, // apps 产物先于 host 构建，勿清空
  },
})
