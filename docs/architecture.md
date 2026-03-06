# Anima 架构文档

*最后更新: 2026-03-06 | 版本: v0.2.45*

---

## 项目概述

Anima 是一个本地优先的 AI 画布应用。核心功能是**积累用户的记忆与偏好**，在每次对话中体现这些理解，让用户感到"被真正记住"。

**架构定位**：Web-first（Hono + React），Electron 作为可选桌面打包方式，两者共享同一套代码。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Hono 4.12（Node.js，轻量 HTTP + SSE） |
| 数据库 | better-sqlite3 12（WAL 模式，同步 API） |
| 前端框架 | React 18.2 + TypeScript 5.4 |
| 状态管理 | Zustand 4.5 |
| 样式 | Tailwind CSS 3.4 |
| 动画 | Framer Motion 12 |
| 构建 | Vite 5 + electron-vite 2（可选） |
| 桌面（可选） | Electron 29 |
| AI 接入 | OpenAI-compatible API（默认接 Kimi 2.5） |

---

## 目录结构

```
evocanvas/
├── src/
│   ├── server/                    # Hono 后端
│   │   ├── index.ts               # 服务入口（多租户中间件、路由注册）
│   │   ├── db.ts                  # SQLite 初始化、多租户连接池、getAllUserDbs()
│   │   ├── agentWorker.ts         # 后台 AI 任务 Worker（每 30s tick）
│   │   ├── routes/
│   │   │   ├── storage.ts         # 文件存储 API + 文件上传
│   │   │   ├── config.ts          # API Key / 模型设置
│   │   │   ├── ai.ts              # AI 代理（SSE 流式）
│   │   │   └── memory.ts          # 记忆 / 画像 / 向量检索
│   │   ├── middleware/
│   │   │   └── auth.ts            # Bearer Token 多租户鉴权
│   │   └── __tests__/
│   │       ├── server.test.ts     # HTTP 集成测试（含多租户 enqueueTask）
│   │       ├── ai-onboarding.test.ts  # onboarding 模式测试
│   │       └── memory.test.ts     # 记忆路由集成测试（含 FTS5 trigger、引用块过滤、decayPreferences）
│   │                              # 共 246 个测试用例
│   │
│   ├── renderer/                  # React 前端
│   │   └── src/
│   │       ├── components/        # UI 组件（Canvas / NodeCard / AnswerModal 等）
│   │       ├── stores/
│   │       │   └── canvasStore.ts # 主 Zustand Store（节点 / 对话 / 偏好 / 画布状态）
│   │       ├── services/
│   │       │   ├── storageService.ts  # 存储抽象层（自动适配 Web HTTP / Electron IPC）
│   │       │   └── ai.ts              # 前端 AI 调用（SSE 流解析）
│   │       └── hooks/
│   │           └── useAI.ts           # AI 调用 Hook
│   │
│   ├── services/                  # 纯函数业务逻辑（可复用、可单测）
│   │   ├── feedback.ts            # 负反馈检测 & 置信度计算
│   │   ├── profile.ts             # 偏好规则 CRUD
│   │   ├── prompt.ts              # Prompt 工具函数（触发词检测、灰字提示）
│   │   ├── fileParsing.ts         # PDF / Word 文档解析
│   │   └── __tests__/             # 单元测试
│   │
│   └── shared/                    # 共享类型和常量
│       ├── types.ts               # StorageService 接口、Node / Conversation 类型
│       └── constants.ts           # 文件名白名单、分类常量
│
├── e2e/                           # Playwright E2E 测试
├── data/                          # 用户数据（不进 git）
│   └── {userId}/anima.db          # 每用户独立 SQLite 数据库
├── dist/                          # Vite 前端构建产物
└── docs/                          # 文档
```

---

## 核心模块

### 1. 存储层

**Web 模式（默认）**：
- `src/server/index.ts` — Hono HTTP 服务，API Key 永不暴露给浏览器
- 数据写入 SQLite（`data/{userId}/anima.db`），多租户完全隔离
- `agentWorker.ts` — 后台 Worker，轮询 `agent_tasks` 表处理异步任务

**Electron 模式（可选桌面打包）**：
- `src/main/index.ts` — 主进程，`ipcMain` 提供安全的文件操作
- `src/preload/index.ts` — `contextBridge` 暴露安全 API 给渲染进程

**前端抽象层**：
- `src/renderer/src/services/storageService.ts` — 检测 `window.electronAPI` 自动适配 Web / Electron，上层代码无感知

### 2. SQLite 数据库 Schema

