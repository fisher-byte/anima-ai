# Anima 变更日志

## [0.2.59] - 2026-03-07

### feat(v0.2.59): B1 — 结构化用户心智模型 (User Mental Model)

#### 改动

| 内容 | 文件 | 说明 |
|------|------|------|
| `user_mental_model` 表 | `db.ts:173–177` | migration 新增 singleton 表，存 `model_json: TEXT`（结构化 JSON）|
| `extractMentalModel()` | `agentTasks.ts:588–650` | 从最新 60 条 memory_facts + user_profile 提炼结构化心智模型（认知框架/长期目标/思维偏好/领域知识/情绪模式）|
| 任务注册 | `agentWorker.ts` | `extract_mental_model` 任务类型注册到 processTask dispatcher |
| 路由 GET/POST/DELETE | `memory.ts` | `/api/memory/mental-model`（读取）+ `/api/memory/mental-model/refresh`（入队重建）+ DELETE（清空）|
| 自动触发 | `memory.ts:548–556` | `/extract` 每 20 条 fact 里程碑同时触发 `extract_mental_model` 任务 |
| 层 2.5 prompt 注入 | `ai.ts:263–283` | 在 user_profile 和 memory_facts 之间注入认知框架/长期目标/思维偏好（CONTEXT_BUDGET 守卫）|
| 前端展示 | `ConversationSidebar.tsx` | 进化基因 tab 新增「心智模型」区块，分类色标签展示五维数据，刷新按钮触发重建 |
| 集成测试 +5 | `server-integration.test.ts` | GET空/GET有值/POST刷新/POST幂等/DELETE 五个测试 |

#### 解决的问题

- **碎片化 memory_facts 难以利用**：数十条散点事实无法被 AI 有效使用；结构化心智模型将散点压缩为五个维度，注入 system prompt 更精准
- **prompt 层次欠缺深度个性化**：原 3 层（偏好/画像/事实）缺乏对用户认知模式的显式描述；层 2.5 补充认知框架与思维偏好，直接指导 AI 回答方式
- **P2 prompt.ts 僵尸文件**：已于 v0.2.59 删除（23 个测试同步移除，总测试数 277→282）

**测试**：282/282 通过 · TS 零错误

---

## [0.2.58] - 2026-03-07

### feat(v0.2.58): 分类系统升级 — Embedding 原型向量 + 关键词全量计分

#### 改动

| 内容 | 文件 | 说明 |
|------|------|------|
| 原型向量缓存 | `memory.ts:60–87` | 新增 `PROTOTYPE_VECS` Map + `prototypeInitDone` 标志 + `CATEGORY_PROTOTYPES` 六类原型文本字典 |
| `initCategoryPrototypes()` | `memory.ts:73–87` | 导出函数，启动时并发 embedding 六类原型，失败不崩溃（fallback to LLM） |
| `/classify` 改写（三层降级） | `memory.ts:631–695` | 层1：原型向量 cosine similarity（内置 DashScope key，不依赖用户配置）；层2：LLM（用户 key）；层3：null（原有降级） |
| 启动钩子 | `server/index.ts:97–98` | 新增 `initCategoryPrototypes().catch(...)` 紧随 `bootstrapAllEmbeddings` 之后 |
| `detectIntent` 全量计分 | `canvasStore.ts:1509–1518` | first-match-wins → count all 6 categories，取最高分；消除"ai会取代人类"被工作事业抢走的 bug |
| 单元测试 +11 | `memory.test.ts` | `detectIntent full-scoring` 11 个测试：空串/单关键词/多关键词/空格兼容/ai取代人类/幸福探讨等 |

#### 解决的问题

- **"ai会取代人类"错归工作事业**：`工作事业` 关键词列表含 `ai`，first-match-wins 导致一触即返回；全量计分后 `思考世界` 命中 `ai会`+`取代` 共 2 词，正确胜出
- **新用户无 API Key 时 `/classify` 返回 null**：原方案依赖用户配置的 key；新方案层1用内置 DashScope key + 向量相似度，无需用户配置
- **分类测试覆盖不足**：补全 11 个 detectIntent 全量计分单元测试

#### 技术债清偿

| 债项 | 状态 |
|------|------|
| `detectIntent` first-match-wins 误分类 | ✅ 已修复 |
| `/classify` 依赖用户 key 导致新用户无分类 | ✅ 已修复（内置 key 兜底） |
| 分类测试覆盖不足（仅 no-key stub） | ✅ 已补全 11 个单元测试 |

**测试**：300/300 通过 · TS 零错误

---

## [0.2.57] - 2026-03-07

### fix(v0.2.57): code review 修复 — viewport 公式 + mouseup 泄露 + detectIntent 全面迭代

#### 改动

| 内容 | 文件 | 说明 |
|------|------|------|
| 视口裁剪坐标公式修正 | `Canvas.tsx:268–272` | 内容层起点为 (-vw,-vh)，正确公式：`minX = (0 - offset.x + vw) / scale - buffer`；之前公式偏差一整个视口宽度，导致边缘节点错误裁剪 |
| CapabilityNodeCard mouseup 泄露修复 | `NodeCard.tsx:387` | `removeEventListener('mouseup', handleGlobalMouseUpRef.current)` → `removeEventListener('mouseup', handleGlobalMouseUp)`；之前每次拖拽积累一个孤立监听器 |
| detectIntent 关键词全面迭代 | `canvasStore.ts` | 六类关键词从扁平列表重写为语义分组；日常生活 31 词、日常事务 27 词、学习成长 33 词、工作事业 35 词、情感关系 38 词、思考世界 34 词；消除 '攻略' 跨类重复 |
| reclassifyNodes 错误上报 | `canvasStore.ts:1615` | `catch { /* silent */ }` → `catch { set({ lastError: '节点重分类失败...' }) }` |
| memory.ts 请求体防护 | `memory.ts:660` | `nodes.slice(0, 200)` 防止超大请求；`CATEGORY_COLORS[matched] ?? CATEGORY_COLORS['其他']` 防 undefined |
| 死代码清理 | `canvasStore.ts:545` | 删除从未被读取的 `conversationsFullMap` |
| E2E 动画稳定性修复 | `e2e/canvas.spec.ts:202` | `waitForTimeout(300)` → `600`，`click()` → `click({ force: true })`；解决 nodeFloat 动画导致的元素不稳定 |

---

## [0.2.56] - 2026-03-07

### feat(v0.2.56): 节点物理感 + P1 技术债清偿 + 分类重识别

#### 改动

| 内容 | 文件 | 说明 |
|------|------|------|
| 节点物理感 / 深度感 | `NodeCard.tsx` | hover y:-2、拖拽 y:-4 浮起；阴影强度三档（normal/hover/drag）；`filter: blur` 远景虚化 |
| 视口裁剪（P1 技术债） | `Canvas.tsx` | 节点 > 60 时只渲染可见视口内节点（+300px buffer）；storeOffset/storeScale 触发重算 |
| 静默吞错改善（P1 技术债） | `canvasStore.ts`, `Canvas.tsx` | `endConversation` catch → `lastError` → Canvas.tsx useEffect → `toast.error()` |
| detectIntent 关键词扩充 | `canvasStore.ts` | 情感关系 +19 词（幸福/快乐/爱等）；思考世界 +14 词（探讨/感悟/生命等） |
| 分类重识别接口 | `memory.ts`, `canvasStore.ts` | `POST /api/memory/reclassify-nodes` 批量 AI 重分类；`reclassifyNodes()` 动作 |

#### 解决的问题

- 历史节点分类错误（"幸福的探讨"被标为"其他"）：关键词覆盖不足 → 已扩充
- 节点缺乏立体感：统一平铺 → 增加 hover/drag lift 动画
- 80+ 节点帧率下降（P1）：无裁剪全渲 → viewport culling
- AI/存储失败无感知（P1）：静默吞错 → toast 提示

---

## [0.2.55] - 2026-03-07

### refactor(v0.2.55): 极简视觉重设计 — 连线 + 节点卡片

#### 改动

| 内容 | 文件 | 说明 |
|------|------|------|
| 去掉逻辑边六色 | `Edge.tsx` | logical 边统一极淡黑色（opacity 0.06–0.16），置信度仅影响透明度，不再区分颜色 |
| 去掉语义边紫色虚线 | `Edge.tsx` | semantic 边统一极淡黑色（opacity 0.05–0.18），权重仅影响透明度，无虚线 |
| 去掉 hover 标签和点击面板 | `Edge.tsx` | 连线不再有任何交互层，画布静默不打扰 |
| 去掉 framer-motion 入场动画 | `Edge.tsx` | Edge 组件大幅简化，移除 useState/useEffect/motion 依赖 |
| 节点背景改纯白 | `NodeCard.tsx` | `rgba(255,255,255,0.92)` 替代分类色背景 |
| 左侧 accent 色条 | `NodeCard.tsx` | 3px 竖条（`node.color` opacity 0.7），紧贴左边框，表达分类但不抢戏 |
| 新增 PROJECT.md | `docs/PROJECT.md` | 项目管理唯一入口：当前冲刺 / 优先级队列 / 设计原则 / 决策记录 |

**设计依据**：连线的存在本身已传达"有关联"，颜色叠加反而是视觉噪音。节点卡片主体保持中性白，分类用细线暗示而非整块涂色。参考微信/苹果设计哲学：克制即美。

**测试**：289/289 通过 · TS 零错误

---

## [0.2.54] - 2026-03-07

### fix(v0.2.54): E2E token 隔离 + MemoryLines 颜色映射修复

#### 修复

| 问题 | 文件 | 说明 |
|------|------|------|
| E2E 数据污染用户库（P0） | `.env` | `ACCESS_TOKEN`（E2E 专用）改为独立测试 token，追加到 `ACCESS_TOKENS` 末尾，E2E 产生的数据写入独立用户库，不再污染真实用户数据 |
| MemoryLines 颜色看不出差异 | `Canvas.tsx` | 原方案只调整 opacity，节点背景色本身是极淡的浅色，线条视觉无区别。改为 `CATEGORY_LINE_COLORS` 映射表，7 种分类映射到深色/饱和版线条色（绿/黄/蓝/天蓝/红/紫/灰），视觉区分明显 |

**测试**：289/289 通过 · TS 零错误

---

## [0.2.53] - 2026-03-07

### feat(v0.2.53): MemoryLines 语义化颜色 + 逻辑边入场动画

#### 新功能

| 功能 | 文件 | 说明 |
|------|------|------|
| MemoryLines 语义化颜色 | `Canvas.tsx` | 记忆引用虚线（高亮节点 → 输入框）现在使用各节点自身的分类颜色（opacity 0.55）而非统一灰色，多条线同时存在时可以清晰区分来源 |
| 逻辑边初见惊喜动画 | `Edge.tsx`, `canvasStore.ts` | 新逻辑边首次出现时播放路径绘制动画（1s pathLength 0→1）+ 同色外发光消退（1.4s），3秒后标记清除，后续重载不重复播放 |

#### 性能/架构

| 改动 | 文件 | 说明 |
|------|------|------|
| `newLogicalEdgeIds` 状态 | `canvasStore.ts` | 新增 `Set<string>` 状态追踪刚提取的边，`addLogicalEdges` 填入，3s 后 `setTimeout` 清除 |
| MemoryLines marker 个性化 | `Canvas.tsx` | 每条线的箭头 marker 使用对应线的颜色（改为 `id="mem-arrow-{nodeId}"` 避免共用 marker） |

**测试**：289/289 通过 · TS 零错误

---

## [0.2.52] - 2026-03-07

### fix + feat(v0.2.52): 逻辑边修复 + 节点碰撞 + 输入框 Ghost Text + ThinkingSection 分阶段

#### 修复

| 问题 | 文件 | 说明 |
|------|------|------|
| 逻辑边只显示2种 | `canvasStore.ts` | `_triggerLogicalEdgeExtraction` 中 candidates 的 `userMessage: ''` 改为 `title+keywords` 拼接摘要，AI 现在能正确判断全部6种关系 |

#### 新功能

| 功能 | 文件 | 说明 |
|------|------|------|
| 节点拖拽碰撞检测 | `NodeCard.tsx` | `handleGlobalMouseMove` 中加入 `NODE_MIN_GAP=155` 碰撞检测：拖拽节点遇到其他节点时沿推开方向停在边界，节点可挨近但不重叠 |
| Ghost Text 轮换 | `InputBox.tsx` | 输入框为空时每4秒轮换显示5条不同提示语（问我任何事 / 有什么在脑子里转？/ 最近在思考什么？等），聚焦后暂停 |
| 快捷键提示简化 | `InputBox.tsx` | 两个带边框的 tag → 单行轻量文字"Enter 发送 · Shift+Enter 换行"，减少视觉噪音 |
| ThinkingSection 分阶段 | `ThinkingSection.tsx` | 思考过程分4阶段：等待首token → 正在分析（<200字）→ 深度推理中（<800字）→ 全力思考中（≥800字）→ 思考完毕 · N字 |

**289/289 测试通过，TS 编译零错误**

---

## [0.2.51] - 2026-03-07

### chore(v0.2.51): 代码质量重构 — 大文件拆分 + AI 友好代码规范

#### 改动概览

- **文件拆分（4 个目标）**：
  - `server.test.ts` (1610行) → 3 文件：`server.test.ts` (629) + `server-integration.test.ts` (703) + `server-ai.test.ts` (272)
  - `agentWorker.ts` (853行) → 2 文件：`agentWorker.ts` (234，调度入口) + `agentTasks.ts` (626，AI任务实现)
  - `AnswerModal.tsx` (1339行) → 2 文件：`AnswerModal.tsx` (1112，主逻辑) + `AnswerModalSubcomponents.tsx` (255，纯UI子组件)
  - `canvasStore.ts` (1551行) → 未拆分（Zustand 单store闭包设计，拆分需 slice 重构），新增架构注释 + `[SECTION:]` 导航标记

#### 新增文件

