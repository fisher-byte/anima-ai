# Anima 架构文档

*最后更新: 2026-03-18 | 版本: v0.5.22*

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
│   │   ├── agentWorker.ts         # 后台 AI 任务 Worker（调度入口，每 30s tick）
│   │   ├── agentTasks.ts          # AI 后台任务实现（consolidateFacts / extractProfile 等）
│   │   ├── routes/
│   │   │   ├── storage.ts         # 文件存储 API + 文件上传
│   │   │   ├── config.ts          # API Key / 模型设置
│   │   │   ├── ai.ts              # AI 代理（SSE 流式）
│   │   │   └── memory.ts          # 记忆 / 画像 / 向量检索
│   │   ├── lib/
│   │   │   └── embedding.ts       # 共享 embedding 工具库（fetchEmbedding / embedTextWithUserKey / cosineSim 等）
│   │   ├── middleware/
│   │   │   └── auth.ts            # Bearer Token 多租户鉴权
│   │   └── __tests__/
│   │       ├── server.test.ts              # HTTP 路由测试（health/storage/config/auth，testDb 作用域）
│   │       ├── server-integration.test.ts  # memory/agent/file 集成测试（memDb/fileDb 作用域）
│   │       ├── server-ai.test.ts           # readRound/澄清层/search_round 纯逻辑测试
│   │       ├── ai-onboarding.test.ts       # onboarding 模式测试
│   │       └── memory.test.ts              # 记忆路由集成测试
│   │
│   ├── renderer/                  # React 前端
│   │   └── src/
│   │       ├── components/        # UI 组件（Canvas / NodeCard / AnswerModal / AnswerModalSubcomponents 等）
│   │       ├── stores/
│   │       │   └── canvasStore.ts # 主 Zustand Store（节点 / 对话 / 偏好 / 画布状态 / 语义边）
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
│       ├── constants.ts           # 文件名白名单、分类常量、Space system prompts
│       ├── pgData.ts              # Paul Graham Space 种子节点 / 边数据（35 nodes）
│       ├── zhangData.ts           # 张小龙 Space 种子节点 / 边数据（35 nodes）
│       └── wangData.ts            # 王慧文 Space 种子节点 / 边数据（30 nodes）
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

**LingSi 数据资产**：
- `decision-personas.json`
- `decision-units.json`
- `decision-source-manifest.json`

这三份文件同样存放在 `storage` 表中，不新增数据库表。设计目标是先复用现有存储与鉴权链路，再在应用层做 schema 约束和人工审核流程。

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

### 5. 语义边系统（知识图谱化）

每个新记忆节点创建后，系统异步构建与其他节点的语义关联边：

1. **触发**：`addNode()` 完成后，300ms 延迟触发 `_buildSemanticEdgesForNode()`
2. **检索**：调用 `POST /api/memory/search/by-id`，使用已有节点向量做 k-NN，无额外 embedding 开销
3. **过滤**：余弦相似度 ≥ 0.65，每节点最多生成 5 条语义边，全局上限 200 条
4. **渲染**：语义边（`edgeType: 'semantic'`）显示为紫色虚线（rgba(139,92,246,0.9)，`strokeDasharray="4 4"`）；weight 0.65→1px，1.0→3.5px；透明度 0.1–0.4
5. **边标签**：score ≥ 0.85 → "强关联"，≥ 0.75 → "关联"，其他 → "相关"
6. **持久化**：语义边单独存储在 `semantic-edges.json`，与普通结构边（branch/category）分离
7. **历史回算**：首次加载时若 `semantic-edges.json` 不存在，串行处理所有历史节点（每节点间隔 200ms），用户可实时看到图谱"生长"