```sql
-- 文件存储（profile.json / nodes.json / conversations.jsonl）
CREATE TABLE storage (filename TEXT PRIMARY KEY, content TEXT, updated_at TEXT);

-- 应用配置（apiKey / model / baseUrl / preference_rules）
CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);

-- 对话向量索引（RAG 检索用）
CREATE TABLE embeddings (conversation_id TEXT PRIMARY KEY, vector BLOB, dim INTEGER, updated_at TEXT);

-- 用户画像（AI 后台提取）
CREATE TABLE user_profile (id INTEGER PRIMARY KEY CHECK (id = 1),
  occupation TEXT, interests TEXT, tools TEXT, writing_style TEXT,
  goals TEXT, location TEXT, raw_notes TEXT, last_extracted TEXT, updated_at TEXT);

-- 后台任务队列
CREATE TABLE agent_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT, payload TEXT, status TEXT, retries INTEGER,
  created_at TEXT, started_at TEXT, finished_at TEXT, error TEXT);

-- 记忆事实（软删除）
CREATE TABLE memory_facts (id TEXT PRIMARY KEY, fact TEXT,
  source_conv_id TEXT, created_at TEXT, invalid_at TEXT);

-- 上传文件（含二进制）
CREATE TABLE uploaded_files (id TEXT PRIMARY KEY, filename TEXT, mimetype TEXT,
  size INTEGER, content BLOB, text_content TEXT, conv_id TEXT,
  chunk_count INTEGER, embed_status TEXT, created_at TEXT);

-- 文件分块向量（语义搜索）
CREATE TABLE file_embeddings (id TEXT PRIMARY KEY, file_id TEXT,
  chunk_index INTEGER, chunk_text TEXT, vector BLOB, dim INTEGER, created_at TEXT);

-- 服务端对话历史（多轮上下文，最多 100 条）
CREATE TABLE conversation_history (conversation_id TEXT PRIMARY KEY,
  messages TEXT, updated_at TEXT);
```

### 3. 多租户架构

```
ACCESS_TOKENS=token_a,token_b,token_c   # 环境变量

请求携带 Bearer token_a
  ↓
auth.ts: tokenToUserId('token_a') → SHA-256 前 12 位 hex → "a1b2c3d4e5f6"
  ↓
index.ts 中间件: c.set('db', getDb('a1b2c3d4e5f6'))
  ↓
所有路由通过 c.get('db') 操作该用户专属的 data/a1b2c3d4e5f6/anima.db
```

- 每个用户数据库完全隔离，互不可见
- `agentWorker` 后台任务通过 `getAllUserDbs()` 遍历所有用户数据库，用正确的 db 处理各自任务
- 老数据（legacy `data/anima.db`）首次建库时自动迁移到主用户目录，且只迁移一次（`.migrated` 哨兵文件）

### 4. Agent Worker（后台任务系统）

每 30 秒轮询所有用户数据库中的 `agent_tasks` 表：

| 任务类型 | 触发时机 | 做什么 |
|---------|---------|-------|
| `extract_profile` | 对话结束后入队 | AI 从用户发言提取职业 / 兴趣 / 工具等画像增量 |
| `extract_preference` | 对话结束后入队 | AI 判断用户反馈是否含偏好规则，写入 profile.json |
| `embed_file` | 文件上传后入队 | 对文件文本分块并生成向量，存入 file_embeddings |
| `consolidate_facts` | 每满 20 条 memory_facts 自动入队 | AI 合并语义重叠的记忆条目 |

特性：指数退避重试（最多 3 次）、崩溃恢复（服务重启时将 running 状态重置为 pending）、7 天旧任务清理。

### 5. AI 代理（SSE 流式）

`POST /api/ai/stream` 的 System Prompt 分层注入（优先级从高到低）：

```
1. 进化基因（preference_rules）— 用户习得的行为偏好
2. 用户画像（user_profile）— AI 后台提炼的结构化画像
3. 记忆事实（memory_facts）— 记忆碎片，语义检索最相关的
4. 压缩记忆（前端传入）— 本次对话相关的历史对话摘要
```

支持工具调用（`$web_search`，Kimi 2.5 原生联网），工具结果自动进入第二轮请求。

### 6. 状态管理（Zustand）

**文件**: `src/renderer/src/stores/canvasStore.ts`

核心状态分区：

| 分区 | 字段 |
|------|------|
| 画布数据 | `nodes`, `edges` |
| 对话 | `currentConversation`, `conversationHistory`, `isModalOpen` |
| 用户画像 | `profile`（包含 `rules` 偏好规则数组） |
| 认证 | `authed`, `userId` |
| 引导 | `onboardingState`, `capabilityNodes` |
| 视口 | `offset`, `scale` |
| 交互 | `selectedNodeId`, `highlightedNodeIds`, `searchQuery` |

