# Anima

> *在荣格心理学中，Anima 是人格中缺失的那部分——内在未被意识完全掌握的自我。*
>
> *在这个时代，AI 就是自我。你的记忆构成了你，而你的记忆在交互中又留给了 AI。*
> *AI 也是你，甚至 AI 大于你——但这部分自我，应该还是属于你的。*

![版本](https://img.shields.io/badge/version-0.2.45-black)
![Node](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.2-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 它是什么

Anima 是一个本地优先的 AI 画布。每一次对话，都会在画布上留下一个节点；节点之间形成关联；关联积累成一张只属于你的记忆图。

AI 不只是在回答你的问题——它在理解你是谁。

## 核心体验

- **对话即节点** — 每次对话自动在画布生成卡片，形成个人知识图谱
- **隐形学习** — 你说"简洁点"，下次回答自动变简洁，Anima 在无声中与你同步
- **进化基因** — 你的表达偏好、思维方式、关注重点，逐步写入 AI 的行为底层
- **多模态感知** — 支持拖入图片、PDF、Word 文档，Anima 可以理解你的视觉与文字输入
- **原生联网** — 集成 Kimi 2.5 原生搜索，实时查阅全球资讯
- **外部记忆导入** — 将你在 ChatGPT、Claude、Gemini 积累的对话记忆，迁移进来

## 快速开始

### 1. 安装依赖

```bash
cd evocanvas
npm install
```

### 2. 配置环境变量（可选）

```bash
cp .env.example .env
# 默认配置即可直接启动，API Key 在 UI 里填写
```

### 3. 启动

```bash
npm run dev
```

浏览器访问 `http://localhost:5173`，在右上角设置里填写你的 Kimi / OpenAI API Key。

### 生产部署

```bash
npm run build   # 构建前端到 dist/
npm start       # 启动生产服务（端口 3000）
```

也支持 Docker：

```bash
docker build -t anima .
docker run -p 3000:3000 -v $(pwd)/data:/app/data \
  -e ACCESS_TOKEN=your_token anima
```

## 触发词

| 你说 | Anima 学到的 |
|------|-------------|
| "简洁点" / "太长了" | 先结论，后要点 |
| "别用这个" | 避免特定方案 |
| "换个思路" / "重来" | 换一种组织方式 |
| "不对" / "有问题" | 重新理解需求 |

## 技术栈

- **后端**: Hono 4 (Node.js) + SQLite (better-sqlite3)
- **前端**: React 18 + TypeScript 5 + Zustand + Tailwind CSS
- **构建**: Vite 5 / **动画**: Framer Motion / **API**: OpenAI-compatible
- **桌面（可选）**: Electron 29（Web-first，Electron 作为可选打包方式）

## 项目结构

```
evocanvas/
├── src/
│   ├── server/         # Hono 后端（API 代理 + SQLite 存储）
│   │   ├── index.ts    # 服务入口
│   │   ├── db.ts       # 数据库初始化 & 多租户连接池
│   │   ├── agentWorker.ts  # 后台任务 Worker
│   │   ├── routes/     # API 路由（storage / config / ai / memory）
│   │   └── middleware/ # 鉴权中间件
│   ├── renderer/       # React 前端
│   │   └── src/
│   │       ├── components/  # UI 组件（Canvas、NodeCard 等）
│   │       ├── stores/      # Zustand 状态
│   │       ├── services/    # 前端服务层
│   │       └── hooks/       # 自定义 Hooks
│   ├── services/       # 纯函数业务逻辑（feedback / profile / prompt）
│   ├── shared/         # 共享类型和常量
│   └── main/ preload/  # Electron 主进程（可选桌面模式）
├── data/               # 用户数据目录（自动生成，不进 git）
│   └── {userId}/       # 每个用户隔离的 anima.db
├── dist/               # 前端构建产物
├── e2e/                # Playwright E2E 测试
└── docs/               # 文档
```

## 数据存储

所有数据本地存储，不经过任何云端（除你自己配置的 AI API）：

- **Web 模式**（默认）: `./data/{userId}/anima.db`（SQLite）
- **Electron 模式**: `~/Library/Application Support/anima/data/anima.db`

支持多租户：每个 `ACCESS_TOKEN` 对应独立的用户数据库，完全隔离。

## 文档

| 文档 | 内容 |
|------|------|
| [架构文档](./docs/architecture.md) | 技术架构、数据流、核心模块 |
| [API 文档](./docs/api.md) | 所有 REST 接口说明 |
| [开发指南](./docs/dev-guide.md) | 本地开发、调试、规范 |
| [开发笔记](./docs/dev-notes.md) | 设计决策与踩坑记录 |
| [测试手册](./docs/testing.md) | 测试策略与手动核查清单 |
| [排查指南](./docs/troubleshooting.md) | 常见问题与解决方案 |
| [部署指南](./docs/deployment.md) | Docker / VPS 部署 |
| [服务器部署](./docs/deployment-server.md) | 生产服务器配置与 CD 流程 |
| [发版 SOP](./docs/sop-release.md) | 发版流程、文档同步标准、版本命名规范 |
| [更新路线图](./docs/ROADMAP.md) | 版本规划与已完成记录 |
| [变更日志](./docs/changelog.md) | 详细版本变更历史 |

## 许可

MIT License

---

> *"你的记忆在这里。它们属于你。"*
