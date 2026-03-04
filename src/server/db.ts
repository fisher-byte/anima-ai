/**
 * SQLite database connection and schema initialization
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const DB_PATH = path.join(DATA_DIR, 'anima.db')

export const db = new Database(DB_PATH)

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Initialize schema
db.exec(`
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

  -- 向量记忆索引：每条对话的 embedding 向量（Float32 序列化为 BLOB）
  CREATE TABLE IF NOT EXISTS embeddings (
    conversation_id TEXT PRIMARY KEY,
    vector          BLOB NOT NULL,
    dim             INTEGER NOT NULL,
    updated_at      TEXT NOT NULL
  );

  -- 用户画像：singleton（id=1）
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

  -- 后台 Agent 任务队列
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

  -- 从对话中自动摘取的用户记忆事实（独立记忆板块）
  CREATE TABLE IF NOT EXISTS memory_facts (
    id             TEXT NOT NULL,
    fact           TEXT NOT NULL,
    source_conv_id TEXT,
    created_at     TEXT NOT NULL,
    invalid_at     TEXT,          -- 时效标记：不为空表示该事实已被新信息取代（软删除）
    PRIMARY KEY(id)
  );
  CREATE INDEX IF NOT EXISTS idx_memory_facts_created ON memory_facts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_memory_facts_source ON memory_facts(source_conv_id);

  -- 用户上传的文件（真实二进制存储）
  -- 注意：chunk_count / embed_status 由 migration 块按需添加（兼容旧数据库）
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

  -- 文件内容分块向量索引（独立于对话 embedding，避免混淆搜索结果）
  CREATE TABLE IF NOT EXISTS file_embeddings (
    id              TEXT NOT NULL,           -- chunk 唯一 ID
    file_id         TEXT NOT NULL,           -- 关联 uploaded_files.id
    chunk_index     INTEGER NOT NULL,        -- 第几块（0-based）
    chunk_text      TEXT NOT NULL,           -- 该块的原文
    vector          BLOB NOT NULL,           -- Float32 向量
    dim             INTEGER NOT NULL,
    created_at      TEXT NOT NULL,
    PRIMARY KEY(id)
  );
  CREATE INDEX IF NOT EXISTS idx_file_embeddings_file ON file_embeddings(file_id);
  CREATE INDEX IF NOT EXISTS idx_file_embeddings_created ON file_embeddings(created_at DESC);
`)

// ── 增量迁移（兼容老版本数据库） ─────────────────────────────────────────────
// SQLite 不支持 ADD COLUMN IF NOT EXISTS，用 try/catch 处理已存在的情况
const migrations = [
  'ALTER TABLE agent_tasks ADD COLUMN retries INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE memory_facts ADD COLUMN invalid_at TEXT',
  'ALTER TABLE uploaded_files ADD COLUMN chunk_count INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE uploaded_files ADD COLUMN embed_status TEXT NOT NULL DEFAULT 'pending'",
  'CREATE INDEX IF NOT EXISTS idx_uploaded_files_conv ON uploaded_files(conv_id)',
  'CREATE INDEX IF NOT EXISTS idx_uploaded_files_created ON uploaded_files(created_at DESC)',
  "CREATE INDEX IF NOT EXISTS idx_uploaded_files_embed ON uploaded_files(embed_status)",
  // file_embeddings 表在旧数据库中不存在，由 migration 负责建立
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
  // 部分索引：只索引有效（未失效）的 facts，加速 WHERE invalid_at IS NULL 查询
  'CREATE INDEX IF NOT EXISTS idx_memory_facts_active ON memory_facts(created_at DESC) WHERE invalid_at IS NULL'
]
for (const sql of migrations) {
  try { db.exec(sql) } catch { /* 列/索引已存在时忽略 */ }
}

// ── WAL checkpoint 定时任务（防止 WAL 文件无限增长）────────────────────────
// PASSIVE 模式：不阻塞正在进行的读写；每 5 分钟运行一次
setInterval(() => {
  try { db.pragma('wal_checkpoint(PASSIVE)') } catch { /* 忽略偶发错误 */ }
}, 5 * 60 * 1000)

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
