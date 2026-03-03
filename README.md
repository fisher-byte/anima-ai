# EvoCanvas - 不会忘记你的AI画布

> 一个记住你偏好的本地AI画布。

![版本](https://img.shields.io/badge/version-0.3.2-blue)
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

### 已实现 (v0.2.5)

- [x] **缩放性能彻底修复（v0.3.1）** — 三层根因：① NodeCard 用细粒度 selector 替代全 store 订阅；② 漂浮动画改为纯 CSS `@keyframes`（compositor thread，零主线程开销）；③ 根容器改为 `<div>` + CSS transition 消除 Framer Motion 常驻 rAF 上下文。滚动/缩放全程零 React 重渲染
- [x] **Web 全栈化（v0.3.0）** — Hono 后端 + SQLite 存储，AI 调用走后端代理（API Key 不出浏览器），支持 Docker 部署
- [x] **缩放性能优化（Web）** - wheel 事件按帧合并；offset/scale 脱离 React state，直操 DOM transform；useLodScale 隔离 zoom 重渲染
- [x] **滚轮缩放修复** - 用原生 `addEventListener('wheel', { passive: false })` 替代 React 合成事件，`preventDefault()` 真正生效；区分触控板与鼠标滚轮灵敏度（`Math.pow(1.001, delta)`）
- [x] **ClusterLabel 交互修复** - 内容层 div 正确设置 `pointerEvents: 'none'`，ClusterLabel 的点击与拖拽不再被父层阻断
- [x] **输入框与对话面板居中修复** - 去掉 Framer Motion `x: "-50%"` 导致的 transform 冲突，改用纯 CSS `left-1/2 -translate-x-1/2`，Morph 动画与居中不再打架
- [x] **NodeDetailPanel 风格统一** - Header 去掉蓝色渐变改为白底；分类标签颜色跟随节点 `node.color`；继续话题按钮改为 `bg-gray-900` 克制风格
- [x] **ClusterLabel 可见度增强** - 光晕改用固定深色（blue-500/green-500/purple-500）；光晕扩大至 400×400 + `blur(100px)`，溢出容器外；文字升至 `text-5xl font-black`
- [x] **极光背景增强** - opacity `0.07 → 0.12`；颜色从 blue/green/purple-100 升至 300 级别，背景呼吸感更明显
- [x] **对话岛 (Dialogue Island)** - 从底部输入框 Morph 展开的半屏对话面板，保留画布背景；顶部记忆引用条、支持停止生成与文件预览
- [x] **极光背景与 LOD** - 极光背景随主导分类变色；缩小画布时节点淡出、显示宏观聚类标签（ClusterLabel），标签反向缩放保持可读
- [x] **语义高亮** - 输入时实时检测意图并检索相关记忆，画布上对应节点高亮；高亮使用节点 id 与 conversationId 正确映射
- [x] **节点详情面板** - 点击节点从右侧滑出详情面板，支持继续话题、重命名、删除
- [x] **首次引导 (Onboarding)** - 新用户 3 步引导：漫游、对话、宏微观切换
- [x] **记忆按当前问题调用与压缩注入** - 连续对话时按当前输入重查相关记忆，压缩后注入 AI，并按轮展示“已联结 xxx 记忆”轻量标签
- [x] **话题分类修正** - 拆分节点时使用意图分类（explicitCategory），生活/工作等分类正确落位；加载时按对话首句全量重算分类，历史错分自动纠正
- [x] **对话 UI 优化** - 模型标签在对话区顶部单行展示（KIMI-K2.5）；复制/编辑/重试在气泡外、悬停显示；内容区收窄（max-w-xl）；用户消息悬停显示操作按钮
- [x] **思考区默认折叠与样式** - 有正文时首帧即折叠，展开区左边框与浅底区分层级
- [x] **话题智能拆分 (Topic Splitting)** - 自动识别多轮对话中的意图切换，并在画布上自动拆分为独立话题节点
- [x] **全屏沉浸式对话** - 沉浸式全屏布局，毛玻璃背景与中心聚焦
- [x] **模态框内文件直传** - 对话窗口内 Paperclip 与拖拽区，支持图片、PDF、文档与代码
- [x] **交互摩擦力修复** - NodeCard 拖拽归位平滑
- [x] **思考链路持久化** - 思考逻辑自动折叠与持久化，历史回放可查看
- [x] **记忆联结标识** - 按轮显示当前调用的分类记忆
- [x] **实时推理流 (Reasoning Stream)** - 全面接入 Kimi 2.5 Thinking 过程，实时展示 AI 的逻辑演进
- [x] **空间深度感 (Z-Depth)** - 画布节点具备“时间深度”，活跃节点更大更亮，历史节点轻微模糊，营造空间感
- [x] **高级表格渲染** - 深度定制 Markdown 表格样式（斑马纹、圆角、精致间距），对标顶级文档体验
- [x] **对话分支 (Branching)** - 支持从任意回复开启新分支，形成树状知识进化路径
- [x] **流体动力学** - 画布平移支持惯性滑动，连线具备景深感（粗细与模糊随距离变化）
- [x] **全方位文件解析** - 支持 PDF、Word、代码、文本文件的本地解析并注入上下文
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
- [版本备份](./docs/backup-20260303-canvas.tsx) - Web 缩放性能修复的关键文件快照

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

**暂不做的功能**（即使很酷）：
- 自动连线图谱（当前为分支+板块连线）
- DNA HUD 可视化
- 多模型实时切换 UI（已有设置内选模型）

**相信**最好的功能是不存在的功能。

## Roadmap

### v0.2.5 (当前) ✓
- 5 个核心 Bug 全量修复：滚轮缩放（passive wheel）、ClusterLabel 交互（pointerEvents 层级）、输入框/对话面板居中（Framer Motion transform 冲突）、NodeDetailPanel 风格统一、ClusterLabel + 极光背景可见度增强

### v0.2.4 ✓
- 对话岛形态、极光背景、LOD 宏观聚类与 ClusterLabel 反向缩放
- 语义高亮（输入时画布节点高亮）、节点详情面板、首次引导
- 画布拖拽与缩放样式修复（pointer-events、移除 3D 旋转）

### v0.2.6 (计划中)
- 节点多选、编组与手动逻辑连线
- 导出画布为独立知识文件
- 搜索结果的高亮精确定位

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
