/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    storage: {
      read: (filename: string) => Promise<string | null>
      write: (filename: string, content: string) => Promise<boolean>
      append: (filename: string, content: string) => Promise<boolean>
    }
  }
}
