/**
 * Storage Service Abstraction Layer
 *
 * Provides a unified interface for storage operations, supporting:
 * - Web mode: HTTP API calls to the Hono backend
 * - Electron mode: IPC calls via window.electronAPI
 *
 * Auto-selects the appropriate implementation based on environment.
 */

import type { StorageService } from '@shared/types'

// ─── Web Implementation (HTTP) ────────────────────────────────────────────────

class WebStorageService implements StorageService {
  private baseUrl = '/api'
  private token: string | null = null

  setToken(token: string) {
    this.token = token
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'text/plain' }
    if (this.token) h['Authorization'] = `Bearer ${this.token}`
    return h
  }

  async read(filename: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/storage/${encodeURIComponent(filename)}`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {}
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Storage read failed: ${res.status}`)
      return await res.text()
    } catch (error) {
      console.error('WebStorageService.read failed:', error)
      return null
    }
  }

  async write(filename: string, content: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/storage/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: this.headers(),
        body: content
      })
      return res.ok
    } catch (error) {
      console.error('WebStorageService.write failed:', error)
      return false
    }
  }

  async append(filename: string, content: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/storage/${encodeURIComponent(filename)}/append`, {
        method: 'POST',
        headers: this.headers(),
        body: content
      })
      return res.ok
    } catch (error) {
      console.error('WebStorageService.append failed:', error)
      return false
    }
  }
}

// ─── Electron Implementation (IPC) ───────────────────────────────────────────

class ElectronStorageService implements StorageService {
  async read(filename: string): Promise<string | null> {
    return window.electronAPI.storage.read(filename)
  }

  async write(filename: string, content: string): Promise<boolean> {
    return window.electronAPI.storage.write(filename, content)
  }

  async append(filename: string, content: string): Promise<boolean> {
    return window.electronAPI.storage.append(filename, content)
  }
}

// ─── Config Service ───────────────────────────────────────────────────────────

class WebConfigService {
  private baseUrl = '/api'
  private token: string | null = null

  setToken(token: string) {
    this.token = token
  }

  private authHeader(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  async getApiKey(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/config/apikey`, {
        headers: this.authHeader()
      })
      if (!res.ok) return ''
      const data = await res.json()
      return data.apiKey ?? ''
    } catch {
      return ''
    }
  }

  async setApiKey(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/config/apikey`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...this.authHeader() },
        body: JSON.stringify({ apiKey })
      })
      return res.ok
    } catch {
      return false
    }
  }

  async getSettings(): Promise<{ model: string; baseUrl: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/config/settings`, {
        headers: this.authHeader()
      })
      if (!res.ok) return { model: '', baseUrl: '' }
      return res.json()
    } catch {
      return { model: '', baseUrl: '' }
    }
  }

  async saveSettings(settings: { model?: string; baseUrl?: string }): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/config/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...this.authHeader() },
        body: JSON.stringify(settings)
      })
      return res.ok
    } catch {
      return false
    }
  }
}

class ElectronConfigService {
  async getApiKey(): Promise<string> {
    return window.electronAPI.config.getApiKey()
  }

  async setApiKey(apiKey: string): Promise<boolean> {
    return window.electronAPI.config.setApiKey(apiKey)
  }

  // In Electron mode, model/baseUrl are stored in settings.json via storageService
  async getSettings(): Promise<{ model: string; baseUrl: string }> {
    return { model: '', baseUrl: '' }
  }

  async saveSettings(_settings: { model?: string; baseUrl?: string }): Promise<boolean> {
    return true
  }
}

// ─── Environment Detection & Export ──────────────────────────────────────────

const isElectron =
  typeof window !== 'undefined' &&
  typeof (window as any).electronAPI !== 'undefined'

const _webStorage = new WebStorageService()
const _webConfig = new WebConfigService()

export const storageService: StorageService = isElectron
  ? new ElectronStorageService()
  : _webStorage

export const configService = isElectron
  ? new ElectronConfigService()
  : _webConfig

/**
 * Set the Bearer token for Web mode (used when AUTH_ENABLED=true on the server).
 * Call this once at app startup after reading the token from localStorage or env.
 */
export function setAuthToken(token: string) {
  if (!isElectron) {
    _webStorage.setToken(token)
    _webConfig.setToken(token)
  }
}
