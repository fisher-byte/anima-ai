import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCESS_TOKEN_KEY, USER_TOKEN_KEY } from '../constants/userToken'

const originalFetch = global.fetch
const storage = new Map<string, string>()

const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
}

describe('repairStaleAutoToken', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    localStorage.clear()
    vi.resetModules()
    global.fetch = vi.fn()
  })

  it('keeps the token when the current token db already has a usable key', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ hasKey: true }),
    } as Response)

    const { repairStaleAutoToken, USER_TOKEN_KEY } = await import('../App')
    localStorage.setItem(USER_TOKEN_KEY, 'token-1')

    await expect(repairStaleAutoToken('token-1')).resolves.toBe('token-1')
    expect(localStorage.getItem(USER_TOKEN_KEY)).toBe('token-1')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('clears a stale token when only the default db has a usable key', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hasKey: false }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hasKey: true }),
      } as Response)

    const { repairStaleAutoToken, USER_TOKEN_KEY } = await import('../App')
    localStorage.setItem(USER_TOKEN_KEY, 'token-2')

    await expect(repairStaleAutoToken('token-2')).resolves.toBeNull()
    expect(localStorage.getItem(USER_TOKEN_KEY)).toBeNull()
  })

  it('keeps the token when neither current nor default db has a usable key', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hasKey: false }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hasKey: false }),
      } as Response)

    const { repairStaleAutoToken, USER_TOKEN_KEY } = await import('../App')
    localStorage.setItem(USER_TOKEN_KEY, 'token-3')

    await expect(repairStaleAutoToken('token-3')).resolves.toBe('token-3')
    expect(localStorage.getItem(USER_TOKEN_KEY)).toBe('token-3')
  })

  it('returns null when there is no token to repair', async () => {
    const { repairStaleAutoToken } = await import('../App')
    await expect(repairStaleAutoToken(null)).resolves.toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('migrateLegacyAccessTokenIfNeeded', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    localStorage.clear()
    vi.resetModules()
  })

  it('copies anima_access_token to anima_user_token and removes legacy key', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'legacy-only')
    const { migrateLegacyAccessTokenIfNeeded } = await import('../App')
    migrateLegacyAccessTokenIfNeeded()
    expect(localStorage.getItem(USER_TOKEN_KEY)).toBe('legacy-only')
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull()
  })

  it('does not overwrite existing user token', async () => {
    localStorage.setItem(USER_TOKEN_KEY, 'user-1')
    localStorage.setItem(ACCESS_TOKEN_KEY, 'other')
    const { migrateLegacyAccessTokenIfNeeded } = await import('../App')
    migrateLegacyAccessTokenIfNeeded()
    expect(localStorage.getItem(USER_TOKEN_KEY)).toBe('user-1')
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull()
  })
})

afterAll(() => {
  global.fetch = originalFetch
})