| 文件 | 说明 |
|------|------|
| `src/server/agentTasks.ts` | AI 后台任务实现（consolidateFacts / extractLogicalEdges / extractProfile 等） |
| `src/server/__tests__/server-integration.test.ts` | memory/agent/file 集成测试（使用 memDb/fileDb 作用域） |
| `src/server/__tests__/server-ai.test.ts` | readRound 逻辑 + 澄清层触发 + search_round 格式测试 |
| `src/renderer/src/components/AnswerModalSubcomponents.tsx` | 纯UI子组件：UserMessageContent / ReferenceBlockBubble / ClosingAnimation / InputArea |

#### 规范

- 所有文件 < 1000 行理想，绝对上限 1500 行
- AI 友好代码：`[SECTION:]` 标记分区，模块职责头注释
- 测试按 DB 作用域分组（testDb / memDb / fileDb），按功能域分文件

**289/289 测试通过，TS 编译零错误**

---

## [0.2.50] - 2026-03-07

### feat(v0.2.50): 多轮 web_search + 调研澄清层 + 代码质量修复

#### 变更 A：后端多轮搜索（ai.ts）

- **`readRound()` 提取为独立函数**：从单轮 SSE 流中读取 content/reasoning 增量及 tool_calls，统一复用。
- **P0 修复**：添加 `try/finally reader.releaseLock()`，确保 ReadableStream reader 在任意退出路径下均被释放，消除资源泄漏。
- **while 循环替代 if**：最多 5 轮（`MAX_SEARCH_ROUNDS = 5`），每轮在 `finishReason === 'tool_calls'` 且有 tool_calls 时继续，否则正常退出。
- **续轮请求包含 `tools` 声明**：每次续轮请求都带 `tools: [{ type: 'builtin_function', function: { name: '$web_search' } }]`，确保模型可以继续调用搜索。
- **`search_round` SSE 事件**：每次进入新搜索轮次前推送 `{ type: 'search_round', round, message }` 给前端。

#### 变更 B：前端搜索进度指示器

- **`AIStreamChunk` 扩展**：新增 `type: 'search_round'`，带 `round?: number` 字段（`services/ai.ts`）。
- **`useAI.ts` 新增 `onSearchRound` 回调**：在 for-await 循环中分发 `search_round` chunk，调用 `callbacksRef.current.onSearchRound?.(round, message)`。
- **`AnswerModal.tsx` 搜索进度 UI**：最新一轮 AI 回复区域上方显示蓝色动态提示条，`onComplete` 时清空；仅在 `isStreaming && idx === turns.length - 1` 时展示。

#### 变更 C：调研前澄清层（AnswerModal.tsx）

- **触发条件**：`!isOnboardingMode && hasResearchKw && !hasConcreteTarget && !clarifyPending`。
- **P1 修复**：添加 `!isOnboardingMode` 守卫，确保新手引导流程中不触发澄清层。
- **澄清卡片**：浮于输入框上方（`absolute bottom-full`），提供「行业与市场数据」「产品或技术方案对比」两个快捷按钮，及自由输入框。
- **`sendClarifiedMessage` 提取**：将两处相同的 `doSend` 匿名函数提取为 `useCallback`，消除代码重复。

#### 变更 D：单元测试（+20 tests）

- **`readRound` 逻辑测试**（6 个）：普通 content 流、tool_call 累积、reader.releaseLock 无泄漏、多并行 tool_calls、`[DONE]` 跳过、空 body。
- **澄清层触发规则测试**（9 个）：关键词、引号锚点、年份、英文词、长度>20、onboarding 守卫、重复触发防护、无关键词、短英文边界。
- **search_round 消息格式测试**（5 个）：round=2/3/5 消息文本、MAX_SEARCH_ROUNDS=5 边界、finishReason!=tool_calls 提前退出。

总计 289 tests，全部通过（原 269 + 新增 20）。

---

## [0.2.49] - 2026-03-07

### fix(v0.2.49): Edge 视觉白色毛玻璃重设计 + 逻辑边去重提取

#### 变更 A：Edge.tsx 视觉重设计

- **hover label（branch/category 边）**：背景从黑色 `rgba(15,15,15,0.75)` 改为白色 `rgba(255,255,255,0.92)`，文字从白色改为深灰 `rgba(50,50,70,0.85)`，新增浅色描边与轻投影，与画布白色毛玻璃风格统一。
- **hover label（语义/逻辑边）**：改为白色背景 + 主色 accent 文字 + 主色半透明描边，宽度自适应文字长度（由固定 52px 改为 `label.length * 13 + 24`）。
- **点击解释面板**：背景从 `rgba(15,15,20,0.92)` 黑底改为 `rgba(255,255,255,0.93)` 白色毛玻璃，移除顶部色条，新增左侧 accent 竖条（3px 宽，关系主色）；分数由文本改为 badge（主色 12% 填充背景）；正文文字从白色改为 `rgba(60,60,80,0.85)` 深色；关闭提示从"点击边关闭"改为"再次点击关闭"。
- **panelTitle**：逻辑边无 relation 时降级显示 `'逻辑关联'`，语义边标题从 `'语义相似'` 改为 `'语义关联'`。
- 移除不再使用的 `panelW` / `panelH` 变量，面板尺寸计算移入 IIFE 局部作用域。

#### 变更 B：canvasStore.ts 逻辑边去重

- `addNode` 的逻辑边提取 `setTimeout` 改为 `async`，触发前先 `GET /api/memory/logical-edges/:conversationId` 检查是否已有逻辑边。
- 若 `edges.length > 0` 则直接返回，跳过 AI 请求，避免重复消耗 API 配额。
- `fetch` 失败时静默 catch 并继续触发提取（fail-safe，不破坏正常流程）。

---

## [0.2.48] - 2026-03-07

### feat(v0.2.48): 连线可解释性 + L3 逻辑边提取 (commit 3d3d55d)

#### 变更 A：L3 逻辑边提取
- **agentWorker.ts** 新增 `extractLogicalEdges` 异步任务：对话结束后对比当前节点与 top-5 语义相近节点，调用 moonshot-v1-8k 提取显式逻辑关系（`deepens` / `solves` / `contradicts` / `depends` / `inspires` / `revises`），写入 `logical_edges` 表。
- **db.ts** 新增 `logical_edges` 表（`from_id`, `to_id`, `relation`, `reason`, `confidence`, `created_at`），支持多租户 `conversation_id` 隔离。
- **memory.ts** 新增 `GET /api/memory/logical-edges` 路由：前端可按 `conversationId` 拉取逻辑边列表；新增 `POST /api/memory/logical-edges` 供 agentWorker 批量写入。
- **types.ts** `Edge` 新增 `edgeType: 'logical'`、`relation?: string`、`reason?: string`、`confidence?: number` 字段，向后兼容。

#### 变更 B：连线可解释性（Edge.tsx）
- 新增 `RELATION_STYLES` 映射表，为 6 种逻辑关系分配独立视觉样式（颜色、虚线类型、箭头）：深化(蓝实线)、解决(绿实线)、矛盾(红虚线)、依赖(灰实线)、启发(金虚线)、重新思考(橙波浪线)。
- 点击逻辑边弹出解释面板（`EdgeInfoPanel`）：显示关系类型、AI 置信度百分比、中文解释（reason 字段）、时间戳。
- LOD（细节层次）支持：缩放比例 < 0.4 时标签与面板自动隐藏，保持画布性能。
- 修复 `pointerEvents` 问题：语义边和逻辑边的 hit area 扩展为透明宽 stroke，确保细线可点击。

#### 变更 C：canvasStore logicalEdges 状态机
- 新增 `logicalEdges` 状态（与 `semanticEdges` 平行管理）。
- 新增 `addLogicalEdges()`、`clearLogicalEdgesForNode()`、`loadLogicalEdges()` 方法。
- `addNode()` 完成后异步触发 `_triggerLogicalEdgeExtraction()`（500ms 延迟，等待 AI 回复稳定），逻辑边提取对主流程完全透明。
- `removeNode()` 同步清除相关逻辑边，防止悬空引用。
- 逻辑边持久化到 `logical-edges.json`，重启后恢复。

---

### fix: API key 不保存 + 连线 hover/click 无响应 (commit 856f3b0)

#### 修复 A：API Key 不保存
- **server/index.ts** `/api/settings` PUT 路由：新增空字符串守卫（`if (!key || key.trim() === '')`），拒绝写入空 key，避免覆盖已存在的有效 key。
- **SettingsModal.tsx**：新增 `hasExistingKey` 状态，已配置 key 时显示 `●●●●●●●●` 掩码 + "已配置，输入新值以替换"提示，用户不必重复粘贴 key。

#### 修复 B：连线 hover/click 无响应
- **Edge.tsx**：将所有边的 SVG `<path>` 元素分为视觉层（细线）和交互层（透明宽 stroke，12px），交互层独立处理 `onMouseEnter`/`onMouseLeave`/`onClick`，彻底解决细线无法命中的问题。
- 修复语义边在 `pointerEvents: none` 状态下 tooltip 无法触发的问题（改为 `pointerEvents: 'auto'` 并通过 z-index 管理层级）。

---

## [0.2.47] - 2026-03-07

### Embedding 内置化 + 节点语义关联（知识图谱化）

#### 变更 A：Embedding 内置化
- **memory.ts** `fetchEmbedding`：从使用用户配置 API Key 改为内置阿里云 Key（`text-embedding-v3`，1536 维）。用户无需配置 embedding 专用 Key，向量化能力开箱即用。
- **agentWorker.ts** `embedFileContent`：同步改为内置 Key，文件 embedding 不再依赖用户 Key。
- 移除 `embeddingDisabledKeys` 缓存逻辑，替换为 `builtinEmbeddingFailed` 进程级标志。

#### 变更 B：节点语义关联边
- **types.ts** `Edge`：新增 `edgeType?: 'branch' | 'category' | 'semantic'` 和 `weight?: number` 字段。
- **canvasStore.ts**：新增 `semanticEdges` 状态、`addSemanticEdges()`、`clearSemanticEdgesForNode()` 方法。`addNode()` 完成后异步触发 `_buildSemanticEdgesForNode()`，300ms 延迟后调用 `/api/memory/search/by-id`，过滤 score ≥ 0.65，每节点最多生成 5 条语义边，全局上限 200 条，持久化到 `semantic-edges.json`。
- **memory.ts**：新增 `POST /api/memory/search/by-id` 路由，以已有节点向量做 k-NN，零额外 embedding 调用。
- **Edge.tsx**：语义边渲染为紫色虚线（rgba(139,92,246,0.9)，`strokeDasharray="4 4"`），weight 越高越粗（1–3.5px），透明度 0.1–0.4。
- **constants.ts**：`STORAGE_FILES` 新增 `SEMANTIC_EDGES`，`ALLOWED_FILENAMES` 新增 `'semantic-edges.json'`。

#### 历史节点回算
- `loadNodes()` 完成后，若 `semantic-edges.json` 不存在或为空，自动串行回算所有历史记忆节点的语义边（每节点间隔 200ms），用户可直观看到图谱"生长"过程。

## [0.2.46] - 2026-03-07

### 文件上传 embed_file 稳定性修复

#### 问题根因
Moonshot API 对 embedding 端点返回 403（需单独开通权限），且 5 秒 AbortSignal 超时太短导致第一个分块超时。前两次尝试失败后文件被标记为 `failed`，给用户呈现错误状态，但实际上文件文本内容已完整存储，AI 对话完全可用。

#### 变更 A：`embed_file` 失败状态语义修正
- **agentWorker.ts**：embedding 无法完成（无 key / 403 权限不足 / 全部 chunk 超时）时，`embed_status` 从 `'failed'` 改为 `'text_only'`，准确表达"文本可读，无向量索引"
- **agentWorker.ts**：embedding API 超时从 `AbortSignal.timeout(5_000)` 提升至 `15_000`，避免慢响应被误判为失败

#### 变更 B：生产数据库修复
- 服务端 `data/0937432a3330/anima.db` 中已存在的 `failed` 记录直接 UPDATE 为 `text_only`

## [0.2.45] - 2026-03-06

### 文件上传 UI 修复 + 节点布局优化

#### 变更 A：用户消息气泡不再显示文件原始内容
- **AnswerModal.tsx `UserMessageContent`**：渲染前用正则剥离 `=== 文件 N: filename ===\n...\n=== 结束 filename ===\n` 块，文件内容不再以纯文本泄露到对话气泡中
- **canvasStore.ts `addNode`**：节点标题生成时同样剥离文件内容标记和引用块标记，保证节点标题干净可读

#### 变更 B：节点卡片显示文件附件标签
- **types.ts `Node`**：新增 `files?: FileAttachment[]` 字段（非图片附件）
- **canvasStore.ts `addNode`**：创建节点时过滤出非图片文件（`!f.preview`），写入 `newNode.files`
- **NodeCard.tsx**：在"记忆引用数量"下方新增文件胶囊列表，样式：`bg-white/60 border border-gray-200/60`，含 Paperclip 图标 + 文件名（截断）

#### 变更 C：节点碰撞检测与推挤优化
- **canvasStore.ts `addNode`**：螺旋搜索半径上限从 700px 扩展至 1000px，最大迭代从 100 次增至 120 次
- **fallback 推挤**：候选位置从 8×1 改为 16×3 组合（16个角度 × 3个半径），更大可能找到空位
- **推挤对象**：从仅推挤同类节点（`catNodes`）改为推挤所有过近节点（任意类别），防止跨类别重叠
- **推挤方向**：从"沿岛屿质心方向"改为"沿新节点→被推节点方向"，物理上更直观准确

---

## [0.2.44] - 2026-03-06

### 引用块功能 + 记忆系统升级 + 加载体验优化 + P2 修复

#### 变更 A：引用块 UI（InputBox.tsx + AnswerModal.tsx InputArea）

- 粘贴内容 > 500 字时，自动识别为引用块，在输入框上方显示折叠胶囊（`ReferenceBlockPreview`）
- **AnswerModal 底部 InputArea 同步支持引用块**（之前仅主画布 InputBox 有此功能）
- 用户消息渲染改用 `UserMessageContent` 组件，解析 `[REFERENCE_START]...[REFERENCE_END]` 标记为折叠胶囊
- 引用块样式：`bg-amber-50` 系，与普通文字有明显区分；可展开查看全文

