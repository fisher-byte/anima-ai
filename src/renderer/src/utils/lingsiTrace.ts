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
