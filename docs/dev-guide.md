# Anima 开发指南

*最后更新: 2026-03-07 | 版本: v0.2.52*

## 环境准备

### 系统要求

- Node.js 20+
- npm 10+

### 安装

```bash
npm install
```

### 配置（可选）

```bash
cp .env.example .env
# 默认配置无需修改即可启动
# 按需设置 PORT / DATA_DIR / ACCESS_TOKEN 等
```

**API Key 不在 `.env` 中配置**，启动后在 UI 右上角设置页面填写，保存到服务端 SQLite。

---

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 并发启动 Vite 前端（:5173）+ Hono 后端（:3000） |
| `npm run dev:client` | 仅启动 Vite 前端 |
| `npm run dev:server` | 仅启动后端（tsx watch 热重载） |
| `npm run build` | 构建前端到 `dist/` |
| `npm start` | 生产模式启动（同时服务 API + 静态文件，端口 3000） |
| `npm test` | 运行所有测试（单元 + 集成，当前 289 个用例，11 个文件） |
| `npm run test:watch` | 监听模式（开发时用） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run dev:electron` | 启动 Electron 桌面版（可选，非主要模式） |

---

## 项目结构

```
evocanvas/
├── src/
│   ├── server/                    # Hono 后端（主要模式）
│   │   ├── index.ts               # 服务入口（多租户中间件、路由注册）
│   │   ├── db.ts                  # SQLite 初始化、多租户连接池、getAllUserDbs()
│   │   ├── agentWorker.ts         # 后台 AI 任务 Worker（调度入口，每 30s tick 所有用户 db）
│   │   ├── agentTasks.ts          # AI 后台任务实现（consolidateFacts / extractProfile 等）
│   │   ├── routes/
│   │   │   ├── storage.ts         # 文件存储 API + 文件上传
│   │   │   ├── config.ts          # API Key / 模型设置
│   │   │   ├── ai.ts              # AI 代理（SSE 流式）
│   │   │   └── memory.ts          # 记忆 / 画像 / 向量检索
│   │   ├── middleware/
│   │   │   └── auth.ts            # Bearer Token 多租户鉴权
│   │   └── __tests__/
│   │       ├── server.test.ts              # HTTP 路由测试（testDb，629行）
│   │       ├── server-integration.test.ts  # memory/agent/file 集成测试（memDb/fileDb）
│   │       ├── server-ai.test.ts           # AI/搜索/澄清层纯逻辑测试
│   │       ├── ai-onboarding.test.ts       # onboarding 模式测试（6 个用例）
│   │       └── memory.test.ts              # 记忆路由集成测试
│   │
│   ├── renderer/                  # React 前端
│   │   └── src/
│   │       ├── components/        # UI 组件（Canvas / NodeCard / AnswerModal / AnswerModalSubcomponents 等）
│   │       ├── stores/
│   │       │   └── canvasStore.ts # 主 Zustand Store
│   │       ├── services/
│   │       │   ├── storageService.ts  # 存储抽象层（Web HTTP / Electron IPC 自动适配）
│   │       │   └── ai.ts              # 前端 AI 调用（SSE 流解析）
│   │       └── hooks/
│   │           └── useAI.ts           # AI 调用 Hook
│   │
│   ├── services/                  # 纯函数业务逻辑（可复用、可单测）
│   │   ├── feedback.ts            # 负反馈检测 & 置信度计算
│   │   ├── profile.ts             # 偏好规则 CRUD
│   │   ├── prompt.ts              # Prompt 工具函数
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
├── vite.config.ts                 # Vite 配置（/api 代理到 :3000）
├── tsconfig.json                  # 前端 TS 配置
├── tsconfig.server.json           # 后端 TS 配置
├── Dockerfile                     # 多阶段构建
├── .env.example                   # 环境变量模板
└── docs/                          # 文档
```

---

## 架构概览

```
浏览器 (Vite :5173 开发 / :3000 生产)
  │
  ├── storageService.read/write/append
  │     └── HTTP  →  Hono /api/storage/*  →  SQLite data/{userId}/anima.db
  │
  ├── configService.getSettings/saveSettings
  │     └── HTTP  →  Hono /api/config/*   →  SQLite config 表
  │
  └── useAI → services/ai.ts (SSE)
        └── POST /api/ai/stream
              ├── 服务端读取该用户 db 中的 apiKey / preferences / profile
              ├── 构建分层 System Prompt
              └── 代理 Kimi API，转发 SSE 流

后台（每 30s）
  agentWorker.tick()
    └── getAllUserDbs() → 遍历所有用户 db
          └── 处理 agent_tasks：extract_profile / extract_preference / embed_file / consolidate_facts
```

**Electron 兼容**：`storageService` 检测 `window.electronAPI` 自动切换实现，上层代码无需关心。

---

## 多租户开发注意事项

- `enqueueTask(db, type, payload)` — `db` 是**必传**的第一个参数，必须是用户专属的 db 实例（从 `c.get('db')` 获取），不能使用全局默认 `db`
- 路由中通过 `const db = userDb(c)` 获取当前用户的 db
- 新增后台任务类型时，`processTask(db, task)` 中所有操作均使用传入的 `db`

---

## 画布性能设计

**关键设计，请勿随意修改：**

- `offset` / `scale` 存 ref，不走 React state；`applyTransform()` 直接操作 DOM transform
- wheel 事件按帧累计 delta，每帧只触发一次 RAF；300ms debounce 后才写 React state
- `NodeCard` 用细粒度 selector 订阅各字段，避免全量 re-render
- 节点漂浮动画用纯 CSS `@keyframes`（compositor thread），不用 Framer Motion repeat

---

## 调试技巧

### 查看后端数据（多租户）

```bash
# 找到用户 ID（12位 hex，由 token SHA-256 前缀生成）
ls data/

# 连接对应用户的 SQLite
sqlite3 data/{userId}/anima.db

# 查看后台任务状态
SELECT type, status, retries, error FROM agent_tasks ORDER BY id DESC LIMIT 20;

# 查看偏好规则
SELECT value FROM config WHERE key='preference_rules';

# 查看记忆事实
SELECT fact, created_at FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC;

# 查看用户画像
SELECT occupation, interests, tools FROM user_profile WHERE id=1;
```

### API 手动测试（带 token）

```bash
TOKEN=your-token

# 健康检查（无需 token）
curl http://localhost:3000/api/health

# 读取节点
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/storage/nodes.json

# 触发记忆整合
curl -X POST http://localhost:3000/api/memory/consolidate \
  -H "Authorization: Bearer $TOKEN"
```

### 实时日志（生产）

```bash
pm2 logs evocanvas --lines 50 --follow
```

### 前端调试

开发模式按 `F12` 打开 DevTools，Network 面板过滤 `/api` 查看所有后端请求；SSE 流在 EventStream 标签页实时查看。

---

## 代码规范

- TypeScript 严格模式
- 组件：函数式组件 + Hooks
- 服务层：纯函数，便于测试
- 错误处理：try-catch，返回合理默认值；用户无感的错误（如 embedding 403）只 `console.info`，不抛出

### 文件大小规范

| 级别 | 行数 | 处理方式 |
|------|------|---------|
| 理想 | < 800 行 | 无需处理 |
| 可接受 | 800-1000 行 | 评估拆分可行性 |
| 需拆分 | 1000-1500 行 | 本迭代内拆分 |
| 禁止 | > 1500 行 | 立即拆分，不得合入 |

**例外**：Zustand 单 store 闭包（`canvasStore.ts`）因架构约束允许例外，需在文件头注明理由。

### 模块头注释规范

每个文件顶部必须有职责注释（参考格式）：
```typescript
/**
 * ModuleName — 一句话职责描述
 *
 * 职责：具体做什么
 * 公开接口 / 导出：列出主要导出
 * 关键约束：性能要求、设计决策等
 */