#### 变更 B：记忆提取引用块过滤

- **canvasStore.ts**：调用 `/api/memory/extract` 前，正则剥离引用块内容，只传对话核心
- **memory.ts**：服务端 `/extract` 路由做防御性二次剥离，防止前端漏传

#### 变更 C：FTS5 BM25 替换 Jaccard fallback

- **db.ts**：`initSchema` 新建 `memory_facts_fts` FTS5 虚拟表及四个触发器（insert/invalidate/delete/update 同步），migrations 补充存量回填
- **ai.ts**：新增 `bm25FallbackFacts` 函数；`fetchRelevantFacts` 的 embedding 失败分支改为返回 BM25 结果；层 3 fallback 链：embedding → BM25 → 时间序 top-10（从15降到10）；移除低效 Jaccard 分支

#### 变更 D：激活 decayOldPreferences

- **agentWorker.ts**：新增 `maybeDecayPreferences`（每24小时对 `config.preference_rules` 做 -0.05 衰减，最低 0.3），在 `tick()` 每用户 db 循环中调用

#### 变更 E：统一 enqueueTask

- **memory.ts**：`/consolidate` 路由和 `/extract` 自动触发处，改用已有 `enqueueTask()` 替换裸 SQL INSERT

#### 变更 F：加载状态动画优化（ThinkingSection + AnswerModal）

- **ThinkingSection.tsx**：新增 `isWaiting` prop，发送后等待首 token 时显示三点跳动动画 + "正在思考..."；streaming 时左侧蓝色脉冲圆点 + "正在思考中"；思考内容边框改蓝色系（`border-blue-100 bg-blue-50/40`）；完成后显示"思考完毕"
- **AnswerModal.tsx**：初始 `isLoading` 状态改为三点弹跳动画 + "正在连接…"，替代原来的小转圈

#### P2 修复

- **agentWorker.ts**：`maybeDecayPreferences` 操作正确数据源 `config.preference_rules`（而非 `storage.profile.json`）
- **db.ts**：补充 `fts_sync_update` trigger（fact 内容编辑时同步 FTS5 索引）
- **InputBox.tsx**：引用块数量上限 5 个（`.slice(0, 5)`）

---

### 修复 agentWorker 多租户 bug（P0）

#### 问题
多用户部署（`ACCESS_TOKENS` 配置多个 token）时，后台 Agent Worker 的所有任务
（`extract_profile`、`extract_preference`、`embed_file`、`consolidate_facts`）
全部静默操作第一个用户的默认数据库，其他用户的记忆提取、画像积累、文件向量化功能完全失效。

#### 根本原因
`agentWorker.ts` 通过 `import { db } from './db'` 使用全局默认 db 实例，而实际上
每个用户的 `agent_tasks` 存在自己的 `data/{userId}/anima.db` 里。

#### 修复
- `db.ts` 新增 `getAllUserDbs()`，扫描 `data/` 目录下所有 12 位 hex userId 子目录
- `agentWorker.ts` 所有工作函数改为接收 `db` 参数，`tick()` 遍历所有用户 db
- `enqueueTask(db, type, payload)` 新增必传 `db` 参数
- `routes/memory.ts` 的 `/queue` 路由和 `routes/storage.ts` 的文件上传入队均传入正确的用户 db
- 新增 4 个集成测试验证多租户隔离正确性

单用户 self-hosted 场景完全透明，行为与之前一致。

---

### 生产环境问答与体验修复

针对生产环境某账户「无法正常问答」的排查与修复，涉及接口、前端状态与流式降级。

#### 问题与修复摘要

1. **profile.json 404 与前端报错**
   - 现象：控制台大量 404，新用户无 profile 时前端解析失败。
   - 修复：`GET /api/storage/profile.json` 在无文件时返回 200 + `{ rules: [] }`，不再返回 404。

2. **settings 在 web 模式无谓 404**
   - 现象：web 模式下仍请求本地 `settings.json`，产生 404。
   - 修复：SettingsModal 优先从 `configService.getSettings()` 拉取；仅在 Electron 下回退到本地 `settings.json`；并导出 `isElectronEnvironment()` 供区分环境。

3. **重新进入对话后 TypeError（profile.rules）**
   - 现象：进入历史会话或重试时出现「读取 rules 为 undefined」的报错。
   - 修复：`loadProfile` 恢复从 storage 读 `profile.json`，并保证写入 store 的 `profile.rules` 始终为数组；`getPreferencesForPrompt`、`detectFeedback`、`addPreference`、`removePreference` 等处对 `profile?.rules` 做 `Array.isArray` 防御。

4. **重试/重新生成时 state 陈旧**
   - 现象：从会话进入时调用 `handleRegenerate` 使用陈旧 `turns`，导致 `currentTurn.user` 为空报错。
   - 修复：`handleRegenerate` 支持传入 `sourceTurns`，从会话进入时传入当前会话的 `finalTurns`。

5. **简单问句首包慢**
   - 现象：「你好」「你是谁」等简单问句响应前等待时间长。
   - 修复：扩展简单问句规则（元问句、短句等），命中时走 FAST_MODEL 快路径；服务端 SSE 解析支持 `\r\n` 换行。

6. **复杂问句「网络连接中断」**
   - 现象：开启联网搜索时上游请求失败即报错，无降级。
   - 修复：带 `tools` 的请求在收到任何内容前失败时，自动重试一次不带 `tools` 的请求，保证至少返回无联网回答。

7. **流式结束时报网络错误但内容已完整**
   - 现象：ERR_INCOMPLETE_CHUNKED_ENCODING 等导致整次回答被标为失败。
   - 修复：若错误为网络/fetch/incomplete/chunk 类且已累积有效 `fullText`，则视为成功结束、保存历史并调用 `onComplete`。

详细过程与小结见项目根目录《0306生产环境问答修复与总结.md》。

---


## [0.2.42] - 2026-03-06

### Code review 修复

根据 v0.2.37-v0.2.41 整体 code review 发现的三个边界问题：

1. **OnboardingGuide.tsx**：`localStorage.getItem('evo_onboarding_v3')` 改为严格比较 `=== 'done'`，
   与 canvasStore.ts 保持一致，避免存入非预期值时误判已完成
2. **agentWorker.ts** `mergeArr`：`JSON.parse(existing)` 加 try/catch，防止存储数据损坏时崩溃
3. 单元测试 232 / 232 全通过，E2E 测试 10 / 10 全通过

---



### 彻底消除 embedding 超时等待

#### 问题
Moonshot embedding API（`moonshot-v1-embedding`）对当前账号未开通，每次请求先等 5s 超时才
fallback 到关键词搜索，导致记忆检索有可感知的延迟。

#### 修复
- `memory.ts`：首次收到 403 后将 apiKey 加入内存黑名单，后续请求直接跳过，零等待
- `agentWorker.ts`：文件 embedding 遇 403 同样加入黑名单并立即标记 failed，不再消耗重试次数
- 效果：服务重启后第一次 embedding 请求仍会收到 403（约 < 1s），之后所有请求直接走关键词搜索

---



### 修复主输入框卡死 + 优化 embedding 超时处理

#### 问题
1. 从主输入框发消息后 modal 不打开（一直无响应）
2. Moonshot embedding API 返回 403 导致每次请求等待 10 秒超时，全面拖慢体验
3. 日志被 403 warning 刷屏

#### 根本原因
- `startConversation` 调用 `await getRelevantMemories()`，后者请求后端 `/api/memory/search`，
  后端调 Moonshot embedding 接口（未开通 403），等待 10 秒超时后才返回
- 在 10 秒等待期间 modal 没有打开，用户以为按钮无响应
- 之后 `startConversation` 虽然执行了 `set({isLoading: true})`，但 `AnswerModal` 的发送 effect 检测到
  `isLoading=true` 就跳过不执行，造成二次死锁（modal 永远转圈）

#### 修复
- `startConversation` 改为**立即打开 modal**（`isLoading: false`），后台异步获取记忆用于自动连线
- embedding 超时从 10s 缩短至 5s
- 403 由 `warn` 降级为 `info`，不再刷屏日志
- agentWorker 的 embed_file 遇到 403 时立即标记 `failed` 并退出，不再重试

---



### 修复跨账号切换导致 onboarding 状态污染

#### 问题
同一浏览器切换不同账号时，上一个账号完成引导后留下的 `evo_onboarding_v3=done`
会污染新账号（新用户），导致：
- onboarding 节点不被创建
- 新手教程不弹出
- 画布只显示"导入外部记忆"块或完全空白

#### 根本原因（`canvasStore.ts loadNodes`）
`onboardingDone` 只读 `localStorage`，不验证服务端数据，跨账号切换时本地标记仍然有效。

#### 修复
- 引入双重验证：`localStorage` 标记 **AND** 服务端数据确认
  （有真实对话节点 OR onboarding 节点已完成状态）
- 发现 localStorage 与服务端不一致时自动清除本地标记，下次加载正确触发引导

---

## [0.2.38] - 2026-03-06

### 修复新用户 onboarding 被 App.tsx 误判跳过

#### 问题
新用户首次登录后，`loadNodes` 创建 capability 节点写入 `nodes.json`；
第二次刷新时 `App.tsx` 发现 `nodes.json` 返回 200 就直接写入 `evo_onboarding_v3=done`，
导致新手教程永远不再弹出。

#### 修复（`App.tsx`）
读取 `nodes.json` 内容并解析，只有当存在非 capability 的真实对话节点时才跳过引导。

---

## [0.2.37] - 2026-03-06

### 修复新用户 onboarding 闪烁和报错提示

#### 问题
1. `canvasStore.loadNodes` 末尾调用 `openOnboarding()`，`OnboardingGuide` 组件 800ms 后也调用一次，导致 modal 开/关闪烁
2. `OnboardingGuide` effect 依赖数组缺少 `nodes`，等不到节点加载完就触发
3. AnswerModal 进入 onboarding 时显示残留的 errorMessage

#### 修复
- `canvasStore.ts`：删除 `loadNodes` 末尾的 `openOnboarding()` 调用
- `OnboardingGuide.tsx`：等 `nodesLoaded=true` 后触发，修正依赖数组，正确识别老用户
- `AnswerModal.tsx`：进入 onboarding 模式时清除残留 errorMessage

---

## [0.2.36] - 2026-03-06

### 严重安全漏洞修复：多用户数据隔离泄露

#### 漏洞描述
**高危**：任意持有合法 token 的用户（包括测试 token `evo_test_002~005`）首次登录时，
`migrateFromDefault()` 函数会把 `data/anima.db`（主用户的全部历史数据）复制到新用户数据库，
导致其他用户可以看到主用户的全部聊天记录、记忆、节点数据。

#### 根本原因（`src/server/db.ts`）
`migrateFromDefault()` 的设计意图是"从旧版无鉴权 anima.db 迁移到新版多租户数据库"，
但缺少用户身份校验——对任意 userId 的新数据库都会执行迁移，不区分是否是数据的真实所有者。

#### 修复
1. **身份校验**：`migrateFromDefault(db, userId)` 新增 `userId` 参数，函数内部通过 `ACCESS_TOKEN` 计算主用户 userId，只有匹配时才执行迁移，其他用户直接返回
2. **幂等锁文件**：迁移成功后写入 `data/{userId}/.migrated` 标记文件，防止重复迁移
3. **废除泄露 token**：`.env` 中删除 `evo_test_002~005`，`ACCESS_TOKENS` 只保留 `evo_yuzhiyang_001`

#### 线上服务器紧急操作（需手动执行）
```bash
# 删除已被污染数据的测试用户数据库（这些 db 包含了主用户数据的副本）
rm -rf data/f767c37874d2  # evo_test_002
rm -rf data/f554a7fa04b6  # evo_test_003
rm -rf data/77bbe65307a8  # evo_test_004
rm -rf data/8984a18ab49a  # evo_test_005
# 重启服务
```

#### 测试
- `npm test`：232 tests 全部通过

---

## [0.2.35] - 2026-03-06

### 在线版 modal 竞态修复 + 网络错误友好提示

#### 问题
在线部署（在线服务器版）出现多个关联 bug：
1. **点击卡片无响应/等待久**：`openModalById` 需先完成 `conversations.jsonl` 网络读取才打开 modal，网络慢时 UI 无任何响应
2. **进去的不是点的那个**：找不到对话时 `currentConversation: null` 但 modal 仍打开，显示上一个对话内容
3. **已完成卡片点进去重新生成**：`openModalById` 先设 `isModalOpen: true`（旧 conversation 残留）触发 `prepareConversation` effect，再异步更新 conversation，导致 effect 在旧数据上跑了一遍，触发重生成
4. **快速连续点击多个卡片**：多个并发异步请求，先发后返的覆盖了后发先返的，显示错误的对话
5. **`[API错误: fetch failed]` / `[API错误: BodyStreamBuffer was aborted]`**：网络中断时底层原始错误直接透传给用户

#### 修复

**`canvasStore.ts` — `openModalById`**
- 改为立即 `set({ isModalOpen: true, isLoading: true })`，modal 立刻打开显示 loading spinner，不等网络
- 引入模块级 `_openModalToken` 递增令牌，异步回调中只有持有最新令牌的请求才被接受，彻底解决快速点击竞态
- 找不到对话时 `set({ isModalOpen: false })`（不再打开空 modal）

**`AnswerModal.tsx`**
- 订阅 `isLoading` 状态：`isLoading === true` 时 `prepareConversation` effect 提前返回，防止在旧 conversation 上触发生成
- 新增 `isLoading` 监听 effect：loading 开始时立即清空 `turns`/`isStreaming`/`errorMessage`，避免 modal loading 期间显示上一个对话内容
- 对话内容区加条件渲染：`isLoading` 时显示居中 spinner，不渲染 turns

**`ai.ts` — 网络错误归一化**
- 捕获 `fetch failed`（含大小写变体）、`BodyStreamBuffer was aborted`、`NetworkError`、`ERR_NETWORK` 等底层网络错误，统一替换为"网络连接中断，请检查网络后重试"

