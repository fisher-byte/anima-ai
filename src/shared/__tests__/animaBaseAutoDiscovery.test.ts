import { describe, expect, it } from 'vitest'

import { pickVerbatimExcerpt, toRepoRelativePosix } from '../../../scripts/animaBaseAutoDiscovery'

describe('animaBaseAutoDiscovery', () => {
  it('picks an excerpt that exists verbatim in the full file', () => {
    const md = `---
title: Test
---

# Hello

This is a long enough line for excerpt validation to succeed without any doubt.
`
    const ex = pickVerbatimExcerpt(md)
    expect(ex).toBeTruthy()
    expect(md.includes(ex!)).toBe(true)
    expect(ex!.length).toBeGreaterThanOrEqual(48)
  })

  it('normalizes repo-relative paths to posix', () => {
    const anima = '/repo/anima-base'
    const file = `${anima}/people/product/lenny-rachitsky/x.md`
    expect(toRepoRelativePosix(file, anima)).toBe('people/product/lenny-rachitsky/x.md')
  })
})
