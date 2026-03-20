import type {
  DecisionPersonaId,
  DecisionRecord,
  DecisionMode,
  DecisionPersona,
  DecisionProductStatePack,
  DecisionSourceRef,
  DecisionTrace,
  DecisionUnit,
} from './types'

const MAX_MATCHED_UNITS = 3
const MAX_TRACE_SOURCES = 5
const LINKED_CONTEXT_HINT_REGEX = /\s*【已关联(?:空间|文件)：[\s\S]*?】/g
const LOW_SIGNAL_PRODUCT_STATE_KEYWORDS = new Set(['@', 'mention', 'space', '卡片', 'badge'])

function normalizeText(text: string): string {
  return text.toLowerCase()
}

function stripLinkedContextHints(text: string): string {
  return text.replace(LINKED_CONTEXT_HINT_REGEX, '').trim()
}

function inferDecisionType(query: string, personaId?: string): string {
  const normalized = normalizeText(stripLinkedContextHints(query))
  if (/(pmf|留存|增长|roadmap|优先级|pricing|定价|渠道|增长)/i.test(normalized)) return 'product_strategy'
  if (/(career|职业|offer|转岗|创业|合伙人)/i.test(normalized)) return 'career'
  if (/(team|org|组织|dac[iy]|会议|汇报|owner|协作)/i.test(normalized)) return 'org'
  if (/(social|社交|关系|入口|内容|推荐|商业化|平台|小程序|广告)/i.test(normalized)) return 'experience'
  if (/(risk|风险|pre-mortem|kill criteria|回滚|two-way door)/i.test(normalized)) return 'risk'
  return personaId === 'zhang' ? 'product_experience' : 'general_decision'
}

function inferStage(query: string): string {
  const normalized = normalizeText(stripLinkedContextHints(query))
  if (/(pre[- ]?pmf|pmf 前|还没 pmf|早期)/i.test(normalized)) return 'pre_pmf'
  if (/(post[- ]?pmf|pmf 后|规模化|scale|扩张|增长期)/i.test(normalized)) return 'post_pmf'
  if (/(上线|launch|发布|冷启动|初期)/i.test(normalized)) return 'launch'
  if (/(回访|复盘|review|优化|迭代)/i.test(normalized)) return 'iteration'
  return 'unspecified'
}

function inferMissingInfo(query: string, matchedUnits: DecisionUnit[], persona?: DecisionPersona): string[] {
  const normalized = normalizeText(stripLinkedContextHints(query))
  const missing: string[] = []
  const hasNumbers = /\d/.test(query)
  const hasTime = /(周|月|季度|year|month|week|timeline|deadline|截止)/i.test(normalized)
  const hasConstraint = /(预算|资源|团队|人数|时间|约束|限制|成本|风险)/i.test(normalized)
  const hasStage = /(阶段|pmf|留存|增长|上线|冷启动|规模化|成熟)/i.test(normalized)
  const hasTarget = /(目标|想要|希望|要达到|成功)/i.test(normalized)
  const isBroadQuestion = query.trim().length < 24 || /(怎么想|怎么看|怎么办|该不该|怎么做)/.test(normalized)

  if (!hasStage) missing.push('当前阶段还不清楚')
  if (!hasTarget) missing.push('目标函数还不清楚')
  if (!hasConstraint) missing.push('资源/约束条件不清楚')
  if (!hasTime) missing.push('时间边界不清楚')
  if (!hasNumbers && matchedUnits.length === 0) missing.push('缺少关键事实或指标')

  if (persona?.id === 'zhang' && !/(场景|入口|关系|用户|社交|路径|流程)/.test(normalized)) {
    missing.push('真实使用场景不清楚')
  }

  if (persona?.id === 'lenny' && !hasNumbers && isBroadQuestion) {
    missing.push('缺少指标/信号，难判断是否已到该动作的阶段')
  }

  return Array.from(new Set(missing)).slice(0, 4)
}

