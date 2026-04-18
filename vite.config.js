import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '.env') })
const apiPort = Number(process.env.PORT || 5190)

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: `/api/*` → Express (PORT in .env, default 5190).
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})