#### 新增测试（`src/renderer/src/services/__tests__/ai.test.ts`）
- 新增 16 个单元测试，覆盖：5 种网络错误归一化、3 种 HTTP 状态码映射、SSE 内容/推理流解析、error 事件、malformed JSON 容错、callAI 汇总

#### 测试结果
- `npm test`：232 tests 全部通过（新增 16 个）
- `playwright test`：10 E2E tests 全部通过

---

## [0.2.34] - 2026-03-06

### 刷新闪烁修复（nodesLoaded + apiKeyChecked 状态防抖）

#### 问题
刷新页面后，节点数据从服务端异步加载完成前，UI 会短暂显示：
- "画布空空如也" 空状态提示
- "需要配置 Kimi API Key 才能开始对话" 提示

#### 根本原因
- `hasApiKey` 初始值为 `false`，`evo_onboarding_v3` 在 localStorage 已标记完成
- `needsApiKey = onboardingDone && !hasApiKey && !isOnboardingMode` 在 `loadNodes()` 尚未返回时即为 `true`，导致 API Key 提示立即渲染
- `nodes.length === 0` 在 `loadNodes()` 返回前永远为真，导致空画布提示立即渲染

#### 修复（`canvasStore.ts` + `InputBox.tsx` + `Canvas.tsx`）
- 新增 `apiKeyChecked: boolean`：`checkApiKey()` 完成后才设为 `true`，`needsApiKey` 加上此条件（`apiKeyChecked && !hasApiKey`）
- 新增 `nodesLoaded: boolean`：`loadNodes()` 的 try/catch 结束后设为 `true`，空画布提示加上 `nodesLoaded` 条件
- 刷新流程：spinner（`!authChecked`）→ 节点静默加载中（无空状态闪烁）→ 节点渲染完成

#### 测试
- `npm test`：216 tests 全部通过
- 线上部署验证完成

---

## [0.2.33] - 2026-03-06

### 首屏性能优化 + 白屏修复 + gzip_static 修复

#### 代码分割（`vite.config.ts`）
- 新增 `manualChunks`：`vendor-react`(43KB)、`vendor-zustand`(4KB)、`vendor-markdown`(47KB) 拆为独立 chunk，主 bundle 从 1.08MB 降至 283KB（gzip：315KB → 89KB，减少 72%）
- 首屏需下载约 183KB gzip，减少 42%；浏览器并行下载多个小 chunk 比顺序下载一个大文件更快

#### mammoth 动态导入（`src/services/fileParsing.ts`）
- 将 `import * as mammoth from 'mammoth'`（静态，~400KB）改为 lazy singleton 动态 import，仅在用户首次上传 Word 文档时加载，不阻塞首屏

#### Loading Spinner（`src/renderer/src/App.tsx`）
- `authChecked=false`（bundle 加载期间）改为显示居中 spinner + "正在加载..."，消除纯白屏体验

#### gzip_static 修复（Nginx，服务器端）
- 代码分割后新 chunk 文件名变化，服务器上旧 `.gz` 预压缩文件不匹配，`gzip_static on` 导致 `ERR_EMPTY_RESPONSE`
- 已将生产服务器 nginx 配置改为 `gzip_static off`，on-the-fly gzip 正常返回 `Content-Encoding: gzip`
- `docs/deployment-server.md` 同步更新

#### 测试
- `npm test`：216 tests 全部通过
- `playwright test`：10 E2E tests 全部通过
- 线上 API 验证：health/auth/storage/config/memory 全部正常

---

## [0.2.32] - 2026-03-06

### 老用户数据迁移 + 新手引导误触发修复 + E2E 鉴权修复

#### 老用户数据自动迁移（`db.ts`）
- **`src/server/db.ts`**：新增 `migrateFromDefault()`，首次为 userId 建库时，若 `_default` 库（v0.2.25 前无 token 的旧数据）有内容，自动迁移 `storage` / `config` / `memory_facts` 表到新 userId 库，保留历史对话、节点、记忆和 API 配置
- 迁移为幂等操作（仅在新库为空时执行），迁移成功后打印日志

#### 新手引导误触发修复（前端三处）
- **`src/renderer/src/App.tsx`**：自动登录验证（已保存 token）且 `r.ok` 时，在 `setAuthed(true)` 前先设置 `evo_onboarding_v3='done'`，防止 `loadNodes` 内部在 localStorage 标记写入前检查
- **`src/renderer/src/components/LoginPage.tsx`**：手动输入 token 验证成功且服务端返回 200（有数据）时，同样在 `onLogin()` 前写入 `evo_onboarding_v3='done'`
- **`src/renderer/src/components/OnboardingGuide.tsx`**：新增兜底检测，`nodes.length > 0` 时直接写标记并 return，防止数据已存在但标记丢失时触发引导

#### E2E 鉴权环境变量修复
- **`.env`**：新增 `ACCESS_TOKEN=evo_yuzhiyang_001`（与 `ACCESS_TOKENS` 首位一致），供 E2E 测试及 `playwright.config.ts` 的 `process.env.ACCESS_TOKEN` 读取；服务端仍以 `ACCESS_TOKENS`（逗号分隔多 token）为准

#### 测试
- `tsc --noEmit`：零错误
- `npm test`：216 tests 全部通过
- `playwright test`：10 E2E tests 全部通过（修复前 6 个因无 auth header 失败）

---

## [0.2.31] - 2026-03-05

### API Key 引导流 + GlobalUI 交互组件系统

#### 引导模式演示 key fallback
- **`src/server/routes/ai.ts`**：引导模式（`isOnboarding=true`）且用户未配置 key 时，自动 fallback 到 `process.env.ONBOARDING_API_KEY`，确保新用户无需提前配置即可完成引导对话；fallback key 用于所有 3 处上游 fetch（主轮次、语义检索、第二轮 tool_calls）
- **`.env`**：新增 `ONBOARDING_API_KEY=` 占位行

#### canvasStore 新增 hasApiKey / checkApiKey
- **`src/renderer/src/stores/canvasStore.ts`**：新增 `hasApiKey: boolean` state 和 `checkApiKey()` action（调用 `configService.getApiKey()`，成功后更新 store）；`completeOnboarding()` 和 `loadNodes()` 的 `onboardingDone` 分支末尾各触发一次 `checkApiKey()`

#### InputBox API Key 提示 + 内联配置
- **`src/renderer/src/components/InputBox.tsx`**：引导完成且无 key 时 InputBox 变为提示条（"需要配置 Kimi API Key 才能开始对话"）+ 「设置 API Key」按钮；点击展开内联 password 输入框，粘贴 key 后回车或点「保存」即触发 `POST /api/config/verify-key` 验证；验证成功后恢复正常输入状态；`handleSubmit` 开头加 `needsApiKey` 守卫防止无 key 发送

#### GlobalUI — 全局 Toast + ConfirmDialog 系统
- **`src/renderer/src/components/GlobalUI.tsx`**（新增）：提供 `useToast()` 和 `useConfirm()` 两个 hook；Toast 顶部居中弹出，3 秒自动消失，入场/出场弹簧动画；ConfirmDialog 毛玻璃蒙层 + 居中卡片，支持 `danger` 红色按钮，返回 `Promise<boolean>`；`useMemo` 稳定 toastAPI 引用，`useEffect` + `useRef` 追踪 timer 防止内存泄漏
- **`src/renderer/src/App.tsx`**：用 `<GlobalUI>` 包裹整个 App，全局可用

#### 删除确认改造（移除浏览器原生 confirm）
- **`src/renderer/src/components/NodeCard.tsx`**：删除按钮尺寸从 `w-6 h-6` 放大到 `w-8 h-8`，X 图标 12→14px；删除前调用 `useConfirm()` 展示 Web confirm dialog（危险样式）
- **`src/renderer/src/components/ConversationSidebar.tsx`**：「清空用户画像」「遗忘偏好」两处 `window.confirm` 全部替换为 `useConfirm()` Web dialog

#### 测试
- **新增** `src/server/__tests__/ai-onboarding.test.ts`：6 个集成测试覆盖 ONBOARDING_API_KEY fallback 全部分支
- **新增** `e2e/canvas.spec.ts`：新增测试 9（confirm dialog 出现+取消）、测试 10（API Key 提示条+内联输入框流程）
- `tsc --noEmit`：零错误
- `npm test`：216 tests 全部通过

---

## [0.2.30] - 2026-03-05

### 节点布局优化 + 通用记忆导入 + 整理体验提升 + 合并逻辑改进

#### 新节点贴近同类岛屿（push-outward 布局）
- **`src/renderer/src/stores/canvasStore.ts`** `addNode`：新节点优先落在同类节点岛屿附近（螺旋搜索半径 120–600px 共 100 个候选点）；若岛屿周围全满，选最优方向后将阻塞节点沿"岛屿中心→阻塞节点"方向往外推移（写磁盘同步更新），确保新节点始终紧邻同类群落

#### ImportMemoryModal 通用方案入口
- **`src/renderer/src/components/ImportMemoryModal.tsx`**：新增 `generic` step，点击「其他 AI / 通用方式」后展示可复制的提示词文本框（含复制按钮 + 2s 已复制反馈），下方直接提供粘贴区和「保存为记忆节点」，适用于豆包、文心、通义等任意 LLM
- **`src/shared/constants.ts`**：`IMPORT_MEMORY_PROMPTS` 新增 `generic` 键（与其他平台相同 prompt）

#### 整理按钮 hover 提示
- **`src/renderer/src/components/ConversationSidebar.tsx`**：整理按钮从纯图标改为「图标 + 文字」形式，外层 `group` 容器在 hover 时展示 tooltip（44px 宽，描述"AI 合并重复或过时的记忆条目，新信息优先保留"）

#### 合并逻辑时序感知改进
- **`src/server/agentWorker.ts`** `consolidateFacts`：新 prompt 将 facts 按创建时间排序后传给 LLM，明确要求：①新信息优先（同主题新旧不同时丢弃旧条目）；②真正重复才合并；③不相关不硬合；④保留独特信息；⑤每条 ≤ 25 字

#### 测试
- `tsc --noEmit`：零错误
- `npm test`：210 tests 全部通过

---

## [0.2.29] - 2026-03-05

### 对话历史独立入口 + 记忆自动整理

#### 对话历史按钮移到外层
- **`src/renderer/src/components/Canvas.tsx`**：「对话历史」从 LayoutGrid 菜单中移出，变为右上角独立的 `History` 图标按钮，点击直接打开侧栏 history tab，无需先展开菜单

#### 记忆 facts 自动整理（consolidate_facts）
- **`src/server/agentWorker.ts`**：新增 `consolidate_facts` 任务类型，调用 LLM 把所有有效 facts 合并语义重叠条目，软删除旧条目，写入整合后的新条目（条数 ≤ 原来）
- **`src/server/routes/memory.ts`**：
  - `POST /api/memory/extract`：写入成功后检查总数，每满 20 的倍数自动入队一次 `consolidate_facts`（幂等，不重复入队）
  - `POST /api/memory/consolidate`：手动触发接口，前端调用入队任务
- **`src/renderer/src/components/ConversationSidebar.tsx`**：记忆 tab 顶部新增「整理」按钮（Layers 图标，facts ≥ 5 条时显示），点击触发合并并给出 toast 提示；合并任务约 30s 后由 agentWorker 后台完成，用户刷新可见结果

#### 测试
- `tsc --noEmit`：零错误
- `npm test`：210 tests 全部通过

---

## [0.2.28] - 2026-03-05

### 全站 auth header 全量修复（记忆 tab、AnswerModal、文件上传）

#### 根因
`ConversationSidebar.tsx`、`AnswerModal.tsx`、`InputBox.tsx` 共 **15 处** `fetch('/api/...')` 调用缺少 `Authorization: Bearer <token>` 请求头，导致 auth 开启时所有请求返回 401，引发：
- 记忆 tab（「关于你的记忆」「进化基因」「用户画像」）一直显示空
- 对话中偏好提取、onboarding 阶段画像提取静默失败
- 文件上传（InputBox & AnswerModal）、导出功能 401 失败

#### 修复文件
- **`src/renderer/src/components/ConversationSidebar.tsx`**：新增 `authFetch` helper，替换全部 7 处裸 fetch（`/api/memory/profile` × 4、`/api/memory/facts` × 1、`/api/memory/facts/:id` PUT/DELETE × 2）
- **`src/renderer/src/components/AnswerModal.tsx`**：新增 `authFetch` helper，替换全部 5 处裸 fetch（`/api/storage/file`、`/api/memory/queue` × 3、`/api/storage/export`）
- **`src/renderer/src/stores/canvasStore.ts`**：补全 `authFetch` 覆盖节点删除时的 `DELETE /api/memory/index/:id`（之前遗漏）
- **`src/renderer/src/components/InputBox.tsx`**：文件上传 `POST /api/storage/file` 补充 Authorization header

#### 测试
- `tsc --noEmit`：零错误
- `npm test`：210 tests 全部通过

---

## [0.2.27] - 2026-03-05

### 五项前端体验修复（鉴权 + 记忆 badge + 连线 + 拖拽 + Key 校验）

#### Bug 1：InputBox 记忆 badge 实时显示
- **`src/renderer/src/components/InputBox.tsx`**：将记忆检索从"提交时 fire-and-forget"改为"输入时 600ms 防抖检索"，badge 在用户停止输入 600ms 后立刻亮起，不再因 InputBox 被 modal 替换而消失；提交时取消未触发的防抖，清空 badge 和 highlight，防止残留；`useEffect` 监听 `isModalOpen` 切换回 false 时归零 badge，保证对话框关闭后 badge 不会因异步回调写入而重现

#### Bug 2：关闭对话框后 highlight 残留 + 多余连线
- **`src/renderer/src/stores/canvasStore.ts`**：`closeModal` 新增清除 `highlightedCategory` 和 `highlightedNodeIds`；`updateEdges` 类别星型连线增加距离约束（> 600px 不连），避免远距离同类节点产生视觉干扰连线

