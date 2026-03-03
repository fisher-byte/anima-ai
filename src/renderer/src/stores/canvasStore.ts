import { create } from 'zustand'
import type { Node, Edge, Conversation, Profile, PreferenceRule, NodePosition } from '@shared/types'
import { STORAGE_FILES, FEEDBACK_TRIGGERS, CONFIDENCE_CONFIG, UI_CONFIG } from '@shared/constants'
import { storageService } from '../services/storageService'

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
  addNode: (conversation: Conversation, position?: NodePosition, explicitCategory?: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  removeNode: (id: string) => Promise<void>
  
  // 方法：连线操作
  updateEdges: () => void
  
  // 方法：画布操作
  offset: NodePosition
  scale: number
  setOffset: (offset: NodePosition) => void
  setScale: (scale: number) => void
  setView: (offset: NodePosition, scale: number) => void
  focusNode: (id: string) => void
  resetView: () => void
  startConversation: (userMessage: string, images?: string[], files?: import('@shared/types').FileAttachment[], parentId?: string) => Promise<void>
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
  selectNode: (id: string | null) => void
  setHighlight: (category: string | null, nodeIds: string[]) => void

  // 新增：新手引导状态
  isOnboardingMode: boolean
  onboardingPhase: number
  openOnboarding: () => void
  setOnboardingPhase: (phase: number) => void
  completeOnboarding: () => void

  // 新增：移除偏好规则
  removePreference: (index: number) => Promise<void>

  // 全量清空（用户画像 + 记忆 + 进化基因）并开启新手教程
  clearAllForOnboarding: () => Promise<void>
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
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

  // 新手引导初始化
  isOnboardingMode: false,
  onboardingPhase: 0,

  setConversationHistory: (history) => set({ conversationHistory: history }),
  resetConversationHistory: () => set({ conversationHistory: [] }),

  selectNode: (id) => set({ selectedNodeId: id }),
  setHighlight: (category, nodeIds) => set({ highlightedCategory: category, highlightedNodeIds: nodeIds }),

  openOnboarding: () => {
    const conv: import('@shared/types').Conversation = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      userMessage: '',
      assistantMessage: '',
      images: [],
      files: []
    }
    set({ isOnboardingMode: true, onboardingPhase: 0, currentConversation: conv, isModalOpen: true, isLoading: false })
  },
  setOnboardingPhase: (phase) => set({ onboardingPhase: phase }),
  completeOnboarding: () => set({ isOnboardingMode: false, onboardingPhase: 0 }),

  removePreference: async (index: number) => {
    const { profile } = get()
    const updatedRules = profile.rules.filter((_, i) => i !== index)
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
      profile: emptyProfile,
      conversationHistory: [],
      selectedNodeId: null,
      highlightedCategory: null,
      highlightedNodeIds: [],
      offset: { x: 0, y: 0 },
      scale: 1
    })

    await Promise.all([
      storageService.write(STORAGE_FILES.PROFILE, JSON.stringify(emptyProfile, null, 2)),
      storageService.write(STORAGE_FILES.NODES, JSON.stringify([], null, 2)),
      storageService.write(STORAGE_FILES.CONVERSATIONS, '')
    ])
    get().openOnboarding()
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

        const needsRelayout = nodes.some(n => n.x < minX + 50 || n.x > maxX - 50 || n.y < minY + 50 || n.y > maxY - 50)

        if (needsRelayout) {
          const centerX = 1.5 * viewW
          const centerY = 1.5 * viewH
          const minDist = 230
          const placed: { x: number; y: number }[] = []
          const isFarEnough = (x1: number, y1: number) => placed.every(p => Math.hypot(p.x - x1, p.y - y1) >= minDist)

          nodes = nodes.map((n, idx) => {
            // 旧坐标有效且在可视附近就保留
            if (Number.isFinite(n.x) && Number.isFinite(n.y) && n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
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

          // 持久化整理后的坐标，避免下次依旧“看不见”
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
                if (conv.id && conv.userMessage) conversationsById.set(conv.id, conv.userMessage)
              } catch { /* ignore */ }
            }
          }
          const detectIntent = get().detectIntent
          const CATEGORIES: { name: string; color: string }[] = [
            { name: '工作学习', color: 'rgba(219, 234, 254, 0.9)' },
            { name: '生活日常', color: 'rgba(220, 252, 231, 0.9)' },
            { name: '灵感创意', color: 'rgba(243, 232, 255, 0.9)' },
            { name: '其他', color: 'rgba(243, 244, 246, 0.9)' }
          ]
          let updated = false
          nodes = nodes.map(n => {
            const userMessage = conversationsById.get(n.conversationId)
            if (!userMessage) return n
            const newCategory = detectIntent(userMessage)
            if (newCategory === n.category) return n
            updated = true
            const color = CATEGORIES.find(c => c.name === newCategory)?.color ?? CATEGORIES[3].color
            return { ...n, category: newCategory, color }
          })
          if (updated) {
            await storageService.write(STORAGE_FILES.NODES, JSON.stringify(nodes, null, 2))
          }
        } catch (e) {
          console.warn('Re-categorize nodes failed:', e)
        }

        set({ nodes })
        get().updateEdges() // 加载后更新连线
        
        // 初始加载后，如果有节点，聚焦到第一个
        if (nodes.length > 0) {
          get().focusNode(nodes[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load nodes:', error)
    }
  },

  // 加载用户偏好
  loadProfile: async () => {
    try {
      const content = await storageService.read(STORAGE_FILES.PROFILE)
      if (content) {
        const profile = JSON.parse(content) as Profile
        set({ profile })
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    }
  },

  // 添加节点（explicitCategory 由 endConversation 传入时优先使用，保证话题拆分分类正确）
  addNode: async (conversation: Conversation, position?: NodePosition, explicitCategory?: string) => {
    const { nodes } = get()

    // 生成标题
    const title = conversation.userMessage.slice(0, UI_CONFIG.NODE_TITLE_MAX_LENGTH)

    // 生成关键词并清理结构词
    const keywords = conversation.assistantMessage
      .split(/[\s,，.。!！?？;；]+/)
      .filter(word => word.length >= 2 && word.length <= 6)
      .filter(word => !/^#\d+$/.test(word))
      .filter(word => !['用户', 'AI', '用户：', 'AI：'].includes(word))
      .slice(0, UI_CONFIG.NODE_KEYWORDS_COUNT)

    // --- 增强分类与染色逻辑：优先使用 explicitCategory，否则按全文关键词匹配 ---
    const CATEGORIES = [
      { name: '工作学习', keywords: ['代码', '开发', '学习', '论文', '总结', '计划', 'AI', '模型', '技术', '工作'], color: 'rgba(219, 234, 254, 0.9)' }, // 蓝色
      { name: '生活日常', keywords: ['美食', '天气', '旅游', '电影', '运动', '健康', '深圳', '餐厅', '吃饭', '好吃', '店铺', '非常好吃'], color: 'rgba(220, 252, 231, 0.9)' }, // 绿色
      { name: '灵感创意', keywords: ['创意', '想法', '艺术', '写作', '小说', '绘画', '设计'], color: 'rgba(243, 232, 255, 0.9)' }, // 紫色
      { name: '其他', keywords: [], color: 'rgba(243, 244, 246, 0.9)' } // 灰色
    ]

    let category: string
    let color: string
    if (explicitCategory) {
      const found = CATEGORIES.find(c => c.name === explicitCategory)
      category = found ? found.name : explicitCategory
      color = found ? found.color : CATEGORIES[CATEGORIES.length - 1].color
    } else {
      let matchedCat = CATEGORIES[CATEGORIES.length - 1]
      const fullContent = (conversation.userMessage + conversation.assistantMessage).toLowerCase()
      for (const cat of CATEGORIES) {
        if (cat.keywords.some(k => fullContent.includes(k.toLowerCase()))) {
          matchedCat = cat
          break
        }
      }
      category = matchedCat.name
      color = matchedCat.color
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
      // 新岛屿：找一个远离现有岛屿的空位（限制在中心 1200px 范围内）
      const islandDist = 500
      let angle = Math.random() * Math.PI * 2
      for (let i = 0; i < 12; i++) {
        const tx = centerX + Math.cos(angle) * islandDist
        const ty = centerY + Math.sin(angle) * islandDist
        if (nodes.every(n => Math.hypot(n.x - tx, n.y - ty) > islandDist * 0.8)) {
          islandX = tx
          islandY = ty
          break
        }
        angle += (Math.PI * 2) / 12
      }
      // 无论是否找到空位，都限制在 centerX±1200 范围内
      islandX = Math.max(centerX - 1200, Math.min(centerX + 1200, islandX))
      islandY = Math.max(centerY - 1200, Math.min(centerY + 1200, islandY))
    }

    // 在岛屿周围寻找空位（螺旋搜索，半径上限600px）
    let x = position?.x
    let y = position?.y
    const nodeGap = 240

    if (x == null || y == null) {
      let found = false
      for (let i = 0; i < 100; i++) {
        const radius = (catNodes.length === 0 ? 0 : 150) + Math.floor(i / 8) * 60  // 上限：150 + 11*60 = 810 → 实际最大 ~600
        if (radius > 600) break  // 超过600px停止寻找，直接用岛屿中心附近
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
        // fallback：在岛屿中心随机小偏移叠加，而不是精确位置
        x = islandX + (Math.random() - 0.5) * nodeGap
        y = islandY + (Math.random() - 0.5) * nodeGap
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
      groupId: conversation.parentId ? nodes.find(n => n.id === conversation.parentId)?.groupId : undefined
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
  },

  // 更新节点位置
  updateNodePosition: async (id: string, x: number, y: number) => {
    const { nodes, updateEdges } = get()
    const updatedNodes = nodes.map(n => n.id === id ? { ...n, x, y } : n)
    set({ nodes: updatedNodes })
    updateEdges() // 更新连线位置
    await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
  },

  // 更新连线逻辑 (优先基于分支关系，其次基于板块)
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
            createdAt: new Date().toISOString()
          })
          connectedNodeIds.add(node.id)
        }
      }
    })
    
    // 2. 按类别分组的板块连线 (星型拓扑 - 仅针对没有父节点的根节点)
    const categories = new Map<string, Node[]>()
    nodes.forEach(n => {
      if (connectedNodeIds.has(n.id)) return // 已经有分支连线的不再参与板块星型连线
      const cat = n.category || '其他'
      if (!categories.has(cat)) categories.set(cat, [])
      categories.get(cat)!.push(n)
    })
    
    categories.forEach((catNodes) => {
      if (catNodes.length < 2) return
      const centerNode = catNodes[0]
      for (let i = 1; i < catNodes.length; i++) {
        newEdges.push({
          id: `edge-cat-${centerNode.id}-${catNodes[i].id}`,
          source: centerNode.id,
          target: catNodes[i].id,
          createdAt: new Date().toISOString()
        })
      }
    })
    
    set({ edges: newEdges })
  },

  // 删除节点
  removeNode: async (id: string) => {
    const { nodes } = get()
    const nodeToRemove = nodes.find(n => n.id === id)
    const updatedNodes = nodes.filter(n => n.id !== id)
    set({ nodes: updatedNodes })
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

      // fire-and-forget：删除向量索引
      fetch(`/api/memory/index/${nodeToRemove.conversationId}`, { method: 'DELETE' })
        .catch(() => { /* 静默忽略 */ })
    }
  },

  // 开始对话 (增强：检测意图并智能分支)
  startConversation: async (userMessage: string, images?: string[], files?: import('@shared/types').FileAttachment[], parentId?: string) => {
    const { nodes, detectIntent, getRelevantMemories } = get()
    
    // 1. 检测当前意图分类
    const category = detectIntent(userMessage)
    
    // 2. 只有在没有明确 parentId（即不是用户手动点击分支）时，才尝试自动联结
    let effectiveParentId = parentId
    if (!effectiveParentId) {
      // 找寻关于这个分类的“最近活跃节点”
      const catNodes = nodes.filter(n => n.category === category)
      if (catNodes.length > 0) {
        // 尝试找寻语义最相关的记忆
        const memories = await getRelevantMemories(userMessage)
        // 如果有相关记忆且属于同一分类，自动作为该记忆的分支
        const bestMatch = memories.find(m => {
          const n = nodes.find(node => node.id === m.conv.id)
          return n?.category === category
        })
        
        if (bestMatch) {
          effectiveParentId = bestMatch.conv.id
        } else {
          // 如果没有语义非常接近的，则连接到该分类的最近一个节点（维持岛屿凝聚）
          effectiveParentId = catNodes[catNodes.length - 1].id
        }
      }
    }

    const conversation: Conversation = {
      id: crypto.randomUUID(),
      parentId: effectiveParentId, // 支持对话分支
      createdAt: new Date().toISOString(),
      userMessage,
      assistantMessage: '',
      images: images || [],
      files: files || []
    }
    set({ currentConversation: conversation, isModalOpen: true, isLoading: true })
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
    const { addNode, appendConversation, detectIntent } = get()
    const currentConversation = explicitConversation ?? get().currentConversation
    if (!currentConversation) return

    // 1. 解析回复中的多轮对话
    const sectionRegex = /#\s*(\d+)\s*\n+\s*用户[：:]\s*([\s\S]*?)\n+\s*AI[：:]\s*([\s\S]*?)(?=\n+\s*#\s*\d+|$)/g
    const turns: { user: string; ai: string; category: string }[] = []
    let match
    while ((match = sectionRegex.exec(assistantMessage)) !== null) {
      const user = match[2].trim()
      const ai = match[3].trim()
      turns.push({ user, ai, category: detectIntent(user) })
    }

    // 如果没解析出多轮（旧格式或单次对话），作为单轮处理
    if (turns.length === 0) {
      turns.push({ 
        user: currentConversation.userMessage, 
        ai: assistantMessage, 
        category: detectIntent(currentConversation.userMessage) 
      })
    }

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
        images: isFirst ? currentConversation.images : [], // 文件通常只在第一轮
        files: isFirst ? currentConversation.files : []
      }

      try {
        await appendConversation(conv)
        await addNode(conv, undefined, group.category)
      } catch (error) {
        console.error(`保存话题分组 ${i} 失败:`, error)
      }
    }

    set({ isLoading: false })
  },

  // 关闭模态框
  closeModal: () => {
    set({ isModalOpen: false, currentConversation: null, isLoading: false })
  },

  // 打开模态框（用于回放）
  openModal: (conversation: Conversation) => {
    set({ currentConversation: conversation, isModalOpen: true, isLoading: false })
  },

  // 通过 conversationId 打开回放（从 conversations.jsonl 读取完整内容）
  openModalById: async (conversationId: string) => {
    try {
      const content = await storageService.read(STORAGE_FILES.CONVERSATIONS)
      if (!content) {
        set({ currentConversation: null, isModalOpen: true, isLoading: false })
        return
      }
      const lines = content.trim().split('\n').filter(Boolean)
      // 找最后一次同 id 的记录（防止同 id 多次写入）
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const conv = JSON.parse(lines[i]) as Conversation
          if (conv.id === conversationId) {
            set({ currentConversation: conv, isModalOpen: true, isLoading: false })
            return
          }
        } catch {
          // ignore invalid line
        }
      }
      set({ currentConversation: null, isModalOpen: true, isLoading: false })
    } catch (error) {
      set({ isLoading: false })
    }
  },

  // 检测负反馈
  detectFeedback: (message: string): PreferenceRule | null => {
    for (const trigger of FEEDBACK_TRIGGERS) {
      for (const keyword of trigger.keywords) {
        if (message.includes(keyword)) {
          // 检查是否已存在相同偏好的规则
          const { profile } = get()
          const existingRule = profile.rules.find(r => r.preference === trigger.preference)
          
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
    
    // 检查是否已存在相同偏好的规则
    const existingIndex = profile.rules.findIndex(r => r.preference === newRule.preference)
    
    let updatedRules: PreferenceRule[]
    if (existingIndex >= 0) {
      // 更新现有规则
      updatedRules = [...profile.rules]
      updatedRules[existingIndex] = newRule
    } else {
      // 添加新规则
      updatedRules = [...profile.rules, newRule]
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
    // 只返回置信度较高的偏好（> 0.5）
    return profile.rules
      .filter(r => r.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .map(r => r.preference)
  },

  // 检测查询意图
  detectIntent: (query: string): string => {
    const text = query.toLowerCase()
    const CATEGORIES = [
      { name: '工作学习', keywords: ['代码', '开发', '学习', '论文', '总结', '计划', 'AI', '模型', '技术', '工作', '文档', '项目', 'bug', '修', '写'] },
      { name: '生活日常', keywords: ['美食', '天气', '旅游', '电影', '运动', '健康', '深圳', '餐厅', '吃饭', '心情', '八卦', '推荐', '怎么去', '好吃', '店铺', '非常好吃'] },
      { name: '灵感创意', keywords: ['创意', '想法', '艺术', '写作', '小说', '绘画', '设计', '灵感', '未来', '科幻', '编一个', '故事'] }
    ]

    for (const cat of CATEGORIES) {
      if (cat.keywords.some(k => text.includes(k))) {
        return cat.name
      }
    }
    return '其他'
  },

  // 获取相关的历史记忆（后端向量检索，降级到关键词搜索）
  getRelevantMemories: async (query: string): Promise<{ conv: Conversation; category?: string; nodeId?: string }[]> => {
    try {
      const { nodes } = get()
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
        const resp = await fetch('/api/memory/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      for (const s of scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3)) {
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
    await storageService.append(
      STORAGE_FILES.CONVERSATIONS,
      JSON.stringify(conversation)
    )

    // fire-and-forget：向量索引
    const indexText = conversation.userMessage + ' ' + conversation.assistantMessage
    fetch('/api/memory/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, text: indexText })
    }).catch(() => { /* 静默忽略，不影响主流程 */ })

    // fire-and-forget：画像提取（排入 Agent 队列）
    fetch('/api/memory/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'extract_profile',
        payload: {
          userMessage: conversation.userMessage,
          assistantMessage: conversation.assistantMessage.slice(0, 600)
        }
      })
    }).catch(() => { /* 静默忽略 */ })

    // fire-and-forget：从对话中摘取用户记忆事实（独立记忆板块）
    if (conversation.userMessage?.trim().length > 5) {
      fetch('/api/memory/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          userMessage: conversation.userMessage,
          assistantMessage: conversation.assistantMessage.slice(0, 400)
        })
      }).catch(() => { /* 静默忽略 */ })
    }
  }
}))