**Embedding 共享库**（v0.5.1+）：所有 embedding 相关工具函数统一提取到 `src/server/lib/embedding.ts`，包含 `fetchEmbedding`、`fetchMultimodalEmbedding`、`embedTextWithUserKey`、`vecToBuffer`、`bufferToVec`、`cosineSim`。`memory.ts` 和 `ai.ts` 均从该 lib import，消除三处重复实现。`agentWorker.ts` 通过 `memory.ts` re-export 维持动态 import 兼容性。Embedding 使用阿里云 DashScope（`text-embedding-v4`，2048 维），用户无需额外配置。

### 6. AI 代理（SSE 流式）

`POST /api/ai/stream` 的 System Prompt 分层注入（优先级从高到低）：

```
1. 进化基因（preference_rules）— 用户习得的行为偏好
2. 用户画像（user_profile）— AI 后台提炼的结构化画像
3. 记忆事实（memory_facts）— 记忆碎片，语义检索最相关的
4. 压缩记忆（前端传入）— 本次对话相关的历史对话摘要
```

支持工具调用（`$web_search`，Kimi 2.5 原生联网），工具结果自动进入第二轮请求。

**LingSi（当前已扩到产品状态包）**：
- `Lenny` 与 `张小龙` 决策版沿用 `systemPromptOverride`，并新增 `extraContext` 注入 DecisionUnit 命中结果
- 首次打开支持决策的 Space 时，前端会把真实 `seeds/lingsi/*` 资产写入 `storage` 表，包含 `decision-product-state.json`，避免依赖 mock
- 主页 `@persona` 对支持决策的 persona 改为 decision-only 调用；结构化 mention token 会把 `invokedAssistant` 与 `decisionTrace` 写入对话元数据，但输入框只展示纯 `@名字`
- 当问题命中当前项目关键词（如 `Anima / 首页 / @ / 轨迹 / 决策模式`）时，决策链路会额外注入结构化产品状态包，让 persona 理解当前版本与已知风险
- `decision-product-state.json` 的动态字段由 `npm run lingsi:state-pack` 从 `changelog`、评测报告和 seeds 基线自动刷新，减少人工漂移
- 命中的证据会进入对话元数据 `decisionTrace`：`mode`、`personaId`、`matchedDecisionUnitIds`、`sourceRefs`
- `AnswerModal` 现已提供独立决策轨迹视图；trace modal 通过 portal 渲染，且在流式输出期间禁用打开，避免页面卡死
- 来源真相库保留在独立仓库 `anima-base/`，主项目只导入必要子集；当前基线为 `2 personas / 37 sources / 59 approved units`，最新同步 head 为 `083974d`，详见 `docs/lingsi-flywheel.md`

**v0.3.2 新增能力：**

- **URL 内容预取**：在 `streamSSE` 回调内检测 `trimmedText` 中的 URL（最多 2 个），通过 Jina Reader 抓取 Markdown 内容（≤8000 字符），作为额外 system 消息注入上下文，在 CONTEXT_BUDGET 之外
- **url_fetch SSE 事件**：URL 预取时发送进度事件（`status: "fetching" | "done" | "failed"`），前端可展示实时进度
- **search_memory function calling**：AI 可主动调用 `search_memory` 工具查询用户记忆库，服务端本地拦截执行 `fetchRelevantFacts`；续轮请求统一使用 `TOOLS_WITH_MEMORY`（含 `$web_search` + `search_memory`）
- **search_files function calling**：AI 可主动调用 `search_files` 工具检索历史上传文件内容，`searchFileChunks` 函数通过 embedding 余弦相似度从 `file_embeddings` 表返回最相关的 5 个文件片段；支持跨对话引用历史文件
- **usage SSE 事件**：流式响应结束后发送 token 用量反馈（`totalTokens`, `model`），供前端展示消耗

**v0.4.3 记忆评分系统（Memory Quality v1）：**

