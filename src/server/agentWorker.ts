/**
 * Agent Worker — 后台任务调度器
 *
 * 每 30 秒检查所有用户数据库的 agent_tasks 表，分发给 agentTasks.ts 中的具体实现。
 * 多租户：tick() 遍历所有用户 db，每个任务使用对应用户的 db 操作数据。
 *
 * 公开接口：
 *   startAgentWorker()       — 启动 Worker（由 server/index.ts 调用）
 *   enqueueTask(db, type, payload) — 入队新任务
 *   bootstrapAllEmbeddings() — 启动时为历史对话补充向量索引
 */

import type Database from 'better-sqlite3'
import { getAllUserDbs } from './db'
import {
  consolidateFacts,
  extractLogicalEdges,
  extractProfileFromConversation,
  extractPreferenceFromFeedback,
  mergeProfile,
  embedFileContent,
  maybeDecayPreferences,
  extractMentalModel,
} from './agentTasks'
import type {
  ExtractProfilePayload,
  ExtractPreferencePayload,
  EmbedFilePayload,
  ExtractLogicalEdgesPayload,
} from './agentTasks'

/** 处理单条任务（使用该用户专属的 db） */
async function processTask(
  db: InstanceType<typeof Database>,
  task: { id: number; type: string; payload: string; retries?: number }
) {
  const now = new Date().toISOString()
  db.prepare('UPDATE agent_tasks SET status = ?, started_at = ? WHERE id = ?').run('running', now, task.id)

  // 每个任务最多 30 秒，防止单个 LLM 挂起阻塞整个 tick
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('task timeout (30s)')), 30_000)
  )

  try {
    const work = (async () => {
      if (task.type === 'extract_profile') {
        const payload = JSON.parse(task.payload) as ExtractProfilePayload
        const extracted = await extractProfileFromConversation(db, payload.userMessage, payload.assistantMessage)
        if (extracted && Object.keys(extracted).length > 0) mergeProfile(db, extracted)
      } else if (task.type === 'extract_preference') {
        const payload = JSON.parse(task.payload) as ExtractPreferencePayload
        await extractPreferenceFromFeedback(db, payload.userMessage, payload.assistantMessage)
      } else if (task.type === 'embed_file') {
        const payload = JSON.parse(task.payload) as EmbedFilePayload
        await embedFileContent(db, payload.fileId, payload.textContent, payload.filename)
      } else if (task.type === 'consolidate_facts') {
        await consolidateFacts(db)
      } else if (task.type === 'extract_logical_edges') {
        const payload = JSON.parse(task.payload) as ExtractLogicalEdgesPayload
        await extractLogicalEdges(db, payload)
      } else if (task.type === 'extract_mental_model') {
        await extractMentalModel(db)
      }
    })()

    await Promise.race([work, timeout])

    db.prepare('UPDATE agent_tasks SET status = ?, finished_at = ? WHERE id = ?').run('done', new Date().toISOString(), task.id)
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const retries = (task.retries ?? 0) + 1
    if (retries < 3) {
      db.prepare('UPDATE agent_tasks SET status = ?, retries = ?, error = ?, started_at = NULL WHERE id = ?')
        .run('pending', retries, errMsg, task.id)
      console.warn(`[agent] task ${task.id} failed (attempt ${retries}/3), will retry:`, errMsg)
    } else {
      db.prepare('UPDATE agent_tasks SET status = ?, error = ?, finished_at = ? WHERE id = ?')
        .run('failed', errMsg, new Date().toISOString(), task.id)
      console.warn(`[agent] task ${task.id} permanently failed after 3 attempts:`, errMsg)
    }
  }
}

/** 检查并处理所有用户数据库中的 pending 任务（多租户版本） */
async function tick() {
  const userDbs = getAllUserDbs()

  for (const { userId, db } of userDbs) {
    const tasks = db.prepare(
      'SELECT id, type, payload, retries FROM agent_tasks WHERE status = ? ORDER BY id ASC LIMIT 5'
    ).all('pending') as { id: number; type: string; payload: string; retries: number }[]

    for (const task of tasks) {
      await processTask(db, task)
    }

    if (tasks.length > 0) {
      console.log(`[agent] processed ${tasks.length} tasks for user ${userId}`)
    }

    maybeDecayPreferences(db)
  }
}

/** 清理旧任务：删除 7 天前已完成/失败的任务（遍历所有用户 db） */
function cleanOldTasks() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const userDbs = getAllUserDbs()
  for (const { db } of userDbs) {
    try {
      const deleted = db.prepare(
        "DELETE FROM agent_tasks WHERE status IN ('done', 'failed') AND finished_at < ?"
      ).run(cutoff)
      if (deleted.changes > 0) console.log(`[agent] cleaned up ${deleted.changes} old tasks`)
    } catch (e) {
      console.warn('[agent] cleanOldTasks error for a user db:', e)
    }
  }
}

