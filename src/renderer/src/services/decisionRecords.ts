import type { AssistantInvocation, Conversation, DecisionRecord } from '@shared/types'
import { STORAGE_FILES } from '@shared/constants'

import { stripLinkedContextHints } from '../utils/conversationUtils'
import { storageService } from './storageService'

export const DECISION_RECORDS_UPDATED_EVENT = 'anima:decision-records-updated'

export interface OngoingDecisionItem {
  conversation: Conversation
  decisionRecord: DecisionRecord
  personaName: string
  source: 'main' | 'lenny' | 'zhang' | 'pg' | 'wang'
  title: string
  revisitAt?: string
  adoptedAt?: string
  result?: NonNullable<DecisionRecord['outcome']>['result']
  notes?: string
  updatedAt: string
  isDue: boolean
}

type DecisionSource = OngoingDecisionItem['source']

const DECISION_FILES: Array<{ filename: string; source: DecisionSource }> = [
  { filename: STORAGE_FILES.CONVERSATIONS, source: 'main' },
  { filename: STORAGE_FILES.LENNY_CONVERSATIONS, source: 'lenny' },
  { filename: STORAGE_FILES.ZHANG_CONVERSATIONS, source: 'zhang' },
  { filename: STORAGE_FILES.PG_CONVERSATIONS, source: 'pg' },
  { filename: STORAGE_FILES.WANG_CONVERSATIONS, source: 'wang' },
]

const PERSONA_NAME_BY_ID: Record<string, string> = {
  lenny: 'Lenny Rachitsky',
  zhang: '张小龙',
  pg: 'Paul Graham',
  wang: '王慧文',
}

function buildInvokedAssistant(source: DecisionSource, decisionRecord?: DecisionRecord): AssistantInvocation | undefined {
  if (source === 'lenny') return { type: 'public_space', id: 'lenny', name: PERSONA_NAME_BY_ID.lenny, mode: decisionRecord?.mode }
  if (source === 'zhang') return { type: 'public_space', id: 'zhang', name: PERSONA_NAME_BY_ID.zhang, mode: decisionRecord?.mode }
  if (source === 'pg') return { type: 'public_space', id: 'pg', name: PERSONA_NAME_BY_ID.pg, mode: decisionRecord?.mode }
  if (source === 'wang') return { type: 'public_space', id: 'wang', name: PERSONA_NAME_BY_ID.wang, mode: decisionRecord?.mode }
  return undefined
}

function sanitizeTitle(raw: string): string {
  const clean = stripLinkedContextHints(raw || '').replace(/\s+/g, ' ').trim()
  return clean.length <= 36 ? clean : `${clean.slice(0, 36)}…`
}

function normalizeConversation(conv: Conversation, source: DecisionSource): Conversation {
  if (conv.invokedAssistant) return conv
  const invokedAssistant = buildInvokedAssistant(source, conv.decisionRecord)
  return invokedAssistant ? { ...conv, invokedAssistant } : conv
}

function compareItems(a: OngoingDecisionItem, b: OngoingDecisionItem): number {
  const aDue = a.revisitAt ? new Date(a.revisitAt).getTime() : Number.POSITIVE_INFINITY
  const bDue = b.revisitAt ? new Date(b.revisitAt).getTime() : Number.POSITIVE_INFINITY
  if (aDue !== bDue) return aDue - bDue
  return new Date(b.decisionRecord.updatedAt).getTime() - new Date(a.decisionRecord.updatedAt).getTime()
}

function isDueDate(revisitAt?: string): boolean {
  if (!revisitAt) return false
  const dueAt = new Date(revisitAt).getTime()
  return Number.isFinite(dueAt) && dueAt <= Date.now()
}

export function emitDecisionRecordsUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DECISION_RECORDS_UPDATED_EVENT))
}

export async function listOngoingDecisionItems(): Promise<OngoingDecisionItem[]> {
  const latestByConversationId = new Map<string, OngoingDecisionItem>()

  for (const { filename, source } of DECISION_FILES) {
    const content = await storageService.read(filename)
    if (!content) continue

    const lines = content.split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Conversation
        if (!parsed.decisionRecord) continue
        const status = parsed.decisionRecord.status
        if (status !== 'adopted' && status !== 'revisited') continue

        const conversation = normalizeConversation(parsed, source)
        const personaName = PERSONA_NAME_BY_ID[parsed.decisionRecord.personaId] ?? parsed.decisionRecord.personaId
        const item: OngoingDecisionItem = {
          conversation,
          decisionRecord: parsed.decisionRecord,
          personaName,
          source,
          title: sanitizeTitle(parsed.decisionRecord.userQuestion || parsed.userMessage),
          revisitAt: parsed.decisionRecord.outcome?.revisitAt,
          adoptedAt: parsed.decisionRecord.outcome?.adoptedAt,
          result: parsed.decisionRecord.outcome?.result,
          notes: parsed.decisionRecord.outcome?.notes,
          updatedAt: parsed.decisionRecord.updatedAt,
          isDue: status === 'adopted' && isDueDate(parsed.decisionRecord.outcome?.revisitAt),
        }

        const existing = latestByConversationId.get(parsed.id)
        if (!existing || compareItems(item, existing) < 0) {
          latestByConversationId.set(parsed.id, item)
        }
      } catch {
        // ignore invalid jsonl line
      }
    }
  }

  return Array.from(latestByConversationId.values()).sort(compareItems)
}

export async function listDecisionLedgerItems(): Promise<OngoingDecisionItem[]> {
  const items = await listOngoingDecisionItems()
  return items.sort((a, b) => {
    if (a.decisionRecord.status !== b.decisionRecord.status) {
      if (a.decisionRecord.status === 'adopted') return -1
      if (b.decisionRecord.status === 'adopted') return 1
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}