#### Bug 3：拖动节点时连线实时跟随
- **`src/renderer/src/stores/canvasStore.ts`**：新增 `updateNodePositionInMemory(id, x, y)` 方法，仅更新 store 内存中的节点坐标，不写磁盘、不调 `updateEdges`；用于拖动中每帧更新，Edge 组件的 `useMemo` 即可响应坐标变化
- **`src/renderer/src/components/NodeCard.tsx`**：`RegularNodeCard` 拖动中通过 `requestAnimationFrame` 节流调用 `updateNodePositionInMemory`，连线随节点实时流畅移动；mouseUp 时调原 `updateNodePosition`（写磁盘 + 重算连线）；同时在 mouseUp 时 `cancelAnimationFrame` 清理待执行帧

#### Bug 4：正确 API Key 仍报"无效或已过期"
- **`src/renderer/src/services/storageService.ts`**：导出 `getAuthToken()` 函数
- **`src/renderer/src/services/ai.ts`**：`streamAI` 请求注入 `Authorization: Bearer <token>` 头
- **`src/renderer/src/stores/canvasStore.ts`**：新增内部 `authFetch()` 辅助函数，统一处理 auth + JSON header；替换全部 6 处裸 `fetch('/api/...')` 调用（`/api/ai/summarize`、`/api/memory/classify`、`/api/memory/search`、`/api/memory/index`、`/api/memory/queue`、`/api/memory/extract`）

#### Bug 5：设置页保存 API Key 时加校验
- **`src/server/routes/config.ts`**：新增 `POST /api/config/verify-key` 路由，向 upstream `<baseUrl>/models` 发请求（6s 超时），返回 `{ valid: boolean }`
- **`src/renderer/src/components/SettingsModal.tsx`**：`handleSave` 保存后异步调用验证接口（8s 超时），key 无效时在 API Key 输入框下方显示红色 `keyError` 提示；网络失败静默跳过，不阻止保存

#### 测试
- `npm test`：210 tests 全部通过，无新增失败

---



### Canvas Resize 居中 + 清空按钮移除 + 数据迁移与鉴权开启

#### Canvas 窗口 Resize 居中适配
- **`src/renderer/src/components/Canvas.tsx`**：新增 `window.resize` 监听器；窗口尺寸变化时计算 `Δw/Δh`，将当前 offset 各加 `Δw/2, Δh/2`，通过 `applyTransform` 直操 DOM 并同步写回 store。拖拽浏览器边框放大后，画布内容随视口中心等比例位移，不再偏左上角

#### 删除"全量清空并开启新手教程"UI 入口
- **`src/renderer/src/components/ConversationSidebar.tsx`**：删除"进化基因"tab 底部的全量清空按钮区块（原 lines 691–717）。后端 `DELETE /api/memory/facts`、`clearAllForOnboarding` store action 均保留，供开发者 curl 调用

#### 数据迁移：旧 Electron 对话迁移至 Web 版
- 编写一次性迁移脚本 `scripts/migrate-electron-data.cjs`，将旧 Electron 版数据（`~/Library/Application Support/evocanvas/data/`）迁移至 Web 版 SQLite：
  - 20 条旧对话 + 2 条现有对话 → 22 条合并写入（旧数据优先）
  - 17 个旧节点（补 `nodeType: "conversation"`）+ 1 个 capability 节点 → 18 个节点合并写入
  - 使用 `ON CONFLICT DO UPDATE` 原子写入，不影响其他 storage 行

#### Bearer Token 鉴权开启
- **`.env`**：添加 `AUTH_DISABLED=false` + `ACCESS_TOKEN`（64 位随机十六进制）；鉴权正式开启（Fail Closed 模式）
- 未持有 token 的浏览器访问 `http://localhost:5173` 时将显示 `LoginPage` 输入令牌；输入正确 token 后自动存入 `localStorage` 并注入所有后续 API 请求头

#### E2E 测试
- **`e2e/canvas.spec.ts`**、**`playwright.config.ts`**：E2E 请求增加 `Authorization: Bearer` 头，适配开启鉴权后的后端

---

## [0.2.24] - 2026-03-05

### 记忆与进化基因侧边栏根因修复

基于 SQLite 数据追踪，修复"全量清空并开启新手教程"后侧边栏记忆和进化基因始终为空的三个根因 bug。

#### 后端修复
- **记忆去重查询排除软删除记录**（`server/routes/memory.ts`）：`POST /api/memory/extract` 语义去重查询原无 `WHERE invalid_at IS NULL` 过滤，全量清空后的软删除旧事实会阻止新手教程相同事实重新入库；修复后仅比对有效记录，全量重置后可正常提取新记忆
- **全量清空同时清理 config 和 pending 任务**（`server/routes/memory.ts`）：`DELETE /api/memory/facts` 现额外执行两步：① 将 `config.preference_rules` 重置为 `[]`，避免旧偏好规则干扰新手教程 AI 行为；② 删除 `agent_tasks` 中 `pending` 状态的任务，防止旧任务在新教程期间处理产生脏数据

#### 前端修复
- **新增 `pendingMemoryRefresh` 轮询机制**（`stores/canvasStore.ts`、`components/ConversationSidebar.tsx`）：引导完成后在 3s / 8s / 15s 三个时间点轮询 `/api/memory/facts`，与已有的进化基因轮询（5s / 15s / 35s）对称；`completeOnboarding` 同时设置两个轮询标志

#### 测试
- 更新 `src/server/__tests__/memory.test.ts` 测试桩 `DELETE /api/memory/facts` 路由以匹配新的清理行为，并新增两个测试用例：验证 config 偏好规则被清空、验证 pending 任务被删除而 done 任务被保留

---

## [0.2.23] - 2026-03-05

### MVP 上线准备（P0 修复 + 登录门槛 + 长期价值）

基于全量代码核查，完成上线前最后一轮修复，同时补齐价值层功能。

#### P0 修复（保命）
- **SSE 前端分包解析**（`services/ai.ts`）：原 `chunk.split('\n')` 直接切割，JSON 跨 TCP chunk 时静默丢失；改为与后端一致的 `sseBuffer + \n\n` 边界分割，跨包内容不再截断
- **InputBox 实时 embedding 请求消除**（`components/InputBox.tsx`）：删除输入时防抖 300ms 调用 `getRelevantMemories` 的 useEffect；改为提交时 fire-and-forget 检索，F12 Network 面板输入期间零余请求
- **InputBox 文件首次走上传接口**（`components/InputBox.tsx`）：文件原先仅存本地 state 拼入 prompt；改为提交前调用 `/api/storage/file` 上传（图片 base64 跳过），上传失败降级而非阻断发送
- **.env.example 变量名与代码一致**（`.env.example`）：`AUTH_ENABLED=false` 改为 `AUTH_DISABLED=false`，与 `auth.ts` 中实际读取的变量名对齐，补充 Fail Closed 语义注释

#### P1 修复（闭环）
- **AnswerModal 上传文件绑定 convId**（`components/AnswerModal.tsx`）：FormData 追加 `convId`，后端可将文件与对话关联，检索命中时能溯源到正确对话

#### 上线门槛
- **登录页 + token 注入**（`components/LoginPage.tsx` 新建、`App.tsx`）：启动时探活检测后端鉴权状态；有 localStorage token 自动注入并验证；未设置 token 时显示简洁登录页（输入框 + 确认按钮）；后端未启用鉴权时透明放行

#### 长期价值
- **节点标题 AI 异步摘要**（`server/routes/ai.ts` 新增 `/api/ai/summarize`、`stores/canvasStore.ts`）：节点创建后异步发起 10 字摘要请求，回写节点 title；失败静默降级为截断句
- **连线关系 label**（`stores/canvasStore.ts`、`components/Edge.tsx`、`components/Canvas.tsx`）：分支连线自动填 label="延续"，同主题连线 label="同主题"；连线 hover 时以 SVG tooltip 展示 label

#### 类型系统
- **`FileAttachment._rawFile?: File`**（`@shared/types.ts`）：新增临时字段，InputBox 提交前暂存原始 File 对象用于上传；已从正式传输的 FileAttachment 中剔除（`_rawFile` 在上传后析构）

---



### 前端联调专项修复（对标顶级开源体验）

基于全面前端联调审计（对标 ChatGPT Web、Vercel AI SDK、Linear、Notion），修复 4 项影响生产体验的缺陷。

#### 错误体验提升
- **HTTP 错误状态码友好提示**（`ai.ts`）：原 `AI proxy error ${status}: ${text}` 原始报错对用户毫无信息量；改为按状态码映射中文提示（401 → "API Key 无效"、413 → "文件内容过大"、415 → "不支持该类型"、500/502/503 → 服务不可用）
- **设置保存失败提示**（`SettingsModal.tsx`）：原 catch 块只有 `console.error`，用户保存失败无任何反馈；新增 `showError` 状态，失败后展示红色 "保存失败，请检查网络" toast（3s 自动消失）

#### 代码质量
- **移除 `@ts-ignore`**（`SettingsModal.tsx`）：`AI_CONFIG` 为 `as const` 只读对象，直接赋值需 `@ts-ignore`；改用 `(AI_CONFIG as { MODEL: string }).MODEL = model` 类型断言，消除非正规抑制注释

#### 文件处理健壮性
- **前端文件大小预检**（`InputBox.tsx`）：上传前增加 10MB 前端校验，文件超限立即设为 `error` 状态并展示错误，不再把大文件传入解析器（避免浏览器 OOM）
- **文件上传失败可视化反馈**（`AnswerModal.tsx` + `FileBubble.tsx`）：后端上传失败时（HTTP 非 2xx、网络断开）在 `FileAttachment.uploadError` 记录原因；`FileBubble` 紧凑态展示 `⚠` 图标（tooltip 显示原因），展开态显示错误文案并隐藏下载链接

#### 类型系统
- **`FileAttachment.uploadError?: string`**（`@shared/types.ts`）：新增可选字段，前端与后端通信状态可追踪

---

## [0.2.18] - 2026-03-04

### 后端安全审计与性能修复（对标顶级开源）

基于全面代码审计（对标 LangChain、Vercel AI SDK、mem0、MemGPT），修复 7 个严重/高级问题。

#### CRITICAL 修复
- **config INSERT crash**（`agentWorker.ts`）：`INSERT INTO config` 未提供 `updated_at` 字段，首次写入 `preference_rules` 时 SQLite `NOT NULL constraint failed` 导致崩溃；同步补全 UPDATE 语句的 `updated_at`

#### HIGH 修复
- **SSE buffer 边界**（`ai.ts`）：原 `chunk.split('\n')` 直接切割，JSON 可能跨 TCP chunk 被截断，内容静默丢失；改为持久 `sseBuffer`，按 `\n\n` 分割完整 SSE 事件，第一轮和第二轮（web search）均已修复
- **N+1 查询消除**（`ai.ts`）：`fetchRelevantFacts` 中对每条 fact 单独 `SELECT source_conv_id`（最多 100 次），改为首次查询一次包含所有字段，完全消除 N+1
- **向量全量加载改为缓存**（`memory.ts`）：`/search` 每次将 embeddings 表全量载入内存；改为模块级 LRU-lite 缓存（60s TTL，写入时失效），`LIMIT 2000` 防内存爆炸

#### 安全修复
- **auth Fail Open → Fail Closed**（`auth.ts`）：`AUTH_ENABLED=true` 默认关闭改为 `AUTH_DISABLED=true` 才跳过，避免生产环境忘配环境变量导致鉴权失效
- **timingSafeEqual 防时序攻击**（`auth.ts`）：Bearer token 明文 `!==` 比较改为 `crypto.timingSafeEqual()`，防止逐字节猜测攻击

#### MEDIUM/LOW 修复
- **Token 估算中文误差**（`ai.ts`）：`approxTokens()` 原 `chars/4` 对中文误差最高 8x；改为区分 CJK（每字 ≈2 token）与拉丁字符（4字符 ≈1 token）的混合算法，误差降至 <1.5x
- **DB partial index**（`db.ts`）：新增 `idx_memory_facts_active` 部分索引（`WHERE invalid_at IS NULL`），加速软删除过滤查询
- **WAL checkpoint 定时任务**（`db.ts`）：新增每 5 分钟 `PRAGMA wal_checkpoint(PASSIVE)` 定时执行，防止 WAL 文件无限增长

---

## [0.2.17] - 2026-03-04

### 文件存储与向量化系统达到顶级水平

#### 核心架构升级（对标 LlamaIndex / LangChain）
- **独立文件向量表 `file_embeddings`**：文件内容 embedding 从 `embeddings` 表独立出来，避免文件结果混入对话语义搜索，解决 topK 被占用问题
- **文本分块（Chunking）**：参照 LangChain `RecursiveCharacterTextSplitter`，在段落 > 句子 > 词边界切分，每块 800 字符、10% 重叠，大文件不再截断丢失内容
- **文件 Embedding 走 Agent 队列**：`embed_file` 任务类型加入 agentWorker，后台异步分块向量化，不阻塞上传响应，失败自动重试（最多 3 次）
- **新增 `/api/memory/search/files`**：文件内容语义搜索独立端点，返回匹配的文件名 + 原始 chunk 文本

#### 服务端安全与健壮性
- **文件大小限制**：50MB 上限，超出返回 413
- **MIME 类型白名单 + 魔数校验**：拒绝 `.exe/.dll` 等可执行文件类型；对已知格式（PNG/JPEG/PDF/OLE2）校验魔数与声明 MIME 是否一致，防止类型伪造
- **文件名安全化**：Content-Disposition 中过滤非安全字符，防止 header 注入
- **Export 补全**：`GET /api/storage/export` 新增 `uploadedFiles` 字段（元数据，不含二进制），数据导出更完整

#### 新 API
- `GET /api/storage/files` — 列出已上传文件（元数据，无二进制）
- `DELETE /api/storage/file/:id` — 删除文件及其所有分块向量
- `POST /api/memory/search/files` — 文件内容语义搜索

#### DB Schema
- `uploaded_files` 新增 `chunk_count`、`embed_status` 字段，追踪 embedding 进度
- 新增 `file_embeddings` 表（file_id + chunk_index + chunk_text + vector）
- `uploaded_files` 新增 3 个索引（conv_id / created_at / embed_status）

#### 测试
- 测试用例从 134 → 155（新增 21 个）
- 覆盖：文件上传/下载/删除、大小/类型验证、魔数校验、文本分块、file_embeddings 隔离、Agent 队列

