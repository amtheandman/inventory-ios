import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' + target safari14 保证 IPA 内 WKWebView(iOS14) 能正常加载运行
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    target: 'safari14',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000
  }
})
