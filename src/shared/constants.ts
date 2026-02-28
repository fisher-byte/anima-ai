/**
 * EvoCanvas 常量定义
 * 
 * 包含所有配置项、触发词、默认值等
 */

/**
 * 应用信息
 */
export const APP_NAME = 'EvoCanvas'
export const APP_VERSION = '0.1.0'

/**
 * 存储文件名
 */
export const STORAGE_FILES = {
  PROFILE: 'profile.json',
  NODES: 'nodes.json',
  CONVERSATIONS: 'conversations.jsonl'
} as const

/**
 * 负反馈触发词映射表
 * 
 * 当用户表达包含这些关键词时，触发对应偏好规则
 */
export const FEEDBACK_TRIGGERS = [
  {
    keywords: ['简洁点', '太复杂', '太长了', '精简', '简短'],
    preference: '保持表达简洁：先结论，后要点，避免冗长铺垫'
  },
  {
    keywords: ['别用这个', '不要用', '不用这个', '别用'],
    preference: '避免使用刚才提到的方案或工具'
  },
  {
    keywords: ['换个思路', '重来', '重新', '另一种', '换个方式'],
    preference: '换一种组织方式：给要点、给步骤、给对比'
  },
  {
    keywords: ['不对', '错了', '有问题', '不准确'],
    preference: '重新理解需求，确认关键信息后再回答'
  }
] as const

/**
 * 默认System Prompt
 */
export const DEFAULT_SYSTEM_PROMPT = `你是用户的长期AI助手。你的目标是记住用户的偏好，并在每次对话中体现这些偏好。`

/**
 * AI配置
 */
export const AI_CONFIG = {
  MODEL: 'gpt-4o-mini',
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.7,
  STREAM: true
} as const

/**
 * UI配置
 */
export const UI_CONFIG = {
  NODE_TITLE_MAX_LENGTH: 8,
  NODE_KEYWORDS_COUNT: 3,
  INPUT_PLACEHOLDER: '问我任何事',
  GRAY_HINT_TEXT: '我记得你上次更喜欢',
  CANVAS_GRID_SIZE: 20
} as const

/**
 * 置信度配置
 */
export const CONFIDENCE_CONFIG = {
  INITIAL: 0.6,
  INCREMENT: 0.1,
  MAX: 1.0,
  MIN: 0.3
} as const

/**
 * API配置
 * API Key将在运行时从主进程安全获取，不在渲染进程暴露
 */
export const API_CONFIG = {
  BASE_URL: 'https://api.openai.com/v1',
  API_KEY: '', // 将在应用启动时从主进程加载
  TIMEOUT: 30000 // 30秒超时
}

/**
 * 允许的文件名列表（防止路径遍历攻击）
 */
export const ALLOWED_FILENAMES = [
  'profile.json',
  'nodes.json',
  'conversations.jsonl'
] as const

/**
 * 验证文件名是否合法
 */
export function isValidFilename(filename: string): boolean {
  // 检查是否在允许列表中
  if (!ALLOWED_FILENAMES.includes(filename as any)) {
    return false
  }
  
  // 检查是否包含路径遍历字符
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false
  }
  
  return true
}
