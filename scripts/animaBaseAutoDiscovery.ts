/**
 * 从本地 anima-base 仓库扫描 Lenny / 张小龙目录下尚未在精选 SOURCE_SPECS 中登记的 Markdown，
 * 生成 SourceSpec + UnitSeed，供 extract-lingsi-seeds 合并写入 seeds。
 *
 * 设计原则：
 * - 与精选条目按 sourcePath 去重，精选优先；
 * - 每条来源对应 1 个 DecisionUnit，摘录正文中的可验证片段作为 evidence；
 * - 自动单元 evidenceLevel 固定为 C，confidence 中等，避免与高质量精选混淆；
 * - Persona 的 evidenceSources 仍只用精选（在 extract 主脚本中处理），避免清单爆炸。
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import type { DecisionEvidenceLevel, DecisionSourceType } from '../src/shared/types'

export interface SourceSpecLite {
  id: string
  personaId: string
  type: DecisionSourceType
  person: string
  sourcePath: string
  label: string
  title: string
  url?: string
  publishedAt: string
  notes: string
  evidenceLevel: DecisionEvidenceLevel
  mustInclude: string[]
}

export interface UnitSeedLite {
  id: string
  personaId: string
  title: string
  summary: string
  scenario: string
  goal?: string
  constraints?: string[]
  tags: string[]
  triggerKeywords: string[]
  preferredPath?: string
  antiPatterns?: string[]
  reasoningSteps: string[]
  reasons: string[]
  followUpQuestions: string[]
  nextActions: string[]
  evidenceLevel: DecisionEvidenceLevel
  evidenceRefs: Array<{ sourceId: string; excerpt: string }>
  confidence: number
  status?: 'approved' | 'candidate' | 'archived'
}

const PERSON_ROOT: Record<string, { rel: string; personaId: string; displayName: string }> = {
  lenny: {
    rel: join('people', 'product', 'lenny-rachitsky'),
    personaId: 'lenny',
    displayName: 'Lenny Rachitsky',
  },
  zhang: {
    rel: join('people', 'product', 'zhang-xiaolong'),
    personaId: 'zhang',
    displayName: '张小龙',
  },
}

const SKIP_NAMES = new Set(
  ['readme.md', 'template.md', 'changelog.md', '.ds_store'].map(s => s.toLowerCase()),
)

function hashId(sourcePath: string): string {
  return createHash('sha256').update(sourcePath, 'utf8').digest('hex').slice(0, 12)
}

function inferTypeFromPath(relPosix: string): DecisionSourceType {
  const lower = relPosix.toLowerCase()
  if (lower.includes('/frameworks/')) return 'framework'
  if (lower.includes('/podcasts/')) return 'podcast_transcript'
  if (lower.includes('/decision-cases/')) return 'decision_case'
  if (lower.includes('/articles/')) return 'article'
  if (lower.includes('/talks/')) return 'article'
  if (lower.includes('/quotes/')) return 'quote'
  return 'resource'
}

/** 将路径规范为 posix 风格，便于与 SOURCE_SPECS 比较 */
export function toRepoRelativePosix(fullPath: string, animaRoot: string): string {
  const rel = relative(animaRoot, fullPath)
  return rel.split(sep).join('/')
}

function splitFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  if (!content.startsWith('---')) {
    return { meta: {}, body: content }
  }
  const end = content.indexOf('\n---', 3)
  if (end === -1) {
    return { meta: {}, body: content }
  }
  const rawFm = content.slice(3, end).trim()
  const body = content.slice(end + 4).replace(/^\n/, '')
  const meta: Record<string, string> = {}
  for (const line of rawFm.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/)
    if (m) meta[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body }
}

function firstHeadingTitle(body: string): string | undefined {
  const m = body.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : undefined
}

/** 取正文中的第一处足够长的可引用片段（必须与磁盘原文一致，供 indexOf 校验） */
export function pickVerbatimExcerpt(fullContent: string, minLen = 48, maxLen = 380): string | null {
  const { body } = splitFrontmatter(fullContent)
  const lines = body.split(/\r?\n/)

  const tryLine = (raw: string): string | null => {
    const t = raw.trim()
    if (t.length < minLen) return null
    if (t.startsWith('#')) return null
    if (t.startsWith('![') || t.startsWith('```')) return null
    if (/^[-*]\s+\[[ x]\]\s/i.test(t)) return null
    const slice = t.length <= maxLen ? t : t.slice(0, maxLen)
    if (!fullContent.includes(slice)) return null
    return slice
  }

  for (const line of lines) {
    const ex = tryLine(line)
    if (ex) return ex
  }

  const collapsed = body
    .replace(/^#+\s+.+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
  if (collapsed.length >= minLen) {
    const slice = collapsed.slice(0, maxLen)
    if (fullContent.includes(slice)) return slice
  }

  return null
}

function tokenizeKeywords(title: string, extra: string[]): string[] {
  const raw = `${title} ${extra.join(' ')}`
  const parts = raw
    .split(/[\s/·,:：，。；;、]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && s.length <= 32)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const k = p.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
    if (out.length >= 14) break
  }
  return out
}