- **MEMORY_STRATEGY 环境变量**：`baseline`（默认，原有行为）| `scored`（激活评分策略）
- **MEMORY_DECAY 环境变量**：`false`（默认）| `true`（指数时间衰减，半衰期 69 天）
- **fetchScoredFacts**：在 `baseline` 的语义检索基础上，叠加 importance + decay + accessBonus 综合评分
  - `finalScore = applyDecay(cosine, created_at) * (0.7 + importance * 0.3) + accessBonus`
  - `accessBonus = min(0.15, access_count * 0.02)`
- **memory_scores.json**：存于 SQLite `storage` 表（`filename='memory_scores.json'`），格式 `{ fact_id: { importance, emotion, access_count, last_accessed_at } }`；access_count 在每次检索后通过 `setImmediate` 异步写回，不阻塞响应

**v0.4.4 会话级记忆摘要（Session Memory）：**

- **session_memory.json**：存于 SQLite `storage` 表（`filename='session_memory.json'`），格式 `{ conv_id: { summary, turn_count, updated_at } }`
- **触发条件**：对话结束后，用户轮数 ≥ 10 且当前 convId 无已有摘要，通过 `setImmediate` 异步调用 `generateSessionSummary`
- **注入位置**：系统提示层 3.5（在动态事实层 3 之后、压缩记忆层 4 之前），置于 CONTEXT_BUDGET 之外（始终注入，不受 token 预算截断）
- **自动清理**：`saveSessionMemory` 保留最近 50 条会话摘要，按 `updated_at` 淘汰最旧

**v0.4.5 MEMORY_BUDGET 环境变量：**

- **MEMORY_BUDGET**：控制 system prompt 注入层总 token 预算（默认 1500）；`parseInt(MEMORY_BUDGET ?? '1500') || 1500`，非数字/空值安全降级

### 7. Public Space 架构（v0.4.0+）

Anima 支持多个「Public Space」：可与知名人物的思维模型对话，每个 Space 完全独立于用户私有记忆。

**已内置 Space**：

| Space | 文件前缀 | 种子节点数 | 主题色 | 数据来源 |
|-------|---------|---------|-------|---------|
| Lenny Rachitsky | `lenny-` | ~40 | gray-900 | anima-base/people/product/lenny |
| Paul Graham | `pg-` | ~35 | gray-900 | anima-base/people/startup/paul-graham |
| 张小龙 | `zhang-` | 35 | gray-900 | anima-base/people/product/zhang-xiaolong |
| 王慧文 | `wang-` | 30 | gray-900 | anima-base/people/product/wang-huiwen |

**存储隔离**：每个 Space 有独立的 `{prefix}-nodes.json` / `{prefix}-conversations.jsonl` / `{prefix}-edges.json`，与用户主空间（`nodes.json` / `conversations.jsonl`）完全隔离，互不污染。

**模式切换机制**（`canvasStore.ts`）：
```typescript
// isLennyMode=true 是"在某个 Space 中"的总开关
// isPGMode / isZhangMode / isWangMode 区分具体 Space
openZhangMode() → set({ isLennyMode: true, isZhangMode: true, isPGMode: false, isWangMode: false })
```

所有文件路由（5 处）均使用 4-way ternary：
```typescript
isPGMode ? PG_NODES : isZhangMode ? ZHANG_NODES : isWangMode ? WANG_NODES : LENNY_NODES
```

**System Prompt 路由**（`AnswerModal.tsx`）：
```typescript
const spacePrompt = isPGMode ? PG_SYSTEM_PROMPT : isZhangMode ? ZHANG_SYSTEM_PROMPT
  : isWangMode ? WANG_SYSTEM_PROMPT : LENNY_SYSTEM_PROMPT
```
Space 内的对话使用人物专属 System Prompt，完全绕过用户私有 preference_rules / memory_facts 注入。

**安全**：所有 Space 文件名均在 `ALLOWED_FILENAMES` 白名单中，文件路径防护机制与主空间一致。

