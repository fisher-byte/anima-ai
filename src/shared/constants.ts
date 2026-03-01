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
 * 支持多种模型，通过环境变量或API配置切换
 */
export const AI_CONFIG = {
  MODEL: 'kimi-k2.5',  // 默认使用最新 Kimi 2.5
  MAX_TOKENS: 4096,
  TEMPERATURE: 1.0,
  STREAM: true
} as const

/**
 * 具备多模态和联网能力的模型列表
 */
export const MULTIMODAL_MODELS = ['kimi-k2.5', 'gpt-4o', 'gpt-4o-mini'] as const

/**
 * 支持的模型列表
 */
export const SUPPORTED_MODELS = {
  KIMI: {
    'kimi-k2.5': 'Kimi 2.5 (最新多模态)',
    'moonshot-v1-8k': 'Kimi 8K',
    'moonshot-v1-32k': 'Kimi 32K',
    'moonshot-v1-128k': 'Kimi 128K'
  },
  OPENAI: {
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo'
  }
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
 * API Key将在运行时从主进程或环境变量获取
 */
export const API_CONFIG = {
  BASE_URL: import.meta.env.RENDERER_VITE_API_URL || 'https://api.openai.com/v1',
  API_KEY: '', // 将在应用启动时加载
  TIMEOUT: 60000 // 增加到60秒，因为联网搜索可能较慢
}

/**
 * 允许的文件名列表（防止路径遍历攻击）
 */
export const ALLOWED_FILENAMES = [
  'profile.json',
  'nodes.json',
  'conversations.jsonl',
  'settings.json'
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
