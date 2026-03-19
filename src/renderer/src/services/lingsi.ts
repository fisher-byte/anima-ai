import { STORAGE_FILES } from '@shared/constants'
import {
  BUNDLED_DECISION_PERSONAS,
  BUNDLED_DECISION_PRODUCT_STATE,
  BUNDLED_DECISION_SOURCE_MANIFEST,
  BUNDLED_DECISION_UNITS,
} from '@shared/lingsiSeedData'
import { buildLingSiDecisionPayloadFromUnits, mergeDecisionTrace } from '@shared/lingsiDecisionEngine'
import type { DecisionMode, DecisionPersona, DecisionProductStatePack, DecisionRecord, DecisionTrace, DecisionUnit } from '@shared/types'
import { storageService } from './storageService'

let seedPromise: Promise<void> | null = null
let cachedPersonas: DecisionPersona[] | null = null
let cachedUnits: DecisionUnit[] | null = null
let cachedProductState: DecisionProductStatePack | null = null
/**
 * 上次完成 seed 时所用的 bundled updatedAt 版本标记。
 * 每次 ensureLingSiStorageSeeded 结束后写入；若下次发现 bundled 版本变了，
 * 则先清空缓存再重新 seed，确保用户始终使用最新 persona / unit 数据。
 */
let cachedBundledVersion: string | null = null

/**
 * 手动清空模块级缓存（供测试 / 开发热重载使用）。
 * 生产路径请勿直接调用。
 */
export function invalidateLingSiCache(): void {
  cachedPersonas = null
  cachedUnits = null
  cachedProductState = null
  cachedBundledVersion = null
  seedPromise = null
}

export async function ensureLingSiStorageSeeded(): Promise<void> {
  if (seedPromise) return seedPromise

  // 版本变化检测：bundled 数据有更新时先清空内存缓存，强制重新从磁盘或 bundled 数据加载
  const bundledVersion = BUNDLED_DECISION_PRODUCT_STATE.updatedAt
  if (cachedBundledVersion !== null && cachedBundledVersion !== bundledVersion) {
    cachedPersonas = null
    cachedUnits = null
    cachedProductState = null
  }

  seedPromise = (async () => {
    const [personasRaw, manifestRaw, productStateRaw, unitsRaw] = await Promise.all([
      storageService.read(STORAGE_FILES.DECISION_PERSONAS),
      storageService.read(STORAGE_FILES.DECISION_SOURCE_MANIFEST),
      storageService.read(STORAGE_FILES.DECISION_PRODUCT_STATE),
      storageService.read(STORAGE_FILES.DECISION_UNITS),
    ])

    if (personasRaw && manifestRaw && productStateRaw && unitsRaw) {
      try {
        const parsedPersonas = JSON.parse(personasRaw) as DecisionPersona[]
        JSON.parse(manifestRaw)
        const parsedProductState = JSON.parse(productStateRaw) as DecisionProductStatePack
        const parsedUnits = JSON.parse(unitsRaw) as DecisionUnit[]

        // 如果磁盘中的 product state 版本落后于 bundled，则强制用 bundled 数据覆盖磁盘
        if (parsedProductState.updatedAt !== bundledVersion) {
          await Promise.all([
            storageService.write(STORAGE_FILES.DECISION_PERSONAS, JSON.stringify(BUNDLED_DECISION_PERSONAS, null, 2)),
            storageService.write(STORAGE_FILES.DECISION_SOURCE_MANIFEST, JSON.stringify(BUNDLED_DECISION_SOURCE_MANIFEST, null, 2)),
            storageService.write(STORAGE_FILES.DECISION_PRODUCT_STATE, JSON.stringify(BUNDLED_DECISION_PRODUCT_STATE, null, 2)),
            storageService.write(STORAGE_FILES.DECISION_UNITS, JSON.stringify(BUNDLED_DECISION_UNITS, null, 2)),
          ])
          cachedPersonas = BUNDLED_DECISION_PERSONAS
          cachedProductState = BUNDLED_DECISION_PRODUCT_STATE
          cachedUnits = BUNDLED_DECISION_UNITS
        } else {
          cachedPersonas = parsedPersonas
          cachedProductState = parsedProductState
          cachedUnits = parsedUnits
        }
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
    // 记录本次完成时的 bundled 版本，供下次比对
    cachedBundledVersion = bundledVersion
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
  decisionRecord?: DecisionRecord
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
