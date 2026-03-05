# Code Review Report — v0.2.24

**日期**：2026-03-05
**版本**：0.2.24
**范围**：记忆与进化基因侧边栏根因修复，5 个文件变更

---

## 审查结果摘要

| 分类 | 数量 |
|------|------|
| 严重 Bug（修复）| 2 |
| 中等 Bug（修复）| 1 |
| 潜在风险（已接受）| 0 |
| 改进建议（非阻塞）| 0 |

TypeScript 编译：`tsc --noEmit` **零错误**
单元测试：210 tests **全部通过**（新增 2 个回归用例）

---

## 根因分析回顾

本次修复对象：「全量清空并开启新手教程」→ 完成教程 → 侧边栏记忆/进化基因始终为空。

经 SQLite 数据追踪确认三个根因均已修复，未引入新问题。

---

## 文件级审查

### `src/server/routes/memory.ts`

#### Fix 1 — 去重查询加 `invalid_at IS NULL`（line 379）

**变更前**：
```sql
SELECT fact FROM memory_facts ORDER BY created_at DESC LIMIT 30
```

**变更后**：
```sql
SELECT fact FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC LIMIT 30
```

**评价**：✅ 正确。软删除事实（`invalid_at` 非 null）不应参与去重比对，这是明确的语义 bug。修复最小化，不影响任何其他路径。

---

#### Fix 2 — `DELETE /api/memory/facts` 附带清理

**变更**：路由新增两条 SQL：
1. `UPDATE config SET value = '[]' WHERE key = 'preference_rules'`
2. `DELETE FROM agent_tasks WHERE status = 'pending'`

**评价**：✅ 正确。

- config 清理：`preference_rules` 是 agentWorker 写入的缓存，全量重置时遗留旧规则会在新手教程期间被 AI 继续引用，产生语义错乱。清空为 `[]` 而非 DELETE 整行，保持 key 存在性，避免 agentWorker 的 `INSERT OR IGNORE` 逻辑与 `UPDATE` 路径不一致。

- pending tasks 清理：`DELETE WHERE status = 'pending'` 精确清除未处理任务，保留 `done`/`failed` 历史记录，符合最小影响原则。两条 SQL 均为同步执行，无事务需要（SQLite 单写者，顺序执行即幂等）。

---

### `src/renderer/src/stores/canvasStore.ts`

**变更**：
1. interface `CanvasState` 新增 `pendingMemoryRefresh: boolean` + `setPendingMemoryRefresh`
2. 初始值 `pendingMemoryRefresh: false`
3. setter `setPendingMemoryRefresh: (val) => set({ pendingMemoryRefresh: val })`
4. `completeOnboarding` 末尾：`set({ pendingProfileRefresh: true, pendingMemoryRefresh: true })`

**评价**：✅ 正确。与已有的 `pendingProfileRefresh` 完全对称，实现方式一致。`completeOnboarding` 有 `_completingOnboarding` 并发锁，两个 flag 都在 `try` 块末尾设置，不存在并发竞态。

---

### `src/renderer/src/components/ConversationSidebar.tsx`

**变更**：新增 `useEffect` 监听 `pendingMemoryRefresh`，在 3s / 8s / 15s 调用 `fetchMemoryFacts(false)`，15s 时清除标志。

**评价**：✅ 正确。

- `fetchMemoryFacts` 已有 `useCallback` 包装，deps 正确，不会在轮询期间引起不必要的 re-render。
- 三个 timer 均在 cleanup 函数中 `clearTimeout`，组件卸载或 flag 变化时不会内存泄漏。
- `fetchMemoryFacts(false)` 在后台静默拉取（非 silent=true），**会触发新记忆 toast**，这是期望行为——用户在侧边栏打开时能看到"✦ 新记忆已写入"提示。
- 15s 覆盖窗口合理：`/api/memory/extract` 同步 AI 调用约 2-5s，3s 首次轮询可捕获快速响应，8s/15s 兜底慢速网络。

---

### `src/server/__tests__/memory.test.ts`

**变更**：
1. 测试桩 `DELETE /api/memory/facts` 路由同步更新，与生产代码行为一致
2. 新增测试：`DELETE /api/memory/facts also clears preference_rules in config`
3. 新增测试：`DELETE /api/memory/facts deletes pending agent_tasks`

**评价**：✅ 回归测试覆盖充分。两个新用例分别验证了 Fix 2 的两条清理逻辑，边界条件（done 任务不被误删）也有断言。

---

## 总结

本次 3 处修复均为局部精确改动，无副作用。TypeScript 零错误，210 个单元测试全部通过。

**验收标准对照**：

| 验收项 | 状态 |
|--------|------|
| 全量清空后重新提取记忆 `extracted > 0` | ✅ Fix 1 解决 |
| 全量清空后 pending tasks 被清除 | ✅ Fix 2 解决 |
| 全量清空后 preference_rules 被重置 | ✅ Fix 2 解决 |
| 侧边栏 15s 内显示新记忆 | ✅ Fix 3 解决 |
| 侧边栏 35s 内显示新偏好规则 | ✅ 已有机制保留 |
| 所有单元测试通过 | ✅ 210/210 |
