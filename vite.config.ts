import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html')
      },
      output: {
        manualChunks: {
          // React 核心 — 最常命中缓存
          'vendor-react': ['react', 'react-dom'],
          // 状态管理
          'vendor-zustand': ['zustand'],
          // markdown 渲染
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
        }
      }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
