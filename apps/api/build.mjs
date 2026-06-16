import * as esbuild from 'esbuild'

// Bundle the API (incl. internal @sdoe/* TS packages) to a single ESM file so it
// runs under plain `node` — tsx as a long-lived process is unreliable on some
// machines, so we build then run with node instead.
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/index.js',
  sourcemap: true,
  // CJS deps (pg, fastify, …) call require()/__dirname at runtime; provide require in ESM output.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  external: ['pg-native'],
  logLevel: 'info',
})