async function listMarkdownRecursive(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const ent of entries) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...(await listMarkdownRecursive(p)))
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.md')) {
      out.push(p)
    }
  }
  return out
}

export interface DiscoverOptions {
  animaBaseRoot: string
  curatedSourcePaths: Set<string>
}

export interface DiscoverResult {
  specs: SourceSpecLite[]
  seeds: UnitSeedLite[]
  skipped: Array<{ path: string; reason: string }>
}

/**
 * 扫描 Lenny + 张小龙目录，跳过已在 curatedSourcePaths 中的文件。
 */
export async function discoverAutoSpecsAndSeeds(options: DiscoverOptions): Promise<DiscoverResult> {
  const { animaBaseRoot, curatedSourcePaths } = options
  const specs: SourceSpecLite[] = []
  const seeds: UnitSeedLite[] = []
  const skipped: Array<{ path: string; reason: string }> = []

  for (const key of Object.keys(PERSON_ROOT)) {
    const { rel, personaId, displayName } = PERSON_ROOT[key]!
    const rootDir = join(animaBaseRoot, rel)
    let files: string[] = []
    try {
      await stat(rootDir)
      files = await listMarkdownRecursive(rootDir)
    } catch {
      skipped.push({ path: rootDir, reason: 'directory missing' })
      continue
    }

    for (const abs of files) {
      const sourcePath = toRepoRelativePosix(abs, animaBaseRoot)
      if (curatedSourcePaths.has(sourcePath)) continue

      const base = abs.split(sep).pop()!.toLowerCase()
      if (SKIP_NAMES.has(base)) {
        skipped.push({ path: sourcePath, reason: 'skipped filename' })
        continue
      }

      let content: string
      try {
        content = await readFile(abs, 'utf8')
      } catch (e) {
        skipped.push({ path: sourcePath, reason: `read failed: ${e}` })
        continue
      }

      const excerpt = pickVerbatimExcerpt(content)
      if (!excerpt) {
        skipped.push({ path: sourcePath, reason: 'no excerpt' })
        continue
      }

      const { meta, body } = splitFrontmatter(content)
      const title =
        meta.title ||
        firstHeadingTitle(body) ||
        base.replace(/\.md$/i, '').replace(/[-_]/g, ' ')
      const publishedAt = meta.date?.slice(0, 10) || '1970-01-01'
      const type = inferTypeFromPath(sourcePath)
      const h = hashId(sourcePath)
      const sourceId = `src-auto-${h}`
      const unitId = `unit-auto-${h}`

      const boring = new Set(['people', 'product', 'lenny-rachitsky', 'zhang-xiaolong'])
      const pathTags = sourcePath.split('/').filter(s => s && !s.includes('.') && !boring.has(s))
      const tags = Array.from(
        new Set([
          ...pathTags.filter(t =>
            ['frameworks', 'podcasts', 'decision-cases', 'articles', 'talks', 'quotes'].includes(t),
          ),
          type,
        ]),
      ).slice(0, 8)

      const summaryPlain = body
        .replace(/^#+\s+.+$/gm, '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220)

      const spec: SourceSpecLite = {
        id: sourceId,
        personaId,
        type,
        person: displayName,
        sourcePath,
        label: title.slice(0, 120),
        title: title.slice(0, 200),
        url: meta.source?.startsWith('http') ? meta.source : undefined,
        publishedAt,
        notes: `auto-ingest:${type}`,
        evidenceLevel: 'C',
        mustInclude: [],
      }

      const seed: UnitSeedLite = {
        id: unitId,
        personaId,
        title: title.slice(0, 200),
        summary: summaryPlain || `来自 anima-base：${title}`,
        scenario: `在 anima-base 语料「${title.slice(0, 80)}」中检索相关判断与原文依据。`,
        tags,
        triggerKeywords: tokenizeKeywords(title, [...pathTags, personaId === 'lenny' ? 'Lenny' : '微信']),
        preferredPath: '先对照摘录理解原文立场，再映射到当前决策场景。',
        antiPatterns: ['不经核对原文语境直接套用结论', '把单篇语料当成唯一真理'],
        reasoningSteps: ['阅读摘录与 locator 指向的原文位置', '对照自身约束做可执行迁移', '记录与原文不一致的假设'],
        reasons: [
          summaryPlain
            ? `材料摘要：${summaryPlain.slice(0, 160)}${summaryPlain.length > 160 ? '…' : ''}`
            : '该条目由仓库自动入库，用于扩大可检索证据面；关键结论请以原文为准。',
        ],
        followUpQuestions: ['这篇材料里哪些前提与你的场景一致？哪些不一致？'],
        nextActions: ['在 anima-base 中打开对应路径阅读原文完整论证'],
        evidenceLevel: 'C',
        evidenceRefs: [{ sourceId, excerpt }],
        confidence: 0.62,
        status: 'approved',
      }

      specs.push(spec)
      seeds.push(seed)
    }
  }

  return { specs, seeds, skipped }
}
