import { STORAGE_FILES } from '@shared/constants'
import {
  BUNDLED_DECISION_PERSONAS,
  BUNDLED_DECISION_PRODUCT_STATE,
  BUNDLED_DECISION_SOURCE_MANIFEST,
  BUNDLED_DECISION_UNITS,
} from '@shared/lingsiSeedData'
import { buildLingSiDecisionPayloadFromUnits, mergeDecisionTrace } from '@shared/lingsiDecisionEngine'
import type { DecisionMode, DecisionPersona, DecisionProductStatePack, DecisionTrace, DecisionUnit } from '@shared/types'
import { storageService } from './storageService'

let seedPromise: Promise<void> | null = null
let cachedPersonas: DecisionPersona[] | null = null
let cachedUnits: DecisionUnit[] | null = null
let cachedProductState: DecisionProductStatePack | null = null

export async function ensureLingSiStorageSeeded(): Promise<void> {
  if (seedPromise) return seedPromise

  seedPromise = (async () => {
    const [personasRaw, manifestRaw, productStateRaw, unitsRaw] = await Promise.all([
      storageService.read(STORAGE_FILES.DECISION_PERSONAS),
      storageService.read(STORAGE_FILES.DECISION_SOURCE_MANIFEST),
      storageService.read(STORAGE_FILES.DECISION_PRODUCT_STATE),
      storageService.read(STORAGE_FILES.DECISION_UNITS),
    ])

    if (personasRaw && manifestRaw && productStateRaw && unitsRaw) {
      try {
        cachedPersonas = JSON.parse(personasRaw) as DecisionPersona[]
        JSON.parse(manifestRaw)
        cachedProductState = JSON.parse(productStateRaw) as DecisionProductStatePack
        cachedUnits = JSON.parse(unitsRaw) as DecisionUnit[]
        return
      } catch {
        // fall through and rewrite from bundled seeds
      }
    }

    await Promise.all([
      storageService.write(STORAGE_FILES.DECISION_PERSONAS, JSON.stringify(BUNDLED_DECISION_PERSONAS, null, 2)),
      storageService.write(STORAGE_FILES.DECISION_SOURCE_MANIFEST, JSON.stringify(BUNDLED_DECISION_SOURCE_MANIFEST, null, 2)),
      storageService.write(STORAGE_FILES.DECISION_PRODUCT_STATE, JSON.stringify(BUNDLED_DECISION_PRODUCT_STATE, null, 2)),
      storageService.write(STORAGE_FILES.DECISION_UNITS, JSON.stringify(BUNDLED_DECISION_UNITS, null, 2)),
    ])
    cachedPersonas = BUNDLED_DECISION_PERSONAS
    cachedProductState = BUNDLED_DECISION_PRODUCT_STATE
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

export async function loadDecisionPersonas(): Promise<DecisionPersona[]> {
  if (cachedPersonas) return cachedPersonas

  await ensureLingSiStorageSeeded()
  const raw = await storageService.read(STORAGE_FILES.DECISION_PERSONAS)
  if (!raw) {
    cachedPersonas = BUNDLED_DECISION_PERSONAS
    return cachedPersonas
  }

  try {
    cachedPersonas = JSON.parse(raw) as DecisionPersona[]
  } catch {
    cachedPersonas = BUNDLED_DECISION_PERSONAS
  }
  return cachedPersonas
}

export async function loadDecisionProductState(): Promise<DecisionProductStatePack> {
  if (cachedProductState) return cachedProductState

  await ensureLingSiStorageSeeded()
  const raw = await storageService.read(STORAGE_FILES.DECISION_PRODUCT_STATE)
  if (!raw) {
    cachedProductState = BUNDLED_DECISION_PRODUCT_STATE
    return cachedProductState
  }

  try {
    cachedProductState = JSON.parse(raw) as DecisionProductStatePack
  } catch {
    cachedProductState = BUNDLED_DECISION_PRODUCT_STATE
  }
  return cachedProductState
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
  const [units, personas, productState] = await Promise.all([loadDecisionUnits(), loadDecisionPersonas(), loadDecisionProductState()])
  const persona = options?.personaId ? personas.find(item => item.id === options.personaId) : undefined
  return buildLingSiDecisionPayloadFromUnits(query, mode, units, {
    ...options,
    persona,
    productState,
  })
}

export { mergeDecisionTrace }
