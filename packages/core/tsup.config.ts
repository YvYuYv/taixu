import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { 'core': '../../src/core.ts' },
  format: ['esm'],
  external: ['cordis'],
  // lz-string/dompurify 是 CJS：Node ESM 下 named import 解析会失败，内联进 bundle
  noExternal: ['lz-string', 'dompurify'],
  // lz-string/dompurify 是 CJS：Node ESM 下 named import 解析会失败，内联进 bundle
  noExternal: ['lz-string', 'dompurify'],
  clean: true,
  target: 'es2020',
  sourcemap: true,
})
