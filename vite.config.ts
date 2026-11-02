import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 2511,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.AGENT_TOWN_PORT ?? '2510'}` },
  },
})
