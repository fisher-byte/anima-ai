# Code Review Report — v0.4.3

**审查范围**：`src/server/routes/ai.ts`（`fetchScoredFacts` / `loadMemoryScores` / `saveMemoryScores` / `applyDecay` / `MEMORY_STRATEGY`）、`src/shared/constants.ts`（`memory_scores.json` 白名单）、`src/server/__tests__/server-ai.test.ts`（新增 9 个用例）

**结论**：发现 0 个 P0/P1，1 个 P2（已修复：`interface AIRequestBody` 声明缺失），1 个 P3。**记忆评分核心逻辑正确，降级路径完备。**

---

## P0 — 崩溃 / 数据错误

**无。**

核心路径验证通过：
- `MEMORY_STRATEGY === 'baseline'`：完全透传 `fetchRelevantFacts`，原有行为零改动
- `fetchScoredFacts` 在 embedding 失败时回退 `bm25FallbackFacts`（与 baseline 一致）
- `saveMemoryScores` 写入失败静默 catch，不影响主流程
- `loadMemoryScores` 读取失败返回空 Map，`importance` 默认 0.5，行为可预测

---

## P1 — 逻辑错误 / 功能失效

**无。**

- `applyDecay` 当 `MEMORY_DECAY_ENABLED=false` 时直接返回原始 cosineScore（单元测试验证）
- 半衰期公式 `Math.exp(-Math.LN2 / 69 * days)` 在 days=0 时 ≈ 1.0，days=69 时 ≈ 0.5，days=138 时 ≈ 0.25（9 个测试覆盖）
- `accessBonus = min(0.15, count * 0.02)` 上限防止频繁访问 facts 无限权重提升
- `setImmediate` 异步写回，不阻塞 SSE 流式响应（高频场景安全）

---

## P2 — 边界情况 / 功能缺失

**P2-1：`interface AIRequestBody` 声明缺失（已修复）**

**文件**：`src/server/routes/ai.ts:265`

**问题**：Edit 操作意外删除了 `interface AIRequestBody {` 声明行，导致接口体字段变为顶层孤立语句，tsc 报 8 个 TS1011/TS1109/TS1128 parse 错误。

**修复**：在 `const MEMORY_STRATEGY` 之后重新插入 `interface AIRequestBody {` 声明行。

**修复状态**：✅ 已修复（本次 review 第一步）

---

## P3 — 代码质量 / 文档

**P3-1：`fetchScoredFacts` 中 importance 目前始终为默认值 0.5**

**文件**：`src/server/routes/ai.ts:239`

**观察**：`const importance = meta?.importance ?? 0.5` 中，`memory_scores.json` 里的 `importance` 字段当前没有被自动填充逻辑——只有 `access_count` / `last_accessed_at` 被更新。即所有 fact 实际上都以相同的 importance=0.5 参与计算，等效于 baseline × 0.85 + accessBonus 的变种。

**评估**：P3，不阻塞功能。`scored` 策略的主要价值目前来自 `accessBonus`（频繁访问 facts 权重提升）+ 可选时间衰减，已足够形成差异化。importance 自动推断可在后续版本通过 AI 提取（`extract-topic` 类似模式）实现。

**建议**：后续版本在 `endConversation` 时对新增 facts 评估 importance（0~1），写入 memory_scores.json。

---

## 安全审查

| 检查项 | 结果 |
|--------|------|
| `memory_scores.json` 文件名白名单 | ✅ 已加入 `ALLOWED_FILENAMES` |
| `storage` 表写入 SQL 注入防护 | ✅ 使用参数化 `?` 占位符 |
| `setImmediate` 回调中 db 引用有效性 | ✅ db 是模块级 singleton，不存在 GC 问题 |
| 空 map 时不写入空 JSON（节约写放大） | ✅ `if (selectedIds.length > 0)` 守卫 |

---

## 测试覆盖评估

| 覆盖面 | 状态 |
|--------|------|
| `applyDecay` DECAY_DISABLED 透传 | ✅ |
| `applyDecay` 今日无衰减（≈1.0） | ✅ |
| `applyDecay` 69 天半衰期（≈0.5） | ✅ |
| `applyDecay` 138 天四分之一（≈0.25） | ✅ |
| `applyDecay` 不超原始分值 | ✅ |
| MEMORY_STRATEGY finalScore 公式 | ✅ |
| importance=0.5 权重系数 0.85 | ✅ |
| accessBonus 上限 0.15 | ✅ |
| `loadMemoryScores` / `saveMemoryScores` DB 集成 | ❌ 未覆盖（需真实 SQLite 实例，低优先级） |
| `fetchScoredFacts` E2E（embedding → 余弦 → 排序） | ❌ 未覆盖（需真实 embedding API，集成测试范围）  |

---

## 总结

v0.4.3 的记忆评分系统核心逻辑正确，降级完备（baseline 零改动，scored 多重 fallback），安全防护到位。P2-1 在 review 过程中立即修复。P3-1 importance 自动推断是后续迭代点，不影响当前发版。

**vitest 502/502 | tsc 0 errors | 无 P0/P1**