**对话同步到主空间**（v0.4.9+）：Space 内对话结束后，`canvasStore` 调用 `POST /api/memory/sync-lenny-conv`，将对话写入主空间 `conversations.jsonl` 并触发 `fetchEmbedding` 向量索引。`convSource` 字段正确区分 `lenny` / `pg` / `zhang` / `wang` / `custom-{id}`。

**历史记忆补全**（v0.5.1+）：`POST /api/memory/bootstrap-facts` 全量扫描 `conversations.jsonl`，对未提取记忆事实的对话入队 `extract_profile` + `extract_preference`，对缺失向量的对话补齐 `fetchEmbedding`；幂等，可安全重复调用。

**文件下载**（v0.5.3+）：Space 内 FileBrowserPanel 支持鉴权文件下载，使用 `fetch()` + blob + `URL.createObjectURL` 绕过 Authorization 头限制。

### 8. 用户自定义 Space 架构（v0.4.2+）

除内置 Public Space 外，用户可自行创建最多 5 个私有 Space（存储 `custom-spaces.json`）。

**核心设计**：

| 概念 | 说明 |
|------|------|
| `CustomSpaceConfig` | `{id(8位lowercase), name, topic, colorKey, systemPrompt, avatarInitials, createdAt}` |
| 文件命名 | `custom-{8}-nodes.json` / `custom-{8}-conversations.jsonl` / `custom-{8}-edges.json` |
| 安全验证 | `CUSTOM_SPACE_FILE_RE = /^custom-[a-z0-9]{8}-(nodes\.json|conversations\.jsonl|edges\.json)$/` 动态正则，作为 `ALLOWED_FILENAMES` 静态白名单的补充 |
| 颜色主题 | 6 种：indigo / violet / emerald / amber / rose / sky（`SpaceColorKey`） |
| 对话隔离 | Custom Space 对话**不**调用 `/api/memory/sync-lenny-conv`，不流入用户主空间记忆 |
| 无种子节点 | 画布从空白开始，每次对话后 `endConversation` 写入 `custom-{id}-nodes.json` |

**模式切换**（`canvasStore.ts`）：
```typescript
// isCustomSpaceMode 与 isLennyMode 互斥，openCustomSpaceMode 会清除所有其他 Space 标志
openCustomSpaceMode(id) → set({ isCustomSpaceMode: true, activeCustomSpaceId: id, isLennyMode: false, ... })
closeCustomSpaceMode()  → set({ isCustomSpaceMode: false, activeCustomSpaceId: null })
```

**文件路由（6 处）**：
```typescript
// addNode / removeNode / endConversation / appendConversation / openModalById / getRelevantMemories
// 均优先检查 isCustomSpaceMode，使用 custom-{activeCustomSpaceId}-* 文件名
```

**System Prompt 路由**（`AnswerModal.tsx`）：
```typescript
if (isCustomSpaceMode) {
  const activeSpace = customSpaces.find(s => s.id === activeCustomSpaceId)
  const spacePrompt = activeSpace?.systemPrompt ?? LENNY_SYSTEM_PROMPT
  // 完全绕过 preference_rules / memory_facts 注入
}
```

**存储管理**：`createCustomSpace` 生成 8 位随机 id（`crypto.randomUUID().replace(/-/g,'').slice(0,8)`），列表存储在 `custom-spaces.json`；`deleteCustomSpace` 更新列表（不删除对话文件，保留历史数据）。

### 9. 状态管理（Zustand）

**文件**: `src/renderer/src/stores/canvasStore.ts`

核心状态分区：

