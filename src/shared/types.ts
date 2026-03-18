/**
 * Anima 类型定义
 * 
 * 包含所有核心数据类型：节点、对话、偏好规则等
 */

/**
 * 能力节点数据（区别于记忆节点）
 */
export interface CapabilityData {
  capabilityId: 'import-memory' | 'onboarding'  // 可扩展为更多能力类型
  state: 'active' | 'completed'
}

/**
 * 画布节点
 */
export interface Node {
  id: string
  title: string
  keywords: string[]
  date: string
  conversationId: string
  parentId?: string // 冗余 parentId 以便快速绘制连线
  x: number
  y: number
  category?: string
  color?: string
  groupId?: string // 支持节点分组
  // 能力节点扩展字段（普通记忆节点不设此字段）
  nodeType?: 'memory' | 'capability'
  capabilityData?: CapabilityData
  memoryCount?: number // 引用记忆数量（冗余自 Conversation，方便 NodeCard 直接读取）
  files?: FileAttachment[] // 附件列表（非图片文件，供 NodeCard 展示文件胶囊）
  conversationIds?: string[]   // 所有关联对话 ID 列表（含 conversationId）
  topicLabel?: string          // 语义话题标签，如「Python 学习」
  firstDate?: string           // 最早一条对话的日期（时间线用）
}

/**
 * 节点之间的连线
 */
export interface Edge {
  id: string
  source: string  // 源节点ID
  target: string  // 目标节点ID
  label?: string  // 连线标签（可选）
  createdAt: string
  edgeType?: 'branch' | 'category' | 'semantic' | 'logical'  // 边类型，undefined 向后兼容
  weight?: number        // 语义边的余弦相似度分数（0-1）
  relation?: string      // L3 逻辑关系类型（中文）：深化了|解决了|矛盾于|依赖于|启发了|重新思考了
  reason?: string        // AI 生成的中文解释（1-2句话）
  confidence?: number    // AI 置信度 0-1
}

/**
 * 文件附件
 */
export interface FileAttachment {
  id: string
  name: string
  type: string
  size: number
  content?: string  // 解析后的文本内容（用于文档）
  preview?: string  // 预览图（用于图片）
  uploadError?: string  // 上传失败时的错误信息
  _rawFile?: File  // 原始 File 对象（仅 InputBox 提交前暂存，不持久化）
}

/**
 * 灵思决策证据等级
 * A = 原始材料直接支撑
 * B = 策展/框架归纳材料支撑
 * C = 弱证据或间接线索，仅用于提示不确定性
 */
export type DecisionEvidenceLevel = 'A' | 'B' | 'C'

/**
 * 灵思来源类型
 */
export type DecisionSourceType =
  | 'podcast_transcript'
  | 'framework'
  | 'article'
  | 'decision_case'
  | 'quote'
  | 'profile'
  | 'resource'
  | 'topic_index'

/**
 * 灵思输出模式
 */
export type DecisionMode = 'normal' | 'decision'

/**
 * 单条来源线索
 */
export interface DecisionSourceRef {
  id: string
  label: string
  type: DecisionSourceType
  path: string
  locator?: string
  excerpt?: string
  person?: string
  title?: string
  url?: string
  publishedAt?: string
  evidenceLevel: DecisionEvidenceLevel
  notes?: string
}

/**
 * DecisionUnit：面向一个常见决策权衡的最小证据单元
 */
export interface DecisionUnit {
  id: string
  personaId: string
  title: string
  summary: string
  scenario: string
  goal?: string
  constraints?: string[]
  tags: string[]
  triggerKeywords: string[]
  preferredPath?: string
  antiPatterns?: string[]
  reasoningSteps: string[]
  reasons: string[]
  followUpQuestions: string[]
  nextActions: string[]
  evidenceLevel: DecisionEvidenceLevel
  sourceRefs: DecisionSourceRef[]
  status: 'candidate' | 'approved' | 'archived'
  confidence?: number
  createdAt: string
  updatedAt: string
}

/**
 * 决策 persona 的轻量结构化描述
 */
export interface DecisionPersona {
  id: string
  name: string
  basePromptKey?: string
  archetypeTags?: string[]
  drives?: Record<string, number>
  heuristics: string[]
  domainBoundaries?: {
    strong: string[]
    weak: string[]
  }
  evidenceSources: DecisionSourceRef[]
  status: 'active' | 'draft' | 'archived'
  createdAt: string
  updatedAt: string
}

