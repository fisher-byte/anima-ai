/**
 * canvasStore — Zustand 全局状态（单一 store）
 *
 * 所有方法共享同一个 create((set, get) => ({...})) 闭包，
 * 因此无法拆分为独立文件（会丢失 set/get 引用）。
 * 这是 Zustand 的标准单 store 模式，文件体积由此决定。
 *
 * 内部逻辑分区（按搜索关键词定位）：
 *   [SECTION:LOAD]        loadNodes / loadProfile / checkApiKey
 *   [SECTION:NODE]        addNode / updateNodePosition / removeNode
 *   [SECTION:EDGE]        updateEdges / addSemanticEdges / addLogicalEdges
 *   [SECTION:CONVERSATION] startConversation / endConversation / appendConversation
 *   [SECTION:MEMORY]      getRelevantMemories / compressMemoriesForPrompt
 *   [SECTION:PREFERENCE]  detectFeedback / addPreference / detectIntent
 *   [SECTION:ONBOARDING]  openOnboarding / completeOnboarding
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Node, Edge, Conversation, Profile, PreferenceRule, NodePosition, CustomSpaceConfig, DecisionMode } from '@shared/types'
import { STORAGE_FILES, FEEDBACK_TRIGGERS, CONFIDENCE_CONFIG, UI_CONFIG } from '@shared/constants'
import { storageService, historyService } from '../services/storageService'
import { getAuthToken } from '../services/storageService'
import { FILE_BLOCK_PREFIX } from '../utils/conversationUtils'
import { detectIntent as _detectIntent } from '../utils/intentDetector'

// ── 分类色板（分类名 → CSS color，用于节点染色）────────────────────────────
const CATEGORY_COLOR_MAP: Record<string, string> = {
  '日常生活': 'rgba(220, 252, 231, 0.9)',   // 绿
  '日常事务': 'rgba(254, 249, 195, 0.9)',   // 黄
  '学习成长': 'rgba(219, 234, 254, 0.9)',   // 蓝
  '工作事业': 'rgba(224, 242, 254, 0.9)',   // 青蓝
  '情感关系': 'rgba(255, 228, 230, 0.9)',   // 粉
  '思考世界': 'rgba(243, 232, 255, 0.9)',   // 紫
  '其他':     'rgba(243, 244, 246, 0.9)',   // 灰
}
const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_MAP['其他']

/** Internal helper: attach auth + JSON headers to all /api/* fetch calls */
function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

interface CanvasState {
  // 数据
  nodes: Node[]
  edges: Edge[]
  currentConversation: Conversation | null
  profile: Profile
  isModalOpen: boolean
  isLoading: boolean
  
  // 方法：数据加载
  loadNodes: () => Promise<void>
  loadProfile: () => Promise<void>
  
  // 方法：节点操作
  addNode: (conversation: Conversation, position?: NodePosition, explicitCategory?: string, memoryCount?: number, topicLabel?: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodePositionInMemory: (id: string, x: number, y: number) => void
  removeNode: (id: string) => Promise<void>
  renameNode: (id: string, newTitle: string) => Promise<void>
  mergeIntoNode: (targetNodeId: string, newConvId: string, newDate: string) => Promise<void>
  
  // 方法：连线操作
  updateEdges: () => void

  // 语义边
  semanticEdges: Edge[]
  addSemanticEdges: (newEdges: Edge[]) => void
  clearSemanticEdgesForNode: (nodeId: string) => void

  // L3 逻辑边（AI 提取的显式关系）
  logicalEdges: Edge[]
  /** 刚刚新增的逻辑边 id 集合（用于触发入场动画，3s 后自动清除） */
  newLogicalEdgeIds: Set<string>
  addLogicalEdges: (newEdges: Edge[]) => void
  clearLogicalEdgesForNode: (nodeId: string) => void
  loadLogicalEdges: () => Promise<void>
  _triggerLogicalEdgeExtraction: (conversationId: string, userMessage: string, assistantMessage: string) => Promise<void>

  // 方法：画布操作
  offset: NodePosition
  scale: number
  setOffset: (offset: NodePosition) => void
  setScale: (scale: number) => void
  setView: (offset: NodePosition, scale: number) => void
  focusNode: (id: string) => void
  resetView: () => void
  startConversation: (
    userMessage: string,
    images?: string[],
    files?: import('@shared/types').FileAttachment[],
    parentId?: string,
    options?: { invokedAssistant?: import('@shared/types').AssistantInvocation }
  ) => Promise<void>
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => Promise<void>
  endConversation: (assistantMessage: string, appliedPreferences?: string[], reasoning_content?: string, explicitConversation?: Conversation) => Promise<void>
  closeModal: () => void
  openModal: (conversation: Conversation) => void
  openModalById: (conversationId: string) => Promise<void>
  
  // 方法：偏好学习
  detectFeedback: (message: string) => PreferenceRule | null
  addPreference: (rule: PreferenceRule) => Promise<void>
  getPreferencesForPrompt: () => string[]
  getRelevantMemories: (query: string) => Promise<{ conv: Conversation; category?: string; nodeId?: string }[]>
  detectIntent: (message: string) => string
  
  // 方法：对话记录
  appendConversation: (conversation: Conversation) => Promise<void>
  
  // 新增：全局对话历史管理
  conversationHistory: import('@shared/types').AIMessage[]
  setConversationHistory: (history: import('@shared/types').AIMessage[]) => void
  resetConversationHistory: () => void

  // 新增：UI 交互状态
  selectedNodeId: string | null
  highlightedCategory: string | null
  highlightedNodeIds: string[]
  focusedCategory: string | null
  selectNode: (id: string | null) => void
  setHighlight: (category: string | null, nodeIds: string[]) => void
  setFocusedCategory: (cat: string | null) => void

  // 新增：新手引导状态
  isOnboardingMode: boolean
  onboardingPhase: number
  onboardingResumeTurns: import('../utils/conversationUtils').Turn[] | null
  openOnboarding: () => void
  setOnboardingPhase: (phase: number) => void
  completeOnboarding: () => Promise<void>
  saveOnboardingTurns: (turns: import('../utils/conversationUtils').Turn[]) => void

  // Lenny Space 模式：对话/节点读写隔离到 lenny-*.json
  isLennyMode: boolean
  lennyDecisionMode: DecisionMode
  setLennyDecisionMode: (mode: DecisionMode) => void
  zhangDecisionMode: DecisionMode
  setZhangDecisionMode: (mode: DecisionMode) => void
  openLennyMode: () => void
  closeLennyMode: () => void

  // Paul Graham Space 模式（复用 isLennyMode 的隔离机制，但使用 PG system prompt 和 pg-* 文件）
  isPGMode: boolean
  openPGMode: () => void
  closePGMode: () => void

  // Zhang Xiaolong Space 模式
  isZhangMode: boolean
  openZhangMode: () => void
  closeZhangMode: () => void

  // Wang Huiwen Space 模式
  isWangMode: boolean
  openWangMode: () => void
  closeWangMode: () => void

  // 自定义 Space 模式
  isCustomSpaceMode: boolean
  activeCustomSpaceId: string | null
  customSpaces: CustomSpaceConfig[]
  loadCustomSpaces: () => Promise<void>
  openCustomSpaceMode: (id: string) => void
  closeCustomSpaceMode: () => void
  createCustomSpace: (config: Omit<CustomSpaceConfig, 'id' | 'createdAt'>) => Promise<CustomSpaceConfig>
  deleteCustomSpace: (id: string) => Promise<void>

  // 新增：移除偏好规则
  removePreference: (index: number) => Promise<void>

  // 全量清空（用户画像 + 记忆 + 进化基因）并开启新手教程
  clearAllForOnboarding: () => Promise<void>

  // 引导完成后的进化基因轮询标志
  pendingProfileRefresh: boolean
  setPendingProfileRefresh: (val: boolean) => void

  // 引导完成后的记忆轮询标志
  pendingMemoryRefresh: boolean
  setPendingMemoryRefresh: (val: boolean) => void

  // 能力节点
  activeCapabilityId: string | null
  openCapability: (nodeId: string) => void
  closeCapability: () => void
  addCapabilityNode: (capabilityId: 'import-memory' | 'onboarding') => Promise<void>
  saveMemoryImport: (content: string, sourceName: string) => Promise<void>

  // API Key 状态
  hasApiKey: boolean
  apiKeyChecked: boolean   // checkApiKey 至少执行过一次后为 true
  checkApiKey: () => Promise<void>

  // 节点初次加载是否完成（防止空画布提示闪烁）
  nodesLoaded: boolean

  // 错误通知（供 Canvas.tsx 通过 useEffect 订阅并 toast 展示）
  lastError: string | null
  clearLastError: () => void

  // 批量重新分类
  reclassifyNodes: () => Promise<void>

  // 节点时间线面板 UI 状态
  timelineNodeId: string | null
  isTimelineOpen: boolean
  openNodeTimeline: (nodeId: string) => void
  closeNodeTimeline: () => void

  // 历史节点语义聚类重建
  nodeGraphRebuild: {
    phase: 'idle' | 'analyzing' | 'merging' | 'done' | 'error'
    totalClusters: number
    processedClusters: number
    errorMessage?: string
  }
  rebuildNodeGraph: () => Promise<void>
}

// 防止 completeOnboarding 并发重复执行
let _completingOnboarding = false

// 防止 openModalById 并发竞态：每次调用递增，异步回调中只有最新的令牌才被接受
let _openModalToken = 0

// 防止同一节点重复进入语义边计算
const _semanticBuildingSet = new Set<string>()

/** 为指定节点异步计算语义关联边（复用已有向量，无额外 embedding 调用） */
async function _buildSemanticEdgesForNode(
  nodeId: string,
  get: () => CanvasState,
  skipDelay = false
): Promise<void> {
  if (_semanticBuildingSet.has(nodeId)) return
  _semanticBuildingSet.add(nodeId)

  try {
    // 给向量写入留时间（阿里云 embedding API 需要 2-4 秒）；批量回算时由调用方统一等待
    if (!skipDelay) {
      await new Promise(r => setTimeout(r, 4000))
    }

    const resp = await authFetch('/api/memory/search/by-id', {
      method: 'POST',
      body: JSON.stringify({ conversationId: nodeId, topK: 8, threshold: 0.65 })
    })
    if (!resp.ok) return

    const data = await resp.json() as { results: { conversationId: string; score: number }[] }
    if (!data.results?.length) return

    const { nodes, semanticEdges, addSemanticEdges } = get()
    const nodeIds = new Set(nodes.map(n => n.id))
    const existingPairs = new Set(semanticEdges.map(e => `${e.source}:${e.target}`))

    const newEdges: Edge[] = data.results
      .slice(0, 5)  // 每节点最多 5 条语义边
      .filter(r => nodeIds.has(r.conversationId))
      .filter(r => !existingPairs.has(`${nodeId}:${r.conversationId}`) &&
                   !existingPairs.has(`${r.conversationId}:${nodeId}`))
      .map(r => ({
        id: `edge-sem-${nodeId}-${r.conversationId}`,
        source: nodeId,
        target: r.conversationId,
        label: r.score >= 0.85 ? '强关联' : r.score >= 0.75 ? '相关' : '关联',
        createdAt: new Date().toISOString(),
        edgeType: 'semantic' as const,
        weight: r.score
      }))

    if (newEdges.length > 0) addSemanticEdges(newEdges)
  } finally {
    _semanticBuildingSet.delete(nodeId)
  }
}

/** 历史节点语义边全量回算（仅当 semantic-edges.json 不存在或为空时触发）
 *  服务端启动时已预跑 embedding，此处直接查询即可
 */
async function _rebuildAllSemanticEdges(get: () => CanvasState): Promise<void> {
  const { nodes } = get()
  const memoryNodes = nodes.filter(n => !n.nodeType || n.nodeType === 'memory')
  if (memoryNodes.length === 0) return

  // 串行查询每个节点的语义相似度
  for (const node of memoryNodes) {
    await _buildSemanticEdgesForNode(node.id, get, true)  // skipDelay=true，服务端已索引
    await new Promise(r => setTimeout(r, 150))
  }
}

export const useCanvasStore = create<CanvasState>()(
  devtools(
    (set, get) => ({
  nodes: [],
  edges: [],
  semanticEdges: [],
  logicalEdges: [],
  newLogicalEdgeIds: new Set<string>(),
  currentConversation: null,
  profile: { rules: [] },
  isModalOpen: false,
  isLoading: false,
  offset: { x: 0, y: 0 },
  scale: 1,
  conversationHistory: [],
  
  // UI 状态初始化
  selectedNodeId: null,
  highlightedCategory: null,
  highlightedNodeIds: [],
  focusedCategory: null,

  // 新手引导初始化
  isOnboardingMode: false,
  onboardingPhase: 0,
  onboardingResumeTurns: null,

  // Lenny Space 模式
  isLennyMode: false,
  lennyDecisionMode: 'normal',
  zhangDecisionMode: 'normal',
  // Paul Graham Space 模式
  isPGMode: false,
  // Zhang Xiaolong Space 模式
  isZhangMode: false,
  // Wang Huiwen Space 模式
  isWangMode: false,

  // 自定义 Space 模式
  isCustomSpaceMode: false,
  activeCustomSpaceId: null,
  customSpaces: [],

  // 引导完成后进化基因轮询标志
  pendingProfileRefresh: false,

  // 引导完成后记忆轮询标志
  pendingMemoryRefresh: false,

  // 能力节点初始化
  activeCapabilityId: null,

  // API Key 状态初始化
  hasApiKey: false,
  apiKeyChecked: false,
  nodesLoaded: false,
  lastError: null,
  timelineNodeId: null,
  isTimelineOpen: false,
  nodeGraphRebuild: { phase: 'idle', totalClusters: 0, processedClusters: 0 },

  setConversationHistory: (history) => set({ conversationHistory: history }),
  resetConversationHistory: () => set({ conversationHistory: [] }),

  selectNode: (id) => set({ selectedNodeId: id }),
  setHighlight: (category, nodeIds) => set({ highlightedCategory: category, highlightedNodeIds: nodeIds }),
  setFocusedCategory: (cat) => {
    const { nodes, setHighlight } = get()
    if (cat !== null) {
      setHighlight(cat, nodes.filter(n => (n.category ?? '其他') === cat).map(n => n.id))
    } else {
      setHighlight(null, [])
    }
    set({ focusedCategory: cat })
  },

  openOnboarding: () => {
    const conv: import('@shared/types').Conversation = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      userMessage: '',
      assistantMessage: '',
      images: [],
      files: []
    }
    // 尝试从 localStorage 恢复未完成的引导对话
    let resumeTurns: import('../utils/conversationUtils').Turn[] | null = null
    try {
      const saved = typeof localStorage !== 'undefined' && localStorage.getItem('evo_onboarding_turns')
      if (saved) resumeTurns = JSON.parse(saved)
    } catch { /* ignore */ }
    set({ isOnboardingMode: true, onboardingPhase: 0, currentConversation: conv, isModalOpen: true, isLoading: false, onboardingResumeTurns: resumeTurns })
  },
  saveOnboardingTurns: (turns) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('evo_onboarding_turns', JSON.stringify(turns))
      }
    } catch { /* ignore */ }
  },
  setOnboardingPhase: (phase) => set({ onboardingPhase: phase }),
  setLennyDecisionMode: (mode) => set((state) => ({
    lennyDecisionMode: mode,
    currentConversation: state.isLennyMode && !state.isPGMode && !state.isZhangMode && !state.isWangMode && state.currentConversation
      ? {
          ...state.currentConversation,
          decisionTrace: mode === 'decision'
            ? { ...(state.currentConversation.decisionTrace ?? {}), mode: 'decision', personaId: 'lenny' }
            : { mode: 'normal', personaId: 'lenny' },
        }
      : state.currentConversation,
  })),
  setZhangDecisionMode: (mode) => set((state) => ({
    zhangDecisionMode: mode,
    currentConversation: state.isLennyMode && state.isZhangMode && state.currentConversation
      ? {
          ...state.currentConversation,
          decisionTrace: mode === 'decision'
            ? { ...(state.currentConversation.decisionTrace ?? {}), mode: 'decision', personaId: 'zhang' }
            : { mode: 'normal', personaId: 'zhang' },
        }
      : state.currentConversation,
  })),
  openLennyMode: () => set({
    isLennyMode: true,
    isPGMode: false,
    isZhangMode: false,
    isWangMode: false,
    isCustomSpaceMode: false,
    activeCustomSpaceId: null,
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
  }),
  closeLennyMode: () => set({
    isLennyMode: false,
    isPGMode: false,
    isZhangMode: false,
    isWangMode: false,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
  }),
  openPGMode: () => set({
    isLennyMode: true,
    isPGMode: true,
    isZhangMode: false,
    isWangMode: false,
    isCustomSpaceMode: false,
    activeCustomSpaceId: null,
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
  }),
  closePGMode: () => set({
    isLennyMode: false,
    isPGMode: false,
    isZhangMode: false,
    isWangMode: false,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
  }),
  openZhangMode: () => set({
    isLennyMode: true,
    isPGMode: false,
    isZhangMode: true,
    isWangMode: false,
    isCustomSpaceMode: false,
    activeCustomSpaceId: null,
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
  }),
  closeZhangMode: () => set({
    isLennyMode: false,
    isPGMode: false,
    isZhangMode: false,
    isWangMode: false,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
  }),
  openWangMode: () => set({
    isLennyMode: true,
    isPGMode: false,
    isZhangMode: false,
    isWangMode: true,
    isCustomSpaceMode: false,
    activeCustomSpaceId: null,
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
  }),
  closeWangMode: () => set({
    isLennyMode: false,
    isPGMode: false,
    isZhangMode: false,
    isWangMode: false,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
  }),

