import { app, shell, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const DATA_DIR = join(app.getPath('userData'), 'data')
const API_KEY_FILE = join(app.getPath('userData'), 'api_key.enc')

// 允许的文件名白名单（防止路径遍历）
const ALLOWED_FILENAMES = ['profile.json', 'nodes.json', 'conversations.jsonl']

/**
 * 验证文件名是否合法
 */
function isValidFilename(filename: string): boolean {
  // 检查是否在允许列表中
  if (!ALLOWED_FILENAMES.includes(filename)) {
    return false
  }
  // 检查是否包含路径遍历字符
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false
  }
  return true
}

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

  // 存储操作IPC - 已添加文件名验证防止路径遍历
  ipcMain.handle('storage:read', async (_, filename: string) => {
    if (!isValidFilename(filename)) {
      throw new Error(`Invalid filename: ${filename}`)
    }
    await ensureDataDir()
    const filepath = join(DATA_DIR, filename)
    if (!existsSync(filepath)) return null
    const content = await readFile(filepath, 'utf-8')
    return content
  })

  ipcMain.handle('storage:write', async (_, filename: string, content: string) => {
    if (!isValidFilename(filename)) {
      throw new Error(`Invalid filename: ${filename}`)
    }
    await ensureDataDir()
    const filepath = join(DATA_DIR, filename)
    await writeFile(filepath, content, 'utf-8')
    return true
  })

  ipcMain.handle('storage:append', async (_, filename: string, content: string) => {
    if (!isValidFilename(filename)) {
      throw new Error(`Invalid filename: ${filename}`)
    }
    await ensureDataDir()
    const filepath = join(DATA_DIR, filename)
    await writeFile(filepath, content + '\n', { flag: 'a', encoding: 'utf-8' })
    return true
  })

  // API Key 安全存储管理
  ipcMain.handle('config:getApiKey', async () => {
    try {
      if (!existsSync(API_KEY_FILE)) {
        return ''
      }
      const encrypted = await readFile(API_KEY_FILE)
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encrypted)
      }
      return encrypted.toString('utf-8')
    } catch (error) {
      console.error('Failed to get API key:', error)
      return ''
    }
  })

  ipcMain.handle('config:setApiKey', async (_, apiKey: string) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(apiKey)
        await writeFile(API_KEY_FILE, encrypted)
      } else {
        await writeFile(API_KEY_FILE, apiKey, 'utf-8')
      }
      return true
    } catch (error) {
      console.error('Failed to set API key:', error)
      return false
    }
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