function resolveFrameworks(decisionType: string, persona?: DecisionPersona): string[] {
  const preferred = persona?.profile?.questionProtocol?.preferredFrameworks ?? []
  const fallbackByType: Record<string, string[]> = {
    product_strategy: ['stage-before-tactics', 'pmf-retention-growth', 'rice-or-priority-cut'],
    career: ['barbell-test', 'downside-first', 'reversible-vs-irreversible'],
    org: ['ownership-clarity', 'decision-rights', 'pre-mortem'],
    experience: ['scene-before-feature', 'naturalness-before-mechanism', 'relationship-pressure-check'],
    risk: ['pre-mortem', 'kill-criteria', 'two-way-door'],
    general_decision: ['stage-before-tactics', 'pre-mortem'],
    product_experience: ['scene-before-feature', 'restraint-first'],
  }
  return Array.from(new Set([...(preferred.slice(0, 3)), ...((fallbackByType[decisionType] ?? []).slice(0, 3))])).slice(0, 3)
}

function shouldClarifyFirst(
  query: string,
  matchedUnits: DecisionUnit[],
  persona?: DecisionPersona,
): boolean {
  const normalized = normalizeText(stripLinkedContextHints(query))
  const missingInfo = inferMissingInfo(query, matchedUnits, persona)
  if (matchedUnits.length === 0 && missingInfo.length >= 2) return true
  if (persona?.id === 'zhang' && !/(场景|入口|路径|关系|社交)/.test(normalized)) return true
  if (persona?.id === 'lenny' && /(职业|career|增长|pricing|roadmap|优先级)/.test(normalized) && missingInfo.length >= 2) return true
  return false
}

function buildPersonaProfileContext(persona?: DecisionPersona): string | undefined {
  if (!persona) return undefined
  const heuristics = persona.heuristics?.slice(0, 4) ?? []
  const profile = persona.profile
  const decisionStyle = profile?.decisionStyle
    ? Object.entries(profile.decisionStyle)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 3)
        .map(([key]) => key)
    : []
  const archetypes = profile?.jungianArchetypes?.slice(0, 2) ?? []
  const biasRisks = profile?.biasRisks?.slice(0, 2) ?? []
  const sections = [
    '【Persona 决策画像】',
    `persona：${persona.name}`,
    heuristics.length > 0 ? `启发式：${heuristics.map(item => `- ${item}`).join('\n')}` : undefined,
    archetypes.length > 0 ? `叙事标签：${archetypes.map(item => `- ${item}`).join('\n')}` : undefined,
    decisionStyle.length > 0 ? `高权重决策维度：${decisionStyle.map(item => `- ${item}`).join('\n')}` : undefined,
    biasRisks.length > 0 ? `常见偏差风险：${biasRisks.map(item => `- ${item}`).join('\n')}` : undefined,
  ]
  return sections.filter(Boolean).join('\n\n')
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

function dedupeStrings(values: Array<string | undefined | null>, max = 4): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
    if (deduped.length >= max) break
  }
  return deduped
}

function buildFallbackFollowUps(reasoningRoute?: DecisionTrace['reasoningRoute']): string[] {
  const unknowns = reasoningRoute?.keyUnknowns ?? []
  if (unknowns.length === 0) return []
  return unknowns.slice(0, 3).map((item) => `先补充：${item}`)
}

function buildFallbackNextActions(
  personaName: string,
  reasoningRoute?: DecisionTrace['reasoningRoute'],
  productStateUsed?: boolean,
): string[] {
  const actions: string[] = []
  if (reasoningRoute?.followUpRequired) {
    actions.push('先回答上面的关键追问，再继续给出高置信判断。')
  }
  if (reasoningRoute?.decisionType === 'product_strategy') {
    actions.push(`请先写出 2 个候选路径，并用 ${personaName} 的标准比较 tradeoff。`)
  }
  if (productStateUsed) {
    actions.push('把这次判断和当前项目状态核对，确认它解决的是当前阶段最关键的问题。')
  }
  return dedupeStrings(actions, 3)
}

