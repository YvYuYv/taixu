import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { 'react-adapter': '../../src/react-adapter.tsx' },
  format: ['esm'],
  external: ['cordis', 'react', 'react/jsx-runtime'],
  jsx: 'automatic',
  clean: true,
  target: 'es2020',
  sourcemap: true,
})
