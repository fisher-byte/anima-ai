import type { DecisionPersona, DecisionSourceManifestEntry, DecisionUnit } from './types'

import decisionPersonasSeed from '../../seeds/lingsi/decision-personas.json'
import decisionSourceManifestSeed from '../../seeds/lingsi/decision-source-manifest.json'
import decisionUnitsSeed from '../../seeds/lingsi/decision-units.json'

export const BUNDLED_DECISION_PERSONAS = decisionPersonasSeed as DecisionPersona[]
export const BUNDLED_DECISION_SOURCE_MANIFEST = decisionSourceManifestSeed as DecisionSourceManifestEntry[]
export const BUNDLED_DECISION_UNITS = decisionUnitsSeed as DecisionUnit[]
