# EvoCanvas 架构文档

## 项目概述

EvoCanvas 是一个本地优先的AI画布应用，核心功能是**记住用户的偏好**，在每次对话中体现这些偏好，让用户感到"被记住"。

## 技术栈

- **框架**: Electron + React + TypeScript
- **构建**: Vite + electron-vite
- **状态管理**: Zustand
- **样式**: Tailwind CSS
- **AI接入**: OpenAI Compatible API

## 目录结构

```
evocanvas/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # Preload 脚本
│   ├── renderer/       # React 渲染进程
│   │   ├── components/ # UI组件
│   │   ├── hooks/      # 自定义Hooks
│   │   └── stores/     # Zustand状态
│   ├── shared/         # 共享类型和常量
│   └── services/       # 业务逻辑服务
├── data/               # 本地数据存储
└── docs/               # 文档
```

## 核心模块

### 1. 存储层 (Storage)

**主进程**: `src/main/index.ts`
- 使用 Electron 的 `ipcMain` 提供安全的文件操作
- 数据存储在用户数据目录 (`app.getPath('userData')/data`)

**Preload**: `src/preload/index.ts`
- 使用 `contextBridge` 暴露安全的API给渲染进程

**数据文件**:
- `profile.json` - 用户偏好规则
- `nodes.json` - 画布节点数据
- `conversations.jsonl` - 对话记录（追加模式）

### 2. 状态管理 (Zustand)

**文件**: `src/renderer/src/stores/canvasStore.ts`

核心状态:
- `nodes`: 画布节点数组
- `currentConversation`: 当前对话
- `profile`: 用户偏好配置
- `isModalOpen`: 回答层开关
- `selectedNodeId` / `highlightedNodeIds`: 节点选中与语义高亮
- `offset` / `scale`: 画布平移与缩放

核心方法:
- `loadNodes/loadProfile`: 数据加载
- `addNode`: 添加节点
- `startConversation/endConversation`: 对话生命周期
- `detectFeedback/addPreference`: 偏好学习
- `detectIntent` / `getRelevantMemories` / `setHighlight`: 意图检测与语义高亮
- `selectNode` / `openModalById`: 节点详情与回放

### 3. 组件层 (React)

**Canvas** (`components/Canvas.tsx`)
- 无限画布，支持拖拽、缩放（wheel/touch pinch）、惯性滑动
- 极光背景（AmbientBackground）+ 点阵背景
- LOD：`scale < 0.6` 时节点淡出并显示 ClusterLabel 宏观视图
- 渲染 NodeCard、Edge、ClusterLabel

**Canvas 缩放性能架构**（关键设计，请勿随意改动）：
- `offset` / `scale` **完全存在 `viewRef`**，不走 React state；缩放期间零重渲染
- `applyTransform()` 直接操作 `contentLayerRef.current.style.transform`，绕过 React
- wheel 事件在 useEffect 里用 `{ passive: false }` 监听，按帧累计 delta，每帧只触发一次 RAF
- **300ms debounce** 后才做唯一一次 `useCanvasStore.setState`，驱动 useLodScale LOD 切换
- `useLodScale`：用 `useCanvasStore.subscribe()`（非 React hook）订阅 scale；只在跨越 LOD bucket 时才 `setState`，zoom 过程中完全不触发重渲染
- 根包装层用普通 `<div>` + CSS `transition`（非 `motion.div`），消除 Framer Motion 常驻 rAF 上下文

**NodeCard** (`components/NodeCard.tsx`)
- 显示标题、关键词、日期；LOD 透明度；高亮态（highlightedNodeIds）
- **细粒度 selector**：`removeNode`/`updateNodePosition`/`openModalById`/`isHighlighted` 各自独立订阅，不订阅全 store
- **漂浮动画用纯 CSS `@keyframes`**（compositor thread），不用 Framer Motion `repeat: Infinity`（主线程）
- 拖拽通过 `window.addEventListener` + DOM 直写坐标实现，不 setState

**NodeDetailPanel** (`components/NodeDetailPanel.tsx`)
- 节点详情侧边面板：继续话题、重命名、删除