---

## [0.2.16] - 2026-03-04

### 记忆系统达到顶级水平（对标 mem0 / MemGPT / Zep）

#### 架构升级
- **语义检索注入 system prompt**：AI 路由构建 system prompt 时，先用最后一条用户消息调用 embedding 向量检索，取最相关的记忆事实注入（而非最新 N 条）；无 embedding 时降级为最近 15 条有效事实
- **记忆事实时效标记（`invalid_at`）**：参照 Zep 的时效知识图谱设计，`memory_facts` 新增 `invalid_at` 字段；删除操作改为软删除（标记失效时间），历史记录永久保留，避免矛盾事实共存
- **System prompt 分层 Token 预算控制**：4 个注入层（进化基因 > 用户画像 > 记忆事实 > 压缩记忆）按优先级消耗 1500 token 预算，超出时低优先级层自动截断，防止 context 膨胀
- **memory_facts 全面注入生效**：修复 Critical 问题——事实提取了但从未被 AI 使用；现在正确注入，让记忆系统真正起作用

#### 可靠性修复（参照 Celery/BullMQ 标准）
- **Agent Worker 崩溃恢复**：启动时自动将 `status='running'` 的卡死任务重置为 `pending`，防止进程崩溃后任务永久丢失
- **任务失败指数重试**：最多 3 次重试，每次记录 `retries` 计数；3 次后标记 `failed`，不再无限卡住
- **旧任务 TTL 清理**：每小时清理 7 天前已完成/失败的任务，防止 agent_tasks 表无限膨胀
- **DB schema 迁移兼容**：新增 `agent_tasks.retries` 和 `memory_facts.invalid_at` 字段，通过 `ALTER TABLE` try/catch 模式兼容老版本数据库
- **Embedding API 加超时**：`fetchEmbedding` 加 10s 超时，防止 API 无响应时 hang 住
- **Profile JSON 安全解析**：`GET /api/memory/profile` 的 JSON 字段（interests/tools/goals）加 try/catch，DB 损坏时返回空数组而不是 500

#### 其他优化
- **`/memory/extract` 幂等保护**：同一 `conversationId` 已提取过则跳过，避免重复 API 调用
- **topK 输入验证**：`/memory/search` 限制 topK 在 1-20 范围内，防止非法输入
- **source_conv_id 索引**：`memory_facts` 新增 source_conv_id 索引，加速幂等查询
- **词边界截断**：embedding 输入从硬截断改为词边界截断，提升 embedding 质量

#### 测试
- 测试用例从 115 → 134（新增 19 个）
- 新增测试：memory profile CRUD、facts 软删除、agent 崩溃恢复、重试机制、TTL 清理、topK 验证、token 预算逻辑

---

## [0.2.15] - 2026-03-04

### 架构升级：后端 Agent 接管语义分类与进化基因提取

- **AI 语义分类**：`endConversation` 不再仅靠关键词，改为调用后端 `/api/memory/classify` 接口（5s 超时）；后端用 moonshot/gpt-4o-mini 做六类语义判断，失败时降级到关键词匹配
- **进化基因走后端 Agent**：`handleFeedbackSubmit` 改为 fire-and-forget 调用 `/api/memory/queue` 写入 `extract_preference` 任务；后端 `agentWorker` 用 AI 判断用户回复是否含偏好，写入 `config.preference_rules`
- **偏好规则注入 system prompt**：`ai.ts` 在构建 system prompt 时，从 DB 读取 `preference_rules` 与前端传入的 preferences 合并注入，让后端 Agent 提取的偏好真正影响回答风格
- **节点布局中心留空**：`addNode` 岛屿螺旋算法最小半径 0 → 150px，中心区域保持空白，节点围绕中心展开
- **去除前端偏好关键词检测**：删除 `detectFeedback`、`addPreference`、`detectedPreference`，AnswerModal 不再做任何前端偏好判断

### Bug 修复

- `AnswerModal.tsx`：清除 `setDetectedPreference`/`detectedPreference`/`addPreference` 残留引用，修复 6 个 TypeScript 错误
- 去除未使用的 `PreferenceRule` type 导入

---

## [0.2.14] - 2026-03-04

### 体验细节修复

- **能力块颜色**：onboarding 节点背景色 amber 橙 → slate 灰蓝 `rgba(226,232,240,0.9)`，图标 `amber-500` → `gray-400`，不再抢眼
- **引导提示文字颜色**：弹窗头部提示「随时可以关闭」由 `amber-500/80` → `gray-400`，低调不干扰
- **引导消息流速**：`setInterval(18ms×10字)` → 逐字 `setTimeout(28ms)`，句末标点停顿 120ms，还原自然阅读节奏
- **能力块分散摆放**：两个能力块各用不同初始角（`import-memory` 左下、`onboarding` 右上）螺旋展开，不再强制并排
- **能力集群标签**：`__capability__` → 「能力」
- **记忆数量标签**：`MEMORIES` → 「条记忆」

---

## [0.2.13] - 2026-03-04

### 新手教程：全量完成才生成节点 + 支持继承对话

- **只有全量完成才拆分为节点**：新手引导必须到达 phase 4（AI 注入关闭提示后）才保存对话节点，中途叉掉不创建任何节点
- **中途叉掉进度持久化**：未完成时关闭弹窗，已有对话 turns 序列化存入 `localStorage.evo_onboarding_turns`，能力块保留在画布
- **再次点击新手教程继承对话**：`openOnboarding` 会从 localStorage 恢复已保存的 turns，并根据内容推算当前所在 phase，用户可无缝继续
- **弹窗提示文案**：引导未完成时，弹窗头部显示「随时可以关闭，下次点击「新手教程」继续」；完成后提示消失
- **完成时清除进度缓存**：`completeOnboarding` 调用时删除 `evo_onboarding_turns` 条目，避免已完成用户二次恢复
- `canvasStore` 新增 `onboardingResumeTurns` 字段和 `saveOnboardingTurns` 方法

### Bug 修复

- `AnswerModal`：新增 `onboardingDone` state，引导到 phase 4 时设置为 true，替代 `onboardingPhaseRef.current` 的 ref 读取，确保提示文案能正确重渲染

---

## [0.2.12] - 2026-03-04

### 新手教程体验简化

- **新手教程改为自带能力块**：进入应用时自动打开引导弹窗，无需手动点击
- **引导结束后能力块消失**：完成或跳过引导后，`onboarding` 能力块从画布移除，不保留半途入口
- **退出引导自动补齐能力块**：中途关闭引导弹窗时，自动确保 `import-memory` 和 `onboarding` 两个能力块都存在于画布，防止画布空白
- `completeOnboarding` 改为 async，负责移除 onboarding 节点、写 localStorage 标记、补充 import-memory
- onboarding 能力块不持久化到 nodes 文件，重启不会重复触发（由 `localStorage.evo_onboarding_v3` 控制）
- 修复 `loadNodes` 中两段 onboarding 逻辑重复触发的 bug（合并为统一出口）
- 给 `completeOnboarding` 加防重入标志，避免快速连击导致多次执行

### 节点标签显示修复

- `NodeCard.tsx` 节点标题由 `truncate`（单行截断）改为 `break-words + line-clamp-3`，标签可换行完整显示
- `SearchPanel.tsx` 节点标题同步修复为 `line-clamp-2`
- `NODE_TITLE_MAX_LENGTH` 从 8 改为 20，修复「来自 ChatG」等截断标题问题

### 智能路由优化

- 移除 `lastText.length < 40` 的激进判定，避免短但实质性的问题走弱模型
- `SIMPLE_QUERY_FACT_PATTERNS` 清空（原有「什么是」等模式太宽泛）
- 路由逻辑改为精确匹配：仅纯问候词（词后最多一个标点/语气词）才走快速模型
  - 「你好」「hi！」「早~」→ 快速模型
  - 「你好吗」「hi，帮我...」「你好，帮我写代码」→ 用户配置模型
- `FAST_MODEL_MAX_TOKENS` 从 800 提升至 2000

### Code Review 修复

- `AnswerModal.tsx`：用 selector 订阅 `canvasNodes` 替换 `useCanvasStore.getState()` 直接访问，补全依赖数组
- `CapabilityData` 类型扩展支持 `'onboarding'` capabilityId

---



### 品牌改名：EvoCanvas → Anima

Anima 取自荣格心理学——人格中缺失的那部分自我。在 AI 时代，你的记忆留在了 AI 里，这部分自我应该还是属于你的。

- 全局将 "EvoCanvas" 替换为 "Anima"（`APP_NAME`、系统提示词、界面标题、导出文件名、数据库文件名）
- `index.html` 标题：`EvoCanvas - 不会忘记你的AI画布` → `Anima — 属于你的那部分自我`
- `DEFAULT_SYSTEM_PROMPT`：AI 自我定位从"长期伙伴"升级为"Anima——随时间越来越懂你的那部分自我"
- `ONBOARDING_GREETING`：AI 开场白由"我是 EvoCanvas"改为"我是 Anima"
- `package.json`：`name` 改为 `anima`，`version` 同步为 `0.2.11`
- `data/anima.db`：SQLite 数据库文件名由 `evocanvas.db` 改为 `anima.db`
- `README.md`：以哲学宣言重写，品牌气质全面升级

### 引导完成文案 + 全局去紫色 + 能力节点交互修复

#### 引导完成弹窗（OnboardingCompletePopup.tsx + AnswerModal.tsx）
- 完成弹窗改为"已拆分成两个节点，接下来自由探索就好"，去掉引导用户再输入"你好"的步骤
- 移除引导完成后自动生成能力节点的逻辑（能力节点可单独通过菜单添加）

#### 产品色调统一（去紫色）
- `ConversationSidebar.tsx`：「关于你的记忆」头部 purple → gray；记忆条目圆点 purple-300 → gray-300；兴趣标签 purple-50/purple-600 → gray-100/gray-600；加载spinner purple → gray
- `NodeCard.tsx`（CapabilityNodeCard）：violet-50/violet-200/violet-700 → white/gray-300/gray-700
- `ImportMemoryModal.tsx`：平台按钮颜色 → 深/中/浅 gray 梯度；保存按钮 violet-600 → gray-900
  - 交互优化：ChatGPT/Claude 支持 URL 预填 prompt；Gemini 自动复制 prompt 后二次确认跳转

#### 能力节点交互 Bug 修复（NodeCard.tsx）
- 根本原因1：`left: node.x` 缺少 `px` 单位，节点不在正确位置
- 根本原因2：使用 Pointer Events（onPointerDown/Move/Up），与 Canvas 的 Mouse Events 体系冲突，click 和 drag 均失效
- 修复：改用与 RegularNodeCard 相同的 Mouse Events 方案（window.addEventListener + mouseup 时写入位置）

#### 文档全量同步（与品牌/版本一致）
- `docs/` 下所有活跃文档与 Anima 品牌、v0.2.11、`anima.db` 路径统一：api、architecture、deployment、dev-guide、dev-notes、ROADMAP、testing、troubleshooting
- Docker/备份/恢复示例改为 `anima` 镜像与 `anima-data/anima.db`；macOS/Linux/Windows 数据目录改为 `Application Support/anima`
- 历史 code-review 报告标题统一为「Anima（曾用名 EvoCanvas）」；changelog 合并重复 0.2.11 条目

#### 改名后兼容与校验（确保不影响使用）
- **Electron 数据迁移**：`main/index.ts` 增加 `migrateFromEvocanvasIfNeeded()`，首次以 Anima 启动时若当前数据目录为空且存在旧 `evocanvas/data`，则自动复制 profile/nodes/conversations/settings 到新目录，老用户无感迁移
- **配置与锁文件**：`.env.example` 标题改为 Anima；`package-lock.json` 的 name/version 与 package.json 对齐为 anima / 0.2.11
- **验证**：typecheck、lint、单元测试（115）、前端 build 全部通过

---

## [0.2.10] - 2026-03-03

### 能力节点体系 + 新手引导优化 + 记忆系统强化

#### 能力节点（Capability Node）体系（全新架构）

**背景**：画布上除记忆节点外，还需要支持"可重复使用的功能入口"形态。

- `shared/types.ts`：`Node` 新增 `nodeType?: 'memory' | 'capability'` 和 `capabilityData?: { capabilityId, state }` 字段
- `canvasStore.ts`：新增 `activeCapabilityId` 状态，`openCapability / closeCapability / addCapabilityNode / saveMemoryImport` 方法；`updateEdges` 跳过能力节点的分组连线
- `NodeCard.tsx`：重构为纯分发器（`NodeCard` → `RegularNodeCard | CapabilityNodeCard`），避免 React Hooks 规则违反；能力节点采用紫色虚线外框样式
- 新建 `ImportMemoryModal.tsx`：「导入外部记忆」三步流程（选平台 → 复制提示词跳转 → 粘贴保存为节点）
- `Canvas.tsx`：挂载 `<ImportMemoryModal />`
- `constants.ts`：新增 `IMPORT_MEMORY_PROMPTS`（ChatGPT / Claude / Gemini 三平台提示词）

#### 新手引导持久化与完成后生成能力节点

- `OnboardingGuide.tsx`：移除 `nodes.length > 0` 限制，未完成引导的用户每次打开均重新进入
- `AnswerModal.tsx`：引导完成后调用 `addCapabilityNode('import-memory')`，在画布生成能力节点入口
- `canvasStore.ts`：`addCapabilityNode` 内置重复检查，同类节点不会重复生成

#### Toast 结构化（AnswerModal.tsx）

- 替换 `showEvolutionToast: boolean` 为 `evolutionToast: { label, detail } | null`
- 区分三类场景：人物信息更新（提取姓名/职业）/ 进化基因记录（显示规则内容）/ 偏好生效（显示应用数量）
- 新增 `extractUserInfo()` 辅助函数，从自我介绍中提取姓名和职业关键词

#### 智能模型路由（constants.ts + server/routes/ai.ts）

- 短句（<40 字）/ 问候语 / 简单事实问 → 自动路由到 `FAST_MODEL`（`moonshot-v1-8k`，800 token 上限）
- 引导模式统一走快速模型
- 复杂查询保持原有深度模型，且不附带 web search 工具