function summarizeDraftRecommendation(
  matchedUnits: DecisionUnit[],
  reasoningRoute?: DecisionTrace['reasoningRoute'],
  productStateUsed?: boolean,
): string {
  if (matchedUnits.length > 0) {
    const first = matchedUnits[0]
    return first.preferredPath || first.summary || first.title
  }
  if (reasoningRoute?.followUpRequired) {
    return '当前信息不足，先澄清关键未知项，再给出更高置信的推荐路径。'
  }
  if (productStateUsed) {
    return '这次判断主要依据当前项目状态，先聚焦当前阶段最关键的决策，再决定是否扩系统。'
  }
  return '先形成初步倾向，再补充关键信息和验证动作。'
}

export function scoreDecisionUnit(query: string, unit: DecisionUnit): number {
  const normalizedQuery = normalizeText(stripLinkedContextHints(query))
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

export function buildDecisionExtraContext(
  query: string,
  matchedUnits: DecisionUnit[],
  persona?: DecisionPersona,
): string {
  const personaName = persona?.name ?? '当前 persona'
  const decisionType = inferDecisionType(query, persona?.id)
  const stage = inferStage(query)
  const missingInfo = inferMissingInfo(query, matchedUnits, persona)
  const followUpRequired = shouldClarifyFirst(query, matchedUnits, persona)
  const frameworks = resolveFrameworks(decisionType, persona)
  const header = [
    '【LingSi 决策模式】',
    `当前任务：以 ${personaName} 的方式回答一个决策问题。`,
    `决策类型：${decisionType}`,
    `阶段判断：${stage}`,
    `信息策略：${followUpRequired ? '先给初步倾向，再追问 1-3 个高信息增益问题' : '可直接给判断，但要说明假设和 tradeoff'}`,
    '回答要求：',
    '1. 先给直接判断或倾向，不要先铺垫。',
    '2. 明确区分当前阶段、假设条件和主要权衡。',
    '3. 优先使用下面给出的真实 DecisionUnit；证据不够时直接承认不确定。',
    '4. 最后给 2-3 个验证动作或追问，不要只给抽象建议。',
    '5. 不要伪造来源、经历或案例。',
    `用户问题：${query.trim()}`,
  ]

  if (frameworks.length > 0) {
    header.push(`优先框架：\n${frameworks.map(item => `- ${item}`).join('\n')}`)
  }
  if (missingInfo.length > 0) {
    header.push(`当前关键未知：\n${missingInfo.map(item => `- ${item}`).join('\n')}`)
  }

  if (matchedUnits.length === 0) {
    header.push('当前没有高置信命中的 DecisionUnit，请给“初步倾向 + 不确定点 + 下一步验证动作”。')
    return [buildPersonaProfileContext(persona), header.join('\n')].filter(Boolean).join('\n\n')
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

  return [buildPersonaProfileContext(persona), ...header, '命中的 DecisionUnit：', ...unitBlocks].filter(Boolean).join('\n\n')
}

function buildDecisionProductStateContext(
  productState: DecisionProductStatePack,
  personaId?: string,
): string {
  const scopedPersonaId = personaId === 'lenny' || personaId === 'zhang' ? personaId : undefined
  const personaFocus = scopedPersonaId && productState.personaFocus?.[scopedPersonaId]
    ? productState.personaFocus[scopedPersonaId]
    : []

  const sections = [
    '【当前产品状态包】',
    `版本：${productState.version}`,
    `摘要：${productState.summary}`,
    productState.dataSnapshot
      ? `知识基线：\n- personas: ${productState.dataSnapshot.personas}\n- sources: ${productState.dataSnapshot.sources}\n- approved units: ${productState.dataSnapshot.approvedUnits}\n- lenny units: ${productState.dataSnapshot.unitsByPersona.lenny ?? 0}\n- zhang units: ${productState.dataSnapshot.unitsByPersona.zhang ?? 0}${productState.dataSnapshot.animaBaseHead ? `\n- anima-base: ${productState.dataSnapshot.animaBaseHead}` : ''}`
      : undefined,
    `最近完成：${productState.completedChanges.slice(0, 4).map(item => `- ${item}`).join('\n')}`,
    `当前关注：${productState.currentFocus.slice(0, 3).map(item => `- ${item}`).join('\n')}`,
    `已验证方向：${productState.validatedDirections.slice(0, 3).map(item => `- ${item}`).join('\n')}`,
    `已知风险：${productState.knownRisks.slice(0, 3).map(item => `- ${item}`).join('\n')}`,
    `评测结果：${Object.values(productState.evalSummary).map((item) => `- ${item}`).join('\n')}`,
    `待决策：${productState.nextDecisions.slice(0, 3).map(item => `- ${item}`).join('\n')}`,
    personaFocus.length > 0
      ? `当前 persona 视角：${personaFocus.slice(0, 2).map(item => `- ${item}`).join('\n')}`
      : undefined,
    `参考文档：${productState.docRefs.join('、')}`,
  ]

  return sections.filter(Boolean).join('\n\n')
}

export function shouldInjectDecisionProductState(
  query: string,
  productState: DecisionProductStatePack | undefined,
): boolean {
  if (!productState) return false
  const normalizedQuery = normalizeText(stripLinkedContextHints(query))
  return productState.keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword)
    if (LOW_SIGNAL_PRODUCT_STATE_KEYWORDS.has(normalizedKeyword)) return false
    return normalizedQuery.includes(normalizedKeyword)
  })
}

