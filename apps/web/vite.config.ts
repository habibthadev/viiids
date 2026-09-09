import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    exclude: ['@resvg/resvg-js', 'satori'],
  },
  // Nitro auto-detects Vercel in CI (VERCEL env) and emits .vercel/output.
  // Locally it builds a plain node server instead, so `pnpm dev` is untouched.
  plugins: [tanstackStart(), nitro(), viteReact()],
})
