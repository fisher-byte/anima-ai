import type { AssistantInvocation, Conversation, DecisionRecord } from '@shared/types'
import { STORAGE_FILES } from '@shared/constants'

import { stripLinkedContextHints } from '../utils/conversationUtils'
import { storageService, getAuthToken } from './storageService'

export const DECISION_RECORDS_UPDATED_EVENT = 'anima:decision-records-updated'

export interface OngoingDecisionItem {
  conversationId: string
  // Optional snapshot. Prefer opening by id to avoid dragging huge assistantMessage payloads through the decision hub.
  conversation?: Conversation
  decisionRecord: DecisionRecord
  personaName: string
  // 'custom-{spaceId}' 表示自定义 Space 对话，其他值为固定 persona 空间
  source: 'main' | 'lenny' | 'zhang' | 'pg' | 'wang' | (string & {})
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

type DecisionLedgerEntry = {
  conversationId: string
  source: DecisionSource
  title?: string
  decisionRecord: DecisionRecord
  updatedAt: string
}

// Keep this small: decision hub refresh runs on the UI thread.
// If conversations.jsonl has huge assistantMessage payloads, large tails can freeze the page.
const TAIL_LINES_PER_FILE = 400
const MAX_ITEMS_RETURNED = 200

function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).electronAPI !== 'undefined'
}

async function readStorageMaybeTail(filename: string): Promise<string | null> {
  if (!isElectron() && typeof fetch !== 'undefined') {
    try {
      const token = getAuthToken()
      const res = await fetch(`/api/storage/${encodeURIComponent(filename)}?tailLines=${TAIL_LINES_PER_FILE}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 404) return null
      if (res.status === 401) {
        console.warn(`[decisionRecords] auth error reading ${filename} — token may be expired`)
        return null
      }
      if (!res.ok) {
        console.warn(`[decisionRecords] unexpected ${res.status} reading ${filename}`)
        return null
      }
      return await res.text()
    } catch {
      // fall through to storageService
    }
  }
  return storageService.read(filename)
}

function* iterJsonlLinesFromEnd(content: string, maxLines: number): Generator<string> {
  if (!content) return
  let end = content.length
  let count = 0
  // Skip trailing newlines
  while (end > 0 && content[end - 1] === '\n') end--
  for (let i = end - 1; i >= 0; i--) {
    if (content[i] === '\n') {
      const line = content.slice(i + 1, end).trim()
      end = i
      if (line) {
        yield line
        count++
        if (count >= maxLines) return
      }
    }
  }
  const first = content.slice(0, end).trim()
  if (first) yield first
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

  // Fast path: prefer the lightweight decision ledger index.
  // This avoids scanning huge conversations.jsonl payloads on the UI thread.
  const ledgerContent = await readStorageMaybeTail(STORAGE_FILES.DECISION_LEDGER)
  if (ledgerContent) {
    let parsedCount = 0
    for (const line of iterJsonlLinesFromEnd(ledgerContent, TAIL_LINES_PER_FILE * 3)) {
      try {
        const entry = JSON.parse(line) as DecisionLedgerEntry
        if (!entry?.conversationId || !entry?.decisionRecord) continue
        const status = entry.decisionRecord.status
        if (status !== 'adopted' && status !== 'revisited') continue

        const personaName = PERSONA_NAME_BY_ID[entry.decisionRecord.personaId] ?? entry.decisionRecord.personaId
        const item: OngoingDecisionItem = {
          conversationId: entry.conversationId,
          decisionRecord: entry.decisionRecord,
          personaName,
          source: entry.source,
          title: sanitizeTitle(entry.title ?? entry.decisionRecord.userQuestion ?? ''),
          revisitAt: entry.decisionRecord.outcome?.revisitAt,
          adoptedAt: entry.decisionRecord.outcome?.adoptedAt,
          result: entry.decisionRecord.outcome?.result,
          notes: entry.decisionRecord.outcome?.notes,
          updatedAt: entry.decisionRecord.updatedAt,
          isDue: status === 'adopted' && isDueDate(entry.decisionRecord.outcome?.revisitAt),
        }

        const existing = latestByConversationId.get(entry.conversationId)
        if (!existing || new Date(item.updatedAt) > new Date(existing.updatedAt)) {
          latestByConversationId.set(entry.conversationId, item)
        }
      } catch {
        // ignore invalid jsonl line
      }

      parsedCount++
      if (parsedCount % 80 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      if (latestByConversationId.size >= MAX_ITEMS_RETURNED) break
    }

    if (latestByConversationId.size > 0) {
      return Array.from(latestByConversationId.values()).sort(compareItems).slice(0, MAX_ITEMS_RETURNED)
    }
  }

  for (const { filename, source } of DECISION_FILES) {
    const content = await readStorageMaybeTail(filename)
    if (!content) continue

    // Parse from the end: recent decisions matter most, and avoids splitting huge JSONL into arrays.
    let parsedCount = 0
    for (const line of iterJsonlLinesFromEnd(content, TAIL_LINES_PER_FILE)) {
      try {
        const conv = JSON.parse(line) as Conversation
        if (!conv.decisionRecord) continue
        const status = conv.decisionRecord.status
        if (status !== 'adopted' && status !== 'revisited') continue

        const conversation = normalizeConversation(conv, source)
        const personaName = PERSONA_NAME_BY_ID[conv.decisionRecord.personaId] ?? conv.decisionRecord.personaId
        const item: OngoingDecisionItem = {
          conversationId: conv.id,
          conversation,
          decisionRecord: conv.decisionRecord,
          personaName,
          source,
          title: sanitizeTitle(conv.decisionRecord.userQuestion || conv.userMessage),
          revisitAt: conv.decisionRecord.outcome?.revisitAt,
          adoptedAt: conv.decisionRecord.outcome?.adoptedAt,
          result: conv.decisionRecord.outcome?.result,
          notes: conv.decisionRecord.outcome?.notes,
          updatedAt: conv.decisionRecord.updatedAt,
          isDue: status === 'adopted' && isDueDate(conv.decisionRecord.outcome?.revisitAt),
        }

        const existing = latestByConversationId.get(conv.id)
        if (!existing || new Date(item.updatedAt) > new Date(existing.updatedAt)) {
          latestByConversationId.set(conv.id, item)
        }
      } catch {
        // ignore invalid jsonl line
      }

      parsedCount++
      // Cooperative yielding to avoid UI hangs when JSONL lines are large.
      if (parsedCount % 50 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      if (latestByConversationId.size >= MAX_ITEMS_RETURNED) break
    }

    if (latestByConversationId.size >= MAX_ITEMS_RETURNED) break
  }

  return Array.from(latestByConversationId.values()).sort(compareItems).slice(0, MAX_ITEMS_RETURNED)
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