export function buildDecisionTrace(
  mode: DecisionMode,
  matchedUnits: DecisionUnit[],
  personaId?: string,
  options?: {
    productStateUsed?: boolean
    productStateDocRefs?: string[]
    reasoningRoute?: DecisionTrace['reasoningRoute']
  },
): DecisionTrace {
  if (mode === 'normal') return { mode: 'normal', personaId }
  return {
    mode: 'decision',
    personaId,
    matchedDecisionUnitIds: matchedUnits.map(unit => unit.id),
    sourceRefs: dedupeSourceRefs(matchedUnits.flatMap(unit => unit.sourceRefs)),
    productStateUsed: options?.productStateUsed,
    productStateDocRefs: options?.productStateDocRefs?.slice(0, 6) ?? [],
    reasoningRoute: options?.reasoningRoute,
  }
}

export function buildDecisionRecordDraft(
  query: string,
  decisionTrace: DecisionTrace,
  matchedUnits: DecisionUnit[],
  options?: {
    persona?: DecisionPersona
  },
): DecisionRecord | undefined {
  if (decisionTrace.mode !== 'decision' || !decisionTrace.personaId) return undefined

  const now = new Date().toISOString()
  const personaName = options?.persona?.name ?? decisionTrace.personaId
  const recommendationSummary = summarizeDraftRecommendation(
    matchedUnits,
    decisionTrace.reasoningRoute,
    decisionTrace.productStateUsed,
  )
  const followUpQuestions = dedupeStrings(
    [
      ...matchedUnits.flatMap((unit) => unit.followUpQuestions ?? []),
      ...buildFallbackFollowUps(decisionTrace.reasoningRoute),
    ],
    3,
  )
  const nextActions = dedupeStrings(
    [
      ...matchedUnits.flatMap((unit) => unit.nextActions ?? []),
      ...buildFallbackNextActions(personaName, decisionTrace.reasoningRoute, decisionTrace.productStateUsed),
    ],
    3,
  )

  return {
    id: `decision-${crypto.randomUUID()}`,
    // personaId 来自 decisionTrace，构建时已确保是合法的 DecisionPersonaId 值
    personaId: decisionTrace.personaId as DecisionPersonaId,
    mode: decisionTrace.mode,
    decisionType: decisionTrace.reasoningRoute?.decisionType ?? 'general_decision',
    stage: decisionTrace.reasoningRoute?.stage,
    userQuestion: query.trim(),
    knowns: dedupeStrings([
      matchedUnits.length > 0 ? `已命中 ${matchedUnits.length} 条相关 DecisionUnit` : undefined,
      decisionTrace.productStateUsed ? '已注入当前项目状态作为判断背景' : undefined,
    ], 3),
    unknowns: decisionTrace.reasoningRoute?.keyUnknowns?.slice(0, 4) ?? [],
    options: [],
    recommendationSummary,
    keyTradeoffs: decisionTrace.reasoningRoute?.tradeoffs?.slice(0, 4) ?? [],
    assumptions: dedupeStrings([
      decisionTrace.productStateUsed ? '当前项目状态包仍然代表最新事实' : undefined,
      matchedUnits.length === 0 ? '当前没有高置信命中的具体案例' : undefined,
    ], 3),
    followUpQuestions,
    nextActions,
    killCriteria: [],
    evidenceRefs: decisionTrace.sourceRefs?.slice(0, 5) ?? [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

export function buildLingSiDecisionPayloadFromUnits(
  query: string,
  mode: DecisionMode,
  units: DecisionUnit[],
  options?: {
    personaId?: string
    personaName?: string
    persona?: DecisionPersona
    productState?: DecisionProductStatePack
  },
): {
  extraContext?: string
  decisionTrace: DecisionTrace
  decisionRecord?: DecisionRecord
} {
  if (mode !== 'decision') {
    return { decisionTrace: { mode: 'normal', personaId: options?.personaId } }
  }

  const scopedUnits = options?.personaId
    ? units.filter(unit => unit.personaId === options.personaId)
    : units
  const matchedUnits = matchDecisionUnits(query, scopedUnits)
  const shouldInjectProductState = shouldInjectDecisionProductState(query, options?.productState)
  const productStateContext = shouldInjectProductState && options?.productState
    ? buildDecisionProductStateContext(options.productState, options.personaId)
    : undefined
  const persona = options?.persona
    ?? (options?.personaId ? { id: options.personaId, name: options.personaName ?? options.personaId, heuristics: [], evidenceSources: [], status: 'active', createdAt: '', updatedAt: '' } : undefined)
  const decisionType = inferDecisionType(query, persona?.id)
  const stage = inferStage(query)
  const keyUnknowns = inferMissingInfo(query, matchedUnits, persona)
  const chosenFrameworks = resolveFrameworks(decisionType, persona)
  const followUpRequired = shouldClarifyFirst(query, matchedUnits, persona)
  const tradeoffs = matchedUnits.flatMap(unit => unit.antiPatterns ?? []).slice(0, 3)
  const decisionContext = buildDecisionExtraContext(query, matchedUnits, persona)
  const decisionTrace = buildDecisionTrace('decision', matchedUnits, options?.personaId, {
    productStateUsed: shouldInjectProductState,
    productStateDocRefs: shouldInjectProductState ? options?.productState?.docRefs : undefined,
    reasoningRoute: {
      decisionType,
      stage,
      keyUnknowns,
      tradeoffs,
      chosenFrameworks,
      followUpRequired,
    },
  })

  return {
    extraContext: [productStateContext, decisionContext].filter(Boolean).join('\n\n'),
    decisionTrace,
    decisionRecord: buildDecisionRecordDraft(query, decisionTrace, matchedUnits, {
      persona,
    }),
  }
}

export function mergeDecisionTrace(
  existing: DecisionTrace | undefined,
  next: DecisionTrace,
): DecisionTrace {
  // 续问时若 payload 误传 normal，勿清空已有灵思轨迹（显式切回 normal 时 existing 已由 store 写成 normal）
  if (next.mode === 'normal') {
    const persona = next.personaId ?? existing?.personaId
    if (existing?.mode === 'decision' && (!persona || existing.personaId === persona)) {
      return existing
    }
    return { mode: 'normal', personaId: persona }
  }
  return {
    mode: 'decision',
    personaId: next.personaId ?? existing?.personaId,
    matchedDecisionUnitIds: [...new Set([...(existing?.matchedDecisionUnitIds ?? []), ...(next.matchedDecisionUnitIds ?? [])])],
    sourceRefs: dedupeSourceRefs([...(existing?.sourceRefs ?? []), ...(next.sourceRefs ?? [])]),
    productStateUsed: existing?.productStateUsed || next.productStateUsed,
    productStateDocRefs: [...new Set([...(existing?.productStateDocRefs ?? []), ...(next.productStateDocRefs ?? [])])].slice(0, 6),
    reasoningRoute: next.reasoningRoute ?? existing?.reasoningRoute,
  }
}
