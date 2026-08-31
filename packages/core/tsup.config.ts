import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { 'core': '../../src/core.ts' },
  format: ['esm'],
  external: ['cordis'],
  // lz-string/dompurify 保持 external（源码已用 default import 解构，天然兼容 CJS/ESM）
  // lz-string/dompurify 保持 external（源码已用 default import 解构，天然兼容 CJS/ESM）
  clean: true,
  target: 'es2020',
  sourcemap: true,
})
