import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'print-localhost-hint',
      // Print a clear hint when the dev server starts so the user knows
      // to open localhost (not 127.0.0.1) — the backend's CORS allow-list
      // is `http://localhost:5173`, so 127.0.0.1 will fail every API
      // call with a "Server error" / CORS preflight 403.
      configureServer(server) {
        server.printUrls = () => {
          const colorUrl = (url: string) => `\x1b[36m${url}\x1b[0m`
          server.config.logger.info('')
          server.config.logger.info('  Rizqun UI dev server running:')
          server.config.logger.info('')
          server.config.logger.info(`  ➜  Local:    ${colorUrl('http://localhost:5173/')}`)
          server.config.logger.info(`  ➜  Network:  ${colorUrl('http://127.0.0.1:5173/')}  (don't use this — backend CORS only allows localhost)`)
          server.config.logger.info('')
          server.config.logger.info('\x1b[33m  ⚠  Always open http://localhost:5173/ (not 127.0.0.1) — the backend CORS allow-list requires it.\x1b[0m')
          server.config.logger.info('')
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
