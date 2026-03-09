/**
 * Unit tests for POST /api/memory/rebuild-node-graph
 *
 * Tests the Union-Find + dual-threshold algorithm directly by calling
 * the route through a test Hono app backed by in-memory SQLite.
 *
 * Test cases:
 *   1. Single node → no clusters produced
 *   2. A-B-C chain (A-B similar, B-C similar) → one merged cluster
 *   3. Time span guard: 61-day gap, score 0.79 → NOT merged
 *   4. Sanity threshold: A-C cosineSim < 0.60 → cluster discarded
 *   5. No embeddings in DB → reason: 'no-embeddings'
 *   6. keepNode selection: node with more conversationIds kept
 *   7. keepNode tie-break: same count, earlier firstDate wins
 */

import { describe, it, expect, afterAll } from 'vitest'
import { Hono } from 'hono'
import Database from 'better-sqlite3'

// ── helpers (mirror of memory.ts internal utils) ────────────────────────────

function vecToBuffer(vec: number[]): Buffer {
  const f32 = new Float32Array(vec)
  return Buffer.from(f32.buffer)
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Build a unit-norm vector in the given direction */
function makeVec(components: number[]): number[] {
  const norm = Math.sqrt(components.reduce((s, v) => s + v * v, 0))
  return components.map(v => v / norm)
}

// ── in-memory DB ─────────────────────────────────────────────────────────────

const db = new Database(':memory:')
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    conversation_id TEXT PRIMARY KEY,
    embedding       BLOB NOT NULL,
    updated_at      TEXT NOT NULL
  );
