/**
 * 决策列表/侧栏展示用：从结构化字段生成「一眼能懂」的标题与一行摘要。
 */
import type { DecisionRecord } from '@shared/types'

import { stripLinkedContextHints } from './conversationUtils'

/** 去掉句首 @某人；英文多词只吃到姓名（避免把整句中文吃进 mention） */
export function stripLeadingMentions(text: string): string {
  let t = stripLinkedContextHints(text || '').replace(/\s+/g, ' ').trim()
  const latinMention = /^@\s*((?:[A-Za-z][a-zA-Z]*)(?:\s+[A-Za-z][a-zA-Z]*){0,3})\s+/
  const cjkMention = /^@\s*([\u4e00-\u9fa5·]{2,8})\s+/
  while (t.length > 0) {
    let m = t.match(latinMention)
    if (!m) m = t.match(cjkMention)
    if (!m) break
    t = t.slice(m[0].length).trim()
  }
  return t
}

function firstChunk(text: string, max: number): string {
  const t = text.trim()
  if (!t) return ''
  // 不把「？」当断句：单句问句常整句就是标题
  const cut = t.split(/[。！.!…\n]/)[0]?.trim() || t
  return cut.length <= max ? cut : `${cut.slice(0, Math.max(0, max - 1))}…`
}

/** 无中文、仅拉丁数字下划线连字符 → 多为内部枚举值，列表标题改用用户问题更易读 */
function isOpaqueDecisionTypeLabel(dt: string): boolean {
  const t = dt.trim()
  if (t.length < 2) return true
  if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(t)) return true
  if (/[\u4e00-\u9fa5]/.test(t)) return false
  return /^[a-z0-9_-]+$/i.test(t)
}

/**
 * 列表主标题：优先可读 decisionType，否则用去 mention 后的用户问题首句。
 */
export function buildDecisionListTitle(record: DecisionRecord, fallback: string): string {
  const dt = (record.decisionType || '').trim()
  if (dt && !isOpaqueDecisionTypeLabel(dt)) {
    return dt.length <= 44 ? dt : `${dt.slice(0, 43)}…`
  }
  const userClean = stripLeadingMentions(record.userQuestion || fallback)
  if (userClean) return firstChunk(userClean, 44)
  return firstChunk(stripLeadingMentions(fallback), 44)
}

/**
 * 副标题/预览：优先采纳摘要首行，否则用户问题。
 */
export function buildDecisionPreviewLine(record: DecisionRecord): string {
  const raw = (record.recommendationSummary || '').trim()
  if (raw) {
    const oneLine = raw.split(/\n/)[0]?.trim().replace(/\s+/g, ' ') || ''
    return oneLine.length <= 96 ? oneLine : `${oneLine.slice(0, 95)}…`
  }
  const u = stripLeadingMentions(record.userQuestion || '')
  return u ? firstChunk(u, 96) : ''
}
