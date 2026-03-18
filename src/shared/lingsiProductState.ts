export interface EvalCaseResult {
  judge?: {
    winner?: 'decision' | 'normal' | 'tie'
  }
}

export interface ReleaseSnapshot {
  version: string
  date: string
  title: string
  changes: string[]
}

export interface DecisionProductStateDataSnapshot {
  personas: number
  sources: number
  approvedUnits: number
  unitsByPersona: Partial<Record<'lenny' | 'zhang', number>>
  animaBaseHead?: string
}

export function countEvalWinners(results: EvalCaseResult[]): { decision: number; normal: number; tie: number } {
  return results.reduce((acc, item) => {
    const winner = item.judge?.winner ?? 'tie'
    if (winner === 'decision') acc.decision += 1
    else if (winner === 'normal') acc.normal += 1
    else acc.tie += 1
    return acc
  }, { decision: 0, normal: 0, tie: 0 })
}

export function buildPersonaEvalSummary(personaLabel: string, results: EvalCaseResult[]): string {
  const counts = countEvalWinners(results)
  return `${personaLabel} 基线评测当前为 decision ${counts.decision} / normal ${counts.normal} / tie ${counts.tie}。`
}

export function extractLatestReleaseSnapshot(changelog: string): ReleaseSnapshot {
  const releaseMatch = changelog.match(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\n\n### ([^\n]+)\n([\s\S]*?)(?=\n---\n|\n## \[|$)/)
  if (!releaseMatch) {
    throw new Error('Unable to parse latest changelog release section.')
  }

  const [, version, date, title, body] = releaseMatch
  const bulletBlockMatch = body.match(/\*\*[^*]+：\*\*\n((?:- .+\n)+)/)
  if (!bulletBlockMatch) {
    throw new Error('Unable to parse latest changelog bullet block.')
  }

  const changes = bulletBlockMatch[1]
    .trim()
    .split('\n')
    .map(line => line.replace(/^- /, '').trim())
    .filter(Boolean)

  if (changes.length === 0) {
    throw new Error('Latest changelog release contains no change bullets.')
  }

  return { version, date, title: title.trim(), changes }
}

export function buildProductStateSummary(params: {
  version: string
  releaseTitle: string
  dataSnapshot: DecisionProductStateDataSnapshot
  changes: string[]
}): string {
  const { version, releaseTitle, dataSnapshot, changes } = params
  const topChanges = changes.slice(0, 2).join('；')
  return [
    `Anima 当前已支持 ${dataSnapshot.personas} 个决策 persona，基线知识库为 ${dataSnapshot.sources} sources / ${dataSnapshot.approvedUnits} approved units。`,
    `v${version} 本轮聚焦：${releaseTitle}。`,
    topChanges ? `最近完成：${topChanges}` : undefined,
  ].filter(Boolean).join('')
}
