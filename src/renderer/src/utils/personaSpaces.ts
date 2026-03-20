import {
  LENNY_SYSTEM_PROMPT,
  PG_SYSTEM_PROMPT,
  WANG_SYSTEM_PROMPT,
  ZHANG_SYSTEM_PROMPT,
} from '@shared/constants'

import type { AssistantInvocation, DecisionMode, DecisionTrace } from '@shared/types'

export type PublicSpaceId = 'lenny' | 'pg' | 'zhang' | 'wang'

export interface PublicSpaceDefinition {
  id: PublicSpaceId
  name: string
  initials: string
  persona: string
  storagePrefix: string
  supportsDecisionMode: boolean
}

export const PUBLIC_SPACE_DEFINITIONS: PublicSpaceDefinition[] = [
  {
    id: 'lenny',
    name: 'Lenny Rachitsky',
    initials: 'L',
    persona: 'Lenny Rachitsky（Product · Growth）',
    storagePrefix: 'lenny',
    supportsDecisionMode: true,
  },
  {
    id: 'pg',
    name: 'Paul Graham',
    initials: 'PG',
    persona: 'Paul Graham（Startup · Thinking）',
    storagePrefix: 'pg',
    supportsDecisionMode: false,
  },
  {
    id: 'zhang',
    name: '张小龙',
    initials: '张',
    persona: '张小龙（Product · WeChat）',
    storagePrefix: 'zhang',
    supportsDecisionMode: true,
  },
  {
    id: 'wang',
    name: '王慧文',
    initials: '王',
    persona: '王慧文（Startup · Product）',
    storagePrefix: 'wang',
    supportsDecisionMode: false,
  },
]

const PUBLIC_SPACE_MAP = new Map(PUBLIC_SPACE_DEFINITIONS.map((space) => [space.id, space]))

export function getPublicSpaceDefinition(id: string): PublicSpaceDefinition | undefined {
  return PUBLIC_SPACE_MAP.get(id as PublicSpaceId)
}

export function getSystemPromptForPublicSpace(id: string): string | undefined {
  switch (id) {
    case 'lenny':
      return LENNY_SYSTEM_PROMPT
    case 'pg':
      return PG_SYSTEM_PROMPT
    case 'zhang':
      return ZHANG_SYSTEM_PROMPT
    case 'wang':
      return WANG_SYSTEM_PROMPT
    default:
      return undefined
  }
}

export function getDecisionPersonaForPublicSpace(id: string): { id: 'lenny' | 'zhang'; name: string } | null {
  if (id === 'lenny') return { id: 'lenny', name: 'Lenny Rachitsky' }
  if (id === 'zhang') return { id: 'zhang', name: '张小龙' }
  return null
}


export function resolveDecisionModeForPersona(options: {
  personaId: 'lenny' | 'zhang'
  isPublicSpaceMode: boolean
  lennyDecisionMode: DecisionMode
  zhangDecisionMode: DecisionMode
  invokedAssistant?: AssistantInvocation
  decisionTrace?: DecisionTrace
}): DecisionMode {
  const { personaId, isPublicSpaceMode, lennyDecisionMode, zhangDecisionMode, invokedAssistant, decisionTrace } = options

  if (isPublicSpaceMode) {
    // 与当前会话 decisionTrace 对齐：从历史恢复灵思后，续问仍以 trace 为准，避免仅依赖 store 开关不同步
    if (decisionTrace?.personaId === personaId && decisionTrace.mode === 'decision') {
      return 'decision'
    }
    return personaId === 'zhang' ? zhangDecisionMode : lennyDecisionMode
  }

  if (decisionTrace?.personaId === personaId && decisionTrace.mode) {
    return decisionTrace.mode
  }

  if (invokedAssistant?.type === 'public_space' && invokedAssistant.id === personaId && invokedAssistant.mode) {
    return invokedAssistant.mode
  }

  return 'normal'
}