---

## 数据流

```
用户输入 → InputBox → canvasStore.startConversation()
    ↓ (立即打开 modal，不等记忆检索)
    ├── 异步: getRelevantMemories() → /api/memory/search (向量检索)
    │         结果用于画布节点高亮，不阻塞对话
    │
    ↓
POST /api/ai/stream (SSE)
    ├── 服务端读取用户 db 中的 apiKey / preferences / profile / memory_facts
    ├── 构建分层 System Prompt
    ├── 代理 Kimi API，转发 SSE 流
    └── 工具调用时自动执行第二轮
    ↓
用户看到流式回复 → canvasStore.endConversation()
    ├── 话题拆分：多意图时自动分裂为多个节点
    ├── addNode() → 螺旋搜索同类岛屿附近空位 → 写入 nodes.json
    ├── appendConversation() → 追加 conversations.jsonl
    ├── /api/memory/index → 生成对话向量索引
    ├── /api/memory/extract → 提取记忆事实（异步）
    └── /api/memory/queue (extract_profile / extract_preference) → 入队后台任务
```

---

## 画布渲染性能架构

**关键设计，请勿随意改动：**

- `offset` / `scale` **完全存在 `viewRef`**，不走 React state；缩放期间零重渲染
- `applyTransform()` 直接操作 `contentLayerRef.current.style.transform`，绕过 React
- wheel 事件用 `{ passive: false }` 监听，按帧累计 delta，每帧只触发一次 RAF
- **300ms debounce** 后才做唯一一次 `store.setState`，驱动 LOD 切换
- `useLodScale` 用 `store.subscribe()`（非 React hook）订阅 scale；只在跨越 LOD 阈值时 `setState`
- `NodeCard` 用细粒度 selector 订阅（各字段独立订阅），避免全量 re-render
- 节点漂浮动画用纯 CSS `@keyframes`（compositor thread），不用 Framer Motion `repeat: Infinity`

---

## 偏好学习流程

1. **检测**: 用户对话中含触发词（"简洁点"、"太长了"、"别用这个"……）
2. **入队**: `endConversation` 后写入 `extract_preference` 后台任务
3. **AI 提取**: agentWorker 用小模型判断并提炼偏好规则文字
4. **存储**: 写入用户 db 的 `storage.profile.json` + `config.preference_rules`（双写保持兼容）
5. **去重**: 新规则与已有规则子串比对，避免语义重复写入；启动时也做全量去重
6. **应用**: 下次对话时，`preference_rules` 作为 System Prompt 最高优先级注入
7. **提示**: 偏好被应用时，回答层顶部显示灰色小字提示

---

## 配置说明

### 环境变量

```bash
PORT=3000                  # 服务端口（默认 3000）
DATA_DIR=./data            # SQLite 数据目录
AUTH_DISABLED=false        # true = 本地开发免登录
ACCESS_TOKEN=xxx           # 单用户 token
ACCESS_TOKENS=a,b,c        # 多租户，逗号分隔
ONBOARDING_API_KEY=xxx     # 演示用途（新用户引导时临时使用）
```

API Key 不在环境变量中设置，启动后在 UI 设置页面填写，存入 SQLite config 表。

---

## 扩展点

1. **接入其他模型**: 在 UI 设置中修改 `baseUrl` 和 `model`，兼容任何 OpenAI-compatible 接口
2. **新的偏好触发词**: `src/services/feedback.ts` 的 `NEGATIVE_TRIGGERS` 数组
3. **新的分类**: `src/renderer/src/stores/canvasStore.ts` 的 `detectIntent` 函数
4. **新的后台任务类型**: `agentWorker.ts` 的 `processTask` switch 分支 + `enqueueTask` 调用
5. **导入/导出**: `/api/storage/export` 已支持全量 JSON 导出

---

## 安全模型

| 机制 | 实现 |
|------|------|
| 多租户隔离 | SHA-256 token → userId → 独立 SQLite 文件 |
| API Key 保护 | 存服务端 SQLite，不暴露给浏览器 |
| 文件路径防护 | 白名单验证，拒绝 `..` `/` `\` |
| 时序安全比较 | `timingSafeEqual` 防止 timing attack |
| 文件类型校验 | MIME 白名单 + 魔数（magic bytes）双重校验 |
| SQL 注入防护 | 全量使用 better-sqlite3 预编译 statement |
