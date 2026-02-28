import { contextBridge, ipcRenderer } from "electron";
const api = {
  storage: {
    read: (filename) => ipcRenderer.invoke("storage:read", filename),
    write: (filename, content) => ipcRenderer.invoke("storage:write", filename, content),
    append: (filename, content) => ipcRenderer.invoke("storage:append", filename, content)
  },
  config: {
    getApiKey: () => ipcRenderer.invoke("config:getApiKey"),
    setApiKey: (apiKey) => ipcRenderer.invoke("config:setApiKey", apiKey)
  }
};
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electronAPI", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electronAPI = api;
}
