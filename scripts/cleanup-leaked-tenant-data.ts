/**
 * 按「主人身份码」清理其它租户 / 默认库中误存的对话与节点数据。
 *
 * 用法（在服务器或本地 data 目录旁执行）：
 *   npx tsx scripts/cleanup-leaked-tenant-data.ts \
 *     --data-dir ./data \
 *     --owner-token "9ddd3879-3274-4d68-8995-9f4ddd71ccf8" \
 *     [--dry-run]
 *
 * 逻辑：
 * 1. 从主人库 `data/<ownerUserId>/anima.db` 读取其全部 conversation id（及节点 id）。
 * 2. 遍历 `data/anima.db`（默认共享库）与其余 `data/<hex12>/anima.db`（跳过主人目录），
 *    删除属于主人 id 集合的 storage 行片段、embeddings、conversation_history、memory_facts、logical_edges 等。
 *
 * 务必先备份 data 目录。
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'

function tokenToUserId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12)
}

function parseArgs(): { dataDir: string; ownerToken: string; dryRun: boolean } {
  const argv = process.argv.slice(2)
  let dataDir = path.join(process.cwd(), 'data')
  let ownerToken = ''
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data-dir' && argv[i + 1]) {
      dataDir = path.resolve(argv[++i])
    } else if (argv[i] === '--owner-token' && argv[i + 1]) {
      ownerToken = argv[++i].trim()
    } else if (argv[i] === '--dry-run') {
      dryRun = true
    }
  }
  if (!ownerToken) {
    console.error('缺少 --owner-token')
    process.exit(1)
  }
  return { dataDir, ownerToken, dryRun }
}

function collectIdsFromConversationsJsonl(content: string): Set<string> {
  const ids = new Set<string>()
  for (const line of content.trim().split('\n')) {
    if (!line) continue
    try {
      const o = JSON.parse(line) as { id?: string }
      if (o.id) ids.add(o.id)
    } catch { /* ignore */ }
  }
  return ids
}

function collectIdsFromNodesJson(content: string): Set<string> {
  const ids = new Set<string>()
  try {
    const nodes = JSON.parse(content) as Array<{
      id?: string
      conversationId?: string
      conversationIds?: string[]
    }>
    if (!Array.isArray(nodes)) return ids
    for (const n of nodes) {
      if (n.id) ids.add(n.id)
      if (n.conversationId) ids.add(n.conversationId)
      if (Array.isArray(n.conversationIds)) {
        for (const c of n.conversationIds) ids.add(c)
      }
    }
  } catch { /* ignore */ }
  return ids
}

function loadOwnerResourceIds(ownerDbPath: string): Set<string> {
  const db = new Database(ownerDbPath, { readonly: true })
  try {
    const all = new Set<string>()
    const convRow = db.prepare("SELECT content FROM storage WHERE filename = 'conversations.jsonl'").get() as
      { content: string } | undefined
    if (convRow?.content) {
      for (const id of collectIdsFromConversationsJsonl(convRow.content)) all.add(id)
    }
    const nodesRow = db.prepare("SELECT content FROM storage WHERE filename = 'nodes.json'").get() as
      { content: string } | undefined
    if (nodesRow?.content) {
      for (const id of collectIdsFromNodesJson(nodesRow.content)) all.add(id)
    }
    return all
  } finally {
    db.close()
  }
}

function filterJsonl(content: string, removeIds: Set<string>): { newContent: string; removed: number } {
  const lines = content.trim() ? content.trim().split('\n') : []
  let removed = 0
  const kept: string[] = []
  for (const line of lines) {
    try {
      const o = JSON.parse(line) as { id?: string }
      if (o.id && removeIds.has(o.id)) {
        removed++
        continue
      }
    } catch {
      kept.push(line)
      continue
    }
    kept.push(line)
  }
  return { newContent: kept.join('\n') + (kept.length ? '\n' : ''), removed }
}

function filterNodesJson(content: string, removeIds: Set<string>): { newContent: string; removed: number } {
  let removed = 0
  try {
    const nodes = JSON.parse(content) as Array<{
      id?: string
      conversationId?: string
      conversationIds?: string[]
    }>
    if (!Array.isArray(nodes)) return { newContent: content, removed: 0 }
    const out: typeof nodes = []
    for (const n of nodes) {
      const nid = n.id
      const cid = n.conversationId
      const cids = n.conversationIds ?? []
      const hit =
        (nid && removeIds.has(nid)) ||
        (cid && removeIds.has(cid)) ||
        cids.some((x) => removeIds.has(x))
      if (hit) removed++
      else out.push(n)
    }
    return { newContent: JSON.stringify(out), removed }
  } catch {
    return { newContent: content, removed: 0 }
  }
}

