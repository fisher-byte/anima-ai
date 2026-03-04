# Anima 变更日志

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