| 分区 | 字段 |
|------|------|
| 画布数据 | `nodes`, `edges`, `semanticEdges` |
| 对话 | `currentConversation`, `conversationHistory`, `isModalOpen` |
| 用户画像 | `profile`（包含 `rules` 偏好规则数组） |
| 认证 | `authed`, `userId` |
| 引导 | `onboardingState`, `capabilityNodes` |
| 视口 | `offset`, `scale` |
| 交互 | `selectedNodeId`, `highlightedNodeIds`, `searchQuery` |
| Space 模式 | `isLennyMode`, `isPGMode`, `isZhangMode`, `isWangMode`, `isCustomSpaceMode`, `activeCustomSpaceId`, `customSpaces` |

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
    ├── _buildSemanticEdgesForNode() → 300ms 延迟后 POST /api/memory/search/by-id
    │         → 过滤 score ≥ 0.65，每节点最多 5 条，全局上限 200 条
    │         → 生成 edgeType: 'semantic' 紫色虚线边 → 持久化 semantic-edges.json
    ├── appendConversation() → 追加 conversations.jsonl
    ├── /api/memory/index → 生成对话向量索引
    ├── /api/memory/extract → 提取记忆事实（异步）
    └── /api/memory/queue (extract_profile / extract_preference) → 入队后台任务
```

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

## 力模拟布局引擎（v0.2.62+）

**文件**: `src/renderer/src/hooks/useForceSimulation.ts`

### 设计原则

**force sim 只写 DOM，绝不写 Zustand store。** 写 store 触发 React 重渲染，`motion.div` 读 store 坐标会覆盖 DOM，产生闪回。

### 两层力系统

```
Layer 1 — 节点级
  ├── 全局斥力：NODE_REPEL=8000，距离 <500px 生效
  ├── 同类引力弹簧：SAME_ATTRACT=0.0018，理想间距 280px
  ├── 异类斥力：DIFF_REPEL=120，距离 <500px 生效
  ├── 连线弹簧：EDGE_SPRING=0.0025，理想长度 300px
  └── 全局中心引力：CENTER_GRAVITY=0.00008（防飘出）

Layer 2 — 星云（分类）级
  ├── 星云间斥力：CLUSTER_REPEL=12000，距离 <1200px 生效
  └── 连线引导靠近：CLUSTER_EDGE_ATTRACT=0.0008，理想距离 800px
```

### 温度系统（控制布局力强度）

| 状态 | 温度值 | 触发条件 |
|------|--------|---------|
| 冷启动 | 0 | 初始加载（不重排已有布局） |
| 热启动 | 0.6 | `kick()` 调用后 |
| 稳定运行 | 0.15 | 每帧冷却 `×0.997` 直到 MIN |

- `temp=0` 时速度归零，防止 kick 后速度爆发
- 初始加载检测到节点重叠时自动 `kick()`（v0.2.65）

### 公转旋转

所有节点围绕全局几何重心缓慢顺时针公转，**不受温度影响**：

```typescript
const rotDx =  ry * GLOBAL_ROTATION_TORQUE  // 顺时针（屏幕坐标系）
const rotDy = -rx * GLOBAL_ROTATION_TORQUE
n.x += n.vx * temp + rotDx  // 布局位移受温度缩放，公转恒定
n.y += n.vy * temp + rotDy
```

`GLOBAL_ROTATION_TORQUE = 0.00012`，距重心 1000px 的节点每秒移动约 7px。

### 拖拽 & 推挤

- 拖拽节点时设 `draggedNodeIdRef`，该节点跳过力计算和 DOM 写入
- 拖拽结束前必须调用 `updateSimNode(id, x, y)` 同步 sim 内部坐标，再调用 `setDragging(null)`
- 拖拽推挤：`PUSH_RADIUS=280`，邻近节点被推开，DOM 直写 + rAF 节流同步 store

### 性能策略

- **每帧 DOM 直写**：`el.style.left/top`，零 React 重渲染
- **低频 store 同步**：每 90 帧（约 1.5fps）写一次 `updateNodePositionInMemory`，供 Edge SVG 更新
- **星云标签**：force sim 每帧直写 `cluster-label-{category}` DOM，不等 store 同步
- **ForceSimContext**：Canvas Provider → NodeCard Consumer，NodeCard 直接调用 sim API

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
