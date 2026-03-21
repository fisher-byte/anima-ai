import { describe, expect, it } from 'vitest'
import decisionProductStateSeed from '../../../seeds/lingsi/decision-product-state.json'
import type { DecisionProductStatePack } from '../types'

const productState = decisionProductStateSeed as DecisionProductStatePack

describe('LingSi product state seed', () => {
  it('keeps the current state pack aligned with the shipped version', () => {
    expect(productState.version).toBe('0.5.49')
    expect(productState.docRefs).toContain('docs/lingsi-flywheel.md')
    expect(productState.completedChanges.length).toBeGreaterThanOrEqual(4)
    expect(productState.personaFocus?.lenny?.length).toBeGreaterThan(0)
    expect(productState.personaFocus?.zhang?.length).toBeGreaterThan(0)
    expect(productState.dataSnapshot?.personas).toBeGreaterThanOrEqual(2)
    expect(productState.dataSnapshot?.approvedUnits).toBeGreaterThan(0)
  })
})
