import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, '../../..', '.env') })

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export const env = {
  // Railway (and most PaaS) inject the listen port as PORT; fall back to API_PORT for local dev.
  port: int(process.env.PORT ?? process.env.API_PORT, 8787),
  host: process.env.API_HOST ?? '0.0.0.0',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret-change-me-32-bytes-min-length',
  siweDomain: process.env.SIWE_DOMAIN ?? 'localhost:5173',
  siweUri: process.env.SIWE_URI ?? 'http://localhost:5173',
  efpBase: process.env.EFP_API_BASE,
}
