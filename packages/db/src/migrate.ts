import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './client.ts'

// In the source tree the SQL lives at ../drizzle relative to this file. When this is
// bundled into a container the layout differs, so MIGRATIONS_DIR can point at it explicitly.
const migrationsFolder = process.env.MIGRATIONS_DIR
  ? resolve(process.env.MIGRATIONS_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle')

const { db, pool } = createDb()
console.log(`Applying migrations from ${migrationsFolder} ...`)
await migrate(db, { migrationsFolder })
console.log('Migrations applied.')
await pool.end()
