import * as esbuild from 'esbuild'

// Bundle the migration runner (incl. drizzle-orm + pg) to a single ESM file so containers
// can apply migrations with plain `node`, with no node_modules at runtime. The SQL files
// in ./drizzle are read at runtime from MIGRATIONS_DIR (see src/migrate.ts).
await esbuild.build({
  entryPoints: ['src/migrate.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/migrate.js',
  sourcemap: true,
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  external: ['pg-native'],
  logLevel: 'info',
})
