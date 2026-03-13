/**
 * canvasStore — Zhang Xiaolong & Wang Huiwen Space 模式单元测试
 *
 * 验证 Zhang/Wang Space 与 PG Space 相同的存储隔离机制，
 * 使用独立的 zhang-X.json / wang-X.json 存储文件。
 *
 * 覆盖：
 * 1. openZhangMode → isLennyMode: true, isZhangMode: true
 * 2. closeZhangMode → 全部标志重置
 * 3. openWangMode → isLennyMode: true, isWangMode: true
 * 4. closeWangMode → 全部标志重置
 * 5. Zhang/Wang 存储文件键名唯一性
 * 6. Zhang/Wang seed data 完整性
 * 7. Zhang/Wang 系统 prompt 存在性
 * 8. ALLOWED_FILENAMES 包含所有 zhang-X / wang-X 文件
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// ── Zhang Space 模式标志 ────────────────────────────────────────────────────────

describe('canvasStore — Zhang Space openZhangMode / closeZhangMode', () => {
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

  it('openZhangMode sets isLennyMode=true and isZhangMode=true', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isLennyMode: false, isZhangMode: false, isPGMode: false, isWangMode: false })
    useCanvasStore.getState().openZhangMode()
    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(true)
    expect(state.isZhangMode).toBe(true)
    expect(state.isPGMode).toBe(false)
    expect(state.isWangMode).toBe(false)
  })

  it('closeZhangMode resets all space flags and modal state', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({
      isLennyMode: true,
      isZhangMode: true,
      isPGMode: false,
      isWangMode: false,
      isModalOpen: true,
      currentConversation: null,
    })
    useCanvasStore.getState().closeZhangMode()
    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(false)
    expect(state.isZhangMode).toBe(false)
    expect(state.isPGMode).toBe(false)
    expect(state.isWangMode).toBe(false)
    expect(state.isModalOpen).toBe(false)
  })

  it('openZhangMode clears any previously active space', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    // Simulate switching from PG to Zhang
    useCanvasStore.setState({ isLennyMode: true, isPGMode: true, isZhangMode: false, isWangMode: false })
    useCanvasStore.getState().openZhangMode()
    const state = useCanvasStore.getState()
    expect(state.isPGMode).toBe(false)
    expect(state.isZhangMode).toBe(true)
    expect(state.isLennyMode).toBe(true)
  })
})

// ── Wang Space 模式标志 ────────────────────────────────────────────────────────

describe('canvasStore — Wang Space openWangMode / closeWangMode', () => {
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

  it('openWangMode sets isLennyMode=true and isWangMode=true', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isLennyMode: false, isWangMode: false, isPGMode: false, isZhangMode: false })
    useCanvasStore.getState().openWangMode()
    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(true)
    expect(state.isWangMode).toBe(true)
    expect(state.isPGMode).toBe(false)
    expect(state.isZhangMode).toBe(false)
  })

  it('closeWangMode resets all space flags and modal state', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({
      isLennyMode: true,
      isWangMode: true,
      isPGMode: false,
      isZhangMode: false,
      isModalOpen: true,
      currentConversation: null,
    })
    useCanvasStore.getState().closeWangMode()
    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(false)
    expect(state.isWangMode).toBe(false)
    expect(state.isPGMode).toBe(false)
    expect(state.isZhangMode).toBe(false)
    expect(state.isModalOpen).toBe(false)
  })

  it('openWangMode clears any previously active space', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    // Simulate switching from Zhang to Wang
    useCanvasStore.setState({ isLennyMode: true, isZhangMode: true, isWangMode: false, isPGMode: false })
    useCanvasStore.getState().openWangMode()
    const state = useCanvasStore.getState()
    expect(state.isZhangMode).toBe(false)
    expect(state.isWangMode).toBe(true)
    expect(state.isLennyMode).toBe(true)
  })
})

// ── 存储文件键名唯一性 ─────────────────────────────────────────────────────────

describe('Zhang/Wang storage file key isolation', () => {
  it('zhang-* filenames are distinct from lenny-* and pg-*', async () => {
    const { STORAGE_FILES } = await import('../../../../shared/constants')
    expect(STORAGE_FILES.ZHANG_NODES).toBe('zhang-nodes.json')
    expect(STORAGE_FILES.ZHANG_CONVERSATIONS).toBe('zhang-conversations.jsonl')
    expect(STORAGE_FILES.ZHANG_EDGES).toBe('zhang-edges.json')
    expect(STORAGE_FILES.ZHANG_NODES).not.toBe(STORAGE_FILES.LENNY_NODES)
    expect(STORAGE_FILES.ZHANG_NODES).not.toBe(STORAGE_FILES.PG_NODES)
    expect(STORAGE_FILES.ZHANG_CONVERSATIONS).not.toBe(STORAGE_FILES.LENNY_CONVERSATIONS)
    expect(STORAGE_FILES.ZHANG_CONVERSATIONS).not.toBe(STORAGE_FILES.PG_CONVERSATIONS)
  })

  it('wang-* filenames are distinct from lenny-*, pg-*, and zhang-*', async () => {
    const { STORAGE_FILES } = await import('../../../../shared/constants')
    expect(STORAGE_FILES.WANG_NODES).toBe('wang-nodes.json')
    expect(STORAGE_FILES.WANG_CONVERSATIONS).toBe('wang-conversations.jsonl')
    expect(STORAGE_FILES.WANG_EDGES).toBe('wang-edges.json')
    expect(STORAGE_FILES.WANG_NODES).not.toBe(STORAGE_FILES.LENNY_NODES)
    expect(STORAGE_FILES.WANG_NODES).not.toBe(STORAGE_FILES.PG_NODES)
    expect(STORAGE_FILES.WANG_NODES).not.toBe(STORAGE_FILES.ZHANG_NODES)
  })

  it('ALLOWED_FILENAMES includes all zhang-* files', async () => {
    const { ALLOWED_FILENAMES } = await import('../../../../shared/constants')
    expect(ALLOWED_FILENAMES).toContain('zhang-nodes.json')
    expect(ALLOWED_FILENAMES).toContain('zhang-conversations.jsonl')
    expect(ALLOWED_FILENAMES).toContain('zhang-edges.json')
  })

  it('ALLOWED_FILENAMES includes all wang-* files', async () => {
    const { ALLOWED_FILENAMES } = await import('../../../../shared/constants')
    expect(ALLOWED_FILENAMES).toContain('wang-nodes.json')
    expect(ALLOWED_FILENAMES).toContain('wang-conversations.jsonl')
    expect(ALLOWED_FILENAMES).toContain('wang-edges.json')
  })
})

// ── Zhang seed data 完整性 ────────────────────────────────────────────────────

describe('Zhang seed data integrity', () => {
  it('ZHANG_SEED_NODES has at least 30 nodes', async () => {
    const { ZHANG_SEED_NODES } = await import('../../../../shared/zhangData')
    expect(ZHANG_SEED_NODES.length).toBeGreaterThanOrEqual(30)
  })

  it('ZHANG_SEED_EDGES has at least 15 edges', async () => {
    const { ZHANG_SEED_EDGES } = await import('../../../../shared/zhangData')
    expect(ZHANG_SEED_EDGES.length).toBeGreaterThanOrEqual(15)
  })

  it('all Zhang seed node IDs start with zhang-seed-', async () => {
    const { ZHANG_SEED_NODES } = await import('../../../../shared/zhangData')
    for (const node of ZHANG_SEED_NODES) {
      expect(node.id).toMatch(/^zhang-seed-/)
      expect(node.conversationId).toMatch(/^zhang-seed-/)
    }
  })

  it('all Zhang seed nodes have required fields', async () => {
    const { ZHANG_SEED_NODES } = await import('../../../../shared/zhangData')
    for (const node of ZHANG_SEED_NODES) {
      expect(node.title).toBeTruthy()
      expect(node.keywords.length).toBeGreaterThan(0)
      expect(node.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(node.nodeType).toBe('memory')
      expect(typeof node.x).toBe('number')
      expect(typeof node.y).toBe('number')
    }
  })

  it('all Zhang seed edge source/target IDs exist in nodes', async () => {
    const { ZHANG_SEED_NODES, ZHANG_SEED_EDGES } = await import('../../../../shared/zhangData')
    const ids = new Set(ZHANG_SEED_NODES.map(n => n.id))
    for (const edge of ZHANG_SEED_EDGES) {
      expect(ids.has(edge.source), `edge source ${edge.source} not in nodes`).toBe(true)
      expect(ids.has(edge.target), `edge target ${edge.target} not in nodes`).toBe(true)
    }
  })

  it('ZHANG_SYSTEM_PROMPT exists and mentions 张小龙', async () => {
    const { ZHANG_SYSTEM_PROMPT } = await import('../../../../shared/constants')
    expect(ZHANG_SYSTEM_PROMPT).toBeTruthy()
    expect(ZHANG_SYSTEM_PROMPT.length).toBeGreaterThan(200)
    expect(ZHANG_SYSTEM_PROMPT).toContain('张小龙')
  })

  it('central Zhang node has coordinates near (1920, 1200)', async () => {
    const { ZHANG_SEED_NODES } = await import('../../../../shared/zhangData')
    const center = ZHANG_SEED_NODES.find(n => n.id === 'zhang-seed-yong-wan-ji-zou')
    expect(center).toBeDefined()
    expect(center!.x).toBe(1920)
    expect(center!.y).toBe(1200)
  })
})

// ── Wang seed data 完整性 ─────────────────────────────────────────────────────

describe('Wang seed data integrity', () => {
  it('WANG_SEED_NODES has at least 25 nodes', async () => {
    const { WANG_SEED_NODES } = await import('../../../../shared/wangData')
    expect(WANG_SEED_NODES.length).toBeGreaterThanOrEqual(25)
  })

  it('WANG_SEED_EDGES has at least 15 edges', async () => {
    const { WANG_SEED_EDGES } = await import('../../../../shared/wangData')
    expect(WANG_SEED_EDGES.length).toBeGreaterThanOrEqual(15)
  })

  it('all Wang seed node IDs start with wang-seed-', async () => {
    const { WANG_SEED_NODES } = await import('../../../../shared/wangData')
    for (const node of WANG_SEED_NODES) {
      expect(node.id).toMatch(/^wang-seed-/)
      expect(node.conversationId).toMatch(/^wang-seed-/)
    }
  })

  it('all Wang seed nodes have required fields', async () => {
    const { WANG_SEED_NODES } = await import('../../../../shared/wangData')
    for (const node of WANG_SEED_NODES) {
      expect(node.title).toBeTruthy()
      expect(node.keywords.length).toBeGreaterThan(0)
      expect(node.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(node.nodeType).toBe('memory')
      expect(typeof node.x).toBe('number')
      expect(typeof node.y).toBe('number')
    }
  })

  it('all Wang seed edge source/target IDs exist in nodes', async () => {
    const { WANG_SEED_NODES, WANG_SEED_EDGES } = await import('../../../../shared/wangData')
    const ids = new Set(WANG_SEED_NODES.map(n => n.id))
    for (const edge of WANG_SEED_EDGES) {
      expect(ids.has(edge.source), `edge source ${edge.source} not in nodes`).toBe(true)
      expect(ids.has(edge.target), `edge target ${edge.target} not in nodes`).toBe(true)
    }
  })

  it('WANG_SYSTEM_PROMPT exists and mentions 王慧文', async () => {
    const { WANG_SYSTEM_PROMPT } = await import('../../../../shared/constants')
    expect(WANG_SYSTEM_PROMPT).toBeTruthy()
    expect(WANG_SYSTEM_PROMPT.length).toBeGreaterThan(200)
    expect(WANG_SYSTEM_PROMPT).toContain('王慧文')
  })

  it('central Wang node has coordinates near (1920, 1200)', async () => {
    const { WANG_SEED_NODES } = await import('../../../../shared/wangData')
    const center = WANG_SEED_NODES.find(n => n.id === 'wang-seed-core-competitiveness')
    expect(center).toBeDefined()
    expect(center!.x).toBe(1920)
    expect(center!.y).toBe(1200)
  })
})
