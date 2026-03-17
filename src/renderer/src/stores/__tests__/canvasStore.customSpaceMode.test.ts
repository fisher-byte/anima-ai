/**
 * canvasStore — Custom Space 模式单元测试
 *
 * 覆盖：
 * 1. openCustomSpaceMode → isCustomSpaceMode: true, isLennyMode: false 等
 * 2. closeCustomSpaceMode → isCustomSpaceMode: false
 * 3. createCustomSpace → 写 custom-spaces.json, 追加到 customSpaces[]
 * 4. createCustomSpace max 5 → 抛出错误
 * 5. deleteCustomSpace → 从 customSpaces[] 移除
 * 6. addNode early-returns in customSpace mode → nodes.json NOT written
 * 7. appendConversation customSpace mode → 写 custom-{id}-conversations.jsonl
 * 8. isValidFilename 接受 custom-{8}-nodes.json / custom-{8}-conversations.jsonl / custom-{8}-edges.json
 * 9. isValidFilename 拒绝 custom-spaces.json 之外的不合规文件名
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Conversation, CustomSpaceConfig } from '../../../../shared/types'

// ── Mock storageService ────────────────────────────────────────────────────────
const mockStorageRead = vi.fn()
const mockStorageWrite = vi.fn()
const mockStorageAppend = vi.fn()

vi.mock('../../services/storageService', () => ({
  storageService: {
    read: (...args: unknown[]) => mockStorageRead(...args),
    write: (...args: unknown[]) => mockStorageWrite(...args),
    append: (...args: unknown[]) => mockStorageAppend(...args),
  },
  historyService: {
    saveHistory: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
    deleteHistory: vi.fn(),
  },
  configService: {
    getApiKey: vi.fn().mockResolvedValue(''),
    setApiKey: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({ model: '', baseUrl: '' }),
    saveSettings: vi.fn(),
  },
  getAuthToken: () => null,
  setAuthToken: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-custom-1',
    createdAt: new Date().toISOString(),
    userMessage: 'Hello',
    assistantMessage: 'Hi there',
    images: [],
    files: [],
    ...overrides,
  }
}

function makeSpaceConfig(overrides: Partial<CustomSpaceConfig> = {}): Omit<CustomSpaceConfig, 'id' | 'createdAt'> {
  return {
    name: 'Test Persona',
    topic: 'Testing things',
    colorKey: 'indigo',
    systemPrompt: 'You are a test persona.',
    avatarInitials: 'TP',
    ...overrides,
  }
}

// ── Tests: openCustomSpaceMode / closeCustomSpaceMode ─────────────────────────

describe('canvasStore — openCustomSpaceMode / closeCustomSpaceMode', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('openCustomSpaceMode sets isCustomSpaceMode=true and clears other modes', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isCustomSpaceMode: false, isLennyMode: true, isPGMode: true, isZhangMode: true, isWangMode: true })

    useCanvasStore.getState().openCustomSpaceMode('abc12345')

    const state = useCanvasStore.getState()
    expect(state.isCustomSpaceMode).toBe(true)
    expect(state.activeCustomSpaceId).toBe('abc12345')
    expect(state.isLennyMode).toBe(false)
    expect(state.isPGMode).toBe(false)
    expect(state.isZhangMode).toBe(false)
    expect(state.isWangMode).toBe(false)
  })

  it('openCustomSpaceMode clears onboarding/modal residue', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({
      isOnboardingMode: true,
      onboardingPhase: 3,
      onboardingResumeTurns: [{ user: 'intro', assistant: 'ok' }],
      isModalOpen: true,
      currentConversation: makeConversation({ id: 'onboarding-conv' }),
      conversationHistory: [{ role: 'user', content: 'intro' }],
    })

    useCanvasStore.getState().openCustomSpaceMode('abc12345')

    const state = useCanvasStore.getState()
    expect(state.isOnboardingMode).toBe(false)
    expect(state.onboardingPhase).toBe(0)
    expect(state.onboardingResumeTurns).toBeNull()
    expect(state.isModalOpen).toBe(false)
    expect(state.currentConversation).toBeNull()
    expect(state.conversationHistory).toEqual([])
  })

  it('closeCustomSpaceMode resets isCustomSpaceMode and activeCustomSpaceId', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isCustomSpaceMode: true, activeCustomSpaceId: 'abc12345' })

    useCanvasStore.getState().closeCustomSpaceMode()

    const state = useCanvasStore.getState()
    expect(state.isCustomSpaceMode).toBe(false)
    expect(state.activeCustomSpaceId).toBe(null)
    expect(state.isModalOpen).toBe(false)
    expect(state.currentConversation).toBe(null)
  })

  it('openCustomSpaceMode is mutually exclusive with Lenny', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isLennyMode: true })

    useCanvasStore.getState().openCustomSpaceMode('xyz99999')

    expect(useCanvasStore.getState().isLennyMode).toBe(false)
    expect(useCanvasStore.getState().isCustomSpaceMode).toBe(true)
  })
})

// ── Tests: createCustomSpace ───────────────────────────────────────────────────

describe('canvasStore — createCustomSpace', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
    mockStorageWrite.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('createCustomSpace returns config with generated id and writes custom-spaces.json', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ customSpaces: [] })

    const config = makeSpaceConfig()
    const result = await useCanvasStore.getState().createCustomSpace(config)

    // Should have an 8-char lowercase id
    expect(result.id).toMatch(/^[a-z0-9]{8}$/)
    expect(result.name).toBe('Test Persona')
    expect(result.colorKey).toBe('indigo')

    // Should write custom-spaces.json
    const writeCall = mockStorageWrite.mock.calls.find(c => c[0] === 'custom-spaces.json')
    expect(writeCall).toBeTruthy()
  })

  it('createCustomSpace appends to customSpaces array in store', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ customSpaces: [] })

    await useCanvasStore.getState().createCustomSpace(makeSpaceConfig({ name: 'Persona A' }))
    expect(useCanvasStore.getState().customSpaces).toHaveLength(1)

    await useCanvasStore.getState().createCustomSpace(makeSpaceConfig({ name: 'Persona B' }))
    expect(useCanvasStore.getState().customSpaces).toHaveLength(2)
    expect(useCanvasStore.getState().customSpaces[1].name).toBe('Persona B')
  })

  it('createCustomSpace throws when customSpaces.length >= 5', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const existing: CustomSpaceConfig[] = Array.from({ length: 5 }, (_, i) => ({
      id: `space${i}xxx`,
      name: `Space ${i}`,
      topic: 'Test',
      colorKey: 'indigo' as const,
      systemPrompt: 'Test',
      avatarInitials: 'TS',
      createdAt: new Date().toISOString(),
    }))
    useCanvasStore.setState({ customSpaces: existing })

    await expect(
      useCanvasStore.getState().createCustomSpace(makeSpaceConfig())
    ).rejects.toThrow()
  })
})

// ── Tests: deleteCustomSpace ───────────────────────────────────────────────────

describe('canvasStore — deleteCustomSpace', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
    mockStorageWrite.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deleteCustomSpace removes the space from customSpaces[]', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const spaces: CustomSpaceConfig[] = [
      { id: 'aaaabbbb', name: 'A', topic: '', colorKey: 'indigo', systemPrompt: '', avatarInitials: 'A', createdAt: '' },
      { id: 'ccccdddd', name: 'C', topic: '', colorKey: 'rose', systemPrompt: '', avatarInitials: 'C', createdAt: '' },
    ]
    useCanvasStore.setState({ customSpaces: spaces, isCustomSpaceMode: false })

    await useCanvasStore.getState().deleteCustomSpace('aaaabbbb')

    const remaining = useCanvasStore.getState().customSpaces
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe('ccccdddd')
  })

  it('deleteCustomSpace writes updated custom-spaces.json', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const spaces: CustomSpaceConfig[] = [
      { id: 'aaaabbbb', name: 'A', topic: '', colorKey: 'indigo', systemPrompt: '', avatarInitials: 'A', createdAt: '' },
    ]
    useCanvasStore.setState({ customSpaces: spaces })

    await useCanvasStore.getState().deleteCustomSpace('aaaabbbb')

    const writeCall = mockStorageWrite.mock.calls.find(c => c[0] === 'custom-spaces.json')
    expect(writeCall).toBeTruthy()
  })
})

// ── Tests: addNode early-return in customSpace mode ───────────────────────────

describe('canvasStore — addNode storage isolation in customSpaceMode', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('addNode does NOT write nodes.json when isCustomSpaceMode=true', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isCustomSpaceMode: true, activeCustomSpaceId: 'abc12345', nodes: [] })

    const conv = makeConversation()
    await useCanvasStore.getState().addNode(conv)

    const wrote = mockStorageWrite.mock.calls.some(c => c[0] === 'nodes.json')
    expect(wrote).toBe(false)
  })
})

// ── Tests: appendConversation in customSpace mode ─────────────────────────────

describe('canvasStore — appendConversation in customSpaceMode', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
    mockStorageAppend.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('appendConversation writes to custom-{id}-conversations.jsonl in customSpaceMode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isCustomSpaceMode: true, activeCustomSpaceId: 'abc12345' })

    const conv = makeConversation()
    await useCanvasStore.getState().appendConversation(conv)

    const appendCall = mockStorageAppend.mock.calls.find(c => c[0] === 'custom-abc12345-conversations.jsonl')
    expect(appendCall).toBeTruthy()

    // Should NOT append to main conversations.jsonl
    const mainCall = mockStorageAppend.mock.calls.find(c => c[0] === 'conversations.jsonl')
    expect(mainCall).toBeFalsy()
  })
})

// ── Tests: isValidFilename for custom space files ──────────────────────────────

describe('isValidFilename — custom space file patterns', () => {
  it('accepts custom-{8}-nodes.json', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('custom-abc12345-nodes.json')).toBe(true)
    expect(isValidFilename('custom-00000000-nodes.json')).toBe(true)
  })

  it('accepts custom-{8}-conversations.jsonl', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('custom-abc12345-conversations.jsonl')).toBe(true)
  })

  it('accepts custom-{8}-edges.json', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('custom-abc12345-edges.json')).toBe(true)
  })

  it('accepts custom-spaces.json (static allowlist)', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('custom-spaces.json')).toBe(true)
  })

  it('rejects custom-{7}-nodes.json (id too short)', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('custom-abc1234-nodes.json')).toBe(false)
  })

  it('rejects custom-{9}-nodes.json (id too long)', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('custom-abc123456-nodes.json')).toBe(false)
  })

  it('rejects path traversal attempts', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('../custom-abc12345-nodes.json')).toBe(false)
    expect(isValidFilename('custom-abc12345-nodes.json/../evil')).toBe(false)
  })

  it('rejects uppercase letters in custom space id', async () => {
    const { isValidFilename } = await import('../../../../shared/constants')
    expect(isValidFilename('custom-ABC12345-nodes.json')).toBe(false)
  })
})
