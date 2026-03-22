# Anima API 文档

## 架构说明

v0.3.0 起，Anima 重构为 Web 全栈应用。所有存储和 AI 调用均通过 HTTP API 完成，API Key 永不暴露给浏览器。

**前端访问方式**：通过 `storageService` / `configService` 抽象层，自动适配 Web（HTTP）和 Electron（IPC）两种运行环境。

---

## HTTP API 端点

所有端点前缀 `/api/*`，均经过鉴权中间件（见[鉴权说明](#鉴权)）。

### 存储 API

#### GET /api/storage/:filename

读取文件内容。

- **响应**：`200 text/plain`（文件内容）或 `404`（不存在）

```bash
curl http://localhost:3000/api/storage/nodes.json
```

#### PUT /api/storage/:filename

写入文件内容（覆盖）。

- **请求 Body**：`text/plain`（原始文本）
- **响应**：`200 { "ok": true }`

```bash
curl -X PUT http://localhost:3000/api/storage/nodes.json \
  -H "Content-Type: text/plain" \
  -d '[]'
```

#### POST /api/storage/:filename/append

追加一行到文件（JSONL 格式）。自动在行尾添加换行符，幂等设计。

- **请求 Body**：`text/plain`（一行 JSON）
- **响应**：`200 { "ok": true }`

```bash
curl -X POST http://localhost:3000/api/storage/conversations.jsonl/append \
  -H "Content-Type: text/plain" \
  -d '{"id":"uuid","userMessage":"hello"}'
```

**允许的文件名**（白名单，节选）：
- `profile.json`
- `nodes.json`
- `conversations.jsonl`
- `decision-personas.json`
- `decision-units.json`
- `decision-source-manifest.json`
- `settings.json`

说明：
- Public Space / Custom Space 还包含各自的 `*-nodes.json` / `*-conversations.jsonl` / `*-edges.json`
- 自定义 Space 文件名通过模式校验：`custom-{8位小写字母数字}-{nodes|conversations|edges}`

---

### 配置 API

#### GET /api/config/apikey

获取已存储的 API Key。

- **响应**：`200 { "apiKey": "sk-..." }`（未设置时返回空字符串）

```bash
curl http://localhost:3000/api/config/apikey
```

#### PUT /api/config/apikey

存储 API Key（保存在服务端 SQLite，不经过浏览器）。

- **请求 Body**：`application/json { "apiKey": "sk-..." }`
- **响应**：`200 { "ok": true }`

```bash
curl -X PUT http://localhost:3000/api/config/apikey \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-your-key"}'
```

#### GET /api/config/settings

获取模型和 API 地址配置。

- **响应**：`200 { "model": "kimi-k2.5", "baseUrl": "https://api.moonshot.cn/v1" }`

#### PUT /api/config/settings

保存模型和 API 地址配置。

- **请求 Body**：`application/json { "model"?: string, "baseUrl"?: string }`
- **响应**：`200 { "ok": true }`

---

### AI 代理 API

#### POST /api/ai/stream

流式 AI 调用代理。服务端从 DB 读取 API Key，转发到 Kimi/OpenAI，将流以 SSE 形式返回。

- **请求 Body**：

```typescript
{
  messages: AIMessage[]          // 对话历史（不含 system，由服务端注入）
  preferences?: string[]         // 用户偏好列表（注入 system prompt）
  compressedMemory?: string      // 压缩后的相关记忆文本
  systemPromptOverride?: string  // Space / persona 覆盖 prompt
  extraContext?: string          // 额外证据上下文（如 LingSi DecisionUnit 命中结果）
}
```

- **响应**：`text/event-stream` (SSE)

**SSE 事件格式**：

```
data: {"type":"content","content":"逐字输出..."}
data: {"type":"reasoning","content":"推理过程..."}
data: {"type":"done","fullText":"完整回答"}
data: {"type":"error","message":"错误信息"}
```

**示例（curl）**：

```bash
curl -X POST http://localhost:3000/api/ai/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

**工具调用**：服务端自动处理 Kimi 的 `$web_search` tool call 二轮请求，前端透明。

---

### 记忆 / 画像 API

用于「记忆面板」「用户画像」「全量重置（新手教程体验）」。

#### POST /api/memory/index

为一条对话建立向量索引（RAG 检索用）。

- **请求 Body**：`application/json { conversationId: string, text: string }`
- **响应**：`200 { ok: true, dim: number }`

#### DELETE /api/memory/index/:id

删除一条对话的向量索引（按 `conversationId`）。

#### DELETE /api/memory/index

清空全部向量索引（用于全量重置/重新体验新手教程）。

#### POST /api/memory/search

向量检索。

- **请求 Body**：`application/json { query: string, topK?: number }`
- **响应**：`200 { results: { conversationId: string, score: number }[] }`

#### GET /api/memory/profile

读取用户画像（singleton）。

#### PUT /api/memory/profile

更新用户画像（merge 语义，适合增量写入）。

#### DELETE /api/memory/profile

清空用户画像（用于全量重置/重新体验新手教程）。

#### GET /api/memory/facts

读取全部记忆事实（最多 200 条，按时间倒序）。

#### DELETE /api/memory/facts/:id

删除单条记忆事实。

#### DELETE /api/memory/facts

清空全部记忆事实（用于全量重置/重新体验新手教程）。

#### POST /api/memory/extract

从对话中自动摘取「关于用户的记忆事实」，写入 `memory_facts` 表。

- **请求 Body**：`application/json { conversationId?: string, userMessage: string, assistantMessage?: string }`
- **响应**：`200 { ok: boolean, extracted: number, skipped?: boolean }`
- **说明**：同一对话幂等（已提取过则跳过）；无 API Key 时返回 `{ ok: false, reason: "no api key" }`

---

### 对话历史 API

跨会话持久化 `AIMessage[]`，使多轮对话在刷新后可完整恢复。

#### GET /api/storage/history/:conversationId

获取指定对话的 AI 消息历史。

- **响应**：`200 { messages: AIMessage[] }`（不存在时返回空数组）

```bash
curl http://localhost:3000/api/storage/history/conv-uuid-here
```

#### PUT /api/storage/history/:conversationId

保存指定对话的 AI 消息历史（覆盖写入）。

- **请求 Body**：`application/json { messages: AIMessage[] }`
- **响应**：`200 { ok: true }` 或 `400`（messages 非数组）
- **说明**：自动截断至最近 100 条消息，防止单条历史无限增长

```bash
curl -X PUT http://localhost:3000/api/storage/history/conv-uuid-here \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"},{"role":"assistant","content":"你好！"}]}'
```

#### DELETE /api/storage/history/:conversationId

删除指定对话的历史（节点删除时自动调用）。

- **响应**：`200 { ok: true }`

---

### 文件存储 API

#### POST /api/storage/file

上传文件到后端（存储原始二进制 + 文本内容，并排入 `embed_file` 向量化队列）。

- **请求 Body**：`multipart/form-data`，字段：`file`（二进制）、`id`（UUID）、`textContent`（已解析文本）
- **响应**：`200 { ok: true }` 或 `413`（超 50MB）、`415`（不支持类型）

```bash
curl -X POST http://localhost:3000/api/storage/file \
  -F "file=@/path/to/doc.pdf" \
  -F "id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  -F "textContent=解析后的文本内容"
```

#### GET /api/storage/file/:id

下载文件原始内容（按 `id` 获取）。

- **响应**：`200 application/octet-stream`（文件二进制）或 `404`

```bash
curl http://localhost:3000/api/storage/file/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
  -o output.pdf
```

#### GET /api/storage/files

列出所有上传过的文件（元数据，不含二进制）。

- **响应**：`200 { files: [{ id, filename, mimetype, size, embed_status, created_at }] }`

#### GET /api/storage/export

导出全部对话数据（nodes.json + conversations.jsonl）为 ZIP 文件。

- **响应**：`200 application/zip`

---

### 记忆搜索补充

#### POST /api/memory/search/by-id

以已有节点向量做 k-NN 相似度搜索，无需额外 embedding 调用。适用于新节点创建后异步查找语义相似节点（语义边构建场景）。

- **请求 Body**：`application/json { conversationId: string, topK?: number, threshold?: number }`
  - `conversationId`：源节点的对话 ID（必填）
  - `topK`：返回结果数量，范围 1–20，默认 8
  - `threshold`：余弦相似度下限，范围 0–1，默认 0.65
- **响应**：`200 { results: [{ conversationId: string, score: number }] }`
  - 源节点未建立索引时返回 `{ results: [], reason: 'source not indexed' }`
- **说明**：
  - `score` 为余弦相似度（0–1），越高越相似
  - 仅返回记忆节点，排除 `file-` 前缀的文件分块向量
  - 需要源节点已完成向量索引（调用过 `/api/memory/index`）

```bash
curl -X POST http://localhost:3000/api/memory/search/by-id \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"conversationId":"conv-uuid-here","topK":5,"threshold":0.7}'
```

---

#### POST /api/memory/search/files

文件内容语义搜索（独立端点，搜 `file_embeddings` 表，不混入对话搜索）。

- **请求 Body**：`application/json { query: string, topK?: number }`（topK 默认 3，最大 10）
- **响应**：`200 { results: [{ fileId, filename, chunkIndex, chunkText, score }] }`
- **说明**：无 API Key 或 embedding 失败时返回 `{ results: [], fallback: true }`

```bash
curl -X POST http://localhost:3000/api/memory/search/files \
  -H "Content-Type: application/json" \
  -d '{"query":"架构设计方案","topK":3}'
```

---

### 记忆任务队列

#### POST /api/memory/queue

向后台 Agent 任务队列写入任务（fire-and-forget）。

- **请求 Body**：`application/json { type: string, payload: object }`
- **响应**：`200 { ok: true }`

```bash
curl -X POST http://localhost:3000/api/memory/queue \
  -H "Content-Type: application/json" \
  -d '{"type":"extract_profile","payload":{"conversationId":"xxx"}}'
```

#### POST /api/memory/consolidate

手动触发记忆 facts 合并整理（将语义重叠/过时条目合并，新信息优先保留）。合并任务以 `consolidate_facts` 类型入队，由 `agentWorker` 后台处理（约 30s 内完成）。

- **请求 Body**：无
- **响应**：`200 { ok: true }`（任务已入队，非同步完成）
- **说明**：幂等，若队列中已有待执行的同类型任务，不重复入队

```bash
curl -X POST http://localhost:3000/api/memory/consolidate \
  -H "Authorization: Bearer <token>"
```

#### POST /api/memory/classify

将用户消息语义分类到六大类之一。**三层降级策略**（v0.2.58）：

1. **层1 — 原型向量**（默认，内置 DashScope key，无需用户配置 API Key）：将文本 embedding 与六类预计算原型向量做余弦相似度，取最高分分类
2. **层2 — LLM 分类**（层1 失败时）：调用用户配置的 chat/completions 端点做语义分类
3. **层3 — null**（无 API Key 且层1失败时）：返回 null，由前端降级到关键词全量计分

服务器启动时调用 `initCategoryPrototypes()` 预热原型向量，正常情况层1始终可用。

- **请求 Body**：`application/json { text: string }`
- **响应**：`200 { category: string | null }` — 六类之一（日常生活/日常事务/学习成长/工作事业/情感关系/思考世界）或 null

```bash
curl -X POST http://localhost:3000/api/memory/classify \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"text": "ai会取代人类吗"}'
# → {"category": "思考世界"}
```

#### PUT /api/memory/facts/:id

更新单条记忆事实内容。

- **请求 Body**：`application/json { fact: string }`
- **响应**：`200 { ok: true }` 或 `404`（ID 不存在）

```bash
curl -X PUT http://localhost:3000/api/memory/facts/123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"fact":"更新后的记忆内容"}'
```

---



#### GET /api/health

```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"2026-03-03T00:00:00.000Z"}
```

---

## 鉴权

### v0.5.40+（当前行为，多租户身份码）

- **`GET /api/health`**、**`GET /api/auth/status`** 为公开端点，无需 Bearer。
- 当 **未**设置 `AUTH_DISABLED=true` **且** 配置了 `ACCESS_TOKEN` 或 `ACCESS_TOKENS`（与 `/api/auth/status` 的 `authRequired` 一致）时：
  - 其余 **`/api/*` 请求必须**携带非空 `Authorization: Bearer <身份码>`，否则返回 **401**。
  - 身份码映射为 `tokenToUserId`（SHA-256 前 12 位 hex），数据落在 `data/<userId>/anima.db`，**禁止**无身份请求落入共享默认库 `data/anima.db`。
- 当 `AUTH_DISABLED=true` 或未配置任何 `ACCESS_TOKEN(S)` 时：允许无 Bearer（本地开发）；若仍带 Bearer，则使用该 token 做用户隔离。

| 环境变量 | 说明 |
|---------|------|
| `AUTH_DISABLED=true` | 跳过强制 Bearer（本地开发、单机调试） |
| `ACCESS_TOKEN` / `ACCESS_TOKENS` | 存在且未禁用时触发 `authRequired`；浏览器**首访自动生成**身份码（UUID）写入 `anima_user_token` 并随请求携带 Bearer（v0.5.50+，不再要求手填访问令牌页） |

前端通过 `setAuthToken(token)` 注入 token（与 `localStorage` 中 `anima_access_token` / `anima_user_token` 对齐）：

```typescript
import { setAuthToken } from './services/storageService'
setAuthToken(localStorage.getItem('anima_access_token') ?? localStorage.getItem('anima_user_token') ?? '')
```

---

## 前端 storageService 接口

`src/renderer/src/services/storageService.ts` 导出的抽象层，上层 Store 无需关心运行环境。

### storageService

```typescript
import { storageService } from '../services/storageService'

// 读取
const content = await storageService.read('profile.json')        // string | null

// 写入（覆盖）
await storageService.write('nodes.json', JSON.stringify(nodes))  // boolean

// 追加（JSONL）
await storageService.append('conversations.jsonl', JSON.stringify(conv)) // boolean
```

### configService

```typescript
import { configService } from '../services/storageService'

// API Key
const key = await configService.getApiKey()            // string
await configService.setApiKey('sk-...')                // boolean

// 模型/地址
const { model, baseUrl } = await configService.getSettings()
await configService.saveSettings({ model: 'kimi-k2.5', baseUrl: 'https://...' })
```

### setAuthToken

```typescript
import { setAuthToken } from '../services/storageService'
setAuthToken('your-bearer-token')  // 仅 Web 模式有效
```

---

## 前端 AI 服务接口

`src/renderer/src/services/ai.ts`（调用 `/api/ai/stream`）

### streamAI(messages, preferences?, signal?, compressedMemory?)

异步生成器，逐 chunk 产出。

```typescript
import { streamAI } from '../services/ai'

for await (const chunk of streamAI(messages, preferences, signal, compressedMemory)) {
  if (chunk.type === 'content') console.log(chunk.content)
  if (chunk.type === 'reasoning') console.log('[思考]', chunk.content)
}
```

### callAI(messages, preferences?)

非流式，收集完整回答后返回。

```typescript
import { callAI } from '../services/ai'

const { content, error } = await callAI(messages, preferences)
```

---

## 类型定义

与原版完全一致，见 `src/shared/types.ts`：

```typescript
interface StorageService {
  read(filename: string): Promise<string | null>
  write(filename: string, content: string): Promise<boolean>
  append(filename: string, content: string): Promise<boolean>
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | any[]
  tool_calls?: any[]
  tool_call_id?: string
  reasoning_content?: string
}

interface AIStreamChunk {
  type: 'content' | 'reasoning'
  content: string
}
```

---

## SQLite Schema

```sql
-- 文件存储
CREATE TABLE storage (
  filename   TEXT PRIMARY KEY,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- 应用配置（apiKey, model, baseUrl 等）
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 对话 AI 消息历史（跨会话多轮上下文恢复，v0.2.20+）
CREATE TABLE conversation_history (
  conversation_id TEXT PRIMARY KEY,
  messages        TEXT NOT NULL DEFAULT '[]',  -- JSON AIMessage[]
  updated_at      TEXT NOT NULL
);
```

数据库文件位置由 `DATA_DIR` 环境变量控制（默认 `./data/anima.db`）。
