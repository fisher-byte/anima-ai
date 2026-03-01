# EvoCanvas - 不会忘记你的AI画布

> 一个记住你偏好的本地AI画布。

![版本](https://img.shields.io/badge/version-0.1.0-blue)
![Electron](https://img.shields.io/badge/Electron-29.1.4-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.2-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

## 核心体验

**"你会感到AI真的记住了你。"**

- **对话即节点** - 每次对话自动在画布生成卡片，形成个人知识图谱
- **隐形学习** - 你说"简洁点"，下次回答自动变简洁，AI 在无声中与你同步
- **多模态感知** - 支持直接拖入图片，AI 可以“看懂”你的视觉输入
- **原生级联网** - 集成 Kimi 2.5 原生搜索，AI 实时查阅全球资讯
- **消息可溯源** - 支持已发送消息的二次编辑与重新生成，探索对话的更多可能

## 3分钟体验

1. **0-30秒** - 打开 → 空白画布 → 拖入一张图片并提问 → 看到 AI 对图片的深度解析
2. **30-90秒** - 说"太复杂，简洁点" → 编辑刚才的问题重新发送 → 回答明显变短且精准
3. **90-180秒** - 出现灰字"我记得你上次更喜欢简洁表达。" → 感受被 AI 深度理解的瞬间

## 功能特性

### 已实现 (v0.1.7)

- [x] **无限画布** - 白底 + 极淡点阵背景，支持平滑缩放与平移
- [x] **智能导航** - 视图控制挂件与应用中心菜单，极致简约的 UI
- [x] **全屏回答层** - 流式展示 AI 回复，支持联网搜索进度反馈
- [x] **多模态输入** - 支持图片拖拽、粘贴与上传（基于 Kimi 2.5）
- [x] **消息编辑** - 支持对历史消息进行编辑并触发 AI 重新回答
- [x] **自动聚类布局** - 同类节点自动靠近并绘制视觉连线，形成知识板块
- [x] **负反馈识别** - 自动从对话中提取用户偏好并持久化
- [x] **System Prompt 注入** - 每次对话自动携带已学习的偏好
- [x] **灰字提示** - 仅在偏好被应用时显示，建立情感联结
- [x] **本地数据持久化** - 完全离线优先，数据归属于用户

### 触发词

| 你说 | AI学到的 |
|------|---------|
| "简洁点" / "太复杂" | 表达更简洁 |
| "别用这个" | 避免特定方案 |
| "换个思路" / "重来" | 换一种组织方式 |
| "不对" | 重新理解需求 |

## 技术栈

- **Electron 29** + **React 18** + **TypeScript 5**
- **Vite** 构建
- **Zustand** 状态管理
- **Tailwind CSS** 样式
- **OpenAI API** AI能力

## 快速开始

### 安装依赖

```bash
cd evocanvas
npm install
```

### 配置 API Key

```bash
# 创建 .env 文件
echo "EVOCANVAS_API_KEY=your_openai_api_key" > .env
echo "EVOCANVAS_API_URL=https://api.openai.com/v1" >> .env
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
# macOS
npm run build

# Windows
npm run build:win

# Linux
npm run build:linux
```

## 项目结构

```
evocanvas/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # Preload 脚本
│   ├── renderer/       # React 渲染进程
│   │   ├── components/ # UI组件
│   │   ├── hooks/      # 自定义Hooks
│   │   └── stores/     # Zustand状态
│   ├── shared/         # 类型和常量
│   └── services/       # 业务逻辑
├── data/               # 本地数据（自动生成）
│   ├── profile.json    # 用户偏好
│   ├── nodes.json      # 画布节点
│   └── conversations.jsonl  # 对话记录
├── docs/               # 文档
│   ├── architecture.md
│   ├── api.md
│   ├── changelog.md
│   └── dev-notes.md
└── ...
```

## 文档

- [架构文档](./docs/architecture.md) - 技术架构详解
- [API文档](./docs/api.md) - 服务API说明
- [变更日志](./docs/changelog.md) - 版本迭代记录
- [开发笔记](./docs/dev-notes.md) - 实现细节和踩坑记录

## 数据存储

所有数据本地存储，位于：

- **macOS**: `~/Library/Application Support/evocanvas/data/`
- **Windows**: `%APPDATA%/evocanvas/data/`
- **Linux**: `~/.config/evocanvas/data/`

### profile.json

```json
{
  "rules": [
    {
      "trigger": "简洁点",
      "preference": "保持表达简洁：先结论，后要点，避免冗长铺垫",
      "confidence": 0.7,
      "updatedAt": "2026-02-28"
    }
  ]
}
```

## 设计哲学

### MVP 原则

1. **只验证一件事** - "AI会记住我"
2. **极简功能** - 1页面 + 1输入框 + 1回答层
3. **无解释UI** - 学习过程隐形，只留一行灰字
4. **本地优先** - 数据完全本地，保护隐私

### 克制

**不做的功能**（即使很酷）：
- 自动连线图谱
- DNA HUD 可视化
- 多模型切换UI
- 设置页面
- 教程引导

**相信**最好的功能是不存在的功能。

## Roadmap

### v0.1.7 (当前) ✓
- Kimi 2.5 升级与多模态支持
- 原生级别联网搜索工具集成
- 消息编辑与重发功能
- UI 交互体验深度重构

### v0.2.0 (计划中)
- 完整对话历史查看
- 节点拖拽重排与手动连线
- 导入/导出配置与数据备份

### v0.3.0 (计划中)
- 节点连线（简单关系）
- 搜索功能
- 本地模型支持 (Ollama)

## 贡献

这是一个 MVP 验证项目，欢迎：
- 报告 bug
- 提出体验优化建议
- 分享"被记住"的使用感受

## 许可

MIT License - 详见 [LICENSE](./LICENSE)

---

**Made with ❤️ for the "remembered" feeling.**

> "最好的AI不是最聪明的，而是最懂你的。"
