import { app, ipcMain, safeStorage, BrowserWindow, shell } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require2 = __cjs_mod__.createRequire(import.meta.url);
const DATA_DIR = join(app.getPath("userData"), "data");
const API_KEY_FILE = join(app.getPath("userData"), "api_key.enc");
const ALLOWED_FILENAMES = ["profile.json", "nodes.json", "conversations.jsonl"];
function isValidFilename(filename) {
  if (!ALLOWED_FILENAMES.includes(filename)) {
    return false;
  }
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return false;
  }
  return true;
}
async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron.evocanvas");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  ipcMain.handle("storage:read", async (_, filename) => {
    if (!isValidFilename(filename)) {
      throw new Error(`Invalid filename: ${filename}`);
    }
    await ensureDataDir();
    const filepath = join(DATA_DIR, filename);
    if (!existsSync(filepath)) return null;
    const content = await readFile(filepath, "utf-8");
    return content;
  });
  ipcMain.handle("storage:write", async (_, filename, content) => {
    if (!isValidFilename(filename)) {
      throw new Error(`Invalid filename: ${filename}`);
    }
    await ensureDataDir();
    const filepath = join(DATA_DIR, filename);
    await writeFile(filepath, content, "utf-8");
    return true;
  });
  ipcMain.handle("storage:append", async (_, filename, content) => {
    if (!isValidFilename(filename)) {
      throw new Error(`Invalid filename: ${filename}`);
    }
    await ensureDataDir();
    const filepath = join(DATA_DIR, filename);
    await writeFile(filepath, content + "\n", { flag: "a", encoding: "utf-8" });
    return true;
  });
  ipcMain.handle("config:getApiKey", async () => {
    try {
      if (!existsSync(API_KEY_FILE)) {
        return "";
      }
      const encrypted = await readFile(API_KEY_FILE);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encrypted);
      }
      return encrypted.toString("utf-8");
    } catch (error) {
      console.error("Failed to get API key:", error);
      return "";
    }
  });
  ipcMain.handle("config:setApiKey", async (_, apiKey) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(apiKey);
        await writeFile(API_KEY_FILE, encrypted);
      } else {
        await writeFile(API_KEY_FILE, apiKey, "utf-8");
      }
      return true;
    } catch (error) {
      console.error("Failed to set API key:", error);
      return false;
    }
  });
  createWindow();
  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
