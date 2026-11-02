import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: 'web',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: '/',
        name: 'Agent Town',
        short_name: 'Agent Town',
        description: 'A little town for your local AI agents.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#182436',
        background_color: '#182436',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,glb,png,svg}'],
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) } },
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    host: 'localhost',
    port: 2511,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.AGENT_TOWN_PORT ?? '2510'}` },
  },
})