  openCustomSpaceMode: (id: string) => set({
    isCustomSpaceMode: true,
    activeCustomSpaceId: id,
    isLennyMode: false,
    isPGMode: false,
    isZhangMode: false,
    isWangMode: false,
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
  }),
  closeCustomSpaceMode: () => set({
    isCustomSpaceMode: false,
    activeCustomSpaceId: null,
    isModalOpen: false,
    currentConversation: null,
    conversationHistory: [],
    isOnboardingMode: false,
    onboardingPhase: 0,
    onboardingResumeTurns: null,
  }),

  loadCustomSpaces: async () => {
    try {
      const raw = await storageService.read('custom-spaces.json')
      if (raw) {
        const spaces = JSON.parse(raw) as CustomSpaceConfig[]
        if (Array.isArray(spaces)) set({ customSpaces: spaces })
      }
    } catch { /* first run, file doesn't exist yet */ }
  },

  createCustomSpace: async (config) => {
    const { customSpaces } = get()
    if (customSpaces.length >= 5) throw new Error('Maximum 5 custom spaces')
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toLowerCase()
    const newSpace: CustomSpaceConfig = { ...config, id, createdAt: new Date().toISOString() }
    const updated = [...customSpaces, newSpace]
    await storageService.write('custom-spaces.json', JSON.stringify(updated, null, 2))
    set({ customSpaces: updated })
    return newSpace
  },

  deleteCustomSpace: async (id: string) => {
    const { customSpaces } = get()
    const updated = customSpaces.filter(s => s.id !== id)
    await storageService.write('custom-spaces.json', JSON.stringify(updated, null, 2))
    set({ customSpaces: updated })
  },

