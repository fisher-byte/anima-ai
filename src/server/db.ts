/**
 * SQLite database connection and schema initialization
 *
 * Multi-tenant: each ACCESS_TOKEN maps to an isolated database under data/{userId}/anima.db.
 * The userId is a short hash of the token (first 12 hex chars of SHA-256).
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

// Ensure base data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ── Schema & migrations ──────────────────────────────────────────────────────

function initSchema(database: InstanceType<typeof Database>) {
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  database.exec(`
    CREATE TABLE IF NOT EXISTS storage (
      filename   TEXT PRIMARY KEY,
      content    TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      conversation_id TEXT PRIMARY KEY,
      vector          BLOB NOT NULL,
      dim             INTEGER NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      occupation    TEXT,
      interests     TEXT,
      tools         TEXT,
      writing_style TEXT,
      goals         TEXT,
      location      TEXT,
      raw_notes     TEXT,
      last_extracted TEXT,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'pending',
      retries     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      started_at  TEXT,
      finished_at TEXT,
      error       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);

    CREATE TABLE IF NOT EXISTS memory_facts (
      id             TEXT NOT NULL,
      fact           TEXT NOT NULL,
      source_conv_id TEXT,
      created_at     TEXT NOT NULL,
      invalid_at     TEXT,
      PRIMARY KEY(id)
    );
    CREATE INDEX IF NOT EXISTS idx_memory_facts_created ON memory_facts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_facts_source ON memory_facts(source_conv_id);

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id           TEXT NOT NULL,
      filename     TEXT NOT NULL,
      mimetype     TEXT NOT NULL DEFAULT '',
      size         INTEGER NOT NULL DEFAULT 0,
      content      BLOB,
      text_content TEXT,
      conv_id      TEXT,
      created_at   TEXT NOT NULL,
      PRIMARY KEY(id)
    );

    CREATE TABLE IF NOT EXISTS file_embeddings (
      id              TEXT NOT NULL,
      file_id         TEXT NOT NULL,
      chunk_index     INTEGER NOT NULL,
      chunk_text      TEXT NOT NULL,
      vector          BLOB NOT NULL,
      dim             INTEGER NOT NULL,
      created_at      TEXT NOT NULL,
      PRIMARY KEY(id)
    );
    CREATE INDEX IF NOT EXISTS idx_file_embeddings_file ON file_embeddings(file_id);
    CREATE INDEX IF NOT EXISTS idx_file_embeddings_created ON file_embeddings(created_at DESC);

    CREATE TABLE IF NOT EXISTS conversation_history (
      conversation_id TEXT PRIMARY KEY,
      messages        TEXT NOT NULL DEFAULT '[]',
      updated_at      TEXT NOT NULL
    );

    -- FTS5 虚拟表：memory_facts 全文索引（BM25 fallback 用）
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_facts_fts
      USING fts5(id UNINDEXED, fact, tokenize='unicode61 remove_diacritics 1');

    CREATE TRIGGER IF NOT EXISTS fts_sync_insert AFTER INSERT ON memory_facts BEGIN
      INSERT INTO memory_facts_fts(id, fact) VALUES (NEW.id, NEW.fact);
    END;

    CREATE TRIGGER IF NOT EXISTS fts_sync_invalidate AFTER UPDATE OF invalid_at ON memory_facts
      WHEN NEW.invalid_at IS NOT NULL BEGIN
      DELETE FROM memory_facts_fts WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS fts_sync_delete AFTER DELETE ON memory_facts BEGIN
      DELETE FROM memory_facts_fts WHERE id = OLD.id;
    END;

    -- fact 内容更新时同步 FTS5 索引（避免检索到已编辑的旧文本）
    CREATE TRIGGER IF NOT EXISTS fts_sync_update AFTER UPDATE OF fact ON memory_facts
      WHEN NEW.invalid_at IS NULL BEGIN
      UPDATE memory_facts_fts SET fact = NEW.fact WHERE id = NEW.id;
    END;
  `)

  // Incremental migrations
  const migrations = [
    'ALTER TABLE agent_tasks ADD COLUMN retries INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE memory_facts ADD COLUMN invalid_at TEXT',
    'ALTER TABLE uploaded_files ADD COLUMN chunk_count INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE uploaded_files ADD COLUMN embed_status TEXT NOT NULL DEFAULT 'pending'",
    'CREATE INDEX IF NOT EXISTS idx_uploaded_files_conv ON uploaded_files(conv_id)',
    'CREATE INDEX IF NOT EXISTS idx_uploaded_files_created ON uploaded_files(created_at DESC)',
    "CREATE INDEX IF NOT EXISTS idx_uploaded_files_embed ON uploaded_files(embed_status)",
    `CREATE TABLE IF NOT EXISTS file_embeddings (
      id          TEXT NOT NULL,
      file_id     TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text  TEXT NOT NULL,
      vector      BLOB NOT NULL,
      dim         INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      PRIMARY KEY(id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_file_embeddings_file ON file_embeddings(file_id)',
    'CREATE INDEX IF NOT EXISTS idx_file_embeddings_created ON file_embeddings(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_memory_facts_active ON memory_facts(created_at DESC) WHERE invalid_at IS NULL',
    // 存量 memory_facts 回填到 FTS5 索引（已在虚拟表中的会被 OR IGNORE 跳过）
    `INSERT OR IGNORE INTO memory_facts_fts(id, fact)
      SELECT id, fact FROM memory_facts WHERE invalid_at IS NULL`
  ]
  for (const sql of migrations) {
    try { database.exec(sql) } catch { /* column/index already exists */ }
  }
}

