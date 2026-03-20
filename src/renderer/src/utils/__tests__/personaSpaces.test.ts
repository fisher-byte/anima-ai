import { describe, expect, it } from 'vitest'

import { resolveDecisionModeForPersona } from '../personaSpaces'

describe('resolveDecisionModeForPersona', () => {
  it('uses live space toggle when inside public space mode', () => {
    expect(resolveDecisionModeForPersona({
      personaId: 'lenny',
      isPublicSpaceMode: true,
      lennyDecisionMode: 'decision',
      zhangDecisionMode: 'normal',
    })).toBe('decision')
  })

  it('prefers conversation decision trace over store toggle in public space mode', () => {
    expect(resolveDecisionModeForPersona({
      personaId: 'lenny',
      isPublicSpaceMode: true,
      lennyDecisionMode: 'normal',
      zhangDecisionMode: 'normal',
      decisionTrace: { mode: 'decision', personaId: 'lenny', matchedDecisionUnitIds: ['u1'] },
    })).toBe('decision')
  })

  it('uses conversation trace mode for homepage public persona calls', () => {
    expect(resolveDecisionModeForPersona({
      personaId: 'zhang',
      isPublicSpaceMode: false,
      lennyDecisionMode: 'normal',
      zhangDecisionMode: 'normal',
      decisionTrace: { mode: 'decision', personaId: 'zhang' },
      invokedAssistant: {
        type: 'public_space',
        id: 'zhang',
        name: '张小龙',
        mode: 'decision',
      },
    })).toBe('decision')
  })

  it('falls back to invoked assistant mode when trace is absent', () => {
    expect(resolveDecisionModeForPersona({
      personaId: 'lenny',
      isPublicSpaceMode: false,
      lennyDecisionMode: 'normal',
      zhangDecisionMode: 'normal',
      invokedAssistant: {
        type: 'public_space',
        id: 'lenny',
        name: 'Lenny Rachitsky',
        mode: 'decision',
      },
    })).toBe('decision')
  })
})