**OnboardingGuide** (`components/OnboardingGuide.tsx`)
- 新用户首次引导（漫游、对话、宏微观切换），localStorage 记录已读

**GrayHint** (`components/GrayHint.tsx`)
- 灰色小字提示，仅在偏好被应用时显示

### 4. 服务层

**AI服务** (`services/ai.ts`)
- `callAI`: 非流式调用
- `streamAI`: 流式调用（生成器）
- `generateNodeTitle`: 生成节点标题
- `generateKeywords`: 生成关键词

**反馈服务** (`services/feedback.ts`)
- `detectNegativeFeedback`: 检测负反馈触发词
- `updateConfidence`: 更新规则置信度
- `analyzeFeedbackIntensity`: 分析反馈强度

**偏好服务** (`services/profile.ts`)
- `loadProfile/saveProfile`: 配置文件读写
- `addOrUpdateRule`: 添加/更新规则
- `getHighConfidencePreferences`: 获取高置信度偏好
- `decayOldPreferences`: 旧偏好置信度衰减

**Prompt服务** (`services/prompt.ts`)
- `buildSystemPrompt`: 组装System Prompt
- `buildMessages`: 组装消息列表
- `detectAppliedPreferences`: 检测被应用的偏好
- `generateGrayHint`: 生成灰字提示文本

## 数据流

```
用户输入 → InputBox → canvasStore.startConversation()
                          ↓
                    AI调用 (useAI.sendMessage)
                          ↓
                    流式响应 → AnswerModal显示
                          ↓
                    用户反馈 → detectFeedback()
                          ↓
                    更新profile.json → 下次生效
                          ↓
                    关闭 → 生成Node → nodes.json
```

## 偏好学习流程

1. **检测**: 用户在反馈区输入包含触发词的消息
2. **抽取**: 根据触发词映射表提取偏好规则
3. **存储**: 写入 `profile.json`，更新置信度
4. **应用**: 下次对话时，高置信度偏好注入System Prompt
5. **反馈**: 当偏好被应用时，显示灰字提示

## 负反馈触发词

| 用户表达 | 偏好规则 |
|---------|---------|
| "简洁点" / "太复杂" | 表达更简洁：先结论，后要点，少铺垫 |
| "别用这个" | 避免使用刚才提到的方案/工具 |
| "换个思路" / "重来" | 换一种组织方式：给要点/给步骤/给对比 |
| "不对" | 重新理解需求，确认后再回答 |

## 本地存储结构

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

### nodes.json
```json
[
  {
    "id": "uuid",
    "title": "标题",
    "keywords": ["关键词1", "关键词2"],
    "date": "2026-02-28",
    "conversationId": "uuid",
    "x": 100,
    "y": 200
  }
]
```

### conversations.jsonl
```jsonl
{"id": "uuid", "createdAt": "...", "userMessage": "...", "assistantMessage": "...", "appliedPreferences": ["..."]}
{"id": "uuid", "createdAt": "...", "userMessage": "...", "assistantMessage": "...", "negativeFeedback": "..."}
```

## 配置说明

### 环境变量

```bash
# AI API配置
EVOCANVAS_API_URL=https://api.openai.com/v1
EVOCANVAS_API_KEY=your_api_key
```

### 开发运行

```bash
npm install
npm run dev
```

### 构建

```bash
npm run build
```

## 扩展点

1. **多模型支持**: 修改 `services/ai.ts` 中的配置
2. **新的触发词**: 在 `shared/constants.ts` 中添加
3. **新的偏好类型**: 在 `services/feedback.ts` 中扩展检测逻辑
4. **导入/导出**: 使用 `services/profile.ts` 中的 `exportProfile`/`importProfile`

## 性能考虑

1. 对话记录使用 `.jsonl` 格式，支持高效追加
2. 偏好规则数量控制在合理范围（<100条）
3. 节点渲染使用虚拟列表（后续优化）
4. AI流式响应，避免长文本卡顿

## 安全考虑

1. Preload脚本使用 `contextBridge` 隔离主进程API
2. 存储操作限制在特定数据目录
3. API Key从环境变量读取，不硬编码
4. 用户输入转义后显示（防止XSS）
