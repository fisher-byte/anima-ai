/**
 * canvasStore — Lenny Space 模式单元测试
 *
 * 覆盖 Lenny Space 新增逻辑：
 * 1. openLennyMode  → isLennyMode: true
 * 2. closeLennyMode → isLennyMode: false, isModalOpen: false, currentConversation: null
 * 3. endConversation lenny 模式：写 LENNY_CONVERSATIONS / LENNY_NODES，不调 /api/memory/classify 或 /api/memory/index
 * 4. appendConversation lenny 模式：写 LENNY_CONVERSATIONS，不调 /api/memory/index 或 /api/memory/queue
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Conversation } from '../../../../shared/types'

// ── Mock storageService before any store import ────────────────────────────────
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

// ── Mock global fetch to track /api/* calls ────────────────────────────────────
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-lenny-1',
    createdAt: new Date().toISOString(),
    userMessage: 'What is PMF?',
    assistantMessage: 'Product-market fit means your product satisfies a strong market demand.',
    images: [],
    files: [],
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('canvasStore — openLennyMode / closeLennyMode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('openLennyMode sets isLennyMode to true', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const store = useCanvasStore.getState()

    // Ensure it starts as false
    useCanvasStore.setState({ isLennyMode: false })
    expect(useCanvasStore.getState().isLennyMode).toBe(false)

    store.openLennyMode()
    expect(useCanvasStore.getState().isLennyMode).toBe(true)
  })

  it('closeLennyMode sets isLennyMode to false, isModalOpen to false, currentConversation to null', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const store = useCanvasStore.getState()

    // Set up a state that closeLennyMode should reset
    useCanvasStore.setState({
      isLennyMode: true,
      isModalOpen: true,
      currentConversation: makeConversation(),
    })

    store.closeLennyMode()

    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(false)
    expect(state.isModalOpen).toBe(false)
    expect(state.currentConversation).toBeNull()
  })
})

describe('canvasStore — endConversation in lenny mode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()

    // Default: lenny-nodes.json returns empty list
    mockStorageRead.mockResolvedValue(null)
    mockStorageWrite.mockResolvedValue(true)
    mockStorageAppend.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes to LENNY_CONVERSATIONS when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: conv,
    })

    await useCanvasStore.getState().endConversation('PMF answer from Lenny')

    // storageService.append should be called with lenny-conversations.jsonl
    const appendCalls = mockStorageAppend.mock.calls
    const lennyConvCall = appendCalls.find(
      (call) => call[0] === 'lenny-conversations.jsonl'
    )
    expect(lennyConvCall).toBeDefined()
  })

  it('writes to LENNY_NODES when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: conv,
    })

    await useCanvasStore.getState().endConversation('PMF answer from Lenny')

    // storageService.write should be called with lenny-nodes.json
    const writeCalls = mockStorageWrite.mock.calls
    const lennyNodesCall = writeCalls.find(
      (call) => call[0] === 'lenny-nodes.json'
    )
    expect(lennyNodesCall).toBeDefined()
  })

  it('does NOT write to user nodes.json when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: conv,
    })

    await useCanvasStore.getState().endConversation('Lenny answer')

    const writeCalls = mockStorageWrite.mock.calls
    const userNodesCall = writeCalls.find((call) => call[0] === 'nodes.json')
    expect(userNodesCall).toBeUndefined()
  })

  it('does NOT call /api/memory/classify when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: conv,
    })

    await useCanvasStore.getState().endConversation('Lenny answer')

    const fetchCalls = mockFetch.mock.calls as [string, ...unknown[]][]
    const classifyCalls = fetchCalls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/memory/classify')
    )
    expect(classifyCalls).toHaveLength(0)
  })

  it('does NOT call /api/memory/index when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: conv,
    })

    await useCanvasStore.getState().endConversation('Lenny answer')

    const fetchCalls = mockFetch.mock.calls as [string, ...unknown[]][]
    const indexCalls = fetchCalls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/memory/index')
    )
    expect(indexCalls).toHaveLength(0)
  })

  it('does nothing when currentConversation is null', async () => {
    const { useCanvasStore } = await import('../canvasStore')

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: null,
    })

    await useCanvasStore.getState().endConversation('no-op answer')

    expect(mockStorageAppend).not.toHaveBeenCalled()
    expect(mockStorageWrite).not.toHaveBeenCalled()
  })
})

describe('canvasStore — appendConversation in lenny mode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()

    mockStorageAppend.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('appends to LENNY_CONVERSATIONS when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({ isLennyMode: true })

    await useCanvasStore.getState().appendConversation(conv)

    const appendCalls = mockStorageAppend.mock.calls
    const lennyCall = appendCalls.find(
      (call) => call[0] === 'lenny-conversations.jsonl'
    )
    expect(lennyCall).toBeDefined()
    // Verify the conversation JSON was appended
    expect(JSON.parse(lennyCall![1])).toMatchObject({ id: conv.id })
  })

  it('does NOT append to user conversations.jsonl when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({ isLennyMode: true })

    await useCanvasStore.getState().appendConversation(conv)

    const appendCalls = mockStorageAppend.mock.calls
    const userConvCall = appendCalls.find(
      (call) => call[0] === 'conversations.jsonl'
    )
    expect(userConvCall).toBeUndefined()
  })

  it('does NOT call /api/memory/index when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({ isLennyMode: true })

    await useCanvasStore.getState().appendConversation(conv)

    // Wait a tick to ensure any fire-and-forget promises run
    await new Promise((r) => setTimeout(r, 0))

    const fetchCalls = mockFetch.mock.calls as [string, ...unknown[]][]
    const indexCalls = fetchCalls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/memory/index')
    )
    expect(indexCalls).toHaveLength(0)
  })

  it('does NOT call /api/memory/queue when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({ isLennyMode: true })

    await useCanvasStore.getState().appendConversation(conv)

    await new Promise((r) => setTimeout(r, 0))

    const fetchCalls = mockFetch.mock.calls as [string, ...unknown[]][]
    const queueCalls = fetchCalls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/memory/queue')
    )
    expect(queueCalls).toHaveLength(0)
  })
})
