import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// 直接读取环境变量，不使用 loadEnv 避免 Electron 兼容性问题
const VITE_API_KEY = process.env.VITE_API_KEY || ''
const VITE_API_URL = process.env.VITE_API_URL || 'https://api.openai.com/v1'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: '../../out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    // 支持环境变量 - 使用编译时注入，避免运行时 loadEnv 问题
    define: {
      'import.meta.env.VITE_API_KEY': JSON.stringify(VITE_API_KEY),
      'import.meta.env.VITE_API_URL': JSON.stringify(VITE_API_URL)
    }
  }
})
