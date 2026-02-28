/**
 * 模拟AI服务
 * 
 * 用于开发和测试，无需真实API Key
 */

import type { AIMessage } from '../shared/types'

interface MockResponse {
  content: string
  error?: string
}

/**
 * 模拟AI回复（非流式）
 */
export async function mockCallAI(
  messages: AIMessage[],
  preferences: string[] = []
): Promise<MockResponse> {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  const userMessage = messages.find(m => m.role === 'user')?.content || ''
  
  // 根据偏好返回不同的模拟回复
  if (preferences.some(p => p.includes('简洁'))) {
    return {
      content: '结论：这是一个简洁的回复。\n\n要点：\n1. 直接\n2. 高效'
    }
  }
  
  // 模拟回复内容
  const mockReplies: Record<string, string> = {
    '你好': '你好！我是你的AI助手。\n\n我可以帮助你：\n- 回答问题\n- 提供建议\n- 协助思考',
    '测试': '测试成功！\n\n应用运行正常，可以继续使用。',
    'openclaw': 'OpenClaw是一个AI能力进化网络。\n\n核心特性：\n1. 自进化能力\n2. 协议约束\n3. 可审计资产'
  }
  
  // 查找匹配的回复
  for (const [key, value] of Object.entries(mockReplies)) {
    if (userMessage.includes(key)) {
      return { content: value }
    }
  }
  
  // 默认回复
  return {
    content: `收到你的问题："${userMessage.slice(0, 20)}..."\n\n这是一个模拟回复，用于开发和测试。\n\n实际使用时，请在.env中配置有效的API Key。`
  }
}

/**
 * 模拟流式AI回复
 */
export async function* mockStreamAI(
  messages: AIMessage[],
  preferences: string[] = []
): AsyncGenerator<string, MockResponse, unknown> {
  const userMessage = messages.find(m => m.role === 'user')?.content || ''
  
  // 模拟回复内容
  const fullContent = `收到你的问题。\n\n这是一个模拟回复，用于开发和测试界面。实际使用时请在.env中配置有效的API Key。`
  
  // 逐字输出
  const words = fullContent.split('')
  for (const word of words) {
    await new Promise(resolve => setTimeout(resolve, 50))
    yield word
  }
  
  return { content: fullContent }
}

/**
 * 检查是否使用模拟模式
 */
export function isMockMode(): boolean {
  // 如果没有API Key或明确设置了MOCK_MODE，使用模拟
  const hasKey = !!import.meta.env.VITE_API_KEY || false
  const mockMode = import.meta.env.VITE_MOCK_MODE === 'true'
  return !hasKey || mockMode
}