function cleanupOneDb(dbPath: string, removeIds: Set<string>, dryRun: boolean): { storageRows: number; embeddings: number; history: number; facts: number; edges: number } {
  const stats = { storageRows: 0, embeddings: 0, history: 0, facts: 0, edges: 0 }
  if (removeIds.size === 0) return stats

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  try {
    // storage: conversations.jsonl, nodes.json
    for (const filename of ['conversations.jsonl', 'nodes.json'] as const) {
      const row = db.prepare('SELECT content FROM storage WHERE filename = ?').get(filename) as { content: string } | undefined
      if (!row?.content) continue

      if (filename === 'conversations.jsonl') {
        const { newContent, removed } = filterJsonl(row.content, removeIds)
        if (removed > 0) {
          stats.storageRows += removed
          if (!dryRun) {
            const now = new Date().toISOString()
            db.prepare(
              'INSERT INTO storage (filename, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at'
            ).run(filename, newContent, now)
          }
        }
      } else {
        const { newContent, removed } = filterNodesJson(row.content, removeIds)
        if (removed > 0) {
          stats.storageRows += removed
          if (!dryRun) {
            const now = new Date().toISOString()
            db.prepare(
              'INSERT INTO storage (filename, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at'
            ).run(filename, newContent, now)
          }
        }
      }
    }

    const idList = [...removeIds]
    const ph = idList.map(() => '?').join(',')

    if (idList.length) {
      const e = dryRun
        ? db.prepare(`SELECT COUNT(*) as c FROM embeddings WHERE conversation_id IN (${ph})`).get(...idList) as { c: number }
        : db.prepare(`DELETE FROM embeddings WHERE conversation_id IN (${ph})`).run(...idList)
      stats.embeddings = dryRun ? e.c : e.changes

      const h = dryRun
        ? db.prepare(`SELECT COUNT(*) as c FROM conversation_history WHERE conversation_id IN (${ph})`).get(...idList) as { c: number }
        : db.prepare(`DELETE FROM conversation_history WHERE conversation_id IN (${ph})`).run(...idList)
      stats.history = dryRun ? h.c : h.changes

      const f = dryRun
        ? db.prepare(`SELECT COUNT(*) as c FROM memory_facts WHERE source_conv_id IN (${ph})`).get(...idList) as { c: number }
        : db.prepare(`DELETE FROM memory_facts WHERE source_conv_id IN (${ph})`).run(...idList)
      stats.facts = dryRun ? f.c : f.changes

      for (const convId of idList) {
        const ed = dryRun
          ? db.prepare(
              'SELECT COUNT(*) as c FROM logical_edges WHERE source_conv = ? OR target_conv = ?'
            ).get(convId, convId) as { c: number }
          : db.prepare('DELETE FROM logical_edges WHERE source_conv = ? OR target_conv = ?').run(convId, convId)
        stats.edges += dryRun ? ed.c : ed.changes
      }
    }

    if (!dryRun) {
      db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run()
    }
  } finally {
    db.close()
  }

  return stats
}

async function main(): Promise<void> {
  const { dataDir, ownerToken, dryRun } = parseArgs()
  const ownerUserId = tokenToUserId(ownerToken)
  const ownerDb = path.join(dataDir, ownerUserId, 'anima.db')

  if (!fs.existsSync(ownerDb)) {
    console.error(`找不到主人库: ${ownerDb}（请确认身份码与 data 目录正确）`)
    process.exit(1)
  }

  console.log(`主人 userId: ${ownerUserId}`)
  console.log(`主人库: ${ownerDb}`)
  if (dryRun) console.log('*** DRY RUN — 不会写入 ***\n')

  const removeIds = loadOwnerResourceIds(ownerDb)
  console.log(`从主人库收集到 resource id 数量: ${removeIds.size}`)
  if (removeIds.size === 0) {
    console.log('主人库无对话/节点，无需清理。')
    return
  }

  const targets: string[] = []
  const defaultDb = path.join(dataDir, 'anima.db')
  if (fs.existsSync(defaultDb)) targets.push(defaultDb)

  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dataDir, { withFileTypes: true })
  } catch (e) {
    console.error('无法读取 data 目录:', e)
    process.exit(1)
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    if (!/^[0-9a-f]{12}$/.test(ent.name)) continue
    if (ent.name === ownerUserId) continue
    const p = path.join(dataDir, ent.name, 'anima.db')
    if (fs.existsSync(p)) targets.push(p)
  }

  console.log(`待扫描库数量: ${targets.length}\n`)

  for (const dbPath of targets) {
    const rel = path.relative(dataDir, dbPath)
    const s = cleanupOneDb(dbPath, removeIds, dryRun)
    const sum = s.storageRows + s.embeddings + s.history + s.facts + s.edges
    if (sum > 0) {
      console.log(`${rel}: 命中并${dryRun ? '将删除' : '已删除'} storage行/节点=${s.storageRows}, embeddings=${s.embeddings}, history=${s.history}, facts=${s.facts}, edges=${s.edges}`)
    } else {
      console.log(`${rel}: 无匹配数据`)
    }
  }

  console.log('\n完成。若曾使用默认库 anima.db，可考虑在确认后删除该文件或整库清空（请先备份）。')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
