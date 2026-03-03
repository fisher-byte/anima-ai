/**
 * storageService unit tests (WebStorageService only)
 *
 * Tests the HTTP-based WebStorageService using a mocked fetch.
 * ElectronStorageService delegates to window.electronAPI which is tested
 * implicitly by the Electron integration — no unit tests needed there.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock fetch globally before importing the module ───────────────────────────
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Make sure we're in "Web" mode by ensuring window.electronAPI is undefined
// (it's undefined in vitest's jsdom / node environment by default)
// We re-import the module fresh for each test group via dynamic import.

// Helper to build a mock Response
function mockResponse(status: number, body: string, contentType = 'text/plain'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType }
  })
}

function mockJsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebStorageService', () => {
  // We import the module fresh here. Since vitest caches modules, we use
  // the cached version and just reset fetch mocks between tests.

  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('read()', () => {
    it('returns content string on 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '{"rules":[]}'))

      const { storageService } = await import('../storageService')
      const result = await storageService.read('profile.json')
      expect(result).toBe('{"rules":[]}')
    })

    it('returns null on 404', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(404, ''))

      const { storageService } = await import('../storageService')
      const result = await storageService.read('profile.json')
      expect(result).toBeNull()
    })

    it('returns null on network error (does not throw)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { storageService } = await import('../storageService')
      const result = await storageService.read('profile.json')
      expect(result).toBeNull()
    })

    it('calls the correct URL', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, '[]'))

      const { storageService } = await import('../storageService')
      await storageService.read('nodes.json')

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/nodes.json',
        expect.objectContaining({ headers: expect.any(Object) })
      )
    })
  })

  describe('write()', () => {
    it('returns true on 200', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }))

      const { storageService } = await import('../storageService')
      const result = await storageService.write('nodes.json', '[]')
      expect(result).toBe(true)
    })

    it('returns false on non-ok status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(400, 'Bad request'))

      const { storageService } = await import('../storageService')
      const result = await storageService.write('nodes.json', '[]')
      expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { storageService } = await import('../storageService')
      const result = await storageService.write('nodes.json', '[]')
      expect(result).toBe(false)
    })

    it('sends PUT request with correct body', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }))

      const { storageService } = await import('../storageService')
      await storageService.write('profile.json', '{"rules":[]}')

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/profile.json',
        expect.objectContaining({
          method: 'PUT',
          body: '{"rules":[]}'
        })
      )
    })
  })

  describe('append()', () => {
    it('returns true on 200', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }))

      const { storageService } = await import('../storageService')
      const result = await storageService.append('conversations.jsonl', '{"id":"1"}')
      expect(result).toBe(true)
    })

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('offline'))

      const { storageService } = await import('../storageService')
      const result = await storageService.append('conversations.jsonl', 'x')
      expect(result).toBe(false)
    })

    it('sends POST request to /append endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }))

      const { storageService } = await import('../storageService')
      await storageService.append('conversations.jsonl', '{"id":"abc"}')

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/storage/conversations.jsonl/append',
        expect.objectContaining({ method: 'POST', body: '{"id":"abc"}' })
      )
    })
  })
})

describe('WebConfigService', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('getApiKey()', () => {
    it('returns the stored API key', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { apiKey: 'sk-test' }))

      const { configService } = await import('../storageService')
      const key = await configService.getApiKey()
      expect(key).toBe('sk-test')
    })

    it('returns empty string when not set', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { apiKey: '' }))

      const { configService } = await import('../storageService')
      const key = await configService.getApiKey()
      expect(key).toBe('')
    })

    it('returns empty string on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      const { configService } = await import('../storageService')
      const key = await configService.getApiKey()
      expect(key).toBe('')
    })
  })

  describe('setApiKey()', () => {
    it('returns true on success', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }))

      const { configService } = await import('../storageService')
      const result = await configService.setApiKey('sk-new')
      expect(result).toBe(true)
    })

    it('sends PUT with correct JSON body', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }))

      const { configService } = await import('../storageService')
      await configService.setApiKey('sk-hello')

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/config/apikey',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ apiKey: 'sk-hello' })
        })
      )
    })

    it('returns false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      const { configService } = await import('../storageService')
      const result = await configService.setApiKey('sk-x')
      expect(result).toBe(false)
    })
  })

  describe('getSettings()', () => {
    it('returns model and baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, { model: 'kimi-k2.5', baseUrl: 'https://api.moonshot.cn/v1' })
      )

      const { configService } = await import('../storageService')
      const settings = await configService.getSettings()
      expect(settings.model).toBe('kimi-k2.5')
      expect(settings.baseUrl).toBe('https://api.moonshot.cn/v1')
    })

    it('returns empty strings on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fail'))

      const { configService } = await import('../storageService')
      const settings = await configService.getSettings()
      expect(settings.model).toBe('')
      expect(settings.baseUrl).toBe('')
    })
  })

  describe('saveSettings()', () => {
    it('sends PUT with model and baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }))

      const { configService } = await import('../storageService')
      await configService.saveSettings({ model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/config/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1' })
        })
      )
    })
  })
})

describe('setAuthToken', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('injects Authorization header into subsequent requests', async () => {
    const { setAuthToken, storageService } = await import('../storageService')
    setAuthToken('my-token')

    mockFetch.mockResolvedValueOnce(mockResponse(200, '[]'))
    await storageService.read('nodes.json')

    const callArgs = mockFetch.mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers?.Authorization).toBe('Bearer my-token')

    // Reset token
    setAuthToken('')
  })
})
