/**
 * canvasStore — DecisionHub / LingSi 卡死修复专项测试
 *
 * 覆盖 v0.5.38 修复的三个 bug：
 *
 * 1. openModalById: content 为 null 时 isModalOpen 应重置为 false
 *    （修复前只 set isLoading:false，modal 永久卡住）
 *
 * 2. openModalById: sourceHint 参数恢复正确 space 模式
 *    - lenny  → isLennyMode: true, isPGMode: false
 *    - zhang  → isLennyMode: true, isZhangMode: true
 *    - custom-{id} → isCustomSpaceMode: true, activeCustomSpaceId: id
 *
 * 3. setLennyDecisionMode / setZhangDecisionMode:
 *    guard 应同时检查 currentConversation.decisionTrace.mode，
 *    防止 mode 相同但 trace 不同步时被跳过
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Conversation } from '../../../../shared/types'

// ── Mock storageService ──────────────────────────────────────────────────────
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
  getAuthToken: vi.fn().mockReturnValue('test-token'),
}))

// ── Mock fetch (authFetch 内部使用) ──────────────────────────────────────────
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'test-conv-1',
    createdAt: '2026-03-19T00:00:00.000Z',
    userMessage: '测试问题',
    assistantMessage: '测试回答',
    images: [],
    files: [],
    ...overrides,
  }
}

// ── 测试套件 ──────────────────────────────────────────────────────────────────

describe('canvasStore — openModalById 卡死修复', () => {
  beforeEach(() => {
    vi.resetModules()
    mockStorageRead.mockReset()
    mockStorageWrite.mockReset()
    mockStorageAppend.mockReset()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) })
  })

  it('Bug fix: content 为 null 时 isModalOpen 应重置为 false（不再永久卡住）', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    // 模拟文件不存在
    mockStorageRead.mockResolvedValue(null)

    await useCanvasStore.getState().openModalById('nonexistent-conv-id')

    const state = useCanvasStore.getState()
    expect(state.isModalOpen).toBe(false)
    expect(state.isLoading).toBe(false)
  })

  it('Bug fix: sourceHint=lenny 打开前设置 isLennyMode=true', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    // 初始在 main 模式
    useCanvasStore.setState({ isLennyMode: false, isPGMode: false, isZhangMode: false, isWangMode: false })

    // 模拟文件里有对话
    const conv = makeConversation({ id: 'lenny-conv-1' })
    mockStorageRead.mockResolvedValue(JSON.stringify(conv) + '\n')

    // 调用前 isLennyMode 是 false
    expect(useCanvasStore.getState().isLennyMode).toBe(false)

    await useCanvasStore.getState().openModalById('lenny-conv-1', 'lenny-conversations.jsonl', 'lenny')

    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(true)
    expect(state.isPGMode).toBe(false)
    expect(state.isZhangMode).toBe(false)
    expect(state.isWangMode).toBe(false)
    expect(state.isCustomSpaceMode).toBe(false)
  })

  it('Bug fix: sourceHint=zhang 打开前设置 isLennyMode=true + isZhangMode=true', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isLennyMode: false, isPGMode: false, isZhangMode: false, isWangMode: false })

    const conv = makeConversation({ id: 'zhang-conv-1' })
    mockStorageRead.mockResolvedValue(JSON.stringify(conv) + '\n')

    await useCanvasStore.getState().openModalById('zhang-conv-1', 'zhang-conversations.jsonl', 'zhang')

    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(true)
    expect(state.isZhangMode).toBe(true)
    expect(state.isPGMode).toBe(false)
    expect(state.isWangMode).toBe(false)
  })

  it('Bug fix: sourceHint=custom-abc12345 打开前设置 isCustomSpaceMode=true + activeCustomSpaceId', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isCustomSpaceMode: false, activeCustomSpaceId: null, isLennyMode: false })

    const conv = makeConversation({ id: 'custom-conv-1' })
    mockStorageRead.mockResolvedValue(JSON.stringify(conv) + '\n')

    await useCanvasStore.getState().openModalById('custom-conv-1', 'custom-abc12345-conversations.jsonl', 'custom-abc12345')

    const state = useCanvasStore.getState()
    expect(state.isCustomSpaceMode).toBe(true)
    expect(state.activeCustomSpaceId).toBe('abc12345')
    expect(state.isLennyMode).toBe(false)
  })

  it('sourceHint=main 不修改 space flags', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({ isLennyMode: false, isPGMode: false, isZhangMode: false, isWangMode: false, isCustomSpaceMode: false })

    const conv = makeConversation({ id: 'main-conv-1' })
    mockStorageRead.mockResolvedValue(JSON.stringify(conv) + '\n')

    await useCanvasStore.getState().openModalById('main-conv-1', undefined, undefined)

    // main 模式：flags 不变
    const state = useCanvasStore.getState()
    expect(state.isLennyMode).toBe(false)
    expect(state.isCustomSpaceMode).toBe(false)
  })
})

describe('canvasStore — setLennyDecisionMode / setZhangDecisionMode guard 修复', () => {
  beforeEach(() => {
    vi.resetModules()
    mockStorageRead.mockReset()
  })

  it('Bug fix: lennyDecisionMode 已是 normal 但 trace.mode 是 decision 时应仍然更新 trace', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    // 设置 store：lennyDecisionMode 已是 'normal'，但 currentConversation.decisionTrace.mode 是 'decision'
    useCanvasStore.setState({
      isLennyMode: true,
      isPGMode: false,
      isZhangMode: false,
      isWangMode: false,
      lennyDecisionMode: 'normal',
      currentConversation: makeConversation({
        decisionTrace: { mode: 'decision', personaId: 'lenny' },
      }),
    })

    // 调用 setLennyDecisionMode('normal')——此前 guard 会直接 return，导致 trace 不更新
    useCanvasStore.getState().setLennyDecisionMode('normal')

    const trace = useCanvasStore.getState().currentConversation?.decisionTrace
    expect(trace).toEqual({ mode: 'normal', personaId: 'lenny' })
  })

  it('zhangDecisionMode 已是 normal 但 trace.mode 是 decision 时应仍然更新 trace', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    useCanvasStore.setState({
      isLennyMode: true,
      isPGMode: false,
      isZhangMode: true,
      isWangMode: false,
      zhangDecisionMode: 'normal',
      currentConversation: makeConversation({
        decisionTrace: { mode: 'decision', personaId: 'zhang' },
      }),
    })

    useCanvasStore.getState().setZhangDecisionMode('normal')

    const trace = useCanvasStore.getState().currentConversation?.decisionTrace
    expect(trace).toEqual({ mode: 'normal', personaId: 'zhang' })
  })

  it('guard 仍然有效：mode 和 trace 都一致时不触发 set（避免无谓 re-render）', async () => {
    const { useCanvasStore } = await import('../canvasStore')
    const conv = makeConversation({ decisionTrace: { mode: 'normal', personaId: 'lenny' } })
    useCanvasStore.setState({
      isLennyMode: true,
      isPGMode: false,
      isZhangMode: false,
      isWangMode: false,
      lennyDecisionMode: 'normal',
      currentConversation: conv,
    })

    // 两者都已经是 normal，guard 应 skip set
    const before = useCanvasStore.getState().currentConversation
    useCanvasStore.getState().setLennyDecisionMode('normal')
    const after = useCanvasStore.getState().currentConversation
    // 引用应该相同（没有触发 set）
    expect(after).toBe(before)
  })
})
