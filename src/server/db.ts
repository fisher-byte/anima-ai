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
    PRIMARY KEY(id)
  );
  CREATE INDEX IF NOT EXISTS idx_memory_facts_created ON memory_facts(created_at DESC);

  -- 用户上传的文件（真实二进制存储）
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
`)

export type StorageRow = { filename: string; content: string; updated_at: string }
export type ConfigRow = { key: string; value: string; updated_at: string }
export type EmbeddingRow = { conversation_id: string; vector: Buffer; dim: number; updated_at: string }
export type UserProfileRow = {
  id: number; occupation: string | null; interests: string | null; tools: string | null;
  writing_style: string | null; goals: string | null; location: string | null;
  raw_notes: string | null; last_extracted: string | null; updated_at: string
}
export type AgentTaskRow = {
  id: number; type: string; payload: string; status: string;
  created_at: string; started_at: string | null; finished_at: string | null; error: string | null
}
export type MemoryFactRow = {
  id: string; fact: string; source_conv_id: string | null; created_at: string
}
export type UploadedFileRow = {
  id: string; filename: string; mimetype: string; size: number;
  content: Buffer | null; text_content: string | null; conv_id: string | null; created_at: string
}
