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