/**
 * 导入到当前项目的来源文件清单，用于审计和追溯
 */
export interface DecisionSourceManifestEntry {
  id: string
  repo: string
  repoCommit: string
  person: string
  type: DecisionSourceType
  sourcePath: string
  importedAt: string
  importedBy?: string
  notes?: string
}

/**
 * 面向当前产品/版本状态的轻量状态包
 * 用于让支持决策模式的 persona 在回答当前项目问题时具备同一套事实基线
 */
export interface DecisionProductStatePack {
  id: string
  version: string
  updatedAt: string
  summary: string
  keywords: string[]
  completedChanges: string[]
  currentFocus: string[]
  validatedDirections: string[]
  knownRisks: string[]
  nextDecisions: string[]
  evalSummary: Partial<Record<'lenny' | 'zhang', string>>
  personaFocus?: Partial<Record<'lenny' | 'zhang', string[]>>
  dataSnapshot?: {
    personas: number
    sources: number
    approvedUnits: number
    unitsByPersona: Partial<Record<'lenny' | 'zhang', number>>
    animaBaseHead?: string
  }
  docRefs: string[]
}

/**
 * 单轮对话中灵思决策模式的命中信息
 */
export interface DecisionTrace {
  mode: DecisionMode
  personaId?: string
  matchedDecisionUnitIds?: string[]
  sourceRefs?: DecisionSourceRef[]
}

/**
 * 从主页等非 Space 场景调用 persona / custom space 的上下文
 */
export interface AssistantInvocation {
  type: 'public_space' | 'custom_space'
  id: string
  name: string
  mode?: DecisionMode
}

/**
 * 对话记录
 */
export interface Conversation {
  id: string
  parentId?: string // 支持对话分支
  createdAt: string
  userMessage: string
  assistantMessage: string
  reasoning_content?: string // 新增：保存推理内容
  images?: string[]  // 支持图片 base64 列表（向后兼容）
  files?: FileAttachment[]  // 文件附件列表
  negativeFeedback?: string
  appliedPreferences?: string[]
  appliedMemoryIds?: string[]   // 本次对话引用的 conversationId 列表
  decisionTrace?: DecisionTrace
  invokedAssistant?: AssistantInvocation
  /** 深度搜索后台任务状态（可跨页面继续） */
  deepSearch?: {
    taskId: number
    status: 'pending' | 'running' | 'done' | 'failed'
    startedAt?: string
    finishedAt?: string
  }
}

/**
 * 用户偏好规则
 */
export interface PreferenceRule {
  trigger: string
  preference: string
  confidence: number
  updatedAt: string
}

/**
 * 用户配置文件
 */
export interface Profile {
  rules: PreferenceRule[]
}

/**
 * 负反馈触发词映射
 */
export interface FeedbackTrigger {
  keywords: string[]
  preference: string
}

/**
 * AI消息类型
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | any[] // 支持多模态内容数组
  tool_calls?: any[]
  tool_call_id?: string
  reasoning_content?: string
}

/**
 * 存储服务接口
 */
export interface StorageService {
  read(filename: string): Promise<string | null>
  write(filename: string, content: string): Promise<boolean>
  append(filename: string, content: string): Promise<boolean>
}

/**
 * 节点位置
 */
export interface NodePosition {
  x: number
  y: number
}

/**
 * 当前应用状态
 */
export interface AppState {
  nodes: Node[]
  edges: Edge[]
  currentConversation: Conversation | null
  isModalOpen: boolean
  profile: Profile
}

/**
 * 自定义 Space 颜色主题
 */
export type SpaceColorKey = 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky'

/**
 * 用户创建的自定义 Space 配置
 */
export interface CustomSpaceConfig {
  id: string             // 8位小写字母数字，URL-safe
  name: string           // 人物/主题名称，如 "Steve Jobs"
  topic: string          // 副标题描述，如 "Startup philosophy"
  colorKey: SpaceColorKey
  systemPrompt: string   // 完整 persona prompt
  avatarInitials: string // 最多2字符，如 "SJ"
  createdAt: string      // ISO date string
}