```

### [SECTION:] 分区标记

超过 500 行的单文件用 `// [SECTION:NAME]` 注释分区，便于 AI 和开发者定位：
```typescript
// [SECTION:LOAD]    初始化/加载逻辑
// [SECTION:NODE]    节点操作
// [SECTION:EDGE]    连线操作
```

### 提交规范

```
<type>: <description>

[optional body]
```

类型：`feat` / `fix` / `docs` / `test` / `refactor` / `security` / `chore`

---

## 常见问题

### API Key 如何配置？

启动服务后，打开 UI → 右上角设置按钮 → 填写 API Key → 保存。Key 存入服务端 SQLite，不经过浏览器，不在 `.env` 中。

### 数据在哪里？

多租户模式：`DATA_DIR/{userId}/anima.db`（默认 `./data/{userId}/anima.db`）。
单用户开发（AUTH_DISABLED=true）：`./data/dev/anima.db`。

### 如何查看我的 userId？

浏览器 DevTools → Application → Local Storage → `evo_user_id`，或查看 `data/` 目录下的子目录名。

### 端口冲突怎么办？

```bash
PORT=3001 npm run dev:server
# 同时修改 vite.config.ts 中的 proxy target 为 http://localhost:3001
```

### Electron 模式如何启动？

```bash
npm run dev:electron
```

`storageService` 自动检测 `window.electronAPI`，切换到 IPC 模式，无需其他改动。