// ── Per-user database pool ───────────────────────────────────────────────────

const dbPool = new Map<string, InstanceType<typeof Database>>()
const dbTimers = new Map<string, ReturnType<typeof setInterval>>()

/** Derive a short userId from an access token (first 12 hex chars of SHA-256) */
export function tokenToUserId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12)
}

/**
 * One-time migration: copy all data from the legacy _default db into the
 * PRIMARY user's newly created userId db.
 *
 * SECURITY: Only runs for the primary token (ACCESS_TOKEN env var).
 * Other users MUST NOT receive someone else's historical data.
 * A sentinel file (.migrated) is written after the first successful migration
 * so the operation is idempotent even if the server restarts.
 */
function migrateFromDefault(targetDb: InstanceType<typeof Database>, userId: string): void {
  // Only migrate for the primary user (ACCESS_TOKEN, not ACCESS_TOKENS extras)
  const primaryToken = process.env.ACCESS_TOKEN?.trim()
  if (!primaryToken) return
  const primaryUserId = tokenToUserId(primaryToken)
  if (userId !== primaryUserId) {
    // Different user — never copy another user's data
    return
  }

  const defaultDbPath = path.join(DATA_DIR, 'anima.db')
  if (!fs.existsSync(defaultDbPath)) return

  // Idempotency guard: if we already migrated, skip
  const userDir = path.join(DATA_DIR, userId)
  const migratedFlag = path.join(userDir, '.migrated')
  if (fs.existsSync(migratedFlag)) return

  let srcDb: InstanceType<typeof Database> | null = null
  try {
    srcDb = new Database(defaultDbPath, { readonly: true })
  } catch {
    return
  }

  try {
    type CountRow = { cnt: number }
    const count = (sql: string) => (srcDb!.prepare(sql).get() as CountRow).cnt
    const hasData =
      count('SELECT COUNT(*) as cnt FROM storage') > 0 ||
      count('SELECT COUNT(*) as cnt FROM config') > 0 ||
      count('SELECT COUNT(*) as cnt FROM user_profile') > 0 ||
      count('SELECT COUNT(*) as cnt FROM memory_facts') > 0

    if (!hasData) return

    // storage
    const storageRows = srcDb.prepare('SELECT filename, content, updated_at FROM storage').all() as StorageRow[]
    const insStorage = targetDb.prepare(
      'INSERT OR IGNORE INTO storage (filename, content, updated_at) VALUES (?, ?, ?)'
    )
    for (const r of storageRows) insStorage.run(r.filename, r.content, r.updated_at)

    // config
    const configRows = srcDb.prepare('SELECT key, value, updated_at FROM config').all() as ConfigRow[]
    const insConfig = targetDb.prepare(
      'INSERT OR IGNORE INTO config (key, value, updated_at) VALUES (?, ?, ?)'
    )
    for (const r of configRows) insConfig.run(r.key, r.value, r.updated_at)

    // user_profile
    const profile = srcDb.prepare('SELECT * FROM user_profile WHERE id = 1').get() as UserProfileRow | undefined
    if (profile) {
      targetDb.prepare(`
        INSERT OR IGNORE INTO user_profile
          (id, occupation, interests, tools, writing_style, goals, location, raw_notes, last_extracted, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.occupation, profile.interests, profile.tools, profile.writing_style,
        profile.goals, profile.location, profile.raw_notes, profile.last_extracted, profile.updated_at
      )
    }

    // memory_facts
    const facts = srcDb.prepare('SELECT id, fact, source_conv_id, created_at, invalid_at FROM memory_facts').all() as MemoryFactRow[]
    const insFact = targetDb.prepare(
      'INSERT OR IGNORE INTO memory_facts (id, fact, source_conv_id, created_at, invalid_at) VALUES (?, ?, ?, ?, ?)'
    )
    for (const r of facts) insFact.run(r.id, r.fact, r.source_conv_id, r.created_at, r.invalid_at)

    console.log(
      `[db] Migrated legacy default data → userId db` +
      ` (storage:${storageRows.length} config:${configRows.length}` +
      ` facts:${facts.length} profile:${profile ? 1 : 0})`
    )
    // Write idempotency flag so we never migrate again
    try { fs.writeFileSync(migratedFlag, new Date().toISOString()) } catch { /* ignore */ }
  } catch (e) {
    console.error('[db] Migration from default db failed:', e)
  } finally {
    try { srcDb?.close() } catch { /* ignore */ }
  }
}

/** Get (or create) a SQLite database for the given userId */
export function getDb(userId?: string): InstanceType<typeof Database> {
  const key = userId || '_default'

  const cached = dbPool.get(key)
  if (cached) return cached

  const userDir = userId ? path.join(DATA_DIR, userId) : DATA_DIR
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true })
  }

  const dbPath = path.join(userDir, 'anima.db')
  const isNewDb = !fs.existsSync(dbPath)
  const database = new Database(dbPath)
  initSchema(database)

  // Auto-migrate legacy data when a userId db is created for the first time
  // SECURITY: migrateFromDefault checks userId matches the primary token owner
  if (isNewDb && userId) {
    migrateFromDefault(database, userId)
  }

  dbPool.set(key, database)

  // WAL checkpoint every 5 minutes per db
  const timer = setInterval(() => {
    try { database.pragma('wal_checkpoint(PASSIVE)') } catch { /* ignore */ }
  }, 5 * 60 * 1000)
  dbTimers.set(key, timer)

  return database
}

// ── Legacy default export (for backward compatibility during migration) ──────
// Default db is only used when no userId context is available (e.g. agent worker startup)

export const db = getDb()

/**
 * Return all currently active per-user databases (excludes the _default fallback).
 * Used by agentWorker to iterate over all tenants and process their tasks.
 */
export function getAllUserDbs(): Array<{ userId: string; db: InstanceType<typeof Database> }> {
  const result: Array<{ userId: string; db: InstanceType<typeof Database> }> = []
  // Scan the data directory for per-user subdirectories (12-char hex userId)
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // userId directories are 12-char hex strings
      if (!/^[0-9a-f]{12}$/.test(entry.name)) continue
      const userId = entry.name
      const dbPath = path.join(DATA_DIR, userId, 'anima.db')
      if (!fs.existsSync(dbPath)) continue
      result.push({ userId, db: getDb(userId) })
    }
  } catch (e) {
    console.warn('[db] getAllUserDbs scan failed:', e)
  }
  return result
}

// ── Type exports ─────────────────────────────────────────────────────────────

export type StorageRow = { filename: string; content: string; updated_at: string }
export type ConfigRow = { key: string; value: string; updated_at: string }
export type EmbeddingRow = { conversation_id: string; vector: Buffer; dim: number; updated_at: string }
export type UserProfileRow = {
  id: number; occupation: string | null; interests: string | null; tools: string | null;
  writing_style: string | null; goals: string | null; location: string | null;
  raw_notes: string | null; last_extracted: string | null; updated_at: string
}
export type AgentTaskRow = {
  id: number; type: string; payload: string; status: string; retries: number;
  created_at: string; started_at: string | null; finished_at: string | null; error: string | null
}
export type MemoryFactRow = {
  id: string; fact: string; source_conv_id: string | null; created_at: string; invalid_at: string | null
}
export type UploadedFileRow = {
  id: string; filename: string; mimetype: string; size: number;
  content: Buffer | null; text_content: string | null; conv_id: string | null;
  chunk_count: number; embed_status: string; created_at: string
}
export type FileEmbeddingRow = {
  id: string; file_id: string; chunk_index: number; chunk_text: string;
  vector: Buffer; dim: number; created_at: string
}
export type ConversationHistoryRow = {
  conversation_id: string; messages: string; updated_at: string
}