/** 启动 Worker，每 30 秒 tick 一次 */
export function startAgentWorker() {
  console.log('[agent] Worker started (multi-tenant mode)')

  // 崩溃恢复：将上次进程中卡住的 running 任务重置为 pending
  const userDbs = getAllUserDbs()
  for (const { db } of userDbs) {
    try {
      const stalled = db.prepare("UPDATE agent_tasks SET status = 'pending', started_at = NULL WHERE status = 'running'").run()
      if (stalled.changes > 0) console.log(`[agent] recovered ${stalled.changes} stalled tasks from previous run`)
    } catch (e) {
      console.warn('[agent] stalled task recovery error:', e)
    }
  }

  // 启动时对所有用户的 profile.rules 做一次子串去重清洗
  for (const { db } of userDbs) {
    try {
      const profileRow = db.prepare('SELECT content FROM storage WHERE filename = ?').get('profile.json') as { content: string } | undefined
      if (profileRow?.content) {
        const parsed = JSON.parse(profileRow.content) as { rules?: Array<{ preference: string; [k: string]: unknown }> }
        const rules = parsed.rules ?? []
        if (rules.length > 1) {
          const deduped = rules.filter((r, i) => {
            const pref = r.preference?.trim()
            if (!pref) return false  // preference 为空时丢弃该条脏数据
            return !rules.some((other, j) => {
              if (i === j) return false
              const otherPref = other.preference?.trim()
              if (!otherPref) return false
              return otherPref.includes(pref) && otherPref.length > pref.length
            })
          })
          if (deduped.length < rules.length) {
            const nowTs = new Date().toISOString()
            db.prepare('UPDATE storage SET content = ?, updated_at = ? WHERE filename = ?')
              .run(JSON.stringify({ ...parsed, rules: deduped }, null, 2), nowTs, 'profile.json')
            const existing = db.prepare('SELECT value FROM config WHERE key = ?').get('preference_rules') as { value: string } | undefined
            if (existing) db.prepare('UPDATE config SET value = ?, updated_at = ? WHERE key = ?').run(JSON.stringify(deduped), nowTs, 'preference_rules')
            console.log(`[agent] deduped preference rules: ${rules.length} → ${deduped.length}`)
          }
        }
      }
    } catch (e) {
      console.warn('[agent] rule dedup on startup failed:', e)
    }
  }

  tick().catch(e => console.warn('[agent] initial tick error:', e))
  setInterval(() => { tick().catch(e => console.warn('[agent] tick error:', e)) }, 30_000)
  setInterval(() => { try { cleanOldTasks() } catch (e) { console.warn('[agent] cleanOldTasks error:', e) } }, 60 * 60 * 1000)
}

/**
 * 向队列写入任务。
 * 必须传入用户专属的 db 实例，确保任务写入正确的用户数据库。
 */
export function enqueueTask(
  db: InstanceType<typeof Database>,
  type: string,
  payload: Record<string, unknown>
) {
  db.prepare(
    'INSERT INTO agent_tasks (type, payload, status, created_at) VALUES (?, ?, ?, ?)'
  ).run(type, JSON.stringify(payload), 'pending', new Date().toISOString())
}

/**
 * 服务启动时预跑：为所有用户的历史对话补充向量索引。
 * 只处理 embeddings 表中没有记录的对话，已有向量的跳过。
 */
export async function bootstrapAllEmbeddings(): Promise<void> {
  const { fetchEmbedding, vecToBuffer } = await import('./routes/memory')
  const userDbs = getAllUserDbs()
  let totalIndexed = 0

  for (const { userId, db } of userDbs) {
    try {
      const storageRow = db.prepare('SELECT content FROM storage WHERE filename = ?').get('conversations.jsonl') as { content: string } | undefined
      if (!storageRow?.content) continue

      const lines = storageRow.content.trim().split('\n').filter(Boolean)
      if (lines.length === 0) continue

      const indexed = new Set<string>(
        (db.prepare('SELECT conversation_id FROM embeddings').all() as { conversation_id: string }[]).map(r => r.conversation_id)
      )

      const convMap = new Map<string, { userMessage: string; assistantMessage: string }>()
      for (const line of lines) {
        try {
          const conv = JSON.parse(line) as { id?: string; userMessage?: string; assistantMessage?: string }
          if (conv.id && conv.userMessage) convMap.set(conv.id, { userMessage: conv.userMessage, assistantMessage: conv.assistantMessage || '' })
        } catch { /* ignore */ }
      }

      const toIndex = Array.from(convMap.entries()).filter(([id]) => !indexed.has(id))
      if (toIndex.length === 0) continue

      console.log(`[bootstrap] user ${userId}: ${toIndex.length} conversations to index`)

      for (const [convId, conv] of toIndex) {
        try {
          const vec = await fetchEmbedding(db, conv.userMessage + ' ' + conv.assistantMessage)
          if (vec) {
            const now = new Date().toISOString()
            db.prepare(`
              INSERT INTO embeddings (conversation_id, vector, dim, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(conversation_id) DO UPDATE SET vector=excluded.vector, dim=excluded.dim, updated_at=excluded.updated_at
            `).run(convId, vecToBuffer(vec), vec.length, now)
            totalIndexed++
          }
        } catch (e) {
          console.warn(`[bootstrap] embed failed for conv ${convId}:`, e)
        }
        await new Promise(r => setTimeout(r, 200))
      }

      console.log(`[bootstrap] user ${userId}: done`)
    } catch (e) {
      console.warn(`[bootstrap] user ${userId} failed:`, e)
    }
  }

  console.log(`[bootstrap] completed: ${totalIndexed} conversations indexed across all users`)
}
