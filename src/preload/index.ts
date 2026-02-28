import { contextBridge, ipcRenderer } from 'electron'

const api = {
  storage: {
    read: (filename: string) => ipcRenderer.invoke('storage:read', filename),
    write: (filename: string, content: string) => ipcRenderer.invoke('storage:write', filename, content),
    append: (filename: string, content: string) => ipcRenderer.invoke('storage:append', filename, content)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electronAPI = api
}

export type ElectronAPI = typeof api
