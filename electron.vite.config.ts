import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// 使用 loadEnv 正确加载环境变量
const env = loadEnv(process.env.NODE_ENV as string)
const RENDERER_VITE_API_KEY = env.RENDERER_VITE_API_KEY || ''
const RENDERER_VITE_API_URL = env.RENDERER_VITE_API_URL || 'https://api.openai.com/v1'

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
    // 支持环境变量 - 使用编译时注入
    define: {
      'import.meta.env.RENDERER_VITE_API_KEY': JSON.stringify(RENDERER_VITE_API_KEY),
      'import.meta.env.RENDERER_VITE_API_URL': JSON.stringify(RENDERER_VITE_API_URL)
    }
  }
})
