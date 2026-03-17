import type { DecisionMode } from '@shared/types'

export interface InputMentionToken {
  id: string
  type: 'space' | 'file'
  entityId: string
  label: string
  tokenText: string
  mode?: DecisionMode
  invocationType?: 'public_space' | 'custom_space'
  supportsDecisionMode?: boolean
  storagePrefix?: string
}

export function buildMentionTokenText(
  label: string,
  mode: DecisionMode | undefined,
  decisionModeLabel = '灵思',
  annotateDecision = true,
): string {
  return mode === 'decision' && annotateDecision
    ? `@${label}〔${decisionModeLabel}〕 `
    : `@${label} `
}

export function replaceActiveMentionQuery(
  message: string,
  cursor: number,
  tokenText: string,
): { message: string; cursor: number } {
  const beforeCursor = message.slice(0, cursor)
  const atIdx = beforeCursor.lastIndexOf('@')
  if (atIdx < 0) {
    const next = `${message}${tokenText}`
    return { message: next, cursor: next.length }
  }

  const afterCursor = message.slice(cursor)
  const normalizedAfterCursor = tokenText.endsWith(' ') && afterCursor.startsWith(' ')
    ? afterCursor.slice(1)
    : afterCursor
  const nextMessage = `${message.slice(0, atIdx)}${tokenText}${normalizedAfterCursor}`.replace(/ {2,}/g, ' ')
  const nextCursor = Math.min(atIdx + tokenText.length, nextMessage.length)
  return { message: nextMessage, cursor: nextCursor }
}

export function syncMentionTokens(message: string, tokens: InputMentionToken[]): InputMentionToken[] {
  return tokens.filter((token) => message.includes(token.tokenText.trimEnd()))
}

export function getActiveSpaceMention(tokens: InputMentionToken[]): InputMentionToken | undefined {
  return [...tokens].reverse().find((token) => token.type === 'space')
}

export function findMentionTokenRange(
  message: string,
  tokens: InputMentionToken[],
  cursor: number,
  key: 'Backspace' | 'Delete',
): { start: number; end: number; token: InputMentionToken } | null {
  const matches = tokens
    .map((token) => {
      const searchText = token.tokenText.trimEnd()
      const start = message.indexOf(searchText)
      if (start === -1) return null
      const baseEnd = start + searchText.length
      const end = message[baseEnd] === ' ' ? baseEnd + 1 : baseEnd
      return { start, end, token }
    })
    .filter((match): match is { start: number; end: number; token: InputMentionToken } => !!match)
    .sort((a, b) => a.start - b.start)

  for (const match of matches) {
    if (key === 'Backspace' && cursor > match.start && cursor <= match.end) return match
    if (key === 'Delete' && cursor >= match.start && cursor < match.end) return match
  }

  return null
}

export function removeMentionTokenFromMessage(
  message: string,
  range: { start: number; end: number },
): { message: string; cursor: number } {
  const nextMessage = `${message.slice(0, range.start)}${message.slice(range.end)}`.replace(/ {2,}/g, ' ')
  return { message: nextMessage, cursor: range.start }
}
