import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The GitHub Pages workflow sets GITHUB_PAGES_BASE (e.g. /Work-Dashboard/).
export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5180'),
    strictPort: true,
  },
})