#### 记忆语义去重（server/routes/memory.ts）

- 提取新 facts 后，先与近 30 条已有记忆做语义比较（轻量 LLM 调用）
- 返回 keep 数组严格过滤：只保留原始候选中的条目，防止模型幻觉写入
- JSON 解析失败 fallback 精确匹配；API 调用失败 fallback 精确匹配
- 触发条件：仅当已有 facts > 0 时触发去重 API（空库直接插入）

#### 完成弹窗提速（OnboardingCompletePopup.tsx）

- 动画从 Spring（~400ms）改为 `150ms easeOut`，弹出更即时

---

## [0.2.9b] - 2026-03-03

### 引导流程四阶段重设计 + 关闭提示轻量化 + System Prompt 去激进化

#### 新手引导流程重设计（`AnswerModal.tsx` + `conversationUtils.ts`）

**问题**：旧引导 AI 第一句话直接飙出 React 介绍、能力展示，不像朋友对话；phase 2（用户给出风格偏好）会触发 AI 调用，体验脱节。

**重设计**：
- 引导分 4 个阶段：phase 0（问候）→ phase 1（AI 自然回应自我介绍）→ phase 2（用户给偏好 → 直接保存不调 AI）→ phase 3（自由提问 AI 真实回答）→ phase 4（关闭提示）
- `ONBOARDING_STYLE_PROMPT`：phase 1 完成后追加到 AI 回复末尾，问用户风格感觉是否合适
- `ONBOARDING_GENE_SAVED`：phase 2 完成后直接作为静态回复注入，无 AI 调用
- `ONBOARDING_CLOSE_HINT`：phase 3 完成后追加到 AI 回复末尾，引导关闭
- phase 2 处理：用户反馈直接存为 `addPreference`（confidence 0.7），跳过 AI，显示「已记住你的偏好」toast

#### System Prompt 去激进化（`constants.ts` + `server/routes/ai.ts`）

**问题**：`DEFAULT_SYSTEM_PROMPT` 要求「极高智力水平」「必须用 Markdown 表格」等，导致引导期 AI 输出过多格式化内容。

**修复**：
- `DEFAULT_SYSTEM_PROMPT`：改为自然对话基调，跟随问题决定长度和格式
- 新增 `ONBOARDING_SYSTEM_PROMPT`：轻量版，引导时 AI 像初次见面的朋友，简短温暖，不分析不建议
- 后端 `isOnboarding` 标志：引导模式只用 `ONBOARDING_SYSTEM_PROMPT`，不注入偏好/记忆/用户画像

#### isOnboarding 标志贯穿前后端（`ai.ts` → `useAI.ts` → `AnswerModal.tsx`）

- `streamAI` 新增 `isOnboarding?: boolean` 参数，传入请求体
- `useAI.sendMessage` 新增 `isOnboarding?: boolean` 参数，向下透传
- `AnswerModal.handleFeedbackSubmit` 在 AI 调用时传入 `isOnboardingMode`

#### 关闭提示轻量化（`AnswerModal.tsx`）

**问题**：每次关闭都在中间显示全屏飞散动画；历史对话重新打开也会触发；"固化"措辞生硬。

**修复**：
- `ClosingAnimation` 改为左上角小 toast（`fixed top-4 left-4`），快速淡入淡出
- 条件：`!isReplayRef.current && didMutateRef.current`，纯回放不触发
- 文案：「记忆节点已固化」→「已记下来了」/ 引导时「记忆已生成 ✦」
- 去掉全屏飞散 node 碎片动画
- 「偏好已应用并进化」→「已记住你的偏好」

**测试**：115 个测试全部通过，TypeScript 无新增错误。

---

## [0.2.9c] - 2026-03-03

### 全量重置入口（重新体验新手教程）

**背景**：用户画像/记忆/进化基因残留会影响引导期体验，导致“不是第一次打开”的感觉。

**新增/修复**：
- 新增清空接口：`DELETE /api/memory/profile`、`DELETE /api/memory/facts`、`DELETE /api/memory/index`
- 修复「用户画像-清空」：由 PUT 合并写入改为 DELETE 真清空
- 侧栏新增按钮「全量清空并开启新手教程」：同时清空用户画像、记忆事实、向量检索索引、进化基因，以及画布节点/对话记录，再以全新状态打开新手教程

---

## [0.2.9] - 2026-03-03

### 新手引导完善 + 用户画像面板 + 进化提示系统

#### 修复：新手引导流程卡住问题（`OnboardingGuide.tsx`）

**问题**：`sent1` / `open2` 阶段引导气泡说完内容后无任何提示，用户不知道需要关闭对话窗口才能触发下一步，导致引导流程卡死。

**根因**：引导状态机由 `nodes.length` 驱动，节点在 `handleClose()` 后约 500ms 才写入，但文案未说明需要关窗。

**修复**：
- `sent1` 阶段末尾新增提示："说完后点右上角 × 关闭对话，节点就会落到画布上"
- `open2` 阶段末尾同步新增关窗提示

#### 新增：用户画像面板（`ConversationSidebar.tsx`）

**背景**：`agentWorker` 每 30 秒从对话中提取用户画像（职业、兴趣、工具、目标、地点、风格）写入 SQLite `user_profile` 表，但前端没有任何入口展示。

**新增**：
- 进化日志 Tab 内新增「用户画像」卡片区块
- 展示字段：职业、城市、兴趣标签（紫色）、工具标签（蓝色）、目标标签（绿色）、回答风格、最近更新时间
- 打开侧边栏时自动 fetch `/api/memory/profile`，空画像不占位

#### 新增：进化更新前端提示系统（`Canvas.tsx` + `AnswerModal.tsx`）

- 节点数量增加后，右上角菜单「进化日志」入口亮蓝点 + 「新」标签，打开后自动清除
- 菜单新增独立「进化日志」入口（与对话历史分开）
- 关闭对话时固化提示升级：「记忆节点已固化」+ 蓝色条「已应用 N 条偏好 · 进化日志已更新」

**测试**：115 个测试全部通过，TypeScript 无错误。

---

## [0.3.3] - 2026-03-03

### 记忆高亮/连线稳定性修复（Web）

**问题**：右侧出现“记忆”提示，但画布节点无高亮、无连线

**根因**：记忆来源于对话记录，但部分对话没有对应节点，导致高亮 ID 为空

**修复**：
- `canvasStore.ts`：记忆检索只返回“有节点”的结果（conv.id → node.id）
- `InputBox.tsx` / `AnswerModal.tsx`：高亮 ID 统一使用 nodeId 兜底映射

**效果**：记忆提示与画布高亮/连线强一致，不再出现“有提示无反馈”

---

## [0.3.2] - 2026-03-03

### 全组件 useCanvasStore 全量订阅修复 + 高亮动画性能化

**问题**：组件订阅整个 store（无 selector），任何 store 字段变化都导致这些组件重渲染；NodeCard 高亮发光仍在 Framer Motion 主线程无限循环

**受影响组件**：`InputBox`、`AnswerModal`、`SearchPanel`、`NodeDetailPanel`、`NodeCard`（highlight glow）

**修复**：

- `InputBox.tsx`：`useCanvasStore()` 拆为 6 个独立细粒度 selector
- `AnswerModal.tsx`：`useCanvasStore()` 拆为 12 个独立细粒度 selector
- `SearchPanel.tsx`：`useCanvasStore()` 拆为 3 个独立细粒度 selector
- `NodeDetailPanel.tsx`：`useCanvasStore()` 拆为 5 个独立细粒度 selector
- `NodeCard.tsx`：高亮发光 `motion.div` 的 `repeat: Infinity` 改为 CSS class `.node-highlight-glow`
- `index.css`：新增 `@keyframes nodeHighlightPulse` + `.node-highlight-glow` CSS 类（compositor thread）

**效果**：所有主 UI 组件现在仅在各自依赖的字段变化时才重渲染，彻底消除 store 变化级联重渲染风险。

---

## [0.3.1] - 2026-03-03

### Web 版缩放性能彻底修复

**问题**：多次来回滚动后画布卡死，滚动时节点闪烁消失

**根因（三层，按严重程度排序）**：

1. **NodeCard 订阅全 store（最严重）** — `useCanvasStore()` 无 selector，任何 store 变化（scale/offset/highlights）都触发所有 NodeCard 重渲染
2. **Framer Motion `repeat: Infinity` 漂浮动画** — 每个节点的 Framer Motion 无限循环动画在 JS 主线程持续跑 rAF 插值，17 个节点 = 17 个并行主线程循环，与缩放 rAF 竞争
3. **根容器 `motion.div` 持续动画上下文** — `animate={{ filter, scale, opacity }}` + spring transition 让 Framer Motion 永久持有 rAF 循环，整个画布子树保持"需要合成"状态

**修复**：

- `NodeCard.tsx`：`useCanvasStore()` 改为细粒度 selector（`removeNode`/`updateNodePosition`/`openModalById`/`isHighlighted` 各自独立订阅）
- `NodeCard.tsx`：漂浮动画从 Framer Motion `repeat: Infinity` 改为纯 CSS `@keyframes`（compositor thread，零主线程开销）
- `Canvas.tsx`：根包装层从 `motion.div` 改为普通 `<div>` + CSS `transition`，消除 Framer Motion 常驻动画上下文
- `Canvas.tsx`：删除 `ZoomPreviewLayer` + `zoomPhase` 状态机（该方案在缩放时销毁重建整棵 DOM，造成节点闪烁），恢复节点始终存在、transform 直操 DOM 的正确架构
- `index.css`：新增 `@keyframes nodeFloatY / nodeFloatX`

---


### Web 版缩放卡顿治理（滚轮/手势）

**问题**：缩小/放大过程中依旧卡顿，长时间滚轮后偶发卡死

**根因**：
- wheel 事件过密，重复计算导致主线程被持续占用
- 缩放时仍在跑大批量节点/连线的动效与渲染

**修复**（`Canvas.tsx`）：
- wheel 事件按帧合并：单帧累计 delta，再在 RAF 内一次性计算 scale/offset
- 缩放期间暂停重渲染层（节点/连线/ClusterLabel），缩放结束后恢复
- 缩放预览层：缩放中只渲染轻量节点点位与分类标题，避免白屏与卡顿并存
- 版本备份：`docs/backup-20260303-canvas.tsx`

---

### 节点坐标钳制：修复节点飞离画布中心问题

**问题**：历史节点坐标无上限，缩放到最小比例时节点仍散布在极远处，无法在可视区域内看到全部节点

**根因**：
- `addNode` 螺旋搜索半径无上限（最大可达 ~810px），岛屿新建也可在 1200px 外
- `loadNodes` 对历史数据无坐标校验，加载后飞远节点无法被聚回

**修复**（`canvasStore.ts`）：
- `addNode`：岛屿搜索半径限制在 `centerX ± 1200`；螺旋搜索 `radius > 600` 时立即退出；fallback 改为岛屿中心附近随机偏移；最终坐标强制钳制到 `center ± 1500px`
- `loadNodes`：加载时对所有节点先做坐标钳制（`center ± 1500`），超界节点强制拉回；若发现节点被压到边界则触发一次重排算法（螺旋分布），同时持久化修正后的坐标

---

### 修复 MemoryLines 悬空连线 bug

**问题**：输入框输入内容触发记忆引用时，偶现一条线指向空白区域（"悬空线"），该节点实际不在屏幕可视范围内

**根因**：过滤条件 `sx > -50 && sx < vw+50` 范围过宽，部分节点在屏幕边缘外50px内但可见区域内没有节点体，导致线从屏幕角落空白处出发

**修复**：
- 坐标计算分离节点左上角和节点中心：`nx = node.x * scale + offset.x - vw`，中心偏移在 scale 之后独立加
- 过滤改为严格可视区：节点中心 `sx in [0, vw] && sy in [0, vh-100]`，完全排除屏幕外节点

---



### 色彩统一 + 连线坐标修正

**蓝色清零（AnswerModal 全面统一黑色系）**
- 记忆引用标签：`bg-blue-50 text-blue-500 border-blue-100` → `bg-gray-100 text-gray-600 border-gray-200`
- 对话框 focus ring：`focus-within:ring-blue-100` → `focus-within:border-gray-900`
- 文件附件按钮 hover：`hover:text-blue-500 hover:bg-blue-50` → `hover:text-gray-700 hover:bg-gray-100`
- 对话框发送按钮：`bg-blue-600 hover:bg-blue-700` → `bg-gray-900 hover:bg-black`

**MemoryLines 坐标公式修正**
- 修正屏幕坐标转换公式（原公式将节点中心偏移混入 scale 导致位置偏差）：`screenX = node.x * scale + offset.x - vw + 104 * scale`
- 加入可视区域过滤：屏幕范围外的节点不绘制连线，避免从屏幕外飞入的异常路径（"3记忆只有2条线"的情况属于第3个节点不在当前可视区域，属于正常行为，标签计数仍然准确）

**修复 Canvas.tsx 语法错误**
- 清理编辑引入的多余 `}`

---



### 交互体验细节打磨（输入框/记忆感知/动画/漂浮）

**输入框重构**
- 删除左侧无用的 `⌘` 图标按钮，输入区占满全宽
- Focus 时蓝色 ring 改为黑色描边，发送按钮改为黑色（`bg-gray-900`）
- 记忆标签配色改为灰黑风格（`bg-gray-100 text-gray-600`），统一克制用色
- textarea 和全局滚动条默认隐藏，hover/focus 时才淡出显示；textarea 永不显示滚动条

**记忆引用视觉增强**
- 修复 AnswerModal 高亮 bug：`setHighlight` 传的是 `conv.id`，实际需映射到 `node.id`，导致高亮从未生效——已修复
- NodeCard 高亮效果：蓝色光晕改为黑色脉冲呼吸（`shadow-[0_0_20px_rgba(0,0,0,0.12)]` + 外圈 scale 呼吸动画）
- **记忆连线 overlay**：新增 `MemoryLines` 组件，当输入框检测到相关记忆时，在画布与输入框之间绘制虚线路径（`motion.path` + `pathLength` 动画），让用户直观感知 AI 正在引用哪些节点

