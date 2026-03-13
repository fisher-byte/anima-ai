/**
 * Shared embedding utilities
 *
 * Single source of truth for all embedding-related logic:
 *   - Built-in Aliyun DashScope embedding (text + multimodal)
 *   - User-key-based embedding (for fetchRelevantFacts / searchFileChunks)
 *   - Vector serialization (vecToBuffer / bufferToVec)
 *   - Cosine similarity
 */

import type Database from 'better-sqlite3'

// ── Built-in embedding config (Aliyun DashScope, no user config needed) ──────

const BUILTIN_EMBED_KEY = process.env.BUILTIN_EMBED_API_KEY || ''

export const BUILTIN_EMBED = {
  apiKey: BUILTIN_EMBED_KEY,
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'text-embedding-v4'  // Qwen3 最新，支持 2048 维
}

export const BUILTIN_EMBED_MULTIMODAL = {
  apiKey: BUILTIN_EMBED_KEY,
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding',
  model: 'qwen3-vl-embedding'  // 多模态：图片+文本统一向量空间
}

export let builtinEmbeddingFailed = false

// ── Built-in embedding (uses Aliyun key) ──────────────────────────────────────

/** 调 embedding API 返回 number[]，使用内置阿里云 key */
export async function fetchEmbedding(
  _db: InstanceType<typeof Database>,  // 保留签名，不再使用 db
  text: string
): Promise<number[] | null> {
  if (builtinEmbeddingFailed) return null

  const input = text.slice(0, 6000)

  try {
    const resp = await fetch(`${BUILTIN_EMBED.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BUILTIN_EMBED.apiKey}`
      },
      body: JSON.stringify({ model: BUILTIN_EMBED.model, input, dimensions: 2048 }),
      signal: AbortSignal.timeout(8_000)
    })

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        builtinEmbeddingFailed = true
        console.error('[memory] BUILTIN embedding key invalid!')
      } else {
        console.warn('[memory] embedding API error:', resp.status)
      }
      return null
    }

    const data = (await resp.json()) as { data: { embedding: number[] }[] }
    const embedding = data?.data?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length === 0) return null
    return embedding
  } catch (e) {
    console.warn('[memory] fetchEmbedding failed:', e)
    return null
  }
}

/** 多模态 embedding：文本+图片 URL → 统一向量（用于图片文件检索） */
export async function fetchMultimodalEmbedding(
  contents: Array<{ text?: string; image?: string }>
): Promise<number[] | null> {
  if (builtinEmbeddingFailed) return null
  try {
    const resp = await fetch(
      `${BUILTIN_EMBED_MULTIMODAL.baseUrl}/multimodal-embedding`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${BUILTIN_EMBED_MULTIMODAL.apiKey}`,
          'X-DashScope-DataInspection': 'enable'
        },
        body: JSON.stringify({
          model: BUILTIN_EMBED_MULTIMODAL.model,
          input: { contents },
          parameters: { dimension: 1024 }
        }),
        signal: AbortSignal.timeout(15_000)
      }
    )
    if (!resp.ok) {
      console.warn('[memory] multimodal embedding error:', resp.status)
      return null
    }
    const data = (await resp.json()) as { output?: { embeddings?: Array<{ embedding: number[] }> } }
    const embedding = data?.output?.embeddings?.[0]?.embedding
    if (!Array.isArray(embedding) || embedding.length === 0) return null
    return embedding
  } catch (e) {
    console.warn('[memory] fetchMultimodalEmbedding failed:', e)
    return null
  }
}

// ── Vector serialization ──────────────────────────────────────────────────────

/** Float32Array → Buffer（for SQLite storage） */
export function vecToBuffer(vec: number[]): Buffer {
  const f32 = new Float32Array(vec)
  return Buffer.from(f32.buffer)
}

/** Buffer → Float32Array（for cosine similarity） */
export function bufferToVec(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

/** 余弦相似度 */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ── User-key embedding (for ai.ts semantic search) ────────────────────────────

/**
 * Fetch an embedding using the user's API key (or built-in key if available).
 * Used by fetchRelevantFacts, fetchScoredFacts, and searchFileChunks in ai.ts.
 */
export async function embedTextWithUserKey(
  query: string,
  apiKey: string,
  baseUrl: string,
  opts?: { maxInputLen?: number; timeoutMs?: number }
): Promise<Float32Array | null> {
  if (!query.trim() || !apiKey) return null
  const BUILTIN_KEY = process.env.BUILTIN_EMBED_API_KEY || ''
  const embKey = BUILTIN_KEY || apiKey
  const embUrl = BUILTIN_KEY
    ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    : baseUrl
  const embModel = BUILTIN_KEY
    ? 'text-embedding-v4'
    : (baseUrl.includes('moonshot') ? 'moonshot-v1-embedding' : 'text-embedding-3-small')
  const body: Record<string, unknown> = {
    model: embModel,
    input: query.slice(0, opts?.maxInputLen ?? 1000)
  }
  if (BUILTIN_KEY) body.dimensions = 2048
  try {
    const resp = await fetch(`${embUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${embKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8_000)
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as { data: { embedding: number[] }[] }
    const vec = data?.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length === 0) return null
    return new Float32Array(vec)
  } catch { return null }
}
