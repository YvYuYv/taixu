import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { 'angular-adapter': '../../src/angular-adapter.ts' },
  format: ['esm'],
  external: ['cordis'],
  clean: true,
  target: 'es2020',
  sourcemap: true,
})
