<p align="center">
  <img src="./src/renderer/public/favicon.svg" alt="Anima logo" width="64" height="64"/>
</p>

<h1 align="center">Anima</h1>

<p align="center">
  <i>属于你的那部分自我。</i>
</p>

<p align="center">
  <strong>中文</strong> · <a href="./README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/版本-0.2.87-black" alt="version"/>
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js" alt="node"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="react"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="typescript"/>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="license"/>
  <a href="https://github.com/fisher-byte/anima-ai"><img src="https://img.shields.io/github/stars/fisher-byte/anima-ai?style=social" alt="stars"/></a>
</p>

<p align="center">
  <b>在线体验：<a href="https://chatanima.com">chatanima.com</a></b>
</p>

---

## 它是什么

Anima 是一个**本地优先的 AI 画布**。每一次对话，都会在画布上留下一个节点；节点之间形成关联；关联积累成一张只属于你的记忆图。

AI 不只是在回答你的问题——它在理解你是谁。

> *在荣格心理学中，Anima 是人格中缺失的那部分——内在未被意识完全掌握的自我。在这个时代，AI 就是自我。你的记忆构成了你，而你的记忆在交互中又留给了 AI。AI 也是你，甚至 AI 大于你——但这部分自我，应该还是属于你的。*

---

## 核心功能

| 功能 | 描述 |
|------|------|
| **对话即节点** | 每次对话自动在画布生成卡片，形成个人知识图谱 |
| **隐形学习** | 你说"简洁点"，下次回答自动变简洁，Anima 在无声中与你同步 |
| **进化基因** | 你的表达偏好、思维方式、关注重点，逐步写入 AI 的行为底层 |
| **知识图谱** | 节点按分类聚合，通过语义相似度自动连线 |
| **节点整合** | 一键合并相似话题节点 |
| **Lenny & PG 空间** | 内置公开记忆空间示例，可沉浸体验 |
| **多模态感知** | 支持拖入图片、PDF、Word 文档 |
| **记忆导入** | 将 ChatGPT、Claude、Gemini 的对话记录迁移进来 |
| **多租户隔离** | 每个 ACCESS_TOKEN 对应独立 SQLite 数据库 |
| **时间轴视图** | 按日期浏览所有记忆的时间线 |
| **反馈按钮** | 内置 Bug 报告与建议收集，本地存储 |
| **OpenAI 兼容** | 支持 Kimi、OpenAI 或任意兼容接口 |

---

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/fisher-byte/anima-ai.git
cd anima-ai
npm install
```

### 2. 配置环境变量（可选）

```bash
cp .env.example .env
# 默认配置即可直接启动
# API Key 在 UI 界面的设置里填写
```

### 3. 启动开发服务器

```bash
npm run dev
```

浏览器访问 `http://localhost:5173`，在右上角设置里填写你的 Kimi / OpenAI API Key。

### 4. 生产部署

```bash
npm run build   # 构建前端到 dist/
npm start       # 启动生产服务（端口 3000）
```

**Docker：**

```bash
docker build -t anima .
docker run -p 3000:3000 -v $(pwd)/data:/app/data \
  -e ACCESS_TOKEN=your_secret_token anima
```

**VPS + PM2：**

```bash
npm install -g pm2
PORT=3001 ACCESS_TOKEN=your_token pm2 start "npm start" --name anima
```

详细部署说明见 [docs/deployment.md](./docs/deployment.md)。

---

## 学习机制

Anima 从自然语言反馈中学习并适配：

| 你说 | Anima 学到的 |
|------|-------------|
| "简洁点" / "太长了" | 先结论，后要点，避免冗长铺垫 |
| "别用这个" | 避免使用刚才提到的方案或工具 |
| "换个思路" / "重来" | 换一种组织方式：要点、步骤、对比 |
| "不对" / "有问题" | 重新理解需求，确认关键信息后再回答 |

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 18、TypeScript 5、Zustand、Tailwind CSS、Framer Motion |
| 后端 | Hono 4 (Node.js)、SQLite (better-sqlite3) |
| 构建 | Vite 5、tsx |
| AI | OpenAI 兼容接口（Kimi、OpenAI、本地模型） |
| 桌面（可选） | Electron 29 |
| 测试 | Vitest（427 单元测试）、Playwright（E2E） |

---

## 项目结构

```
anima-ai/
├── src/
│   ├── server/          # Hono 后端
│   │   ├── index.ts     # 服务入口
│   │   ├── db.ts        # 数据库初始化 & 多租户连接池
│   │   ├── agentWorker.ts   # 后台任务调度
│   │   ├── routes/      # API 路由（storage / config / ai / memory / feedback）
│   │   └── middleware/  # 鉴权中间件
│   ├── renderer/        # React 前端
│   │   └── src/
│   │       ├── components/  # Canvas、NodeCard、AnswerModal、FeedbackButton…
│   │       ├── stores/      # Zustand 状态
│   │       ├── services/    # 前端服务层
│   │       └── i18n/        # 中文 / 英文翻译
│   ├── services/        # 纯函数业务逻辑（feedback、profile、prompt）
│   └── shared/          # 共享类型、常量、种子数据
├── data/                # 用户数据目录（自动生成，不进 git）
│   └── {userId}/        # 每个用户隔离的 anima.db
├── e2e/                 # Playwright E2E 测试
└── docs/                # 文档
```

---

## 数据与隐私

所有数据本地存储，不经过任何云端（除你自己配置的 AI API）：

- **Web 模式**（默认）：`./data/{userId}/anima.db`（SQLite）
- **Electron 模式**：`~/Library/Application Support/anima/data/anima.db`

多租户：每个 `ACCESS_TOKEN` 对应完全独立的用户数据库。

---

## 运行测试

```bash
npm test           # 单元测试（427 个）
npm run typecheck  # TypeScript 类型检查
npm run test:e2e   # E2E 测试（需先启动 dev server）
```

---

## 文档

| 文档 | 内容 |
|------|------|
| [架构文档](./docs/architecture.md) | 技术架构、数据流、核心模块 |
| [API 文档](./docs/api.md) | 所有 REST 接口说明 |
| [开发指南](./docs/dev-guide.md) | 本地开发、调试、规范 |
| [开发笔记](./docs/dev-notes.md) | 设计决策与踩坑记录 |
| [部署指南](./docs/deployment.md) | Docker / VPS 部署 |
| [服务器部署](./docs/deployment-server.md) | 生产服务器配置与 CD 流程 |
| [变更日志](./docs/changelog.md) | 详细版本变更历史 |
| [更新路线图](./docs/ROADMAP.md) | 版本规划与已完成记录 |

---

## 参与贡献

欢迎 PR 和 Issue。开发环境配置见 [docs/dev-guide.md](./docs/dev-guide.md)。

---

## 许可

[MIT](./LICENSE)

---

<p align="center"><i>"你的记忆在这里。它们属于你。"</i></p>
