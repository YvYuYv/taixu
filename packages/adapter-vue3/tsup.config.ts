import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { 'vue3-adapter': '../../src/vue3-adapter.ts' },
  format: ['esm'],
  external: ['cordis', 'vue'],
  clean: true,
  target: 'es2020',
  sourcemap: true,
})
