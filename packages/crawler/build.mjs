import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/crawl.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/crawl.js',
  sourcemap: true,
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  external: ['pg-native'],
  logLevel: 'info',
})
