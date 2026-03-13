# Anima 测试手册

*最后更新: 2026-03-13 | 版本: v0.3.2*

## 测试策略

### 1. 单元测试 (Unit Test)

**目标**: 核心业务逻辑覆盖率 > 80%

**已覆盖模块**:
- ✅ `feedback.ts` — 负反馈检测（21 个用例）
- ✅ `profile.ts` — 偏好管理（24 个用例）
- ✅ `prompt.ts` — Prompt 组装（23 个用例）
- ✅ `storageService.ts` — Web 存储服务（21 个用例）
- ✅ `conversationUtils.ts` — 对话工具函数（45 个用例）
  - `compressMemoriesForPrompt`：截断、省略号、多条拼接
  - `parseTurnsFromAssistantMessage`：单轮、多轮、reasoning 提取
  - `stripLeadingNumberHeading`：THINKING 哨兵、#N 前缀、多轮前缀剥离
  - `buildAIHistory`：空消息过滤、用户/AI 交替构建
- ✅ `services/ai.ts` — 前端 AI 服务（18 个用例）
- ✅ `canvasStore.nodeConsolidation.test.ts` — 节点聚合逻辑（25 个用例）
  - 节点合并阈值、相似度判断、聚合后数据一致性
- ✅ `canvasStore.lennyMode.test.ts` — Lenny Space 模式（12 个用例）
  - Lenny Space 开关、节点加载、状态隔离
- ✅ `rebuild-node-graph.test.ts` — 节点图重建（7 个用例）
  - 无数据返回 reason、clusters 数组格式、边界条件

**运行命令**:
```bash
npm test              # 运行所有测试（CI 模式）
npm run test:watch    # 监听模式（开发时用）
```

---

### 2. 集成测试 (Integration Test)

**目标**: 所有 HTTP API 端点在真实 SQLite（内存模式）下行为正确

**测试文件分组策略**（按 DB 作用域划分，v0.2.51）：

| 文件 | DB 作用域 | 内容 |
|------|---------|------|
| `server.test.ts` (629行) | `testDb` + `resetDb` | health/storage/config/auth + 对话历史 + API key 守卫 |
| `server-integration.test.ts` (703行) | `memDb` + `fileDb` | memory profile/facts/agent + 文件上传/向量化 + 逻辑边 |
| `server-ai.test.ts` (272行) | 无 DB（纯逻辑） | readRound / 澄清层触发规则 / search_round 消息格式 |
| `ai-onboarding.test.ts` | 独立 `aiDb` | onboarding 模式 + ONBOARDING_API_KEY 降级 |
| `memory.test.ts` | 独立 `memoryDb` | 记忆路由完整 CRUD |

**分组原则**：每个测试文件只使用一种 DB 作用域（testDb / memDb / fileDb），不跨文件引用 DB，防止状态污染。

**已覆盖模块**:
- ✅ `server.test.ts` — 核心路由集成测试（health/storage/config/auth/对话历史/多租户）
- ✅ `server-integration.test.ts` — memory/agent/file 集成测试
  - User Profile CRUD、Memory Facts CRUD、Queue API
  - 文件上传 + Magic Byte 校验 + file_embeddings 隔离
  - 逻辑边 API（GET / GET:id / DELETE:id）
  - AgentWorker 多租户隔离（4 个用例）
- ✅ `server-ai.test.ts` — AI 功能纯逻辑测试（38 个用例）
  - `readRound`：content 流、tool_call 累积、reader.releaseLock、[DONE] 跳过
  - 澄清层触发规则：关键词/引号/年份/长度/onboarding 守卫/重复触发
  - `search_round` SSE：round 消息、MAX_SEARCH_ROUNDS 边界、finishReason 退出
  - `URL_REGEX`：HTTP/HTTPS 检测、中文标点截断、www 不匹配、多 URL 提取
  - `fetchUrlContent`：异常返回 null、非 200 返回 null、超长内容截断
  - `search_memory`：tool type 验证、required 参数检查、isMemoryRound 逻辑
  - 记忆轮文案：isMemoryRound=true 时文案固定、web 搜索文案不变
  - `TOOLS_WITH_MEMORY` 结构：2 个工具、$web_search type、search_memory type

- ✅ `ai-onboarding.test.ts` — AI 引导模式测试（6 个用例）
  - onboarding 标志正确路由到轻量 system prompt
  - 无 API Key 时使用 ONBOARDING_API_KEY 降级

- ✅ `memory.test.ts` — 记忆路由集成测试（含 FTS5 trigger、引用块过滤、decayPreferences、语义边 by-id）

**总测试数**: **451 个用例，17 个测试文件，全部通过**

---

### 3. E2E 测试 (Playwright)

**框架**：`@playwright/test ^1.58.2`，配置文件 `playwright.config.ts`

**运行命令**：
```bash
npm run dev          # 先启动开发服务器（前端 :5173 + 后端 :3000）
npm run test:e2e     # 另开终端运行 E2E
npm run test:e2e:ui  # 带可视化 UI 模式
```

**测试文件**：
| 文件 | 测试数 | 覆盖内容 |
|------|--------|---------|
| `e2e/canvas.spec.ts` | 10 | 应用加载/能力块/后端 API/侧栏/节点/confirm dialog/API Key 提示 |
| `e2e/features.spec.ts` | 36 | 引用块/文件标记/FTS5/decayPreferences/碰撞检测/多租户鉴权/semantic search/logical-edges/NodeTimeline/extract-topic/节点聚合 rebuild/Lenny Space 入口&白名单&种子数量 |

