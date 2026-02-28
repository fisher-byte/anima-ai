import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const DATA_DIR = join(app.getPath('userData'), 'data')

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.evocanvas')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('storage:read', async (_, filename: string) => {
    await ensureDataDir()
    const filepath = join(DATA_DIR, filename)
    if (!existsSync(filepath)) return null
    const content = await readFile(filepath, 'utf-8')
    return content
  })

  ipcMain.handle('storage:write', async (_, filename: string, content: string) => {
    await ensureDataDir()
    const filepath = join(DATA_DIR, filename)
    await writeFile(filepath, content, 'utf-8')
    return true
  })

  ipcMain.handle('storage:append', async (_, filename: string, content: string) => {
    await ensureDataDir()
    const filepath = join(DATA_DIR, filename)
    await writeFile(filepath, content + '\n', { flag: 'a', encoding: 'utf-8' })
    return true
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
