# Code Review Report — v0.2.18 + v0.2.19

**日期**: 2026-03-04
**版本**: v0.2.18（后端安全审计）+ v0.2.19（前端联调专项）
**审查范围**: src/server/（全量）、src/renderer/src/（services/components）、src/shared/types.ts

---

## 总体评价

两个版本合计修复 13 个 CRITICAL/HIGH/MEDIUM 问题，代码质量从"可运行"提升到"生产可信"。
关键里程碑：安全模型从 Fail Open 翻转为 Fail Closed，前端错误路径全面可见。

---

## v0.2.18 — 后端安全审计

### ✅ CRITICAL 修复

**1. config INSERT crash（`agentWorker.ts`）**
- **问题**：`INSERT INTO config (key, value)` 缺少 `updated_at NOT NULL` 字段，首次写入 `preference_rules` 时 `SqliteError: NOT NULL constraint failed`
- **修复**：INSERT / UPDATE 均补全 `updated_at`
- **影响**：无此修复则用户偏好学习功能完全失效

### ✅ HIGH 修复

**2. SSE buffer 边界（`routes/ai.ts`）**
- **问题**：`chunk.split('\n')` 直接切割，JSON 在 TCP 边界被截断时静默丢失内容
- **修复**：持久 `sseBuffer`，以 `\n\n` 为 SSE 事件边界分割
- **评价**：标准 SSE 解析方式（与 Vercel AI SDK 一致）

**3. N+1 查询消除（`routes/ai.ts fetchRelevantFacts`）**
- **问题**：每条 fact 单独 `SELECT source_conv_id`，最多 100 次 DB 往返
- **修复**：首次 SELECT 包含 `source_conv_id`，完全消除 N+1
- **效果**：100 条 facts 场景从 ~100 次 DB 调用降至 1 次

**4. 向量全量加载 → LRU 缓存（`routes/memory.ts`）**
- **问题**：`/search` 每次全量读取 embeddings 表到内存
- **修复**：模块级缓存（60s TTL，写入时 invalidate），`LIMIT 2000` 防内存爆炸
- **评价**：与 FAISS/Chroma 的内存索引思路一致

### ✅ 安全修复

**5. Auth Fail Open → Fail Closed（`middleware/auth.ts`）**
- **问题**：`AUTH_ENABLED=true` 才开启鉴权，生产忘配则裸奔
- **修复**：改为 `AUTH_DISABLED=true` 才跳过，默认安全
- **风险等级**：HIGH（线上数据暴露风险）

**6. timingSafeEqual 防时序攻击（`middleware/auth.ts`）**
- **问题**：`token !== accessToken` 明文比较，可通过逐字节响应时间差猜测 token
- **修复**：`crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`
- **评价**：符合 OWASP A02 要求

### ✅ MEDIUM/LOW 修复

**7. CJK Token 估算误差修复（`routes/ai.ts approxTokens`）**
- 原 `chars/4` 对中文误差最高 8x → 改为 CJK(×2) + 拉丁(÷4) 混合算法，误差 <1.5x

**8. DB partial index（`db.ts`）**
- 新增 `idx_memory_facts_active WHERE invalid_at IS NULL`，加速软删除过滤查询

**9. WAL checkpoint 定时任务（`db.ts`）**
- 每 5 分钟 `PRAGMA wal_checkpoint(PASSIVE)`，防 WAL 文件无限增长

---

## v0.2.19 — 前端联调专项

### ✅ 错误体验提升

**1. HTTP 错误状态码友好提示（`services/ai.ts`）**
- **问题**：原 `AI proxy error ${status}: ${text}` 对用户毫无信息量
- **修复**：按状态码映射中文（401/413/415/500/502/503）
- **评价**：参照 ChatGPT Web 错误提示设计

**2. 设置保存失败提示（`SettingsModal.tsx`）**
- **问题**：catch 块只有 `console.error`，用户保存失败无任何反馈
- **修复**：新增 `showError` 状态，失败后红色 toast（3s 自动消失）
- **代码质量**：同步移除 `@ts-ignore`，改用 `(AI_CONFIG as {MODEL: string}).MODEL = model`

### ✅ 文件处理健壮性

**3. 前端文件大小预检（`InputBox.tsx`）**
- **问题**：无前端大小限制，大文件进入解析器可致浏览器 OOM；后端虽有 50MB 限制但前端无感
- **修复**：10MB 前端校验，超限立即标 `status: 'error'` 阻断解析

**4. 文件上传失败可视化（`AnswerModal.tsx` + `FileBubble.tsx`）**
- **问题**：上传失败 `catch { /* 不阻断 */ }` 静默忽略，用户不知道文件未进入记忆库
- **修复**：捕获 HTTP 状态写入 `FileAttachment.uploadError`；FileBubble 紧凑态 ⚠ 图标 + 展开态错误文案
- **设计参照**：Linear 附件失败状态的可视化模式

### ✅ 类型系统

**5. `FileAttachment.uploadError?: string`（`shared/types.ts`）**
- 前端与后端通信状态可追踪，不再靠 `console.error` 盲调试

---

## ⚠️ 已知待改善项（不阻塞发布）

| 优先级 | 位置 | 问题 | 建议 |
|--------|------|------|------|
| MEDIUM | `conversationUtils.ts` | `Turn.memories` 字段引用完整 `Conversation` 对象，内存占用随对话数线性增长 | 仅存 `id + 摘要` |
| LOW | `AnswerModal.tsx` | 超长对话无虚拟滚动，DOM 节点数随对话增长 | 引入 `react-virtual` |
| LOW | `Canvas.tsx` | `handleClusterDrag` 每次遍历全部节点（< 100 时无感） | 节点数 > 200 时预建 categoryNodeMap |
| LOW | `db.ts WAL checkpoint` | PASSIVE 模式在高并发时可能不触发 | 生产环境考虑 RESTART 模式 |

---

## 测试覆盖

| 测试文件 | 用例数 | 覆盖目标 |
|---------|--------|---------|
| `server.test.ts` | 66 | Storage / Config HTTP 路由 |
| `memory.test.ts` | 19 | Profile / Facts / Queue / Classify / Extract / Index 路由 |
| `conversationUtils.test.ts` | 27 | compress / parseTurns / stripHeading / buildHistory |
| `storageService.test.ts` | 21 | WebStorageService / WebConfigService |
| `profile.test.ts` | 24 | 偏好规则管理 |
| `prompt.test.ts` | 23 | Prompt 构建 |
| `feedback.test.ts` | 21 | 负反馈检测 |
| **合计** | **201** | **7 个文件，全部通过** |

---

## 发布状态

**✅ v0.2.18 可以发布** — 后端安全问题全部修复
**✅ v0.2.19 可以发布** — 前端错误路径完整，测试全绿
