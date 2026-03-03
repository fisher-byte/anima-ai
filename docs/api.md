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

**允许的文件名**（白名单）：
- `profile.json`
- `nodes.json`
- `conversations.jsonl`
- `settings.json`

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

从对话中自动摘取「关于用户的记忆事实」（写入 `memory_facts`）。

---

### 健康检查

#### GET /api/health

```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"2026-03-03T00:00:00.000Z"}
```

---

## 鉴权

`AUTH_ENABLED=false`（默认）时，所有 `/api/*` 端点无需鉴权，适合本地开发和内网部署。

`AUTH_ENABLED=true` 时，所有请求须携带：

```
Authorization: Bearer <ACCESS_TOKEN>
```

前端通过 `setAuthToken(token)` 注入 token：

```typescript
import { setAuthToken } from './services/storageService'
setAuthToken(localStorage.getItem('access_token') ?? '')
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
```

数据库文件位置由 `DATA_DIR` 环境变量控制（默认 `./data/anima.db`）。
