import type { DecisionSourceRef, DecisionUnit } from '@shared/types'

export function fallbackDecisionUnitLabel(id: string): string {
  return id
    .replace(/^lenny-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function resolveDecisionUnitLabels(
  matchedDecisionUnitIds: string[] | undefined,
  units: DecisionUnit[],
): string[] {
  if (!matchedDecisionUnitIds?.length) return []

  const titleById = new Map(units.map((unit) => [unit.id, unit.title]))
  return matchedDecisionUnitIds.map((id) => titleById.get(id) ?? fallbackDecisionUnitLabel(id))
}

export function formatLingSiSourceLabel(ref: DecisionSourceRef): string {
  const fileName = ref.path.split('/').pop()
  const primary = ref.title ?? ref.label
  const secondary = fileName && fileName !== primary ? fileName : null
  return [primary, secondary, ref.locator].filter(Boolean).join(' · ')
}

function isPlainParagraph(block: string): boolean {
  const trimmed = block.trim()
  if (!trimmed) return false
  return !(
    trimmed.startsWith('#') ||
    trimmed.startsWith('- ') ||
    trimmed.startsWith('* ') ||
    trimmed.startsWith('>') ||
    trimmed.startsWith('```') ||
    /^\d+\.\s/.test(trimmed)
  )
}

export function injectLingSiInlineCitations(
  markdown: string,
  sourceRefs: DecisionSourceRef[],
): string {
  if (!markdown.trim() || sourceRefs.length === 0) return markdown

  const markers = sourceRefs.map((_, idx) => ` [${idx + 1}](#lingsi-source-${idx + 1})`).join('')
  if (markdown.includes('#lingsi-source-1')) return markdown

  const blocks = markdown.split('\n\n')
  const targetIndex = blocks.findIndex(isPlainParagraph)
  if (targetIndex === -1) return `${markdown}${markers}`

  blocks[targetIndex] = `${blocks[targetIndex].trimEnd()}${markers}`
  return blocks.join('\n\n')
}
