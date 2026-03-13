import { describe, it, expect, vi } from 'vitest'
import { cosineSim, vecToBuffer, bufferToVec, embedTextWithUserKey } from '../lib/embedding'

describe('cosineSim', () => {
  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0, 1])
    expect(cosineSim(a, b)).toBe(0)
  })

  it('returns 1.0 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2, 3])
    expect(cosineSim(a, b)).toBeCloseTo(1.0, 5)
  })

  it('returns 0 for zero vectors without throwing or returning NaN', () => {
    const a = new Float32Array([0, 0, 0])
    const b = new Float32Array([1, 2, 3])
    const result = cosineSim(a, b)
    expect(result).toBe(0)
    expect(Number.isNaN(result)).toBe(false)
  })
})

describe('vecToBuffer / bufferToVec', () => {
  it('round-trips a float vector with acceptable precision', () => {
    const original = [0.1, 0.2, 0.3, -0.5, 1.23456789]
    const buf = vecToBuffer(original)
    const recovered = bufferToVec(buf)
    expect(recovered.length).toBe(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 5)
    }
  })
})

describe('embedTextWithUserKey', () => {
  it('returns null immediately when apiKey is empty (no network request)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await embedTextWithUserKey('hello', '', 'https://api.example.com')
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