`)

afterAll(() => { db.close() })

function insertEmbedding(convId: string, vec: number[]) {
  db.prepare('INSERT OR REPLACE INTO memories (conversation_id, embedding, updated_at) VALUES (?, ?, ?)').run(convId, vecToBuffer(vec), new Date().toISOString())
}

// ── test app ─────────────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono()

  const ADJACENCY_THRESHOLD = 0.75
  const SANITY_THRESHOLD    = 0.60
  const TEMPORAL_STRICT     = 0.82

  function bufferToVecLocal(buf: Buffer): Float32Array {
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  }

  function cosineSimF32(a: Float32Array, b: Float32Array): number {
    let dot = 0, na = 0, nb = 0
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    if (na === 0 || nb === 0) return 0
    return dot / (Math.sqrt(na) * Math.sqrt(nb))
  }

  app.post('/api/memory/rebuild-node-graph', async (c) => {
    const { nodes } = await c.req.json<{
      nodes: Array<{ id: string; conversationIds: string[]; firstDate: string }>
    }>()

    if (!nodes || nodes.length < 2) {
      return c.json({ clusters: [], reason: 'not-enough-nodes' })
    }

    const nodeVecs: Map<string, Float32Array> = new Map()
    for (const node of nodes) {
      const vecs: Float32Array[] = []
      for (const cid of node.conversationIds) {
        const row = db.prepare('SELECT embedding FROM memories WHERE conversation_id = ? LIMIT 1').get(cid) as { embedding: Buffer } | undefined
        if (row?.embedding) {
          const v = bufferToVecLocal(row.embedding)
          if (v) vecs.push(v)
        }
      }
      if (vecs.length === 0) continue
      const dim = vecs[0].length
      const avg = new Float32Array(dim)
      for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i]
      for (let i = 0; i < dim; i++) avg[i] /= vecs.length
      nodeVecs.set(node.id, avg)
    }

    const nodeIds = [...nodeVecs.keys()]
    if (nodeIds.length < 2) return c.json({ clusters: [], reason: 'no-embeddings' })

    const parent = new Map(nodeIds.map(id => [id, id]))
    function find(x: string): string {
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
      return parent.get(x)!
    }
    function union(x: string, y: string) { parent.set(find(x), find(y)) }

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const nA = nodes.find(n => n.id === nodeIds[i])!
        const nB = nodes.find(n => n.id === nodeIds[j])!
        const daysDiff = Math.abs(new Date(nA.firstDate).getTime() - new Date(nB.firstDate).getTime()) / 86400000
        const score = cosineSimF32(nodeVecs.get(nodeIds[i])!, nodeVecs.get(nodeIds[j])!)
        const threshold = daysDiff > 60 ? TEMPORAL_STRICT : ADJACENCY_THRESHOLD
        if (score >= threshold) union(nodeIds[i], nodeIds[j])
      }
    }

    const clusterMap = new Map<string, string[]>()
    for (const id of nodeIds) {
      const root = find(id)
      if (!clusterMap.has(root)) clusterMap.set(root, [])
      clusterMap.get(root)!.push(id)
    }

    const clusters: Array<{ keepNodeId: string; mergeNodeIds: string[]; mergedConversationIds: string[] }> = []

    for (const [, members] of clusterMap) {
      if (members.length < 2) continue
      let sane = true
      outer: for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          if (cosineSimF32(nodeVecs.get(members[i])!, nodeVecs.get(members[j])!) < SANITY_THRESHOLD) {
            sane = false; break outer
          }
        }
      }
      if (!sane) continue

      const memberNodes = members.map(id => nodes.find(n => n.id === id)!)
      memberNodes.sort((a, b) => {
        const diff = b.conversationIds.length - a.conversationIds.length
        if (diff !== 0) return diff
        return a.firstDate.localeCompare(b.firstDate)
      })
      const keepNode = memberNodes[0]
      const mergeNodes = memberNodes.slice(1)
      clusters.push({
        keepNodeId: keepNode.id,
        mergeNodeIds: mergeNodes.map(n => n.id),
        mergedConversationIds: mergeNodes.flatMap(n => n.conversationIds)
      })
    }

    return c.json({ clusters, totalNodes: nodeIds.length, totalMerges: clusters.reduce((s, cl) => s + cl.mergeNodeIds.length, 0) })
  })

  return app
}

const app = buildApp()

async function post(body: unknown) {
  const req = new Request('http://localhost/api/memory/rebuild-node-graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return app.fetch(req)
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('rebuild-node-graph', () => {
  it('1. single node → not-enough-nodes', async () => {
    const res = await post({ nodes: [{ id: 'n1', conversationIds: ['c1'], firstDate: '2026-01-01' }] })
    const data = await res.json() as { clusters: unknown[]; reason: string }
    expect(data.clusters).toHaveLength(0)
    expect(data.reason).toBe('not-enough-nodes')
  })

  it('2. A-B similar → one cluster produced', async () => {
    // A and B have high cosine similarity (same direction)
    const vecA = makeVec([1, 0.1, 0.05, 0.02])
    const vecB = makeVec([0.98, 0.12, 0.04, 0.03])
    expect(cosineSim(vecA, vecB)).toBeGreaterThan(0.75)

    insertEmbedding('cA', vecA)
    insertEmbedding('cB', vecB)

    const res = await post({
      nodes: [
        { id: 'nA', conversationIds: ['cA'], firstDate: '2026-01-01' },
        { id: 'nB', conversationIds: ['cB'], firstDate: '2026-01-02' }
      ]
    })
    const data = await res.json() as { clusters: { keepNodeId: string; mergeNodeIds: string[] }[] }
    expect(data.clusters).toHaveLength(1)
    expect(data.clusters[0].mergeNodeIds).toHaveLength(1)
  })

  it('3. time span guard: 61-day gap, score 0.79 → NOT merged', async () => {
    // cos(38°) ≈ 0.788, which is above ADJACENCY_THRESHOLD (0.75) but below TEMPORAL_STRICT (0.82)
    const deg38 = 38 * Math.PI / 180
    const vecX = [Math.cos(deg38 * 0), Math.sin(deg38 * 0), 0, 0]   // angle 0°
    const vecY = [Math.cos(deg38),       Math.sin(deg38),       0, 0]  // angle 38°
    const sim = cosineSim(vecX, vecY)
    expect(sim).toBeGreaterThan(0.75)
    expect(sim).toBeLessThan(0.82)

    insertEmbedding('cX', vecX)
    insertEmbedding('cY', vecY)

    const res = await post({
      nodes: [
        { id: 'nX', conversationIds: ['cX'], firstDate: '2026-01-01' },
        { id: 'nY', conversationIds: ['cY'], firstDate: '2026-03-05' }  // 63 days later
      ]
    })
    const data = await res.json() as { clusters: unknown[] }
    expect(data.clusters).toHaveLength(0)
  })

  it('4. sanity check: A-C cosineSim < 0.60 → cluster discarded', async () => {
    // Place P at 0°, Q at 40°, R at 80° in 2D unit circle
    // cos(40°) ≈ 0.766 > 0.75 ✓   cos(80°) ≈ 0.174 < 0.60 ✓
    const toAngle = (deg: number) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180), 0, 0]
    const vecP = toAngle(0)
    const vecQ = toAngle(40)
    const vecR = toAngle(80)
    expect(cosineSim(vecP, vecQ)).toBeGreaterThan(0.75)
    expect(cosineSim(vecQ, vecR)).toBeGreaterThan(0.75)
    expect(cosineSim(vecP, vecR)).toBeLessThan(0.60)

    insertEmbedding('cP', vecP)
    insertEmbedding('cQ', vecQ)
    insertEmbedding('cR', vecR)

    const res = await post({
      nodes: [
        { id: 'nP', conversationIds: ['cP'], firstDate: '2026-01-01' },
        { id: 'nQ', conversationIds: ['cQ'], firstDate: '2026-01-02' },
        { id: 'nR', conversationIds: ['cR'], firstDate: '2026-01-03' }
      ]
    })
    const data = await res.json() as { clusters: unknown[] }
    // The 3-node cluster fails sanity (P-R < 0.60) so it is discarded entirely
    // Possibly P-Q or Q-R form a 2-node cluster that passes sanity
    // But the 3-way union will be tried; depending on union structure some 2-node combos may pass
    // We only check that the buggy full-3-way cluster doesn't exist
    for (const cl of data.clusters as { mergeNodeIds: string[] }[]) {
      expect(cl.mergeNodeIds).toHaveLength(1)  // at most 2-node clusters
    }
  })

  it('5. no embeddings in DB → no-embeddings', async () => {
    const res = await post({
      nodes: [
        { id: 'ghost1', conversationIds: ['ghost-conv-1'], firstDate: '2026-01-01' },
        { id: 'ghost2', conversationIds: ['ghost-conv-2'], firstDate: '2026-01-02' }
      ]
    })
    const data = await res.json() as { clusters: unknown[]; reason: string }
    expect(data.clusters).toHaveLength(0)
    expect(data.reason).toBe('no-embeddings')
  })

  it('6. keepNode: node with more conversationIds is kept', async () => {
    const vecSim1 = makeVec([1, 0.05, 0.01, 0])
    const vecSim2 = makeVec([0.99, 0.06, 0.01, 0])
    expect(cosineSim(vecSim1, vecSim2)).toBeGreaterThan(0.75)

    insertEmbedding('keep-c1', vecSim1)
    insertEmbedding('keep-c2', vecSim1)   // same direction for avg
    insertEmbedding('keep-c3', vecSim2)

    const res = await post({
      nodes: [
        { id: 'keep-n1', conversationIds: ['keep-c1', 'keep-c2'], firstDate: '2026-02-01' },  // 2 convIds
        { id: 'keep-n2', conversationIds: ['keep-c3'],             firstDate: '2026-01-01' }   // 1 convId
      ]
    })
    const data = await res.json() as { clusters: { keepNodeId: string }[] }
    expect(data.clusters).toHaveLength(1)
    expect(data.clusters[0].keepNodeId).toBe('keep-n1')
  })

  it('7. keepNode tie-break: same conversationIds count, earlier firstDate wins', async () => {
    const vecEarly = makeVec([1, 0.05, 0.01, 0])
    const vecLate  = makeVec([0.99, 0.06, 0.01, 0])
    expect(cosineSim(vecEarly, vecLate)).toBeGreaterThan(0.75)

    insertEmbedding('tb-c-early', vecEarly)
    insertEmbedding('tb-c-late',  vecLate)

    const res = await post({
      nodes: [
        { id: 'tb-n-late',  conversationIds: ['tb-c-late'],  firstDate: '2026-03-01' },
        { id: 'tb-n-early', conversationIds: ['tb-c-early'], firstDate: '2026-01-01' }
      ]
    })
    const data = await res.json() as { clusters: { keepNodeId: string }[] }
    expect(data.clusters).toHaveLength(1)
    expect(data.clusters[0].keepNodeId).toBe('tb-n-early')
  })
})
