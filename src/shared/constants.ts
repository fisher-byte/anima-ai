/**
 * EvoCanvas 常量定义
 * 
 * 包含所有配置项、触发词、默认值等
 */

/**
 * 应用信息
 */
export const APP_NAME = 'EvoCanvas'
export const APP_VERSION = '0.2.9'

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
 * 默认System Prompt（普通对话模式）
 * 不要求”极高智力”等夸张约束，自然流畅即可
 * 后端会动态追加用户画像和进化基因
 */
export const DEFAULT_SYSTEM_PROMPT = `你是用户的长期 AI 伙伴，叫 EvoCanvas。

基本原则：
- 用自然、对话式的语气回复，不必每次都用大量 Markdown 格式
- 回复长度和格式跟着问题走：简单问题简短回，需要列表或代码才用格式
- 优先响应用户的实际需求，不做无谓的铺垫和总结
- 今天的日期：{{DATE}}`

/**
 * 新手引导模式 System Prompt（轻量版）
 * 让 AI 像一个刚认识的朋友，不要秀聪明，专注倾听和回应
 */
export const ONBOARDING_SYSTEM_PROMPT = `你是 EvoCanvas，正在和一个新用户第一次见面。

你的任务：
- 自然地回应用户的自我介绍，表现出真正的兴趣和理解
- 回复要简短温暖，不要分析、不要建议、不要展示能力
- 不要用 Markdown 标题或表格，像朋友对话一样
- 用一两句话回应，然后等待用户的下一步

今天的日期：{{DATE}}`

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
// Safe env access: works in both Vite (import.meta.env) and Node (process.env)
const _envApiUrl = (() => {
  try {
    // Vite injects import.meta.env; in Node this property is undefined
    return (import.meta as any).env?.VITE_API_URL as string | undefined
  } catch {
    return undefined
  }
})() || (typeof process !== 'undefined' ? process.env.VITE_API_URL : undefined)

export const API_CONFIG = {
  BASE_URL: _envApiUrl || 'https://api.moonshot.cn/v1',
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
