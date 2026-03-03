# Anima 开发指南

## 环境准备

### 系统要求

- Node.js 20+
- npm 10+

### 安装

```bash
npm install
```

### 配置

```bash
cp .env.example .env
# 编辑 .env，按需设置 PORT / DATA_DIR / AUTH_ENABLED 等
```

API Key 不在 `.env` 中配置，启动后在 UI 设置页面填写（保存到服务端 SQLite）。

---

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 并发启动 Vite 前端（:5173）+ Hono 后端（:3000） |
| `npm run dev:client` | 仅启动 Vite 前端 |
| `npm run dev:server` | 仅启动后端（tsx watch 热重载） |
| `npm run build` | 构建前端到 `dist/` |
| `npm start` | 生产模式启动（服务 API + 静态文件） |
| `npm test` | 运行单元 + 集成测试 |
| `npm run test:watch` | 监听模式 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run dev:electron` | 启动 Electron 版本（保留兼容） |

---

## 项目结构

```
evocanvas/
├── src/
│   ├── server/                    # Hono 后端
│   │   ├── index.ts               # 服务入口
│   │   ├── db.ts                  # SQLite 初始化
│   │   ├── routes/
│   │   │   ├── storage.ts         # 存储 API
│   │   │   ├── config.ts          # 配置 API（apiKey / model / baseUrl）
│   │   │   └── ai.ts              # AI 代理 SSE 端点
│   │   ├── middleware/
│   │   │   └── auth.ts            # Bearer Token 鉴权
│   │   └── __tests__/
│   │       └── server.test.ts     # 服务端集成测试
│   │
│   ├── renderer/                  # React 前端
│   │   └── src/
│   │       ├── services/
│   │       │   ├── storageService.ts  # 存储抽象层（Web/Electron 双版本）
│   │       │   └── ai.ts              # 前端 AI 服务（调用后端代理）
│   │       ├── stores/                # Zustand 状态管理
│   │       ├── components/            # UI 组件
│   │       └── hooks/
│   │           └── useAI.ts           # AI 调用 Hook
│   │
│   ├── services/                  # 纯函数业务服务（可复用）
│   │   ├── ai.ts                  # AI 直调（Electron 模式保留）
│   │   ├── feedback.ts            # 负反馈检测
│   │   ├── profile.ts             # 偏好管理
│   │   ├── prompt.ts              # Prompt 构建
│   │   ├── fileParsing.ts         # 文件解析
│   │   └── __tests__/             # 单元测试
│   │
│   └── shared/                    # 共享类型和常量
│       ├── types.ts               # StorageService 接口等
│       └── constants.ts           # 配置常量
│
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
浏览器 (Vite :5173 / 生产 :3000)
  ├── storageService.read/write/append
  │     └── [Web]  →  HTTP  →  Hono /api/storage/*
  │     └── [Electron]  →  IPC  →  主进程文件系统
  │
  ├── configService.getApiKey/setApiKey/getSettings/saveSettings
  │     └── [Web]  →  HTTP  →  Hono /api/config/*
  │     └── [Electron]  →  IPC  →  safeStorage
  │
  └── useAI → services/ai.ts
        └── POST /api/ai/stream (SSE)
              └── 服务端读取 DB 中的 apiKey，代理 Kimi API
```

**环境自动检测**：`storageService` 和 `configService` 通过 `window.electronAPI` 是否存在自动选择实现，上层代码无需关心。

---

## 画布性能设计

### Zoom 节流

`Canvas.tsx` 的 wheel 事件使用 RAF（requestAnimationFrame）节流：同一帧内的多次 wheel 事件只合并提交一次 `setView`，避免每像素触发 React 全量重渲染。

### NodeCard memo

`NodeCard` 用 `React.memo` 包裹，`scale` 和 `depth` 作为 prop 传入而非在组件内订阅 store.scale。zoom 时只有 `Canvas` 层 re-render，所有 `NodeCard` 通过 memo 跳过。`depth`（节点深度感）在 Canvas 层统一用 `Map` 预计算（O(n)），避免每个 NodeCard 各自 `findIndex`（O(n²)）。

---

## 调试技巧

### 查看后端数据

```bash
# 启动后，数据在 SQLite 中
sqlite3 data/evocanvas.db

# 查看存储内容
SELECT filename, length(content), updated_at FROM storage;

# 查看配置
SELECT key, value FROM config;
```

### API 手动测试

```bash
# 健康检查
curl http://localhost:3000/api/health

# 读取节点
curl http://localhost:3000/api/storage/nodes.json

# 设置 API Key
curl -X PUT http://localhost:3000/api/config/apikey \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sk-your-key"}'

# 测试 AI 流
curl -X POST http://localhost:3000/api/ai/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

### 前端调试

开发模式按 `F12` 打开 DevTools，Network 面板可以看到所有 `/api/*` 请求和 SSE 事件流。

---

## 代码规范

- TypeScript 严格模式
- 组件：函数式组件 + Hooks
- 服务层：纯函数（便于测试）
- 错误处理：必须 try-catch，返回合理默认值

### 提交规范

```
<type>: <description>

[optional body]
```

类型：`feat` / `fix` / `docs` / `test` / `refactor` / `security`

---

## 常见问题

### API Key 如何配置？

启动服务后，打开 UI → 右上角设置按钮 → 填写 API Key → 保存。Key 存入服务端 SQLite，不经过浏览器。

### 数据在哪里？

`DATA_DIR`（默认 `./data/`）目录下的 `evocanvas.db` SQLite 文件。

### 如何切换回 Electron 模式？

`storageService` 自动检测 `window.electronAPI`，Electron 模式无需任何代码改动，直接运行 `npm run dev:electron`。

### 端口冲突怎么办？

```bash
PORT=3001 npm run dev:server
# 同时修改 vite.config.ts 中的 proxy target
```
