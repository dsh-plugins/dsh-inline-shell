/**
 * Bundle build: esbuild emits the host half (lib/index.js) from TypeScript
 * sources. The plugin has no browser half, so no client bundle is produced.
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@deepseek-ai/cordis'],
})

console.log('inline-shell: built lib/index.js')
