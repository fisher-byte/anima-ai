/**
 * canvasStore — Lenny Space 模式单元测试
 *
 * 覆盖 Lenny Space 新增逻辑：
 * 1. openLennyMode  → isLennyMode: true
 * 2. closeLennyMode → isLennyMode: false, isModalOpen: false, currentConversation: null
 * 3. endConversation lenny 模式：写 LENNY_CONVERSATIONS / LENNY_NODES，不调 /api/memory/classify 或 /api/memory/index
 * 4. appendConversation lenny 模式：写 LENNY_CONVERSATIONS，不调 /api/memory/index 或 /api/memory/queue
 * 5. P0-1 fix: addNode early-returns in Lenny mode → nodes.json NOT written (no main space pollution)
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
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
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

  it('openLennyMode clears onboarding/modal residue before entering Lenny Space', async () => {
    const { useCanvasStore } = await import('../canvasStore')

    useCanvasStore.setState({
      isOnboardingMode: true,
      onboardingPhase: 2,
      onboardingResumeTurns: [{ user: 'hello', assistant: 'world' }],
      isModalOpen: true,
      currentConversation: makeConversation({ id: 'onboarding-conv' }),
      conversationHistory: [{ role: 'user', content: 'hello' }],
    })

    useCanvasStore.getState().openLennyMode()

    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(true)
    expect(state.isOnboardingMode).toBe(false)
    expect(state.onboardingPhase).toBe(0)
    expect(state.onboardingResumeTurns).toBeNull()
    expect(state.isModalOpen).toBe(false)
    expect(state.currentConversation).toBeNull()
    expect(state.conversationHistory).toEqual([])
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

  it('setLennyDecisionMode updates the active Lenny response mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')

    useCanvasStore.getState().setLennyDecisionMode('decision')
    expect(useCanvasStore.getState().lennyDecisionMode).toBe('decision')

    useCanvasStore.getState().setLennyDecisionMode('normal')
    expect(useCanvasStore.getState().lennyDecisionMode).toBe('normal')
  })

  it('setLennyDecisionMode keeps the active pure-Lenny conversation mode in sync', async () => {
    const { useCanvasStore } = await import('../canvasStore')

    useCanvasStore.setState({
      isLennyMode: true,
      isPGMode: false,
      isZhangMode: false,
      isWangMode: false,
      currentConversation: makeConversation({
        decisionTrace: {
          mode: 'decision',
          matchedDecisionUnitIds: ['unit-1'],
        },
      }),
    })

    useCanvasStore.getState().setLennyDecisionMode('normal')
    expect(useCanvasStore.getState().currentConversation?.decisionTrace).toEqual({ mode: 'normal', personaId: 'lenny' })

    useCanvasStore.getState().setLennyDecisionMode('decision')
    expect(useCanvasStore.getState().currentConversation?.decisionTrace).toMatchObject({ mode: 'decision', personaId: 'lenny' })
  })

  it('startConversation stores decisionTrace.mode for pure Lenny conversations', async () => {
    const { useCanvasStore } = await import('../canvasStore')

    useCanvasStore.setState({
      isLennyMode: true,
      isPGMode: false,
      isZhangMode: false,
      isWangMode: false,
      lennyDecisionMode: 'decision',
    })

    await useCanvasStore.getState().startConversation('How should I prioritize this roadmap?')

    expect(useCanvasStore.getState().currentConversation?.decisionTrace?.mode).toBe('decision')
  })
})

describe('canvasStore — endConversation in lenny mode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
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

  it('does NOT write to nodes.json when in lenny mode (addNode early return prevents main space pollution)', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: conv,
    })

    await useCanvasStore.getState().endConversation('Lenny answer')

    // P0-1 fix: addNode early-returns when isLennyMode is true, so nodes.json must NOT be written.
    // Lenny conversation nodes are written to lenny-nodes.json in the endConversation Lenny branch.
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

  it('syncs decisionTrace metadata to /api/memory/sync-lenny-conv', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation({
      decisionTrace: {
        mode: 'decision',
        matchedDecisionUnitIds: ['lenny-rice-prioritize-with-confidence'],
        sourceRefs: [{
          id: 'src-lenny-rice',
          label: 'RICE Prioritization Framework',
          type: 'framework',
          path: 'people/product/lenny-rachitsky/frameworks/rice-prioritization-framework.md',
          locator: 'L101',
          excerpt: '- **50% = Low Confidence（低信心）**: 主要基于直觉或假设',
          evidenceLevel: 'B',
        }],
      },
    })

    useCanvasStore.setState({
      isLennyMode: true,
      currentConversation: conv,
    })

    await useCanvasStore.getState().endConversation('Use RICE and make confidence explicit.')

    const syncCall = (mockFetch.mock.calls as [string, RequestInit][]).find(([url]) =>
      typeof url === 'string' && url.includes('/api/memory/sync-lenny-conv')
    )

    expect(syncCall).toBeDefined()
    const body = JSON.parse(String(syncCall?.[1]?.body ?? '{}'))
    expect(body.decisionTrace?.mode).toBe('decision')
    expect(body.decisionTrace?.matchedDecisionUnitIds).toContain('lenny-rice-prioritize-with-confidence')
    expect(body.decisionTrace?.sourceRefs?.[0]?.locator).toBe('L101')
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
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
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
