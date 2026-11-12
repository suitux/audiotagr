import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/tags.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  // Keep the tag library external: it carries the reader/writer payload and must
  // stay resolvable by the consumer's package manager.
  external: ['music-metadata']
})
