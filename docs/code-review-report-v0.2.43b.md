# Code Review Report — v0.2.43b

**审查日期**: 2026-03-06
**审查范围**: 全量代码审查（所有服务端、共享模块、测试文件）
**测试结果**: 236 / 236 通过，TypeScript 零错误

---

## 审查结论

整体代码质量良好。本次审查发现 1 个安全性 bug（P1）、2 个维护问题（P2）、2 个文档不一致（P3），均已在本次修复。

---

## 已修复问题

### P1 — `memory.ts` 去重请求缺少超时保护

**文件**: `src/server/routes/memory.ts` — `/extract` 路由，第二轮 deduplicate 请求
**问题**: 调用 LLM 对记忆事实做语义去重时，未设置 `AbortSignal.timeout()`。若上游 API 无响应，该 fetch 会永久挂起，占用服务端连接。
**修复**: 添加 `signal: AbortSignal.timeout(10_000)`，与其他 LLM 调用风格保持一致。

---

### P2 — `constants.ts` 版本号严重过时

**文件**: `src/shared/constants.ts`，第 11 行
**问题**: `APP_VERSION = '0.2.11'`，而 `package.json` 为 `0.2.43`，相差 32 个版本。虽前端当前未渲染此常量，但若未来使用将导致版本标识错误。
**修复**: 更新为 `'0.2.43'`。

---

### P2 — `constants.ts` API 配置注释 Electron 时代遗留

**文件**: `src/shared/constants.ts`，`API_CONFIG` 注释
**问题**: 注释写"API Key将在运行时从主进程或环境变量获取"，实际架构已切换为服务端 SQLite 存储（Web 模式）。
**修复**: 更新注释为准确描述。

---

### P3 — `testing.md` 漏记 2 个测试文件

**文件**: `docs/testing.md`
**问题**:
- `src/server/__tests__/ai-onboarding.test.ts`（6 个用例）完全未记录
- `src/renderer/src/services/__tests__/ai.test.ts`（16 个用例）完全未记录
- `server.test.ts` 标注为"215 个用例"，实际为 81 个（77 路由 + 4 多租户）
- 总数和文件数正确（236 个 / 9 个文件），但单文件分布描述有误

**修复**: 更新 `testing.md`、`dev-guide.md`、`architecture.md` 中的测试分布描述。

---

## 无问题确认（已审查通过）

### 安全

| 检查项 | 状态 |
|--------|------|
| SQL 注入防护 | ✅ 全量使用 better-sqlite3 预编译 statement |
| 路径遍历防护 | ✅ `isValidFilename()` 白名单 + 双重字符检查 |
| Bearer Token 时序安全 | ✅ `timingSafeEqual` 防 timing attack |
| API Key 不泄露浏览器 | ✅ 仅存服务端 SQLite，不经过客户端 |
| 文件上传安全 | ✅ MIME 白名单 + 魔数（magic bytes）双重校验 + 50MB 大小限制 |
| 多租户隔离 | ✅ SHA-256 token → userId → 独立 SQLite 文件，用户间数据完全隔离 |
| 遗留数据迁移安全 | ✅ `migrateFromDefault` 仅对 PRIMARY TOKEN 的主用户迁移，防止串号 |

### 核心逻辑

| 模块 | 状态 |
|------|------|
| agentWorker 多租户 | ✅ v0.2.43 完整修复，`tick()` 遍历所有用户 db |
| embedding 403 静默处理 | ✅ 进程级 `embeddingDisabledKeys` 黑名单，零用户干扰 |
| Kimi 2.5 reasoning_content | ✅ tool_calls 完成后第二轮自动填充 `reasoning_content` |
| 偏好规则去重 | ✅ 子串双向比对，启动时全量清洗 |
| 记忆事实自动整合 | ✅ 每满 20 条自动入队 `consolidate_facts` |
| 对话向量索引 | ✅ 语义检索失败时优雅降级为最近 15 条关键词匹配 |
| 智能模型路由 | ✅ 纯问候走 `moonshot-v1-8k`，实质内容走用户配置模型 |
| onboarding API Key | ✅ 引导模式下无用户 Key 时使用 `ONBOARDING_API_KEY` 演示 Key |

### 架构

| 检查项 | 状态 |
|--------|------|
| WAL checkpoint | ✅ 每个用户 db 独立 5 分钟定时 checkpoint |
| 崩溃恢复 | ✅ 服务启动时将 `running` 状态任务重置为 `pending` |
| 任务退避重试 | ✅ 最多 3 次，错误信息记录在 `error` 字段 |
| 7 天任务清理 | ✅ 每小时 cleanOldTasks() |
| SSE 流式代理 | ✅ `proxy_buffering off` + 正确的 SSE buffer 分割（`\n\n` 分隔） |
| token budget | ✅ System Prompt 分层注入，总预算 1500 tokens，CJK 字符 2 token/字 |

---

## 设计观察（不影响当前功能，供决策参考）

1. **`memory.ts` 内部裸 SQL 写 agent_tasks**：`/consolidate` 和 `/extract` 里的自动触发条目直接用裸 SQL INSERT，而非调用 `enqueueTask()`。功能等价，但与其他地方的封装风格不一致。若 `agent_tasks` 表结构调整，这两处需要同步手动更新。可评估是否统一。

2. **`services/prompt.ts` 的 `detectPreferenceApplication`**：通过启发式规则（回答长度 < 200 字 = 简洁，含序号 = 结构化）判断偏好是否被应用。逻辑较脆弱（一个长 URL 就能超 200 字），但灰字提示是非核心功能，用户体验影响有限。

3. **`services/feedback.ts` 的 `decayOldPreferences`**：实现了偏好随时间衰减的函数，但服务端 `agentWorker` 没有调用它，前端也未见调用入口。这是一个"设计预留但尚未激活"的功能，可以在下个版本考虑激活。

4. **`constants.ts` 的 `SIMPLE_QUERY_FACT_PATTERNS`**：空数组 `[]`，是早期设计中预留的"事实性查询路由"（走快速模型），目前未使用。清理或激活可减少认知负担。

---

## 测试覆盖分布

| 文件 | 用例数 | 类型 |
|------|--------|------|
| `server.test.ts` | 81 | 集成（HTTP 路由 + 多租户） |
| `memory.test.ts` | 21 | 集成（记忆 / 画像路由） |
| `ai-onboarding.test.ts` | 6 | 集成（AI onboarding 模式） |
| `ai.test.ts` | 16 | 单元（前端 AI 服务） |
| `storageService.test.ts` | 21 | 单元（前端存储服务） |
| `conversationUtils.test.ts` | 27 | 单元（对话工具函数） |
| `feedback.test.ts` | 21 | 单元（负反馈检测） |
| `profile.test.ts` | 24 | 单元（偏好管理） |
| `prompt.test.ts` | 23 | 单元（Prompt 组装） |
| **合计** | **236** | **9 文件，全部通过** |