**总 E2E 场景**：46 个（其中 1 个条件性 skip，视环境是否已配置 API Key）

**环境要求**：需设置 `ACCESS_TOKEN` 环境变量（或在 `.env` 中配置）；无 token 时多租户鉴权相关测试自动跳过。

#### 关键测试覆盖（v0.2.76 现状）

| 场景 | 测试文件 | 测试编号 |
|------|---------|---------|
| 应用基础加载 | canvas.spec.ts | 1 |
| 后端核心接口健康 | canvas.spec.ts | 3 |
| POST /api/memory/queue 入队 | canvas.spec.ts | 7 |
| GET /api/memory/logical-edges | features.spec.ts | 24-25 |
| PUT /api/config/apikey 空值拒绝 | features.spec.ts | 26 |
| 无 token → 401 | features.spec.ts | 21 |
| 语义搜索 by-id | features.spec.ts | 23 |
| NodeTimeline 多对话角标 | features.spec.ts | 29-30 |
| extract-topic 接口 | features.spec.ts | 28 |
| POST /api/memory/rebuild-node-graph | features.spec.ts | 31 |
| 整理相似节点按钮可见 | features.spec.ts | 32-33 |
| Lenny Space 入口按钮可见 | features.spec.ts | 34 |
| lenny-nodes.json 白名单校验 | features.spec.ts | 35 |
| Lenny Space 种子节点数量 ≥ 37 | features.spec.ts | 36 |

#### 手动测试清单（E2E 不覆盖的交互场景）

**对话流程**：
| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 输入"你好"后 Enter | 进入全屏回答层 |
| 2 | 等待 AI 回复 | 看到流式输出 |
| 3 | 关闭回答层 | 画布出现节点卡片 |
| 4 | 刷新页面 | 节点依然存在 |

**文件上传**：
| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 上传 10MB+ 文件 | 前端拦截，显示错误提示 |
| 2 | 上传合法 PDF | FileBubble 显示文件名 |

**负反馈学习**：

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 发送问题获得回答 | 看到 AI 回复 |
| 2 | 回复"简洁点" | 检测到偏好 |
| 3 | 再次问同类问题 | 灰字偏好提示出现 |

#### 3.7 新用户引导测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 新账号首次登录 | 显示 onboarding 引导流程 |
| 2 | 完成引导 | onboarding 节点出现在画布 |
| 3 | 同一浏览器切换账号 | 新账号不跳过引导 |
| 4 | 刷新页面 | 已完成引导的账号不再显示引导 |

---

### 4. API 连通测试（手动）

```bash
TOKEN=your-token

# 健康检查
curl http://localhost:3000/api/health
# 预期：{"status":"ok","timestamp":"..."}

# 配置验证（需 token）
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/config/settings
# 预期：{"model":"kimi-k2.5","baseUrl":"https://api.moonshot.cn/v1"}

# 记忆搜索（需有对话数据）
curl -X POST http://localhost:3000/api/memory/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"编程","topK":3}'

# 手动触发 Agent 任务
curl -X POST http://localhost:3000/api/memory/consolidate \
  -H "Authorization: Bearer $TOKEN"
```

---

### 5. 数据存储验证

| 测试项 | 验证方法 |
|--------|---------|
| 多租户隔离 | `ls data/` 查看是否有多个 12 位 hex 子目录，各自独立 |
| 节点/对话持久化 | `sqlite3 data/{userId}/anima.db "SELECT count(*) FROM storage"` |
| 偏好/配置 | `SELECT value FROM config WHERE key='preference_rules'` |
| 记忆事实 | `SELECT * FROM memory_facts WHERE invalid_at IS NULL` |
| 向量索引 | `SELECT count(*) FROM embeddings` |
| 文件上传 | `SELECT id, filename, embed_status FROM uploaded_files` |
| 后台任务 | `SELECT type, status, retries FROM agent_tasks ORDER BY id DESC LIMIT 20` |

---

### 6. UI/UX 测试清单

- [ ] 画布拖拽流畅（帧率稳定）
- [ ] 节点卡片显示正确
- [ ] Zoom 缩放流畅（无卡顿）
- [ ] 搜索面板正常弹出
- [ ] 侧边栏正常滑出
- [ ] 过渡动画平滑
- [ ] FileBubble 展开/收起正常
- [ ] 输入框文件预览（loading → done / error）
- [ ] 设置弹窗保存成功/失败 toast 均正常显示

---

### 7. 安全测试

- [ ] 文件路径验证阻止非法访问（已有自动化测试覆盖）
- [ ] API Key 不暴露在 Network 面板（通过 DevTools 核查）
- [ ] 超时机制正常（AI 流式请求停止后 abort 有效）
- [ ] 未携带 token 时 API 返回 401（有自动化测试覆盖）
- [ ] 不同 token 数据完全隔离（有自动化测试覆盖）

---

## 手动测试报告模板

```markdown
## 测试日期: YYYY-MM-DD
## 测试版本: vX.X.X
## 测试人员: XXX

### 测试结果
- [ ] 启动测试: 通过/失败
- [ ] 鉴权/多租户测试: 通过/失败
- [ ] 对话测试: 通过/失败
- [ ] 文件上传测试: 通过/失败
- [ ] 错误体验测试: 通过/失败
- [ ] 学习测试: 通过/失败
- [ ] 存储测试: 通过/失败

### 自动化测试
npm test → X 个用例，X 个通过，0 失败

### 发现问题
1. 问题描述: xxx
   - 复现步骤: xxx
   - 期望结果: xxx
   - 实际结果: xxx

### 测试结论
[ ] 可以发布
[ ] 需要修复后重测
```