**关闭动画过程感**
- 重新设计关闭动画：不再是随机方向飞散，改为模拟节点卡片从弹窗中心飞向右上方（画布节点区域），传达"对话固化为节点"的方向感
- 添加 "已固化到画布" 确认提示条

**画布漂浮旋转感**
- NodeCard 浮动动画加入 x 轴漂移（`x: [0, 3, 0, -3, 0]`），与 y 轴错开相位，每个节点相位不同，视觉上产生"轨道流动"的旋转感

**代码清理**
- 清理 3 个历史遗留 unused 变量（`useEffect`、`setView`、`getCategoryColor`/`categoryColor`）
- 全部 68 个测试通过，TypeScript 零错误，构建干净

---



### 体验细节修复（ChatGPT 对齐 + 时间感知 + 动画）

**视觉**
- **背景白化**：App 根容器、Canvas dot-grid、AnswerModal 弹窗、底部输入区全部改为纯白背景，去除灰色和毛玻璃层叠导致的"灰不拉几"问题。

**对话 UI**
- **解析 bug 修复**：修复 `parseTurnsFromAssistantMessage` 正则在 `AI：\n正文` 格式下无法匹配的问题，以及 `stripLeadingNumberHeading` 的清理逻辑，彻底消除原始格式标记（`#2\n用户：... AI：思考：...`）泄漏到渲染层的 bug。
- **操作按钮位置**：用户消息的编辑/复制按钮从气泡内 `absolute` 定位改为气泡**外下方**，hover 时淡入显示，对齐 ChatGPT 交互模式。AI 回复操作按钮同步改为 hover 淡入。
- **用户气泡样式**：改为 `#F4F4F4` 圆角气泡（无描边），更贴近 ChatGPT 视觉风格。

**时间感知**
- **注入当前日期**：`buildSystemPrompt()` 动态注入当前日期（中文格式，含星期），AI 不再误以为当前是 2024 年。

**动画**
- **任务结束动画**：关闭对话岛时触发节点分解动画——8 个彩色小方块从中心向外飞散（framer-motion，450ms），弹窗同步缩小淡出，视觉上传达"对话已固化为节点"的概念。
- **防重复关闭**：`isClosing` 状态锁，动画期间不响应重复关闭操作。

**记忆显示**
- **记忆引用跟随话题**：`Turn` 类型增加 `memories` 字段，每轮对话的记忆引用绑定到该轮，在用户气泡下方显示"引用了 N 条记忆：…"标签，换话题后自动更新（而非全局共享一个引用条）。
- **顶部引用条简化**：移除顶部记忆引用条，改为内联显示，减少 UI 层级干扰。

**测试**
- 更新 `prompt.test.ts` 以适配日期注入后的 `buildSystemPrompt` 输出格式。
- 全部 68 个测试通过，构建干净。

---



### 融合改造与体验升级 (Anima 产品形态)

**空间感知 (Spatial Perception)**
- **极光背景**: 新增 `AmbientBackground` 组件，背景极光颜色随主导思维分类（工作蓝/生活绿/创意紫）动态流转，营造生命感。
- **宏观聚类 (LOD)**: 实现 Level of Detail 逻辑。缩小画布时节点淡出，显现“思维板块”大标题，点击板块中心可平滑推近。
- **节点微动效**: 节点增加上下微浮动动画，模拟漂浮感；连线颜色改为跟随源节点分类，并在激活时有脉冲效果。

**对话岛 (Dialogue Island)**
- **形态重构**: 放弃全屏模态框，改为从底部输入框 Morph 展开的“半屏对话岛”，保留画布背景的模糊感知。
- **记忆引用条**: 对话岛顶部增加可视化引用条，明确展示 AI 联结的历史记忆，点击可高亮画布对应节点。
- **语义高亮**: 输入时实时检测意图，画布背景中相关节点会微微发光 (Scale + Glow)，提供“我在听”的视觉反馈。

**交互完善**
- **节点详情面板**: 点击节点改为从右侧滑出详情面板 (`NodeDetailPanel`)，提供继续话题、重命名等操作，不再打断浏览流。
- **首次引导**: 为新用户增加 3 步引导 (`OnboardingGuide`)，演示漫游、对话、缩放操作。
- **偏好可视化**: 侧边栏“进化日志”增加偏好置信度进度条。

**技术修复**
- 修复了 `AnswerModal` 在新 UI 下的交互回归（停止生成、文件预览、快捷键保存）。
- 清理了未使用的代码与类型定义。
- **Canvas 交互修复**: 修复了画布拖拽失效的问题（移除外层 `pointer-events-none` 干扰，为画布添加 `pointer-events-auto`）。
- **LOD 样式修复**: 移除了 `Canvas` 的 3D 旋转动画以解决交互偏移和视觉晃动；优化了 `ClusterLabel` 在缩小时的尺寸计算（增加反向缩放逻辑），确保宏观视图下标签清晰可见。

---


**对话 UI**
- **模型标签**：改为对话区顶部单行展示（KIMI-K2.5 / 正在进化中...），不再在左侧占块。
- **用户消息操作**：为外层容器加上 `group/user`，悬停时正确显示复制、编辑按钮。

**分类与历史**
- **美食类统一**：生活日常关键词增加「非常好吃」；`detectIntent` 与 `addNode` 的 CATEGORIES 同步。
- **历史分区全量更新**：`loadNodes` 时从 `conversations.jsonl` 按对话首句重算分类并写回节点，历史错分（如美食归到工作/其他）自动纠正。

**技术**
- `AnswerModal.tsx`：顶部单行模型标签、移除 AI 块内左侧标签、用户气泡 `group/user`。
- `canvasStore.ts`：生活日常关键词补充、加载时重分类逻辑与持久化。

---

## [0.1.7] - 2026-03-02

### Kimi 2.5 联网搜索兼容性与对话稳定性修复

**修复与优化**
- **Kimi 2.5 联网搜索深度适配**
  - 实现了 `streamAI` 的递归逻辑，自动处理 Kimi 发出的 `$web_search` 工具调用及其后续对话。
  - 适配了 Kimi 2.5 的 `reasoning_content` 强制非空要求，确保联网搜索过程不再报 400 错误。
  - 将 `TEMPERATURE` 默认值修正为 `1.0`，以符合 Moonshot API 的最新校验规则。
- **对话历史持久化与继承**
  - 将对话历史从局部 Hook 提升至全局 `canvasStore` 管理，解决弹窗关闭后上下文丢失的问题。
  - 实现了回放模式下的对话历史自动重建，确保“再次进入”时能完美衔接之前的语境。
- **稳定性增强**
  - 将 API 超时时间延长至 60 秒，为联网搜索预留充足时间。
  - 优化了对话保存状态，防止在流式传输中断时产生无效的“[无回复]”记录。
  - 实现了“空回复自动重试”逻辑，当第一轮对话由于异常导致内容为空时，再次打开会自动触发重新生成。

## [0.1.6] - 2026-03-01

### 知识图谱体验升级与 API 管理

**新增功能**
- **知识岛屿布局 (Clustering Layout)**
  - 实现了基于类别的“岛屿中心”布局算法，同类节点会自动向板块中心靠拢。
  - 新类别会自动寻找远离现有岛屿的空位，优化画布空间利用率。
- **板块化视觉连线 (Knowledge Graph)**
  - 实现 `Edge` 组件，通过 SVG 动态绘制同类别节点间的联结线。
  - 支持节点拖拽时连线实时重绘。
- **自进化日志 (Evolution Log)**
  - 在侧边栏新增“进化日志”标签页，展示 AI 习得的偏好规则与记忆强度。
- **API 与模型管理 UI**
  - 新增 `SettingsModal` 弹窗，支持在应用内直接配置 API Key、代理地址与切换模型。
  - API Key 采用系统级安全存储 (safeStorage)。

**体验优化**
- **搜索增强**：点击搜索结果现在会平滑聚焦 (Focus) 到对应节点。
- **动效全覆盖**：全面集成 `framer-motion`，实现侧边栏弹窗、卡片创建、设置项切换的“苹果感”流畅动效。
- **视觉减负**：优化 NodeCard 阴影与透明度，提升画布整体的通透感。

**技术实现**
- 主进程新增 `settings.json` 读写支持与文件名验证。
- `canvasStore` 状态管理结构化升级，支持 `edges` 状态同步。

## [0.1.5] - 2026-03-01

### 记忆驱动与自进化愿景确立

**计划更新**
- 确立“无声进化”的设计理念，重点升级语义记忆唤醒与知识图谱视觉。
- 将 v0.1.5 定义为“记忆驱动与无声进化”版本，v0.1.6 为“知识图谱与动效升级”版本。
- 建立了文档版本回溯机制，将旧版 PRD 存入 `docs/history`。

## [0.1.4] - 2026-02-28

### 体验优化与界面重构

**新增功能**
- 全新对话界面 (AnswerModal.tsx)
  - 参考 ChatGPT 风格的聊天气泡交互
  - 用户消息（灰色气泡，右对齐）与 AI 回复（白色背景，左对齐）
  - AI 渐变头像与 Assistant 标识
- 交互动效增强
  - 模态框打开/关闭平滑过渡动画 (300ms)
  - 脉冲式加载动画与打字机效果
  - 自动滚动到底部
- 稳定性提升
  - 移除模拟模式，强制使用真实 API
  - API Key 缺失时的友好错误提示与引导
  - ESC 键快速返回画布
  - 支持快捷键 Enter 发送反馈

**技术实现**
- 完善的对话状态管理（正在思考、对话完成、发生错误）
- 增强的对话内容解析逻辑，支持多轮对话回显
- 优化了关闭模态框时的状态重置与数据持久化逻辑

## [0.1.0] - 2026-02-28

### 项目初始化

- 创建项目基础架构 (Electron + React + TypeScript + Vite)
- 配置开发环境 (Tailwind CSS, Zustand, electron-vite)
- 设计数据存储结构 (profile.json, nodes.json, conversations.jsonl)

### Week 1: 基础交互闭环

**新增功能**
- 无限画布组件 (Canvas.tsx) - 白底 + 点阵背景，支持拖拽
- 底部输入框 (InputBox.tsx) - 毛玻璃风格，支持多行输入
- 全屏回答层 (AnswerModal.tsx) - 流式展示AI回复
- 节点卡片 (NodeCard.tsx) - 显示标题、关键词、日期
- 本地存储系统 - 自动持久化节点和配置

**技术实现**
- 主进程IPC通信封装
- Preload脚本安全隔离
- Zustand状态管理
- 流式AI响应处理

### Week 2: 偏好学习闭环

**新增功能**
- 负反馈识别系统 (feedback.ts)
  - 支持触发词："简洁点"、"太复杂"、"别用这个"、"换个思路"、"不对"
  - 自动提取偏好规则
- 偏好管理服务 (profile.ts)
  - 配置文件读写
  - 置信度系统 (初始0.6，每次+0.1，上限1.0)
  - 旧偏好自动衰减
- Prompt组装服务 (prompt.ts)
  - 自动注入历史偏好到System Prompt
  - 检测偏好应用情况
- 对话记录系统 - 使用 .jsonl 格式追加存储

**技术实现**
- 规则匹配引擎
- 置信度算法
- 偏好合并策略

### Week 3: 体验打磨闭环

**新增功能**
- 灰字提示组件 (GrayHint.tsx)
  - 仅在偏好被应用时显示
  - 简洁的文案提醒
- 节点回放功能 - 点击节点打开对应对话
- 偏好匹配检测
  - 检测回答是否符合用户偏好
  - 触发灰字提示

**体验优化**
- 平滑动画过渡
- 输入框自动高度调整
- 错误处理和边界情况
- 响应式布局

**稳定性**
- 数据校验和错误恢复
- 存储操作失败处理
- API调用超时处理

### 已知问题

- [ ] 节点回放时只显示标题，不加载完整对话内容
- [ ] 画布拖拽时节点位置计算需要优化
- [ ] API Key需要从配置文件读取而非环境变量

### 后续规划

**v0.2.0 (计划中)**
- 完整的对话历史查看
- 节点拖拽排序
- 导入/导出配置
- 多模型切换UI

**v0.3.0 (计划中)**
- 节点连线（简单关系）
- 搜索功能
- 设置面板

## 提交记录

### 2026-02-28

- `init-1` ✓ 项目初始化：搭建Electron+React+TypeScript+Vite环境
- `init-2` ✓ 创建数据类型定义：types.ts
- `init-3` ✓ 创建常量定义：constants.ts
- `week1-1` ✓ 实现无限画布组件（Canvas.tsx）
- `week1-2` ✓ 实现底部输入框组件（InputBox.tsx）
- `week1-3` ✓ 实现AI接入层（useAI.ts, ai.ts）
- `week1-4` ✓ 实现全屏回答层（AnswerModal.tsx）
- `week1-5` ✓ 实现节点卡片组件（NodeCard.tsx）
- `week1-6` ✓ 实现本地存储（storage.ts）
- `week1-7` ✓ Week1验收：完成闭环-输入→回答→成卡
- `week2-1` ✓ 实现负反馈识别（feedback.ts）
- `week2-2` ✓ 实现偏好抽取与存储（profile.ts）
- `week2-3` ✓ 实现对话记录（conversations.jsonl）
- `week2-4` ✓ 实现System Prompt组装（prompt.ts）
- `week2-5` ✓ Week2验收：完成闭环-纠错→学习→写入
- `week3-1` ✓ 实现灰字提示组件（GrayHint.tsx）
- `week3-2` ✓ 实现偏好匹配检测（prompt.ts增强）
- `week3-3` ✓ 实现节点回放功能
- `week3-4` ✓ 体验打磨 - 动画、过渡、边界处理
- `week3-5` ✓ 稳定性优化
- `week3-6` ✓ Week3验收：完成闭环-被记住的反馈+打磨
- `docs-1` ✓ 建立文档体系：architecture.md, api.md, changelog.md
- `backup-1` ✓ 更新项目备份记录

---

**开发周期**: 3周 (2026-02-28 完成MVP)
**核心目标**: 验证"AI会记住我"的默契感 ✓
