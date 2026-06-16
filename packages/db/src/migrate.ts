import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './client.ts'

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle')

const { db, pool } = createDb()
console.log(`Applying migrations from ${migrationsFolder} ...`)
await migrate(db, { migrationsFolder })
console.log('Migrations applied.')
await pool.end()
