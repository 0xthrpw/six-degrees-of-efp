import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Read VITE_* vars from the monorepo-root .env.
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: { port: 5173 },
})
