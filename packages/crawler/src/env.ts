import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Load the monorepo-root .env regardless of which package dir we run from.
const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, '../../..', '.env') })

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export const crawlConfig = {
  efpBase: process.env.EFP_API_BASE,
  seedLimit: int(process.env.CRAWL_SEED_LIMIT, 1000),
  nodeCap: int(process.env.CRAWL_NODE_CAP, 50000),
  maxDepth: int(process.env.CRAWL_MAX_DEPTH, 3),
  concurrency: int(process.env.CRAWL_CONCURRENCY, 5),
}