  setPendingProfileRefresh: (val) => set({ pendingProfileRefresh: val }),
  setPendingMemoryRefresh: (val) => set({ pendingMemoryRefresh: val }),
  completeOnboarding: async () => {
    if (_completingOnboarding) return
    _completingOnboarding = true
    try {
      // 标记引导已完成，清除进度缓存
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('evo_onboarding_v3', 'done')
        localStorage.removeItem('evo_onboarding_turns')
      }
      // onboarding 节点保留在画布，仅标记为已完成状态
      const { nodes } = get()
      const updatedNodes = nodes.map(n =>
        n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding'
          ? { ...n, capabilityData: { ...n.capabilityData, state: 'completed' as const } }
          : n
      )
      set({ isOnboardingMode: false, onboardingPhase: 0, nodes: updatedNodes, onboardingResumeTurns: null })
      get().updateEdges()
      await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
      // 确保 import-memory 能力块存在
      const hasImportMemory = updatedNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'import-memory')
      if (!hasImportMemory) {
        await get().addCapabilityNode('import-memory')
      }
      // 刷新 profile，使引导过程中写入的进化基因立即在侧栏可见
      await get().loadProfile()
      // 标记待轮询：agentWorker 最长 30s 后才处理队列，侧栏需轮询刷新
      set({ pendingProfileRefresh: true, pendingMemoryRefresh: true })
      // 检查用户是否已配置 API Key，供 InputBox 判断是否需要引导配置
      void get().checkApiKey()
    } finally {
      _completingOnboarding = false
    }
  },

  removePreference: async (index: number) => {
    const { profile } = get()
    const rules = Array.isArray(profile?.rules) ? profile.rules : []
    const updatedRules = rules.filter((_, i) => i !== index)
    const updatedProfile = { ...profile, rules: updatedRules }
    set({ profile: updatedProfile })
    await storageService.write(STORAGE_FILES.PROFILE, JSON.stringify(updatedProfile, null, 2))
  },

  clearAllForOnboarding: async () => {
    const emptyProfile = { rules: [] }
    // 目标：以“新用户”状态打开新手教程，避免任何历史数据影响体验
    set({
      nodes: [],
      edges: [],
      semanticEdges: [],
      logicalEdges: [],
      profile: emptyProfile,
      conversationHistory: [],
      selectedNodeId: null,
      highlightedCategory: null,
      highlightedNodeIds: [],
      focusedCategory: null,
      offset: { x: 0, y: 0 },
      scale: 1
    })

    await Promise.all([
      storageService.write(STORAGE_FILES.PROFILE, JSON.stringify(emptyProfile, null, 2)),
      storageService.write(STORAGE_FILES.NODES, JSON.stringify([], null, 2)),
      storageService.write(STORAGE_FILES.CONVERSATIONS, ''),
      storageService.write(STORAGE_FILES.SEMANTIC_EDGES, '[]')
    ])
    storageService.write(STORAGE_FILES.LOGICAL_EDGES, '[]').catch(() => {})
    get().openOnboarding()
  },

  openCapability: (nodeId) => set({ activeCapabilityId: nodeId }),
  closeCapability: () => set({ activeCapabilityId: null }),

  addCapabilityNode: async (capabilityId) => {
    const { nodes } = get()
    // 避免重复添加同类能力节点
    if (nodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === capabilityId)) return
    const viewW = typeof window !== 'undefined' ? window.innerWidth : 1280
    const viewH = typeof window !== 'undefined' ? window.innerHeight : 800
    const centerX = 1.5 * viewW
    const centerY = 1.5 * viewH

    // 在中心附近找一个与现有节点不重叠的位置
    // 用 capabilityId 的 hash 决定初始偏角，让两个能力块自然分散在中心周围
    const nodeGap = 220
    const baseAngle = capabilityId === 'import-memory' ? Math.PI * 1.25 : Math.PI * 0.25
    let x = centerX
    let y = centerY
    for (let i = 0; i < 40; i++) {
      const r = 80 + Math.floor(i / 6) * 100
      const angle = baseAngle + (i % 6) * (Math.PI / 3)
      const tx = centerX + Math.cos(angle) * r
      const ty = centerY + Math.sin(angle) * r
      if (nodes.every(n => Math.hypot(n.x - tx, n.y - ty) >= nodeGap)) {
        x = tx; y = ty; break
      }
    }

    const capabilityNodeId = `capability:${capabilityId}:${Date.now()}`
    const LABELS: Record<string, { title: string; keywords: string[] }> = {
      'import-memory': { title: '导入外部记忆', keywords: ['ChatGPT', 'Claude', '迁移'] },
      'onboarding': { title: '新手教程', keywords: ['引导', '入门', '开始'] }
    }
    const label = LABELS[capabilityId] ?? { title: '能力', keywords: [] }

    const newNode: import('@shared/types').Node = {
      id: capabilityNodeId,
      title: label.title,
      keywords: label.keywords,
      date: new Date().toISOString().split('T')[0],
      conversationId: capabilityNodeId,
      x, y,
      category: '__capability__',
      color: capabilityId === 'onboarding' ? 'rgba(226, 232, 240, 0.9)' : 'rgba(237, 233, 254, 0.9)',
      nodeType: 'capability',
      capabilityData: { capabilityId, state: 'active' }
    }

    const updatedNodes = [...nodes, newNode]
    set({ nodes: updatedNodes })
    get().updateEdges()
    // 所有能力块都持久化，刷新不会丢失
    await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
  },

  saveMemoryImport: async (content, sourceName) => {
    // 把粘贴内容作为一次 assistant 单条对话节点保存到画布
    const { endConversation } = get()
    const convId = `import:${Date.now()}`
    const conv: import('@shared/types').Conversation = {
      id: convId,
      createdAt: new Date().toISOString(),
      userMessage: `来自 ${sourceName} 的记忆导入`,
      assistantMessage: content,
      images: [],
      files: []
    }
    await endConversation(content, [], undefined, conv)
  },

  checkApiKey: async () => {
    try {
      const resp = await authFetch('/api/config/has-usable-key')
      if (resp.ok) {
        const data = await resp.json() as { hasKey: boolean }
        set({ hasApiKey: data.hasKey, apiKeyChecked: true })
      } else {
        set({ hasApiKey: false, apiKeyChecked: true })
      }
    } catch {
      set({ hasApiKey: false, apiKeyChecked: true })
    }
  },

  setOffset: (offset) => set({ offset }),
  setScale: (scale) => set({ scale: Math.max(0.2, Math.min(3, scale)) }),
  setView: (offset, scale) => set({ offset, scale: Math.max(0.2, Math.min(3, scale)) }),

  resetView: () => set({ offset: { x: 0, y: 0 }, scale: 1 }),

  focusNode: (id) => {
    const node = get().nodes.find(n => n.id === id)
    if (node) {
      const viewW = typeof window !== 'undefined' ? window.innerWidth : 1280
      const viewH = typeof window !== 'undefined' ? window.innerHeight : 800
      
      const screenCenterX = 1.5 * viewW
      const screenCenterY = 1.5 * viewH
      const newOffsetX = screenCenterX - node.x
      const newOffsetY = screenCenterY - node.y

      set({
        scale: 1,
        offset: {
          x: newOffsetX,
          y: newOffsetY
        }
      })
    }
  },

  // 加载节点数据
  loadNodes: async () => {
    try {
      const content = await storageService.read(STORAGE_FILES.NODES)
      if (content) {
        const parsed = JSON.parse(content) as Node[]

        const uniqueByConversation = new Map<string, Node>()
        for (const n of parsed) {
          if (!n?.conversationId) continue
          uniqueByConversation.set(n.conversationId, n)
        }

        let nodes = Array.from(uniqueByConversation.values())

        const viewW = typeof window !== 'undefined' ? window.innerWidth : 1280
        const viewH = typeof window !== 'undefined' ? window.innerHeight : 800
        const centerX = 1.5 * viewW
        const centerY = 1.5 * viewH
        const BOUND = 1500  // 所有节点必须在 center ± BOUND 范围内

        // 无论如何先做坐标钳制，消除历史飞远节点
        nodes = nodes.map(n => ({
          ...n,
          x: !Number.isFinite(n.x) ? centerX : Math.max(centerX - BOUND, Math.min(centerX + BOUND, n.x)),
          y: !Number.isFinite(n.y) ? centerY : Math.max(centerY - BOUND, Math.min(centerY + BOUND, n.y)),
        }))

        // 如果钳制后有重叠（多个节点被压到同一边界），做一次重排
        const minX = centerX - BOUND
        const maxX = centerX + BOUND
        const minY = centerY - BOUND
        const maxY = centerY + BOUND

        const NODE_W = 208, NODE_H = 160
        const hasOutOfBounds = nodes.some(n => n.x <= minX || n.x >= maxX || n.y <= minY || n.y >= maxY)
        const hasOverlap = !hasOutOfBounds && (() => {
          for (let i = 0; i < nodes.length; i++)
            for (let j = i + 1; j < nodes.length; j++)
              if (Math.abs(nodes[i].x - nodes[j].x) < NODE_W && Math.abs(nodes[i].y - nodes[j].y) < NODE_H) return true
          return false
        })()
        const needsRelayout = hasOutOfBounds || hasOverlap

        if (needsRelayout) {
          const placed: { x: number; y: number }[] = []
          // 用矩形碰撞判断（与 hasOverlap 标准一致），而非欧氏距离
          const isFarEnough = (x1: number, y1: number) =>
            placed.every(p => Math.abs(p.x - x1) >= NODE_W || Math.abs(p.y - y1) >= NODE_H)

          nodes = nodes.map((n, idx) => {
            // 旧坐标有效、在可视范围内、且与已放置节点不重叠 → 直接保留
            if (
              Number.isFinite(n.x) && Number.isFinite(n.y) &&
              n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY &&
              isFarEnough(n.x, n.y)
            ) {
              placed.push({ x: n.x, y: n.y })
              return n
            }

            let angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2
            for (let i = 0; i < 100; i++) {
              const r = 40 + i * 18
              const x = centerX + Math.cos(angle) * r
              const y = centerY + Math.sin(angle) * r
              angle += 0.7
              if (isFarEnough(x, y)) {
                placed.push({ x, y })
                return { ...n, x, y }
              }
            }
            placed.push({ x: centerX, y: centerY })
            return { ...n, x: centerX, y: centerY }
          })

          // 持久化整理后的坐标，避免下次依旧重叠
          await storageService.write(STORAGE_FILES.NODES, JSON.stringify(nodes, null, 2))
        }

        // 全量按对话首句重新分类，修正历史错分（如美食归到生活日常）；类别名与 detectIntent 保持一致
        try {
          const convContent = await storageService.read(STORAGE_FILES.CONVERSATIONS)
          const conversationsById = new Map<string, string>()
          if (convContent) {
            for (const line of convContent.trim().split('\n').filter(Boolean)) {
              try {
                const conv = JSON.parse(line) as Conversation
                if (conv.id && conv.userMessage) {
                  conversationsById.set(conv.id, conv.userMessage)
                }
              } catch { /* ignore */ }
            }
          }
          // 使用模块级 CATEGORY_COLOR_MAP 替代内联数组
          let updated = false
          nodes = nodes.map(n => {
            const userMessage = conversationsById.get(n.conversationId)
            if (!userMessage) return n
            const newCategory = _detectIntent(userMessage)
            if (newCategory === n.category) return n
            updated = true
            const color = CATEGORY_COLOR_MAP[newCategory] ?? DEFAULT_CATEGORY_COLOR
            return { ...n, category: newCategory, color }
          })
          if (updated) {
            await storageService.write(STORAGE_FILES.NODES, JSON.stringify(nodes, null, 2))
          }
        } catch (e) {
          console.warn('Re-categorize nodes failed:', e)
        }

        // 补全 Phase-1 新字段（向后兼容历史节点）
        nodes = nodes.map(n => ({
          ...n,
          conversationIds: n.conversationIds ?? [n.conversationId],
          topicLabel: n.topicLabel ?? n.category ?? '其他',
          firstDate: n.firstDate ?? n.date,
        }))

        set({ nodes })

        // 加载语义边（持久化文件）
        let hasSemEdges = false
        try {
          const semContent = await storageService.read(STORAGE_FILES.SEMANTIC_EDGES)
          if (semContent) {
            const semEdges = JSON.parse(semContent) as Edge[]
            if (Array.isArray(semEdges) && semEdges.length > 0) {
              set({ semanticEdges: semEdges })
              hasSemEdges = true
            }
          }
        } catch { /* 静默忽略 */ }

        get().updateEdges() // 加载后更新连线（含语义边）

        // 异步加载逻辑边（不阻塞节点渲染）
        get().loadLogicalEdges().catch(() => {})

        // 首次使用语义边功能：延迟回算历史节点
        if (!hasSemEdges && nodes.filter(n => !n.nodeType || n.nodeType === 'memory').length > 0) {
          setTimeout(() => {
            _rebuildAllSemanticEdges(get).catch(() => {})
          }, 2000)
        }

        // 初始加载后，恢复上次视口；没有记录时聚焦到第一个节点
        if (nodes.length > 0) {
          const savedView = typeof localStorage !== 'undefined' && localStorage.getItem('evo_view')
          if (savedView) {
            try {
              const { offset, scale } = JSON.parse(savedView)
              if (offset && typeof offset.x === 'number' && typeof scale === 'number') {
                set({ offset, scale: Math.max(0.2, Math.min(3, scale)) })
              } else {
                get().focusNode(nodes[0].id)
              }
            } catch {
              get().focusNode(nodes[0].id)
            }
          } else {
            get().focusNode(nodes[0].id)
          }
        }
      }

      // 统一处理能力块初始化（只在节点文件里没有对应节点时才补建）
      const currentNodes = get().nodes
      const hasOnboarding = currentNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding')
      const hasImportMemory = currentNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'import-memory')
      const hasRealNodes = currentNodes.some(n => n.nodeType !== 'capability')

      // onboarding 完成条件：localStorage 标记 AND（有真实对话节点 OR onboarding节点已完成 OR 两个能力块都存在）
      // 防止跨账号登录时上一个账号的 localStorage 标记污染新账号
      // 注：若两个能力块都存在，说明 loadNodes 曾经运行过，可以信任 localStorage 的标记
      const lsOnboardingDone = typeof localStorage !== 'undefined' && localStorage.getItem('evo_onboarding_v3')
      const serverConfirmsOnboardingDone = hasRealNodes ||
        currentNodes.some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding' && n.capabilityData?.state === 'completed') ||
        (hasOnboarding && hasImportMemory)  // 两个能力块都存在时，视为「服务端已初始化过」
      const onboardingDone = lsOnboardingDone && serverConfirmsOnboardingDone

      // 如果 localStorage 说完成但服务端数据不一致，清除本地标记
      if (lsOnboardingDone && !serverConfirmsOnboardingDone) {
        typeof localStorage !== 'undefined' && localStorage.removeItem('evo_onboarding_v3')
      }

      if (!onboardingDone) {
        // 未完成引导：两块都要有
        if (!hasImportMemory) await get().addCapabilityNode('import-memory')
        if (!hasOnboarding) await get().addCapabilityNode('onboarding')
        // 聚焦到 onboarding 节点
        const onboardingNode = get().nodes.find(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding')
        if (onboardingNode) get().focusNode(onboardingNode.id)
        // openOnboarding 由 OnboardingGuide 组件统一负责触发，避免重复调用导致闪烁
      } else {
        // 已完成引导：确保 import-memory 存在；onboarding 保留（文件里有就有）
        if (!hasImportMemory) await get().addCapabilityNode('import-memory')
        // 检查用户是否已配置 API Key
        void get().checkApiKey()
      }
    } catch (error) {
      console.error('Failed to load nodes:', error)
    }
    set({ nodesLoaded: true })
  },

  // 加载用户偏好
  loadProfile: async () => {
    try {
      const content = await storageService.read(STORAGE_FILES.PROFILE)
      if (content) {
        const profile = JSON.parse(content) as Profile
        set({ profile: { rules: Array.isArray(profile.rules) ? profile.rules : [] } })
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    }
    // 同步加载自定义 Space 配置（piggyback on loadProfile to avoid extra mount calls）
    try {
      const raw = await storageService.read('custom-spaces.json')
      if (raw) {
        const spaces = JSON.parse(raw) as CustomSpaceConfig[]
        if (Array.isArray(spaces)) set({ customSpaces: spaces })
      }
    } catch { /* first run */ }
  },

  // 添加节点（explicitCategory 由 endConversation 传入时优先使用，保证话题拆分分类正确）
  addNode: async (conversation: Conversation, position?: NodePosition, explicitCategory?: string, memoryCount?: number, topicLabel?: string) => {
    // Lenny/PG/Custom 模式：对话节点已由 endConversation space 分支单独写入 space 文件，
    // addNode 不应写主空间 nodes.json，否则会污染主空间画布。
    if (get().isLennyMode || get().isCustomSpaceMode) return

    const { nodes } = get()

    // 生成标题：截断文件内容块（FILE_BLOCK_PREFIX 截断法，避免正则被文件内容干扰）
    const fileBlockIdx = conversation.userMessage.indexOf(FILE_BLOCK_PREFIX)
    const msgWithoutFiles = (fileBlockIdx >= 0
      ? conversation.userMessage.slice(0, fileBlockIdx)
      : conversation.userMessage
    ).replace(/\[REFERENCE_START\][\s\S]*?\[REFERENCE_END\]/g, '').trim()

    // P1-2: 仅上传文件无文字时，用文件名作为标题 fallback
    let titleSource = msgWithoutFiles
    if (!titleSource && fileBlockIdx >= 0) {
      const firstFileMatch = conversation.userMessage.match(/=== 文件 \d+: ([^\n]+) ===/)
      titleSource = firstFileMatch ? `📎 ${firstFileMatch[1]}` : '文件对话'
    }
    const title = (titleSource || conversation.userMessage).slice(0, UI_CONFIG.NODE_TITLE_MAX_LENGTH)

    // 生成关键词并清理结构词
    const keywords = conversation.assistantMessage
      .split(/[\s,，.。!！?？;；]+/)
      .filter(word => word.length >= 2 && word.length <= 6)
      .filter(word => !/^#\d+$/.test(word))
      .filter(word => !['用户', 'AI', '用户：', 'AI：'].includes(word))
      .slice(0, UI_CONFIG.NODE_KEYWORDS_COUNT)

    // --- 增强分类与染色逻辑：优先使用 explicitCategory，否则按全文关键词匹配 ---
    let category: string
    let color: string
    if (explicitCategory) {
      category = explicitCategory
      color = CATEGORY_COLOR_MAP[explicitCategory] ?? DEFAULT_CATEGORY_COLOR
    } else {
      const fullContent = (conversation.userMessage + conversation.assistantMessage).toLowerCase()
      category = _detectIntent(fullContent) || '其他'
      color = CATEGORY_COLOR_MAP[category] ?? DEFAULT_CATEGORY_COLOR
    }

    // --- 聚类布局优化 (Category Island) ---
    const viewW = typeof window !== 'undefined' ? window.innerWidth : 1280
    const viewH = typeof window !== 'undefined' ? window.innerHeight : 800
    const centerX = 1.5 * viewW
    const centerY = 1.5 * viewH

    // 寻找该类别的中心点（岛屿中心）
    const catNodes = nodes.filter(n => n.category === category)
    let islandX = centerX
    let islandY = centerY

    if (catNodes.length > 0) {
      // 岛屿已存在：计算质心
      islandX = catNodes.reduce((sum, n) => sum + n.x, 0) / catNodes.length
      islandY = catNodes.reduce((sum, n) => sum + n.y, 0) / catNodes.length
    } else if (nodes.length > 0) {
      // 新岛屿：找一个远离现有岛屿的空位（缩短距离，早期节点更靠近中心）
      const islandDist = 280
      let angle = Math.random() * Math.PI * 2
      for (let i = 0; i < 12; i++) {
        const tx = centerX + Math.cos(angle) * islandDist
        const ty = centerY + Math.sin(angle) * islandDist
        if (nodes.every(n => Math.hypot(n.x - tx, n.y - ty) > islandDist * 0.7)) {
          islandX = tx
          islandY = ty
          break
        }
        angle += (Math.PI * 2) / 12
      }
      // 限制在 centerX±800 范围内（比原来的 1200 更紧凑）
      islandX = Math.max(centerX - 800, Math.min(centerX + 800, islandX))
      islandY = Math.max(centerY - 800, Math.min(centerY + 800, islandY))
    }

    // 在岛屿周围寻找空位（螺旋搜索，半径上限 1000px）
    let x = position?.x
    let y = position?.y
    const nodeGap = 240

    if (x == null || y == null) {
      let found = false
      for (let i = 0; i < 120; i++) {
        // 最小半径 150，让中心区域保持空旷，节点围绕中心分布
        const radius = 150 + Math.floor(i / 8) * 60
        if (radius > 1000) break
        const angle = (i % 8) * (Math.PI / 4) + (radius / 200)
        const tx = islandX + Math.cos(angle) * radius
        const ty = islandY + Math.sin(angle) * radius

        const isClear = nodes.every(n => {
          if (n.conversationId === conversation.id) return true
          return Math.hypot(n.x - tx, n.y - ty) >= nodeGap
        })

        if (isClear) {
          x = tx
          y = ty
          found = true
          break
        }
      }

      if (!found) {
        // 空间不足：找离岛屿质心最近但距所有节点最远的候选位置
        let bestTx = islandX
        let bestTy = islandY
        let bestMinDist = 0
        for (let a = 0; a < 16; a++) {
          const angle = a * (Math.PI / 8)
          for (const r of [160, 260, 360]) {
            const tx = islandX + Math.cos(angle) * r
            const ty = islandY + Math.sin(angle) * r
            const minDist = nodes
              .filter(n => n.conversationId !== conversation.id)
              .reduce((min, n) => Math.min(min, Math.hypot(n.x - tx, n.y - ty)), Infinity)
            if (minDist > bestMinDist) { bestMinDist = minDist; bestTx = tx; bestTy = ty }
          }
        }
        x = bestTx
        y = bestTy

        // 推挤：把距离新位置 < nodeGap 的所有节点向外移
        const pushRadius = nodeGap * 1.1
        const nodesToPush = nodes.filter(n =>
          n.conversationId !== conversation.id && Math.hypot(n.x - x!, n.y - y!) < pushRadius
        )
        if (nodesToPush.length > 0) {
          const { nodes: currentNodes } = get()
          const pushedNodes = currentNodes.map(n => {
            if (!nodesToPush.some(p => p.id === n.id)) return n
            // 从新节点位置向外推（避免重叠）
            const dx = n.x - x!
            const dy = n.y - y!
            const rawDist = Math.hypot(dx, dy)
            const pushDist = pushRadius - rawDist + 20
            // rawDist === 0 时（完全重叠），随机方向推开
            const dir = rawDist > 0
              ? { x: dx / rawDist, y: dy / rawDist }
              : { x: Math.cos(Math.random() * Math.PI * 2), y: Math.sin(Math.random() * Math.PI * 2) }
            return { ...n, x: n.x + dir.x * pushDist, y: n.y + dir.y * pushDist }
          })
          set({ nodes: pushedNodes })
          // 推挤后的节点位置持久化（异步，不阻塞）
          storageService.write(STORAGE_FILES.NODES, JSON.stringify(pushedNodes, null, 2)).catch(() => {})
        }
      }
    }

    // 坐标钳制：所有节点必须在 center ± 1500px 范围内
    const BOUND = 1500
    x = Math.max(centerX - BOUND, Math.min(centerX + BOUND, x!))
    y = Math.max(centerY - BOUND, Math.min(centerY + BOUND, y!))

    const newNode: Node = {
      id: conversation.id,
      title,
      keywords,
      date: new Date().toISOString().split('T')[0],
      conversationId: conversation.id,
      parentId: conversation.parentId, // 保存父节点 ID
      x: x!,
      y: y!,
      category,
      color,
      groupId: conversation.parentId ? nodes.find(n => n.id === conversation.parentId)?.groupId : undefined,
      memoryCount: memoryCount ?? 0,
      files: (conversation.files || []).filter(f => !f.preview), // 非图片文件供 NodeCard 展示
      conversationIds: [conversation.id],
      topicLabel: topicLabel ?? category,
      firstDate: new Date().toISOString().split('T')[0],
    }

    const existingIndex = nodes.findIndex(n => n.id === conversation.id)
    const updatedNodes =
      existingIndex >= 0
        ? nodes.map((n, idx) => (idx === existingIndex ? { ...n, title, keywords, color, category } : n))
        : [...nodes, newNode]

    set({ nodes: updatedNodes })
    get().updateEdges() // 添加后更新连线
    get().focusNode(conversation.id)
    await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))

    // 异步语义关联，fire-and-forget（capability: 前缀的节点不参与语义关联）
    if (!conversation.id.startsWith('capability:')) {
      _buildSemanticEdgesForNode(conversation.id, get).catch(() => {})
    }

    // 异步生成 AI 摘要标题（不阻塞主流程，失败静默降级为截断句子）
    if (conversation.assistantMessage && conversation.userMessage) {
      authFetch('/api/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({
          userMessage: conversation.userMessage,
          assistantMessage: conversation.assistantMessage
        })
      }).then(async res => {
        if (!res.ok) return
        const data = await res.json() as { title: string | null }
        if (!data.title) return
        const aiTitle = data.title.trim()
        if (!aiTitle) return
        const { nodes: currentNodes } = get()
        const withTitle = currentNodes.map(n =>
          n.id === conversation.id ? { ...n, title: aiTitle } : n
        )
        set({ nodes: withTitle })
        await storageService.write(STORAGE_FILES.NODES, JSON.stringify(withTitle, null, 2))
      }).catch(() => { /* 静默忽略 */ })
    }
  },

  // 更新节点位置
  updateNodePosition: async (id: string, x: number, y: number) => {
    const { nodes, updateEdges } = get()
    const updatedNodes = nodes.map(n => n.id === id ? { ...n, x, y } : n)
    set({ nodes: updatedNodes })
    updateEdges() // 更新连线位置
    await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
  },

  // 轻量位置更新（仅内存，不写磁盘、不重算连线）——用于拖动中 rAF 节流
  updateNodePositionInMemory: (id: string, x: number, y: number) => {
    const { nodes } = get()
    set({ nodes: nodes.map(n => n.id === id ? { ...n, x, y } : n) })
  },

  // 更新连线逻辑 (优先基于分支关系，其次基于板块，最后合并语义边)
  updateEdges: () => {
    const { nodes } = get()
    const newEdges: Edge[] = []
    const connectedNodeIds = new Set<string>()

    // 1. 基于 parentId 的分支连线 (树状结构)
    nodes.forEach(node => {
      if (node.parentId) {
        const parentNode = nodes.find(n => n.id === node.parentId)
        if (parentNode) {
          newEdges.push({
            id: `edge-branch-${parentNode.id}-${node.id}`,
            source: parentNode.id,
            target: node.id,
            label: '延续',
            createdAt: new Date().toISOString(),
            edgeType: 'branch'
          })
          connectedNodeIds.add(node.id)
        }
      }
    })

    // 2. 按类别分组的板块连线 (星型拓扑 - 仅针对没有父节点的根节点)
    const categories = new Map<string, Node[]>()
    nodes.forEach(n => {
      if (connectedNodeIds.has(n.id)) return // 已经有分支连线的不再参与板块星型连线
      if (n.nodeType === 'capability') return // 能力节点不参与分组连线
      const cat = n.category || '其他'
      if (!categories.has(cat)) categories.set(cat, [])
      categories.get(cat)!.push(n)
    })

    categories.forEach((catNodes) => {
      if (catNodes.length < 2) return
      const centerNode = catNodes[0]
      for (let i = 1; i < catNodes.length; i++) {
        const dist = Math.hypot(catNodes[i].x - centerNode.x, catNodes[i].y - centerNode.y)
        if (dist > 600) continue  // 距离太远不连线，避免视觉上的多余连线
        newEdges.push({
          id: `edge-cat-${centerNode.id}-${catNodes[i].id}`,
          source: centerNode.id,
          target: catNodes[i].id,
          label: '同主题',
          createdAt: new Date().toISOString(),
          edgeType: 'category'
        })
      }
    })

    // 3. 合并有效语义边（过滤掉已删除节点的悬空边）
    const nodeIds = new Set(nodes.map(n => n.id))
    const validSemanticEdges = get().semanticEdges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    )
    const validLogicalEdges = get().logicalEdges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    )

    set({ edges: [...newEdges, ...validSemanticEdges, ...validLogicalEdges] })
  },

  addSemanticEdges: (newEdges: Edge[]) => {
    const { semanticEdges } = get()
    const merged = [...semanticEdges, ...newEdges]
    const trimmed = merged.length > 200 ? merged.slice(-200) : merged
    set({ semanticEdges: trimmed })
    get().updateEdges()
    storageService.write(STORAGE_FILES.SEMANTIC_EDGES, JSON.stringify(trimmed, null, 2)).catch(() => {})
  },

  clearSemanticEdgesForNode: (nodeId: string) => {
    const { semanticEdges } = get()
    const filtered = semanticEdges.filter(e => e.source !== nodeId && e.target !== nodeId)
    set({ semanticEdges: filtered })
    storageService.write(STORAGE_FILES.SEMANTIC_EDGES, JSON.stringify(filtered, null, 2)).catch(() => {})
  },

  clearLogicalEdgesForNode: (nodeId: string) => {
    const { logicalEdges } = get()
    const filtered = logicalEdges.filter(e => e.source !== nodeId && e.target !== nodeId)
    set({ logicalEdges: filtered })
    get().updateEdges()
    storageService.write(STORAGE_FILES.LOGICAL_EDGES, JSON.stringify(filtered, null, 2)).catch(() => {})
  },

  addLogicalEdges: (newEdges: Edge[]) => {
    const { logicalEdges } = get()
    const existingIds = new Set(logicalEdges.map(e => e.id))
    const toAdd = newEdges.filter(e => !existingIds.has(e.id))
    if (toAdd.length === 0) return
    const merged = [...logicalEdges, ...toAdd]
    const trimmed = merged.length > 300 ? merged.slice(-300) : merged
    // 记录新增 id，用于触发入场动画
    const newIds = new Set(toAdd.map(e => e.id))
    set({ logicalEdges: trimmed, newLogicalEdgeIds: newIds })
    get().updateEdges()
    storageService.write(STORAGE_FILES.LOGICAL_EDGES, JSON.stringify(trimmed, null, 2)).catch(() => {})
    // 3s 后清除新增标记（动画播完后无需保留）
    setTimeout(() => {
      set(state => {
        const cleaned = new Set(state.newLogicalEdgeIds)
        newIds.forEach(id => cleaned.delete(id))
        return { newLogicalEdgeIds: cleaned }
      })
    }, 3000)
  },

  loadLogicalEdges: async () => {
    try {
      // 先从本地缓存加载
      const cached = await storageService.read(STORAGE_FILES.LOGICAL_EDGES)
      if (cached) {
        try {
          const edges = JSON.parse(cached) as Edge[]
          if (Array.isArray(edges) && edges.length > 0) {
            set({ logicalEdges: edges })
            get().updateEdges()
            return
          }
        } catch { /* ignore */ }
      }
      // 从服务器加载
      const resp = await authFetch('/api/memory/logical-edges')
      if (!resp.ok) return
      const data = await resp.json() as { edges: Array<{ id: string; source_conv: string; target_conv: string; relation: string; reason: string; confidence: number; created_at: string }> }
      if (!data.edges?.length) return
      const { nodes } = get()
      const nodeByConv = new Map(nodes.map(n => [n.conversationId, n.id]))
      const edges: Edge[] = data.edges
        .map(row => {
          const sourceId = nodeByConv.get(row.source_conv)
          const targetId = nodeByConv.get(row.target_conv)
          if (!sourceId || !targetId) return null
          const e: Edge = {
            id: row.id,
            source: sourceId,
            target: targetId,
            label: row.relation,
            createdAt: row.created_at,
            edgeType: 'logical' as const,
            relation: row.relation,
            reason: row.reason,
            confidence: row.confidence
          }
          return e
        })
        .filter((e): e is Edge => e !== null)
      if (edges.length > 0) {
        set({ logicalEdges: edges })
        get().updateEdges()
        storageService.write(STORAGE_FILES.LOGICAL_EDGES, JSON.stringify(edges, null, 2)).catch(() => {})
      }
    } catch (e) {
      console.warn('[canvasStore] loadLogicalEdges failed:', e)
    }
  },

  _triggerLogicalEdgeExtraction: async (conversationId: string, userMessage: string, assistantMessage: string) => {
    try {
      const resp = await authFetch('/api/memory/search/by-id', {
        method: 'POST',
        body: JSON.stringify({ conversationId, topK: 5, threshold: 0.7 })
      })
      if (!resp.ok) return
      const data = await resp.json() as { results: { conversationId: string; score: number }[] }
      if (!data.results?.length) return

      const { nodes } = get()
      const nodeByConv = new Map(nodes.map(n => [n.conversationId, n]))

      const candidates = data.results
        .map(r => {
          const node = nodeByConv.get(r.conversationId)
          if (!node) return null
          // 用 title + keywords 作为候选节点内容摘要，供 AI 判断逻辑关系
          const summary = [node.title, ...(node.keywords ?? [])].filter(Boolean).join(', ')
          return { conversationId: r.conversationId, title: node.title, userMessage: summary, score: r.score }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)

      if (candidates.length === 0) return

      await authFetch('/api/memory/queue', {
        method: 'POST',
        body: JSON.stringify({
          type: 'extract_logical_edges',
          payload: { conversationId, userMessage, assistantMessage, candidateNodes: candidates }
        })
      })
    } catch { /* 静默 */ }
  },

  // 删除节点
  removeNode: async (id: string) => {
    const { isLennyMode, isPGMode, isZhangMode, isWangMode, isCustomSpaceMode, activeCustomSpaceId } = get()

    // Custom Space 模式：只操作对应 space 的 json 文件
    if (isCustomSpaceMode && activeCustomSpaceId) {
      const nodesFile = `custom-${activeCustomSpaceId}-nodes.json`
      const convsFile = `custom-${activeCustomSpaceId}-conversations.jsonl`
      const nodesRaw = await storageService.read(nodesFile)
      let spaceNodes: Node[] = []
      try { if (nodesRaw) spaceNodes = JSON.parse(nodesRaw) } catch { /* use empty */ }
      const nodeToRemove = spaceNodes.find(n => n.id === id)
      const updatedNodes = spaceNodes.filter(n => n.id !== id)
      await storageService.write(nodesFile, JSON.stringify(updatedNodes, null, 2))
      if (nodeToRemove) {
        try {
          const content = await storageService.read(convsFile)
          if (content) {
            const lines = content.trim().split('\n').filter(Boolean)
            const filteredLines = lines.filter(line => {
              try {
                const conv = JSON.parse(line) as Conversation
                return conv.id !== nodeToRemove.conversationId
              } catch { return true }
            })
            await storageService.write(convsFile, filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : ''))
          }
        } catch { /* ignore */ }
      }
      return
    }

    // Space 模式（Lenny / PG / Zhang / Wang）：只操作对应 space 的 json 文件，不影响用户数据
    if (isLennyMode) {
      const nodesFile = isPGMode ? STORAGE_FILES.PG_NODES : isZhangMode ? STORAGE_FILES.ZHANG_NODES : isWangMode ? STORAGE_FILES.WANG_NODES : STORAGE_FILES.LENNY_NODES
      const convsFile = isPGMode ? STORAGE_FILES.PG_CONVERSATIONS : isZhangMode ? STORAGE_FILES.ZHANG_CONVERSATIONS : isWangMode ? STORAGE_FILES.WANG_CONVERSATIONS : STORAGE_FILES.LENNY_CONVERSATIONS
      const nodesRaw = await storageService.read(nodesFile)
      let lennyNodes: Node[] = []
      try { if (nodesRaw) lennyNodes = JSON.parse(nodesRaw) } catch { /* use empty */ }
      const nodeToRemove = lennyNodes.find(n => n.id === id)
      const updatedNodes = lennyNodes.filter(n => n.id !== id)
      await storageService.write(nodesFile, JSON.stringify(updatedNodes, null, 2))
      // 同步清理 conversations 文件
      if (nodeToRemove) {
        try {
          const content = await storageService.read(convsFile)
          if (content) {
            const lines = content.trim().split('\n').filter(Boolean)
            const filteredLines = lines.filter(line => {
              try {
                const conv = JSON.parse(line) as Conversation
                return conv.id !== nodeToRemove.conversationId
              } catch { return true }
            })
            await storageService.write(convsFile, filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : ''))
          }
        } catch { /* ignore */ }
      }
      // SpaceCanvas 通过 isModalOpen 变化来重载节点，无需写 store.nodes
      return
    }

    const { nodes } = get()
    const nodeToRemove = nodes.find(n => n.id === id)
    const updatedNodes = nodes.filter(n => n.id !== id)
    set({ nodes: updatedNodes })
    get().clearSemanticEdgesForNode(id) // 清理该节点相关的语义边
    get().clearLogicalEdgesForNode(id) // 清理该节点相关的逻辑边
    get().updateEdges() // 删除后同步更新连线

    // 1. 同步删除节点文件记录
    await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))

    // 2. 同步清理对话记录文件（jsonl 格式需要重写）
    if (nodeToRemove) {
      try {
        const content = await storageService.read(STORAGE_FILES.CONVERSATIONS)
        if (content) {
          const lines = content.trim().split('\n').filter(Boolean)
          const filteredLines = lines.filter(line => {
            try {
              const conv = JSON.parse(line) as Conversation
              return conv.id !== nodeToRemove.conversationId
            } catch {
              return true
            }
          })
          await storageService.write(STORAGE_FILES.CONVERSATIONS, filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : ''))
        }
      } catch (err) {
        console.error('Failed to sync conversation deletion:', err)
      }

      // fire-and-forget：删除向量索引 + 对话历史
      authFetch(`/api/memory/index/${nodeToRemove.conversationId}`, { method: 'DELETE' })
        .catch(() => { /* 静默忽略 */ })
      authFetch(`/api/memory/logical-edges/${nodeToRemove.conversationId}`, { method: 'DELETE' })
        .catch(() => {})
      historyService.deleteHistory(nodeToRemove.conversationId)
    }
  },

  renameNode: async (id: string, newTitle: string) => {
    const { nodes } = get()
    const updatedNodes = nodes.map(n => n.id === id ? { ...n, title: newTitle } : n)
    set({ nodes: updatedNodes })
    await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
  },

  mergeIntoNode: async (targetNodeId: string, newConvId: string, newDate: string) => {
    const { nodes } = get()
    let changed = false
    const updatedNodes = nodes.map(n => {
      if (n.id !== targetNodeId) return n
      const existingIds = n.conversationIds ?? [n.conversationId]
      if (existingIds.includes(newConvId)) return n
      changed = true
      return {
        ...n,
        conversationId: newConvId,
        conversationIds: [...existingIds, newConvId],
        date: newDate,
      }
    })
    if (!changed) return
    set({ nodes: updatedNodes })
    get().updateEdges()
    await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
  },

  // 开始对话 (增强：检测意图并智能分支)
  startConversation: async (
    userMessage: string,
    images?: string[],
    files?: import('@shared/types').FileAttachment[],
    parentId?: string,
    options?: { invokedAssistant?: import('@shared/types').AssistantInvocation },
  ) => {
    const {
      nodes, detectIntent, getRelevantMemories, isLennyMode, isPGMode, isZhangMode, isWangMode, lennyDecisionMode, zhangDecisionMode,
    } = get()

    // 1. 检测当前意图分类
    const category = detectIntent(userMessage)

    // 2. 先立即打开 modal（不等待 embedding），提升响应速度
    const convId = crypto.randomUUID()
    const conversation: Conversation & { _appliedMemories?: { conv: Conversation; category?: string; nodeId?: string }[] } = {
      id: convId,
      parentId: parentId,
      createdAt: new Date().toISOString(),
      userMessage,
      assistantMessage: '',
      invokedAssistant: options?.invokedAssistant,
      decisionTrace: isLennyMode && !isPGMode && !isWangMode
        ? isZhangMode
          ? { mode: zhangDecisionMode, personaId: 'zhang' }
          : { mode: lennyDecisionMode, personaId: 'lenny' }
        : options?.invokedAssistant?.type === 'public_space' && (options.invokedAssistant.id === 'lenny' || options.invokedAssistant.id === 'zhang')
          ? {
              mode: options.invokedAssistant.mode ?? 'normal',
              personaId: options.invokedAssistant.id,
            }
        : undefined,
      images: images || [],
      files: files || [],
      _appliedMemories: []
    }
    set({ currentConversation: conversation, isModalOpen: true, isLoading: false })

    // 3. Lenny 模式下跳过用户记忆关联（记忆来源不同，不做 parentId 推断）
    if (isLennyMode) return

    // 4. 后台异步获取记忆，用于自动连线（不阻塞 modal 打开）
    if (!parentId) {
      getRelevantMemories(userMessage).then(memories => {
        const bestMatch = memories.find(m => {
          const n = nodes.find(node => node.id === m.conv.id)
          return n?.category === category
        })
        const effectiveParentId = bestMatch?.conv.id
        // 仅当对话还是当前活跃的且还未发送（assistantMessage 为空）时才更新
        const current = get().currentConversation
        if (current?.id === convId && current.assistantMessage === '') {
          set({
            currentConversation: {
              ...current,
              parentId: effectiveParentId ?? current.parentId,
              _appliedMemories: memories
            } as Conversation & { _appliedMemories: typeof memories }
          })
        }
      }).catch(() => { /* 静默忽略，不影响对话 */ })
    }
  },

  // 更新对话记录（用于编辑消息等场景）
  updateConversation: async (conversationId: string, updates: Partial<Conversation>) => {
    const { currentConversation } = get()
    if (currentConversation && currentConversation.id === conversationId) {
      set({ 
        currentConversation: { ...currentConversation, ...updates },
        isLoading: updates.assistantMessage === '' // 如果清空了助手回复，说明正在重新请求
      })
    }
  },

  // 结束对话 (增强：支持基于意图的话题拆分；explicitConversation 用于 handleClose 后台保存时传入快照)
  endConversation: async (assistantMessage: string, appliedPreferences?: string[], reasoning_content?: string, explicitConversation?: Conversation) => {
    const { addNode, appendConversation, detectIntent, isLennyMode, isPGMode, isZhangMode, isWangMode, isCustomSpaceMode, activeCustomSpaceId } = get()
    const currentConversation = explicitConversation ?? get().currentConversation
    if (!currentConversation) return

    // Custom Space 模式：简化保存逻辑，写自定义 space 文件，不污染用户数据，不触发 sync-lenny-conv
    if (isCustomSpaceMode && activeCustomSpaceId) {
      const nodesFile = `custom-${activeCustomSpaceId}-nodes.json`
      const convsFile = `custom-${activeCustomSpaceId}-conversations.jsonl`
      const conv: Conversation = {
        id: currentConversation.id,
        createdAt: new Date().toISOString(),
        userMessage: currentConversation.userMessage,
        assistantMessage,
        decisionTrace: currentConversation.decisionTrace,
        images: [],
        files: [],
      }
      const nodeTitle = currentConversation.userMessage.slice(0, 30) || 'Conversation'
      const stopWords = new Set(['their', 'about', 'which', 'would', 'could', 'there', 'other',
        'where', 'should', 'these', 'those', 'being', 'after', 'while', 'between', 'through', 'before',
        'under', 'think', 'right', 'every', 'start', 'point', 'might', 'often', 'first', 'since'])
      const keywords = assistantMessage
        .replace(/[#*`>\[\]()]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4 && !stopWords.has(w))
        .slice(0, 3)
      let category = '工作事业'
      const lower = assistantMessage.toLowerCase()
      if (/relationship|team|culture|management|feedback/.test(lower)) category = '关系情感'
      else if (/think|philosophy|framework|belief|mindset/.test(lower)) category = '思考世界'
      else if (/health|workout|sleep|energy/.test(lower)) category = '健康身体'
      else if (/design|creative|writing|art|music/.test(lower)) category = '创意表达'
      await storageService.append(convsFile, JSON.stringify(conv))
      const nodesRaw = await storageService.read(nodesFile)
      let spaceNodes: Node[] = []
      try { if (nodesRaw) spaceNodes = JSON.parse(nodesRaw) } catch { /* use empty */ }
      const centerX = spaceNodes.length > 0 ? spaceNodes.reduce((s, n) => s + n.x, 0) / spaceNodes.length : 1920
      const centerY = spaceNodes.length > 0 ? spaceNodes.reduce((s, n) => s + n.y, 0) / spaceNodes.length : 1200
      const minDist = 300
      let nx = centerX + 300, ny = centerY
      {
        const goldenAngle = Math.PI * (3 - Math.sqrt(5))
        for (let i = 0; i < 200; i++) {
          const r = minDist * Math.sqrt(i + 1)
          const theta = i * goldenAngle
          const cx = centerX + r * Math.cos(theta)
          const cy = centerY + r * Math.sin(theta)
          if (!spaceNodes.some(n => Math.hypot(n.x - cx, n.y - cy) < minDist)) { nx = cx; ny = cy; break }
        }
      }
      const newNode: Node = {
        id: conv.id,
        title: nodeTitle,
        keywords,
        date: conv.createdAt.split('T')[0],
        conversationId: conv.id,
        category,
        nodeType: 'memory',
        x: Math.round(nx),
        y: Math.round(ny),
      }
      spaceNodes.push(newNode)
      await storageService.write(nodesFile, JSON.stringify(spaceNodes, null, 2))

      // P4: 自定义 Space 对话也同步到主空间触发记忆提取 + 进化基因更新
      if (assistantMessage.trim()) {
        try {
          await authFetch('/api/memory/sync-lenny-conv', {
            method: 'POST',
            body: JSON.stringify({
              conversationId: conv.id,
              userMessage: conv.userMessage,
              assistantMessage,
              source: `custom-${activeCustomSpaceId}`,
            }),
          })
        } catch { /* 静默失败，不影响 Custom Space 体验 */ }

        // 记忆事实提取（fire-and-forget）
        const cleanUserMsg = conv.userMessage.replace(/\[REFERENCE_START\][\s\S]*?\[REFERENCE_END\]/g, '[引用内容已省略]').trim()
        if (cleanUserMsg.length > 5) {
          authFetch('/api/memory/extract', {
            method: 'POST',
            body: JSON.stringify({
              conversationId: conv.id,
              userMessage: cleanUserMsg,
              assistantMessage: assistantMessage.slice(0, 400),
            }),
          }).catch(() => {})
        }
      }

      return
    }

    // Space 模式（Lenny 或 PG）：简化保存逻辑——直接写对应 space 文件，跳过分类/合并/向量索引/画像提取
    if (isLennyMode) {
      const nodesFile = isPGMode ? STORAGE_FILES.PG_NODES : isZhangMode ? STORAGE_FILES.ZHANG_NODES : isWangMode ? STORAGE_FILES.WANG_NODES : STORAGE_FILES.LENNY_NODES
      const convsFile = isPGMode ? STORAGE_FILES.PG_CONVERSATIONS : isZhangMode ? STORAGE_FILES.ZHANG_CONVERSATIONS : isWangMode ? STORAGE_FILES.WANG_CONVERSATIONS : STORAGE_FILES.LENNY_CONVERSATIONS
      const conv: Conversation = {
        id: currentConversation.id,
        createdAt: new Date().toISOString(),
        userMessage: currentConversation.userMessage,
        assistantMessage,
        images: [],
        files: [],
      }
      const nodeTitle = currentConversation.userMessage.slice(0, 30) || 'Conversation'
      // P2-1: 英文停用词过滤，避免 "their/about/which" 等噪声词出现在节点关键词里
      const lennyStopWords = new Set(['their', 'about', 'which', 'would', 'could', 'there', 'other',
        'where', 'should', 'these', 'those', 'being', 'after', 'while', 'between', 'through', 'before',
        'under', 'think', 'right', 'every', 'start', 'point', 'might', 'often', 'first', 'since'])
      const keywords = assistantMessage
        .replace(/[#*`>\[\]()]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4 && !lennyStopWords.has(w))
        .slice(0, 3)
      // 分类：简单英文关键词启发
      let category = '工作事业'
      const lower = assistantMessage.toLowerCase()
      if (/relationship|team|culture|management|feedback/.test(lower)) category = '关系情感'
      else if (/think|philosophy|framework|belief|mindset/.test(lower)) category = '思考世界'
      else if (/health|workout|sleep|energy/.test(lower)) category = '健康身体'
      else if (/design|creative|writing|art|music/.test(lower)) category = '创意表达'
      // 写对话记录
      await storageService.append(convsFile, JSON.stringify(conv))
      // 写节点
      const nodesRaw = await storageService.read(nodesFile)
      let lennyNodes: Node[] = []
      try { if (nodesRaw) lennyNodes = JSON.parse(nodesRaw) } catch { /* use empty */ }
      const centerX = lennyNodes.length > 0 ? lennyNodes.reduce((s, n) => s + n.x, 0) / lennyNodes.length : 1920
      const centerY = lennyNodes.length > 0 ? lennyNodes.reduce((s, n) => s + n.y, 0) / lennyNodes.length : 1200
      const minDist = 300
      // 螺旋环形布局：确保新节点不与已有节点重叠（无随机失败风险）
      let nx = centerX + 300, ny = centerY
      {
        const goldenAngle = Math.PI * (3 - Math.sqrt(5)) // ~137.5°
        for (let i = 0; i < 200; i++) {
          const r = minDist * Math.sqrt(i + 1)
          const theta = i * goldenAngle
          const cx = centerX + r * Math.cos(theta)
          const cy = centerY + r * Math.sin(theta)
          if (!lennyNodes.some(n => Math.hypot(n.x - cx, n.y - cy) < minDist)) { nx = cx; ny = cy; break }
        }
      }
      const newNode: Node = {
        id: conv.id,
        title: nodeTitle,
        keywords,
        date: conv.createdAt.split('T')[0],
        conversationId: conv.id,
        category,
        nodeType: 'memory',
        x: Math.round(nx),
        y: Math.round(ny),
      }
      lennyNodes.push(newNode)
      await storageService.write(nodesFile, JSON.stringify(lennyNodes, null, 2))

      // P4: 所有 Space（Lenny / PG / 未来扩展）的对话均同步到用户主空间，触发记忆提取 + 节点生成
      if (assistantMessage.trim()) {
        try {
          await authFetch('/api/memory/sync-lenny-conv', {
            method: 'POST',
            body: JSON.stringify({
              conversationId: conv.id,
              userMessage: conv.userMessage,
              assistantMessage,
              decisionTrace: currentConversation.decisionTrace,
              source: isPGMode ? 'pg' : isZhangMode ? 'zhang' : isWangMode ? 'wang' : 'lenny',
            }),
          })
        } catch { /* 静默失败，不影响 Lenny 空间体验 */ }

        // 记忆事实提取（fire-and-forget）
        const cleanUserMsg = conv.userMessage
          .replace(/\[REFERENCE_START\][\s\S]*?\[REFERENCE_END\]/g, '[引用内容已省略]')
          .trim()
        if (cleanUserMsg.length > 5) {
          authFetch('/api/memory/extract', {
            method: 'POST',
            body: JSON.stringify({
              conversationId: conv.id,
              userMessage: cleanUserMsg,
              assistantMessage: assistantMessage.slice(0, 400),
            }),
          }).catch(() => {})
        }

        // 主空间节点：将 Lenny/PG 对话以 memory 节点形式写入用户主空间画布
        await addNode(conv).catch(() => {})
      }

      return
    }

    /** 调后端 AI 分类，5s 超时后降级为关键词 */
    const classifyText = async (text: string): Promise<string> => {
      try {
        const resp = await authFetch('/api/memory/classify', {
          method: 'POST',
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(5000)
        })
        if (resp.ok) {
          const data = (await resp.json()) as { category: string | null }
          if (data.category) return data.category
        }
      } catch { /* 降级 */ }
      return detectIntent(text)
    }

    // 1. 解析回复中的多轮对话（截断到 20000 字符防止正则回溯超时）
    const sectionRegex = /#\s*(\d+)\s*\n+\s*用户[：:]\s*([\s\S]*?)\n+\s*AI[：:]\s*([\s\S]*?)(?=\n+\s*#\s*\d+|$)/g
    const rawTurns: { user: string; ai: string }[] = []
    let match
    while ((match = sectionRegex.exec(assistantMessage.slice(0, 20000))) !== null) {
      rawTurns.push({ user: match[2].trim(), ai: match[3].trim() })
    }
    if (rawTurns.length === 0) {
      rawTurns.push({ user: currentConversation.userMessage, ai: assistantMessage })
    }

    // 并发 AI 分类（所有 turn 同时请求）
    const categories = await Promise.all(rawTurns.map(t => classifyText(t.user)))
    const turns = rawTurns.map((t, i) => ({ ...t, category: categories[i] }))

    // 2. 根据连续的分类进行分组
    const groups: { category: string; user: string; ai: string }[] = []
    turns.forEach((turn, idx) => {
      const lastGroup = groups[groups.length - 1]
      // 只有在分类一致时才合并，否则开启新分组（拆分节点）
      if (lastGroup && lastGroup.category === turn.category) {
        lastGroup.user += `\n\n${turn.user}`
        lastGroup.ai += `\n\n# ${idx + 1}\n用户：${turn.user}\nAI：${turn.ai}`
      } else {
        groups.push({
          category: turn.category,
          user: turn.user,
          ai: `# ${idx + 1}\n用户：${turn.user}\nAI：${turn.ai}`
        })
      }
    })

    // 3. 为每个分组创建独立的对话记录和节点
    const appliedMemories = (currentConversation as any)._appliedMemories as { conv: Conversation; category?: string; nodeId?: string }[] | undefined
    const appliedMemoryIds = appliedMemories?.map(m => m.conv.id) ?? []

    /** 提取语义话题标签（不阻塞主流程） */
    const extractTopicLabel = async (userMsg: string, assistantMsg: string): Promise<string | null> => {
      try {
        const resp = await authFetch('/api/memory/extract-topic', {
          method: 'POST',
          body: JSON.stringify({ userMessage: userMsg, assistantMessage: assistantMsg }),
          signal: AbortSignal.timeout(5000)
        })
        if (resp.ok) {
          const data = await resp.json() as { topic: string | null }
          return data.topic || null
        }
      } catch { /* 降级 */ }
      return null
    }

    /** 语义相似度检索：找最相似的已有节点（score ≥ 0.75 则合并） */
    const MERGE_THRESHOLD = 0.75
    const findMergeTarget = async (userMsg: string, assistantMsg: string, excludeConvId: string): Promise<string | null> => {
      try {
        const query = `${userMsg.slice(0, 300)} ${assistantMsg.slice(0, 200)}`
        const resp = await authFetch('/api/memory/search', {
          method: 'POST',
          body: JSON.stringify({ query, topK: 3 }),
          signal: AbortSignal.timeout(6000)
        })
        if (!resp.ok) return null
        const data = await resp.json() as { results: { conversationId: string; score: number }[] }
        // 找得分最高、且不属于本次新对话的结果
        const best = data.results.find(r => r.conversationId !== excludeConvId && r.score >= MERGE_THRESHOLD)
        if (!best) return null
        const { nodes } = get()
        const targetNode = nodes.find(n => {
          const ids = n.conversationIds ?? [n.conversationId]
          return ids.includes(best.conversationId)
        })
        return targetNode?.id ?? null
      } catch { /* 降级 */ }
      return null
    }

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const isFirst = i === 0

      const conv: Conversation = {
        id: isFirst ? currentConversation.id : crypto.randomUUID(),
        parentId: isFirst ? currentConversation.parentId : currentConversation.id, // 后续话题作为第一话题的分支
        createdAt: new Date().toISOString(),
        userMessage: group.user,
        assistantMessage: group.ai,
        reasoning_content: isFirst ? reasoning_content : undefined, // 简单起见，只在第一话题保留全量推理
        appliedPreferences,
        appliedMemoryIds: isFirst ? appliedMemoryIds : [],
        images: isFirst ? currentConversation.images : [], // 文件通常只在第一轮
        files: isFirst ? currentConversation.files : []
      }

      try {
        await appendConversation(conv)

        // 提取语义话题标签（不阻塞主流程）
        const topicLabel = await extractTopicLabel(group.user, group.ai)

        // 若用户主动续话（有 parentId），直接合并；否则语义检索
        const parentNodeId = isFirst ? currentConversation.parentId : currentConversation.id
        let mergeTargetId: string | null = parentNodeId || null
        if (!mergeTargetId) {
          mergeTargetId = await findMergeTarget(group.user, group.ai, conv.id)
        }

        if (mergeTargetId) {
          await get().mergeIntoNode(mergeTargetId, conv.id, conv.createdAt.split('T')[0])
        } else {
          await addNode(conv, undefined, group.category, isFirst ? appliedMemoryIds.length : 0, topicLabel ?? undefined)
        }
      } catch (error) {
        console.error(`Failed to save topic group ${i}:`, error)
        if (isFirst) set({ lastError: 'Failed to save conversation — check your connection' })
      }
    }

    set({ isLoading: false })
  },

  // 关闭模态框
  closeModal: () => {
    // 持久化当前对话历史到服务器（fire-and-forget）
    // P1-3: Lenny/Custom Space 模式下不写用户历史（space 对话不属于用户的 conversation_history）
    const { currentConversation, conversationHistory, isLennyMode, isCustomSpaceMode, isOnboardingMode } = get()
    if (!isLennyMode && !isCustomSpaceMode && !isOnboardingMode && currentConversation?.id && conversationHistory.length > 0) {
      historyService.saveHistory(currentConversation.id, conversationHistory)
    }
    set({
      isModalOpen: false,
      currentConversation: null,
      isLoading: false,
      highlightedCategory: null,
      highlightedNodeIds: [],
      focusedCategory: null,
      conversationHistory: [],
      isOnboardingMode: false,
      onboardingPhase: 0,
      onboardingResumeTurns: null,
    })
  },

  // 打开模态框（用于回放）
  openModal: (conversation: Conversation) => {
    set({ currentConversation: conversation, isModalOpen: true, isLoading: false })
    // 异步加载该对话的历史上下文（不阻塞 UI 打开）
    historyService.getHistory(conversation.id).then(messages => {
      if (messages.length > 0) set({ conversationHistory: messages })
    })
  },

  // 通过 conversationId 打开回放（从 conversations.jsonl 读取完整内容）
  openModalById: async (conversationId: string) => {
    // 立即打开 modal 并显示 loading，不等网络，避免点击无响应的感知延迟
    // 用令牌防并发：快速点击多个卡片时，只有最后一次的结果会被应用
    const token = ++_openModalToken
    set({ isModalOpen: true, isLoading: true, conversationHistory: [] })
    try {
      const { isLennyMode, isPGMode, isZhangMode, isWangMode, isCustomSpaceMode, activeCustomSpaceId } = get()
      const convFile = isCustomSpaceMode && activeCustomSpaceId
        ? `custom-${activeCustomSpaceId}-conversations.jsonl`
        : isLennyMode
          ? (isPGMode ? STORAGE_FILES.PG_CONVERSATIONS : isZhangMode ? STORAGE_FILES.ZHANG_CONVERSATIONS : isWangMode ? STORAGE_FILES.WANG_CONVERSATIONS : STORAGE_FILES.LENNY_CONVERSATIONS)
          : STORAGE_FILES.CONVERSATIONS
      const content = await storageService.read(convFile)
      if (token !== _openModalToken) return  // 被更新的调用抢先了，丢弃此结果
      if (!content) {
        set({ isLoading: false })
        return
      }
      const lines = content.trim().split('\n').filter(Boolean)
      // 恢复策略：同一 conversationId 可能被多次 append（例如曾经被“短版本”覆盖）。
      // 优先选择“最完整”的 assistantMessage（多轮 transcript/更长），同时保留最新记录的其他字段。
      let latest: Conversation | null = null
      let bestAssistantMessage = ''
      let bestReasoning: string | undefined
      let bestScore = -1
      const childConvs: Array<{ id: string; assistantLen: number; hasMulti: boolean; createdAt?: string; userLen: number }> = []
      const scanLimit = 8000 // 防止超大文件导致卡顿；足够覆盖同一对话的多次回写
      let scanned = 0

      const scoreAssistant = (a: string) => {
        const hasMulti = a.includes('#1\n') || a.includes('# 1\n')
        return (hasMulti ? 1_000_000_000 : 0) + a.length
      }

      const maxTurnIndexFromTranscript = (text: string) => {
        let maxIdx = 0
        const re = /^#\s*(\d+)\s*$/gm
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const n = Number(m[1])
          if (Number.isFinite(n)) maxIdx = Math.max(maxIdx, n)
        }
        // 兼容 "#1\n用户：" 这种没有独立行的情况
        const re2 = /#\s*(\d+)\s*\n/g
        while ((m = re2.exec(text)) !== null) {
          const n = Number(m[1])
          if (Number.isFinite(n)) maxIdx = Math.max(maxIdx, n)
        }
        return maxIdx
      }

      const ensureTranscript = (conv: Conversation) => {
        const u = (conv.userMessage || '').trim()
        const a = (conv.assistantMessage || '').trim()
        const hasMulti = a.includes('#1\n') || a.includes('# 1\n')
        if (hasMulti) return a
        if (!u && !a) return ''
        return `#1\n用户：${u}\nAI：\n${a}`.trim()
      }

      const appendTurnBlock = (base: string, idx: number, user: string, assistant: string) => {
        const u = (user || '').trim()
        const a = (assistant || '').trim()
        if (!u && !a) return base
        const block = `#${idx}\n用户：${u}\nAI：\n${a}`.trim()
        return base ? `${base}\n\n${block}` : block
      }

      for (let i = lines.length - 1; i >= 0; i--) {
        if (scanned++ > scanLimit) break
        try {
          const conv = JSON.parse(lines[i]) as Conversation
          // 收集“话题拆分”产生的子对话（parentId 指向当前对话 id）
          if (conv.parentId === conversationId && conv.id !== conversationId) {
            const a = conv.assistantMessage || ''
            childConvs.push({
              id: conv.id,
              assistantLen: a.length,
              hasMulti: a.includes('#1\n') || a.includes('# 1\n')
              ,createdAt: (conv as any)?.createdAt
              ,userLen: (conv.userMessage || '').length
            })
          }
          if (conv.id !== conversationId) continue
          if (!latest) { latest = conv }
          const a = conv.assistantMessage || ''
          const s = scoreAssistant(a)
          if (s > bestScore) {
            bestScore = s
            bestAssistantMessage = a
            bestReasoning = conv.reasoning_content
          }
        } catch { /* ignore invalid line */ }
      }

      if (latest) {
        const latestA = latest.assistantMessage || ''
        const latestHasMulti = latestA.includes('#1\n') || latestA.includes('# 1\n')
        const bestHasMulti = bestAssistantMessage.includes('#1\n') || bestAssistantMessage.includes('# 1\n')
        // 新策略：同 id 多条记录中，优先选择“最完整”的 transcript（多轮优先，其次更长）
        // 仅当差异明显时触发“修复回写”，避免每次打开都无限 append
        const diffLen = bestAssistantMessage.length - latestA.length
        const shouldPreferBest = diffLen > 80
        const shouldRepair = shouldPreferBest && (bestHasMulti || latestHasMulti || bestAssistantMessage.trim().length > 0)
        const mergedBase: Conversation = shouldRepair
          ? { ...latest, assistantMessage: bestAssistantMessage, reasoning_content: bestReasoning ?? latest.reasoning_content }
          : latest

        // 线程展示：把 parentId==conversationId 的子对话追加到 transcript 末尾，避免“昨晚的内容在分支里看不到”
        let mergedAssistant = ensureTranscript(mergedBase)
        let nextIdx = maxTurnIndexFromTranscript(mergedAssistant) + 1
        const childFull: Conversation[] = []
        if (childConvs.length > 0) {
          // 再扫描一次，取出子对话正文（仅扫描窗口内，成本可控）
          const want = new Set(childConvs.map(c => c.id))
          scanned = 0
          for (let i = lines.length - 1; i >= 0; i--) {
            if (scanned++ > scanLimit) break
            try {
              const conv = JSON.parse(lines[i]) as Conversation
              if (want.has(conv.id)) childFull.push(conv)
            } catch { /* ignore */ }
          }
          childFull.sort((a, b) => String((a as any)?.createdAt ?? '').localeCompare(String((b as any)?.createdAt ?? '')))
          for (const cc of childFull) {
            mergedAssistant = appendTurnBlock(mergedAssistant, nextIdx++, cc.userMessage || '', cc.assistantMessage || '')
          }
        }
        const merged: Conversation = mergedAssistant && mergedAssistant !== (mergedBase.assistantMessage || '')
          ? { ...mergedBase, assistantMessage: mergedAssistant }
          : mergedBase

        if (token !== _openModalToken) return
        set({
          currentConversation: merged,
          isLoading: false,
          lennyDecisionMode: isLennyMode && !isPGMode && !isZhangMode && !isWangMode
            ? (merged.decisionTrace?.mode ?? get().lennyDecisionMode)
            : get().lennyDecisionMode,
          zhangDecisionMode: isLennyMode && isZhangMode
            ? (merged.decisionTrace?.mode ?? get().zhangDecisionMode)
            : get().zhangDecisionMode,
        })

        // 若触发修复：追加写回一条“修复后的完整版”，让后续读取不再落到短版本
        // 注意：这里也会把子对话合并进 transcript（仅影响回放显示，不影响子节点本身）
        if (shouldRepair || childConvs.length > 0) {
          get().appendConversation(merged).catch(() => {})
        }

        // 异步加载该对话的历史上下文
        historyService.getHistory(conversationId).then(messages => {
          if (token !== _openModalToken) return
          if (messages.length > 0) set({ conversationHistory: messages })
        })
        return
      }

      // 找不到对话记录，关闭 modal 避免显示空白/错误内容
      if (token === _openModalToken) set({ isLoading: false, isModalOpen: false })
    } catch (error) {
      if (token === _openModalToken) set({ isLoading: false, isModalOpen: false })
    }
  },

  // 检测负反馈
  detectFeedback: (message: string): PreferenceRule | null => {
    for (const trigger of FEEDBACK_TRIGGERS) {
      for (const keyword of trigger.keywords) {
        if (message.includes(keyword)) {
          // 检查是否已存在相同偏好的规则
          const { profile } = get()
          const rules = Array.isArray(profile?.rules) ? profile.rules : []
          const existingRule = rules.find(r => r.preference === trigger.preference)
          
          if (existingRule) {
            // 更新现有规则的置信度
            existingRule.confidence = Math.min(
              existingRule.confidence + CONFIDENCE_CONFIG.INCREMENT,
              CONFIDENCE_CONFIG.MAX
            )
            existingRule.updatedAt = new Date().toISOString().split('T')[0]
            return existingRule
          }
          
          // 创建新规则
          return {
            trigger: keyword,
            preference: trigger.preference,
            confidence: CONFIDENCE_CONFIG.INITIAL,
            updatedAt: new Date().toISOString().split('T')[0]
          }
        }
      }
    }
    return null
  },

  // 添加偏好规则
  addPreference: async (newRule: PreferenceRule) => {
    const { profile } = get()
    const rules = Array.isArray(profile?.rules) ? profile.rules : []
    
    // 检查是否已存在相同偏好的规则
    const existingIndex = rules.findIndex(r => r.preference === newRule.preference)
    
    let updatedRules: PreferenceRule[]
    if (existingIndex >= 0) {
      // 更新现有规则
      updatedRules = [...rules]
      updatedRules[existingIndex] = newRule
    } else {
      // 添加新规则
      updatedRules = [...rules, newRule]
    }
    
    const updatedProfile = { ...profile, rules: updatedRules }
    set({ profile: updatedProfile })
    
    // 持久化
    await storageService.write(
      STORAGE_FILES.PROFILE,
      JSON.stringify(updatedProfile, null, 2)
    )
  },

  // 获取用于Prompt的偏好列表
  getPreferencesForPrompt: (): string[] => {
    const { profile } = get()
    const rules = Array.isArray(profile?.rules) ? profile.rules : []
    // 只返回置信度较高的偏好（> 0.5）
    return rules
      .filter(r => r.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .map(r => r.preference)
  },

  // 检测查询意图（六类体系）——委托给 utils/intentDetector.ts，保持接口兼容
  detectIntent: (query: string): string => {
    return _detectIntent(query)
  },

  // 获取相关的历史记忆（后端向量检索，降级到关键词搜索）
  getRelevantMemories: async (query: string): Promise<{ conv: Conversation; category?: string; nodeId?: string }[]> => {
    try {
      const { nodes, isLennyMode, isPGMode, isZhangMode, isWangMode, isCustomSpaceMode, activeCustomSpaceId } = get()

      // Custom Space 模式：从 custom space 文件中做关键词搜索
      if (isCustomSpaceMode && activeCustomSpaceId) {
        const convsFile = `custom-${activeCustomSpaceId}-conversations.jsonl`
        const nodesFile = `custom-${activeCustomSpaceId}-nodes.json`
        const content = await storageService.read(convsFile)
        if (!content) return []
        const spaceNodesRaw = await storageService.read(nodesFile)
        let spaceNodes: Node[] = []
        try { if (spaceNodesRaw) spaceNodes = JSON.parse(spaceNodesRaw) } catch { /* */ }
        const nodeByConvId = new Map<string, Node>()
        spaceNodes.forEach(n => nodeByConvId.set(n.conversationId, n))
        const lines = content.trim().split('\n').filter(Boolean)
        const convs: Conversation[] = []
        for (const line of lines) {
          try { const c = JSON.parse(line) as Conversation; if (c.id) convs.push(c) } catch { /* */ }
        }
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for', 'with'])
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length >= 3 && !stopWords.has(k)).slice(0, 10)
        if (keywords.length === 0) return convs.slice(-5).map(conv => ({ conv, category: nodeByConvId.get(conv.id)?.category, nodeId: nodeByConvId.get(conv.id)?.id }))
        return convs
          .map(conv => {
            const text = (conv.userMessage + ' ' + conv.assistantMessage).toLowerCase()
            const score = keywords.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0)
            return { conv, score, node: nodeByConvId.get(conv.id) }
          })
          .filter(r => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(r => ({ conv: r.conv, category: r.node?.category, nodeId: r.node?.id }))
      }

      // Space 模式：从 space-specific conversations/nodes 文件中做关键词搜索
      if (isLennyMode) {
        const convsFile = isPGMode ? STORAGE_FILES.PG_CONVERSATIONS : isZhangMode ? STORAGE_FILES.ZHANG_CONVERSATIONS : isWangMode ? STORAGE_FILES.WANG_CONVERSATIONS : STORAGE_FILES.LENNY_CONVERSATIONS
        const nodesFile = isPGMode ? STORAGE_FILES.PG_NODES : isZhangMode ? STORAGE_FILES.ZHANG_NODES : isWangMode ? STORAGE_FILES.WANG_NODES : STORAGE_FILES.LENNY_NODES
        const content = await storageService.read(convsFile)
        if (!content) return []
        const spaceNodesRaw = await storageService.read(nodesFile)
        let spaceNodes: Node[] = []
        try { if (spaceNodesRaw) spaceNodes = JSON.parse(spaceNodesRaw) } catch { /* */ }
        const nodeByConvId = new Map<string, Node>()
        spaceNodes.forEach(n => nodeByConvId.set(n.conversationId, n))
        const lines = content.trim().split('\n').filter(Boolean)
        const convs: Conversation[] = []
        for (const line of lines) {
          try { const c = JSON.parse(line) as Conversation; if (c.id) convs.push(c) } catch { /* */ }
        }
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for', 'with'])
        const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length >= 3 && !stopWords.has(k)).slice(0, 10)
        if (keywords.length === 0) return convs.slice(-5).map(conv => ({ conv, category: nodeByConvId.get(conv.id)?.category, nodeId: nodeByConvId.get(conv.id)?.id }))
        return convs
          .map(conv => {
            const text = (conv.userMessage + ' ' + conv.assistantMessage).toLowerCase()
            const score = keywords.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0)
            return { conv, score, node: nodeByConvId.get(conv.id) }
          })
          .filter(r => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(r => ({ conv: r.conv, category: r.node?.category, nodeId: r.node?.id }))
      }

      const nodeByConvId = new Map<string, Node>()
      const nodeById = new Map<string, Node>()
      nodes.forEach(n => {
        nodeByConvId.set(n.conversationId, n)
        nodeById.set(n.id, n)
      })

      // 读取对话内容（用于本地降级 + 向量结果补全全文）
      const content = await storageService.read(STORAGE_FILES.CONVERSATIONS)
      if (!content) return []

      const lines = content.trim().split('\n').filter(Boolean)
      const convMap = new Map<string, Conversation>()
      for (const line of lines) {
        try {
          const c = JSON.parse(line) as Conversation
          if (c.id) convMap.set(c.id, c)
        } catch { /* ignore */ }
      }

      // 1. 尝试后端向量检索
      try {
        const resp = await authFetch('/api/memory/search', {
          method: 'POST',
          body: JSON.stringify({ query, topK: 5 })
        })
        if (resp.ok) {
          const data = (await resp.json()) as { results: { conversationId: string; score: number }[]; fallback?: boolean }

          if (!data.fallback && data.results.length > 0) {
            // 向量检索成功，用结果补全 Conversation 全文
            const results: { conv: Conversation; category?: string; nodeId?: string }[] = []
            for (const r of data.results) {
              const conv = convMap.get(r.conversationId)
              if (!conv) continue
              const node = nodeByConvId.get(conv.id) ?? nodeById.get(conv.id)
              if (!node) continue
              results.push({ conv, category: node.category, nodeId: node.id })
            }

            if (results.length > 0) return results
          }
        }
      } catch {
        // 向量检索失败，降级
      }

      // 2. 降级：关键词搜索（保持原逻辑）
      const stopWords = new Set(['这个', '那个', '什么', '怎么', '如何', '吗', '呢', '啊', '的', '了', '是', '有', '在'])
      const bySplit = query.toLowerCase().split(/[\s,，.。!！?？;；]+/).filter(Boolean)
      const keywordsFromSplit = bySplit.filter(k => k.length >= 2 && !stopWords.has(k))
      const chineseSubstrings: string[] = []
      const cjk = /[\u4e00-\u9fff\u3400-\u4dbf]/
      for (let i = 0; i < query.length; i++) {
        if (!cjk.test(query[i])) continue
        for (let len = 2; len <= 4 && i + len <= query.length; len++) {
          const sub = query.slice(i, i + len)
          if (sub.length >= 2 && !stopWords.has(sub)) chineseSubstrings.push(sub)
        }
      }
      const queryKeywords = [...new Set([...keywordsFromSplit, ...chineseSubstrings])].slice(0, 20)
      if (queryKeywords.length === 0) return []

      const conversations = Array.from(convMap.values())
      const scored = conversations.map(conv => {
        let score = 0
        const text = (conv.userMessage + ' ' + conv.assistantMessage).toLowerCase()
        queryKeywords.forEach(k => { if (text.includes(k.toLowerCase())) score += 1 })
        return { conv, score }
      })

      const fallbackResults: { conv: Conversation; category?: string; nodeId?: string }[] = []
      for (const s of scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)) {
        const node = nodeByConvId.get(s.conv.id) ?? nodeById.get(s.conv.id)
        if (!node) continue
        fallbackResults.push({ conv: s.conv, category: node.category, nodeId: node.id })
      }
      return fallbackResults
    } catch (error) {
      console.error('Failed to get relevant memories:', error)
      return []
    }
  },

  // 追加对话记录（同时触发后端向量索引 + 画像提取任务）
  appendConversation: async (conversation: Conversation) => {
    const { isLennyMode, isPGMode, isZhangMode, isWangMode, isCustomSpaceMode, activeCustomSpaceId } = get()

    // Custom Space 模式：写自定义 space 文件
    if (isCustomSpaceMode && activeCustomSpaceId) {
      await storageService.append(`custom-${activeCustomSpaceId}-conversations.jsonl`, JSON.stringify(conversation))
      return
    }

    // Space 模式：写 space-specific 文件，跳过向量索引和画像提取（space 记忆不污染用户数据）
    // P2-3: 当前 endConversation space 分支已直接写文件，此处为防御性保留（未来直接调用者使用）
    if (isLennyMode) {
      const convsFile = isPGMode ? STORAGE_FILES.PG_CONVERSATIONS : isZhangMode ? STORAGE_FILES.ZHANG_CONVERSATIONS : isWangMode ? STORAGE_FILES.WANG_CONVERSATIONS : STORAGE_FILES.LENNY_CONVERSATIONS
      await storageService.append(convsFile, JSON.stringify(conversation))
      return
    }

    await storageService.append(
      STORAGE_FILES.CONVERSATIONS,
      JSON.stringify(conversation)
    )

    // fire-and-forget：向量索引
    const indexText = conversation.userMessage + ' ' + conversation.assistantMessage
    authFetch('/api/memory/index', {
      method: 'POST',
      body: JSON.stringify({ conversationId: conversation.id, text: indexText })
    }).catch(() => { /* 静默忽略，不影响主流程 */ })

    // fire-and-forget：画像提取（排入 Agent 队列）
    authFetch('/api/memory/queue', {
      method: 'POST',
      body: JSON.stringify({
        type: 'extract_profile',
        payload: {
          userMessage: conversation.userMessage,
          assistantMessage: conversation.assistantMessage.slice(0, 600)
        }
      })
    }).catch(() => { /* 静默忽略 */ })

    // fire-and-forget：从对话中摘取用户记忆事实（独立记忆板块）
    // 剥离 [REFERENCE_START]...[REFERENCE_END] 块，只传对话核心，避免粘贴内容污染记忆
    const cleanUserMessage = conversation.userMessage
      .replace(/\[REFERENCE_START\][\s\S]*?\[REFERENCE_END\]/g, '[引用内容已省略]')
      .trim()
    if (cleanUserMessage.length > 5) {
      authFetch('/api/memory/extract', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: conversation.id,
          userMessage: cleanUserMessage,
          assistantMessage: conversation.assistantMessage.slice(0, 400)
        })
      }).catch(() => { /* 静默忽略 */ })
    }

    // fire-and-forget：逻辑边提取
    // 延迟 3 秒，等语义边先计算出候选节点
    // 先检查该 conversationId 是否已提取过逻辑边，已有则跳过，避免重复 AI 请求
    setTimeout(async () => {
      try {
        const checkResp = await authFetch(`/api/memory/logical-edges/${conversation.id}`)
        if (checkResp.ok) {
          const checkData = await checkResp.json() as { edges: unknown[] }
          if (checkData.edges && checkData.edges.length > 0) return
        }
      } catch { /* 网络失败则继续触发 */ }
      get()._triggerLogicalEdgeExtraction(
        conversation.id,
        conversation.userMessage,
        conversation.assistantMessage
      ).catch(() => {})
    }, 3000)
  },

  clearLastError: () => set({ lastError: null }),

  reclassifyNodes: async () => {
    const { nodes } = get()
    if (nodes.length === 0) return
    const toReclassify = nodes.map(n => ({ id: n.id, title: n.title, keywords: n.keywords, category: n.category }))
    try {
      const resp = await authFetch('/api/memory/reclassify-nodes', {
        method: 'POST',
        body: JSON.stringify({ nodes: toReclassify })
      })
      if (!resp.ok) return
      const data = (await resp.json()) as { updated: { id: string; category: string; color: string }[] }
      if (!data.updated?.length) return
      const updateMap = new Map(data.updated.map(u => [u.id, u]))
      const newNodes = get().nodes.map(n => {
        const upd = updateMap.get(n.id)
        return upd ? { ...n, category: upd.category, color: upd.color } : n
      })
      set({ nodes: newNodes })
      get().updateEdges()
      storageService.write(STORAGE_FILES.NODES, JSON.stringify(newNodes, null, 2)).catch(() => {})
    } catch { set({ lastError: 'Node re-categorization failed — please try again' }) }
  },

  openNodeTimeline: (nodeId: string) => set({ timelineNodeId: nodeId, isTimelineOpen: true }),
  closeNodeTimeline: () => set({ timelineNodeId: null, isTimelineOpen: false }),

  rebuildNodeGraph: async () => {
    const { nodes, mergeIntoNode, removeNode } = get()
    set({ nodeGraphRebuild: { phase: 'analyzing', totalClusters: 0, processedClusters: 0 } })

    try {
      const nodePayload = nodes.map(n => ({
        id: n.id,
        conversationIds: n.conversationIds ?? (n.conversationId ? [n.conversationId] : []),
        firstDate: n.firstDate ?? n.date ?? new Date().toISOString().split('T')[0]
      })).filter(n => n.conversationIds.length > 0)

      const resp = await authFetch('/api/memory/rebuild-node-graph', {
        method: 'POST',
        body: JSON.stringify({ nodes: nodePayload })
      })
      if (!resp.ok) throw new Error('rebuild-node-graph API error')

      const data = await resp.json() as {
        clusters: Array<{ keepNodeId: string; mergeNodeIds: string[]; mergedConversationIds: string[] }>
        totalNodes?: number
        totalMerges?: number
        reason?: string
      }

      if (!data.clusters.length) {
        set({ nodeGraphRebuild: { phase: 'done', totalClusters: 0, processedClusters: 0 } })
        return
      }

      set({ nodeGraphRebuild: { phase: 'merging', totalClusters: data.clusters.length, processedClusters: 0 } })

      for (let i = 0; i < data.clusters.length; i++) {
        const cluster = data.clusters[i]
        for (const convId of cluster.mergedConversationIds) {
          const convDate = get().nodes.find(n => (n.conversationIds ?? [n.conversationId]).includes(convId))?.date ?? new Date().toISOString().split('T')[0]
          await mergeIntoNode(cluster.keepNodeId, convId, convDate)
        }
        for (const nodeId of cluster.mergeNodeIds) {
          await removeNode(nodeId)
        }
        set(s => ({ nodeGraphRebuild: { ...s.nodeGraphRebuild, processedClusters: i + 1 } }))
      }

      set({ nodeGraphRebuild: { phase: 'done', totalClusters: data.clusters.length, processedClusters: data.clusters.length } })
    } catch (err) {
      set({ nodeGraphRebuild: { phase: 'error', totalClusters: 0, processedClusters: 0, errorMessage: String(err) } })
    }
  },
  }),
  {
    name: 'CanvasStore',
    enabled: process.env.NODE_ENV !== 'production',
  }
))

// 在非生产环境暴露 store 到 window，供 E2E 测试和 Redux DevTools 直接访问
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  // @ts-ignore
  window.__CANVAS_STORE__ = useCanvasStore
}
