import { STORAGE_FILES } from '@shared/constants'
import {
  BUNDLED_DECISION_PERSONAS,
  BUNDLED_DECISION_SOURCE_MANIFEST,
  BUNDLED_DECISION_UNITS,
} from '@shared/lingsiSeedData'
import { buildLingSiDecisionPayloadFromUnits, mergeDecisionTrace } from '@shared/lingsiDecisionEngine'
import type { DecisionMode, DecisionTrace, DecisionUnit } from '@shared/types'
import { storageService } from './storageService'

let seedPromise: Promise<void> | null = null
let cachedUnits: DecisionUnit[] | null = null

export async function ensureLingSiStorageSeeded(): Promise<void> {
  if (seedPromise) return seedPromise

  seedPromise = (async () => {
    const [personasRaw, manifestRaw, unitsRaw] = await Promise.all([
      storageService.read(STORAGE_FILES.DECISION_PERSONAS),
      storageService.read(STORAGE_FILES.DECISION_SOURCE_MANIFEST),
      storageService.read(STORAGE_FILES.DECISION_UNITS),
    ])

    if (personasRaw && manifestRaw && unitsRaw) {
      try {
        JSON.parse(personasRaw)
        JSON.parse(manifestRaw)
        cachedUnits = JSON.parse(unitsRaw) as DecisionUnit[]
        return
      } catch {
        // fall through and rewrite from bundled seeds
      }
    }

    await Promise.all([
      storageService.write(STORAGE_FILES.DECISION_PERSONAS, JSON.stringify(BUNDLED_DECISION_PERSONAS, null, 2)),
      storageService.write(STORAGE_FILES.DECISION_SOURCE_MANIFEST, JSON.stringify(BUNDLED_DECISION_SOURCE_MANIFEST, null, 2)),
      storageService.write(STORAGE_FILES.DECISION_UNITS, JSON.stringify(BUNDLED_DECISION_UNITS, null, 2)),
    ])
    cachedUnits = BUNDLED_DECISION_UNITS
  })()

  try {
    await seedPromise
  } finally {
    seedPromise = null
  }
}

export async function loadDecisionUnits(personaId?: string): Promise<DecisionUnit[]> {
  if (cachedUnits) return personaId ? cachedUnits.filter(unit => unit.personaId === personaId) : cachedUnits

  await ensureLingSiStorageSeeded()
  const raw = await storageService.read(STORAGE_FILES.DECISION_UNITS)
  if (!raw) {
    cachedUnits = BUNDLED_DECISION_UNITS
    return cachedUnits
  }

  try {
    cachedUnits = JSON.parse(raw) as DecisionUnit[]
  } catch {
    cachedUnits = BUNDLED_DECISION_UNITS
  }
  return personaId ? cachedUnits.filter(unit => unit.personaId === personaId) : cachedUnits
}

export async function buildLingSiDecisionPayload(
  query: string,
  mode: DecisionMode,
  options?: {
    personaId?: string
    personaName?: string
  },
): Promise<{
  extraContext?: string
  decisionTrace: DecisionTrace
}> {
  const units = await loadDecisionUnits()
  return buildLingSiDecisionPayloadFromUnits(query, mode, units, options)
}

export { mergeDecisionTrace }
