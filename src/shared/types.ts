/**
 * EvoCanvas 类型定义
 * 
 * 包含所有核心数据类型：节点、对话、偏好规则等
 */

/**
 * 画布节点
 */
export interface Node {
  id: string
  title: string
  keywords: string[]
  date: string
  conversationId: string
  x: number
  y: number
  category?: string
  color?: string
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
}

/**
 * 对话记录
 */
export interface Conversation {
  id: string
  createdAt: string
  userMessage: string
  assistantMessage: string
  images?: string[]  // 支持图片 base64 列表
  negativeFeedback?: string
  appliedPreferences?: string[]
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
  role: 'system' | 'user' | 'assistant'
  content: string | any[] // 支持多模态内容数组
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
