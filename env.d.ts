/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI: {
      storage: {
        read: (filename: string) => Promise<string | null>
        write: (filename: string, content: string) => Promise<boolean>
        append: (filename: string, content: string) => Promise<boolean>
      }
      config: {
        getApiKey: () => Promise<string>
        setApiKey: (apiKey: string) => Promise<boolean>
      }
    }
  }
}

export {}