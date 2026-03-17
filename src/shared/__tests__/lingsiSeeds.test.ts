import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { DecisionPersona, DecisionSourceManifestEntry, DecisionUnit } from '../types'

function loadJson<T>(relativePath: string): T {
  const fileUrl = new URL(relativePath, import.meta.url)
  return JSON.parse(readFileSync(fileUrl, 'utf8')) as T
}

describe('LingSi seed outputs', () => {
  const personas = loadJson<DecisionPersona[]>('../../../seeds/lingsi/decision-personas.json')
  const manifest = loadJson<DecisionSourceManifestEntry[]>('../../../seeds/lingsi/decision-source-manifest.json')
  const units = loadJson<DecisionUnit[]>('../../../seeds/lingsi/decision-units.json')

  it('keeps source ids aligned between units and manifest', () => {
    const manifestIds = new Set(manifest.map(item => item.id))
    for (const unit of units) {
      for (const ref of unit.sourceRefs) {
        expect(manifestIds.has(ref.id)).toBe(true)
      }
    }
  })

  it('includes excerpt-level evidence for every approved unit', () => {
    const approvedUnits = units.filter(unit => unit.status === 'approved')
    expect(approvedUnits.length).toBeGreaterThan(0)

    for (const unit of approvedUnits) {
      expect(unit.sourceRefs.length).toBeGreaterThan(0)
      for (const ref of unit.sourceRefs) {
        expect(ref.locator).toMatch(/^L\d+(?:-L\d+)?$/)
        expect(ref.excerpt?.length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps the generated seed baseline at the expected current size', () => {
    expect(personas).toHaveLength(1)
    expect(manifest).toHaveLength(11)
    expect(units).toHaveLength(20)
  })
})
