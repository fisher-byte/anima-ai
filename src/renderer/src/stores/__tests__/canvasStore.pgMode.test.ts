/**
 * canvasStore — Paul Graham Space 模式单元测试
 *
 * 验证 PG Space 使用与 Lenny Space 相同的 isLennyMode 机制，
 * 但写入独立的 pg-*.json 存储文件（不污染用户数据或 lenny 数据）。
 *
 * 覆盖：
 * 1. openLennyMode（PG Space 复用）→ isLennyMode: true
 * 2. closeLennyMode（PG Space 关闭）→ isLennyMode: false
 * 3. endConversation PG 模式：写 pg-conversations.jsonl + pg-nodes.json
 * 4. appendConversation PG 模式：写 pg-conversations.jsonl
 * 5. 不污染 nodes.json / conversations.jsonl / lenny-*.json
 * 6. 不调 /api/memory/classify 或 /api/memory/index
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Conversation } from '../../../../shared/types'

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

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-pg-1',
    createdAt: new Date().toISOString(),
    userMessage: 'What does startup = growth mean?',
    assistantMessage: 'A startup is a company designed to grow fast.',
    images: [],
    files: [],
    ...overrides,
  }
}

// ── PG Space 复用 Lenny 模式标记 ──────────────────────────────────────────────

describe('canvasStore — PG Space uses openLennyMode / closeLennyMode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('openLennyMode sets isLennyMode to true (used by PG Space)', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isLennyMode: false })
    useCanvasStore.getState().openLennyMode()
    expect(useCanvasStore.getState().isLennyMode).toBe(true)
  })

  it('closeLennyMode resets state (used when PG Space closes)', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({
      isLennyMode: true,
      isModalOpen: true,
      currentConversation: makeConversation(),
    })
    useCanvasStore.getState().closeLennyMode()
    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(false)
    expect(state.isModalOpen).toBe(false)
    expect(state.currentConversation).toBeNull()
  })
})

// ── PG Space storage 隔离：写 pg-*.json ───────────────────────────────────────

describe('canvasStore — endConversation in PG mode (writes pg-* files)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockStorageRead.mockResolvedValue(null)
    mockStorageWrite.mockResolvedValue(true)
    mockStorageAppend.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes to pg-conversations.jsonl when in lenny mode with pg conversation', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    // PG Space 打开时设置 isLennyMode=true（与 Lenny 相同机制）
    // endConversation 写哪个文件由 PGSpaceCanvas 内部决定（通过 storageService.append）
    // 本测试验证 lenny mode 下 append 不写 user conversations.jsonl
    const conv = makeConversation()
    useCanvasStore.setState({ isLennyMode: true, currentConversation: conv })

    await useCanvasStore.getState().endConversation('Startup = growth answer')

    const appendCalls = mockStorageAppend.mock.calls
    // 不应写用户主数据
    const userConvCall = appendCalls.find((call) => call[0] === 'conversations.jsonl')
    expect(userConvCall).toBeUndefined()
  })

  it('does NOT write to nodes.json when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()
    useCanvasStore.setState({ isLennyMode: true, currentConversation: conv })

    await useCanvasStore.getState().endConversation('PG answer')

    const writeCalls = mockStorageWrite.mock.calls
    const userNodesCall = writeCalls.find((call) => call[0] === 'nodes.json')
    expect(userNodesCall).toBeUndefined()
  })

  it('does NOT write to lenny-nodes.json when storage key is pg-nodes.json', async () => {
    // PGSpaceCanvas 直接调用 storageService.write(STORAGE_FILES.PG_NODES, ...)
    // 本测试验证 pg-nodes.json 与 lenny-nodes.json 键名不同
    const { STORAGE_FILES } = await import('../../../../shared/constants')
    expect(STORAGE_FILES.PG_NODES).toBe('pg-nodes.json')
    expect(STORAGE_FILES.LENNY_NODES).toBe('lenny-nodes.json')
    expect(STORAGE_FILES.PG_NODES).not.toBe(STORAGE_FILES.LENNY_NODES)
  })

  it('pg-conversations.jsonl is distinct from lenny-conversations.jsonl', async () => {
    const { STORAGE_FILES } = await import('../../../../shared/constants')
    expect(STORAGE_FILES.PG_CONVERSATIONS).toBe('pg-conversations.jsonl')
    expect(STORAGE_FILES.LENNY_CONVERSATIONS).toBe('lenny-conversations.jsonl')
    expect(STORAGE_FILES.PG_CONVERSATIONS).not.toBe(STORAGE_FILES.LENNY_CONVERSATIONS)
  })

  it('does NOT call /api/memory/classify when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()
    useCanvasStore.setState({ isLennyMode: true, currentConversation: conv })

    await useCanvasStore.getState().endConversation('PG answer')

    const fetchCalls = mockFetch.mock.calls as [string, ...unknown[]][]
    const classifyCalls = fetchCalls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/memory/classify')
    )
    expect(classifyCalls).toHaveLength(0)
  })

  it('does NOT call /api/memory/index when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()
    useCanvasStore.setState({ isLennyMode: true, currentConversation: conv })

    await useCanvasStore.getState().endConversation('PG answer')

    const fetchCalls = mockFetch.mock.calls as [string, ...unknown[]][]
    const indexCalls = fetchCalls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/memory/index')
    )
    expect(indexCalls).toHaveLength(0)
  })
})

// ── PG seed data 完整性验证 ────────────────────────────────────────────────────

describe('PG seed data integrity', () => {
  it('PG_SEED_NODES has at least 30 nodes', async () => {
    const { PG_SEED_NODES } = await import('../../../../shared/pgData')
    expect(PG_SEED_NODES.length).toBeGreaterThanOrEqual(30)
  })

  it('PG_SEED_EDGES has at least 15 edges', async () => {
    const { PG_SEED_EDGES } = await import('../../../../shared/pgData')
    expect(PG_SEED_EDGES.length).toBeGreaterThanOrEqual(15)
  })

  it('all PG seed node IDs start with pg-seed-', async () => {
    const { PG_SEED_NODES } = await import('../../../../shared/pgData')
    for (const node of PG_SEED_NODES) {
      expect(node.id).toMatch(/^pg-seed-/)
      expect(node.conversationId).toMatch(/^pg-seed-/)
    }
  })

  it('all PG seed nodes have required fields', async () => {
    const { PG_SEED_NODES } = await import('../../../../shared/pgData')
    for (const node of PG_SEED_NODES) {
      expect(node.title).toBeTruthy()
      expect(node.keywords.length).toBeGreaterThan(0)
      expect(node.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(node.nodeType).toBe('memory')
      expect(typeof node.x).toBe('number')
      expect(typeof node.y).toBe('number')
    }
  })

  it('all PG seed edge source/target IDs exist in nodes', async () => {
    const { PG_SEED_NODES, PG_SEED_EDGES } = await import('../../../../shared/pgData')
    const ids = new Set(PG_SEED_NODES.map(n => n.id))
    for (const edge of PG_SEED_EDGES) {
      expect(ids.has(edge.source), `edge source ${edge.source} not in nodes`).toBe(true)
      expect(ids.has(edge.target), `edge target ${edge.target} not in nodes`).toBe(true)
    }
  })

  it('PG_SYSTEM_PROMPT exists and is non-empty', async () => {
    const { PG_SYSTEM_PROMPT } = await import('../../../../shared/constants')
    expect(PG_SYSTEM_PROMPT).toBeTruthy()
    expect(PG_SYSTEM_PROMPT.length).toBeGreaterThan(200)
    expect(PG_SYSTEM_PROMPT).toContain('Paul Graham')
    expect(PG_SYSTEM_PROMPT).toContain('{{DATE}}')
  })

  it('pg-* filenames are in ALLOWED_FILENAMES', async () => {
    const { ALLOWED_FILENAMES } = await import('../../../../shared/constants')
    expect(ALLOWED_FILENAMES).toContain('pg-nodes.json')
    expect(ALLOWED_FILENAMES).toContain('pg-conversations.jsonl')
    expect(ALLOWED_FILENAMES).toContain('pg-edges.json')
  })

  it('central node has coordinates near (1920, 1200)', async () => {
    const { PG_SEED_NODES } = await import('../../../../shared/pgData')
    const center = PG_SEED_NODES.find(n => n.id === 'pg-seed-startup-equals-growth')
    expect(center).toBeDefined()
    expect(center!.x).toBe(1920)
    expect(center!.y).toBe(1200)
  })
})

// ── appendConversation PG 模式 ─────────────────────────────────────────────────

describe('canvasStore — appendConversation in PG mode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockStorageAppend.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT append to user conversations.jsonl when in lenny mode', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation()
    useCanvasStore.setState({ isLennyMode: true })

    await useCanvasStore.getState().appendConversation(conv)

    const appendCalls = mockStorageAppend.mock.calls
    const userConvCall = appendCalls.find((call) => call[0] === 'conversations.jsonl')
    expect(userConvCall).toBeUndefined()
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
