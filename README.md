# Anima

> *在荣格心理学中，Anima 是人格中缺失的那部分——内在未被意识完全掌握的自我。*
>
> *在这个时代，AI 就是自我。你的记忆构成了你，而你的记忆在交互中又留给了 AI。*
> *AI 也是你，甚至 AI 大于你——但这部分自我，应该还是属于你的。*

![版本](https://img.shields.io/badge/version-0.2.19-black)
![Electron](https://img.shields.io/badge/Electron-29.1.4-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.2-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 它是什么

Anima 是一个本地 AI 画布。每一次对话，都会在画布上留下一个节点；节点之间形成关联；关联积累成一张只属于你的记忆图。

AI 不只是在回答你的问题——它在理解你是谁。

## 核心体验

- **对话即节点** — 每次对话自动在画布生成卡片，形成个人知识图谱
- **隐形学习** — 你说"简洁点"，下次回答自动变简洁，Anima 在无声中与你同步
- **进化基因** — 你的表达偏好、思维方式、关注重点，逐步写入 AI 的行为底层
- **多模态感知** — 支持直接拖入图片，Anima 可以"看懂"你的视觉输入
- **原生联网** — 集成 Kimi 2.5 原生搜索，实时查阅全球资讯
- **外部记忆导入** — 将你在 ChatGPT、Claude、Gemini 积累的对话记忆，迁移进来

## 快速开始

### 1. 安装依赖

```bash
cd evocanvas
npm install
```

### 2. 配置 API Key

在 `evocanvas/` 目录下创建 `.env` 文件：

```env
RENDERER_VITE_API_KEY=your_api_key
RENDERER_VITE_API_URL=https://api.moonshot.cn/v1
```

### 3. 启动

```bash
npm run dev
```

## 触发词

| 你说 | Anima 学到的 |
|------|-------------|
| "简洁点" / "太长了" | 先结论，后要点 |
| "别用这个" | 避免特定方案 |
| "换个思路" / "重来" | 换一种组织方式 |
| "不对" / "有问题" | 重新理解需求 |

## 技术栈

- **Electron 29** + **React 18** + **TypeScript 5**
- **Vite** 构建 / **Hono** 后端 / **SQLite** 本地存储
- **Zustand** 状态管理 / **Tailwind CSS** 样式
- **Framer Motion** 动画 / **OpenAI-compatible API**

## 项目结构

```
evocanvas/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # Preload 脚本
│   ├── renderer/       # React 渲染进程
│   │   ├── components/ # UI 组件
│   │   ├── hooks/      # 自定义 Hooks
│   │   ├── stores/     # Zustand 状态
│   │   └── utils/      # 工具函数
│   ├── shared/         # 类型和常量
│   └── server/         # Hono 后端（AI 代理 + 存储）
├── data/               # 本地数据（自动生成，不进 git）
│   └── anima.db        # SQLite 数据库（节点、记忆、向量）
└── docs/               # 文档
```

## 数据存储

所有数据完全本地，不经过任何云端：

- **macOS**: `~/Library/Application Support/anima/data/`
- **Linux**: `~/.config/anima/data/`

## 文档

- [架构文档](./docs/architecture.md)
- [API 文档](./docs/api.md)
- [变更日志](./docs/changelog.md)
- [开发笔记](./docs/dev-notes.md)

## 许可

MIT License

---

> *"你的记忆在这里。它们属于你。"*
