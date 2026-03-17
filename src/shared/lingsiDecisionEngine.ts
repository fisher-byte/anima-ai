import type { DecisionMode, DecisionSourceRef, DecisionTrace, DecisionUnit } from './types'

const MAX_MATCHED_UNITS = 3
const MAX_TRACE_SOURCES = 5

function normalizeText(text: string): string {
  return text.toLowerCase()
}

function dedupeSourceRefs(sourceRefs: DecisionSourceRef[]): DecisionSourceRef[] {
  const seen = new Set<string>()
  const deduped: DecisionSourceRef[] = []
  for (const ref of sourceRefs) {
    const key = `${ref.id}:${ref.locator ?? ''}:${ref.excerpt ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(ref)
    if (deduped.length >= MAX_TRACE_SOURCES) break
  }
  return deduped
}

export function scoreDecisionUnit(query: string, unit: DecisionUnit): number {
  const normalizedQuery = normalizeText(query)
  let score = 0
  let hardSignalCount = 0

  for (const keyword of unit.triggerKeywords) {
    if (normalizedQuery.includes(normalizeText(keyword))) {
      score += 4
      hardSignalCount += 1
    }
  }
  for (const tag of unit.tags) {
    if (normalizedQuery.includes(normalizeText(tag))) score += 2
  }
  if (normalizedQuery.includes(normalizeText(unit.title))) {
    score += 3
    hardSignalCount += 1
  }
  if (normalizedQuery.includes(normalizeText(unit.scenario))) {
    score += 1
    hardSignalCount += 1
  }
  if (normalizedQuery.includes(normalizeText(unit.summary.slice(0, 24)))) {
    score += 1
    hardSignalCount += 1
  }

  // tags 只作为辅助信号，不允许单独触发命中，避免 `saas` 之类的泛标签造成误判
  if (hardSignalCount === 0) return 0

  return score
}

export function matchDecisionUnits(query: string, units: DecisionUnit[]): DecisionUnit[] {
  return units
    .map(unit => ({ unit, score: scoreDecisionUnit(query, unit) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHED_UNITS)
    .map(item => item.unit)
}

export function buildDecisionExtraContext(query: string, matchedUnits: DecisionUnit[]): string {
  const header = [
    '【LingSi 决策模式】',
    '当前任务：以 Lenny 的方式回答一个决策问题。',
    '回答要求：',
    '1. 先给直接判断或倾向，不要先铺垫。',
    '2. 明确区分当前阶段、假设条件和主要权衡。',
    '3. 优先使用下面给出的真实 DecisionUnit；证据不够时直接承认不确定。',
    '4. 最后给 2-3 个验证动作或追问，不要只给抽象建议。',
    '5. 不要伪造来源、经历或案例。',
    `用户问题：${query.trim()}`,
  ]

  if (matchedUnits.length === 0) {
    header.push('当前没有高置信命中的 DecisionUnit，请给“初步倾向 + 不确定点 + 下一步验证动作”。')
    return header.join('\n')
  }

  const unitBlocks = matchedUnits.map((unit, index) => {
    const reasons = unit.reasons.slice(0, 2).map((reason, i) => `  - 理由${i + 1}：${reason}`).join('\n')
    const questions = unit.followUpQuestions.slice(0, 2).map((question, i) => `  - 追问${i + 1}：${question}`).join('\n')
    const actions = unit.nextActions.slice(0, 2).map((action, i) => `  - 动作${i + 1}：${action}`).join('\n')
    const sources = unit.sourceRefs.map((ref, i) => (
      `  - 来源${i + 1}：${ref.title ?? ref.label} | ${ref.path}${ref.locator ? ` | ${ref.locator}` : ''}\n` +
      `    摘录：${ref.excerpt ?? '见原文'}`
    )).join('\n')

    return [
      `${index + 1}. ${unit.title}`,
      `  - 场景：${unit.scenario}`,
      unit.preferredPath ? `  - 建议路径：${unit.preferredPath}` : undefined,
      reasons,
      questions,
      actions,
      sources,
    ].filter(Boolean).join('\n')
  })

  return [...header, '命中的 DecisionUnit：', ...unitBlocks].join('\n\n')
}

export function buildDecisionTrace(mode: DecisionMode, matchedUnits: DecisionUnit[]): DecisionTrace {
  if (mode === 'normal') return { mode: 'normal' }
  return {
    mode: 'decision',
    matchedDecisionUnitIds: matchedUnits.map(unit => unit.id),
    sourceRefs: dedupeSourceRefs(matchedUnits.flatMap(unit => unit.sourceRefs)),
  }
}

export function buildLingSiDecisionPayloadFromUnits(
  query: string,
  mode: DecisionMode,
  units: DecisionUnit[],
): {
  extraContext?: string
  decisionTrace: DecisionTrace
} {
  if (mode !== 'decision') {
    return { decisionTrace: { mode: 'normal' } }
  }

  const matchedUnits = matchDecisionUnits(query, units)
  return {
    extraContext: buildDecisionExtraContext(query, matchedUnits),
    decisionTrace: buildDecisionTrace('decision', matchedUnits),
  }
}

export function mergeDecisionTrace(
  existing: DecisionTrace | undefined,
  next: DecisionTrace,
): DecisionTrace {
  if (next.mode === 'normal') return { mode: 'normal' }
  return {
    mode: 'decision',
    matchedDecisionUnitIds: [...new Set([...(existing?.matchedDecisionUnitIds ?? []), ...(next.matchedDecisionUnitIds ?? [])])],
    sourceRefs: dedupeSourceRefs([...(existing?.sourceRefs ?? []), ...(next.sourceRefs ?? [])]),
  }
}
