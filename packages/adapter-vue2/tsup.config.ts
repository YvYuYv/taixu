import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { 'vue2-adapter': '../../src/vue2-adapter.ts' },
  format: ['esm'],
  external: ['cordis'],
  clean: true,
  target: 'es2020',
  sourcemap: true,
})
