import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/shep-portal/',
  server: {
    proxy: {
      // Proxy Anthropic API calls to avoid CORS in local dev.
      // In production (GitHub Pages) the browser calls Anthropic directly.
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/anthropic/, ''),
      },
    },
  },
})
