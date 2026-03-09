# Code Review Report — v0.2.74

**版本**：0.2.74
**日期**：2026-03-09
**特性**：历史节点回溯合并 (Retroactive Node Consolidation)
**修订**：v0.2.74-patch1（2026-03-09，修复两个上线后发现的 bug）

---

## 总体评分

| 维度 | 评分 |
|------|------|
| 正确性 | ✅ 通过（含 patch1 修复） |
| 安全性 | ✅ 无注入风险（SQLite 参数化查询，输入校验） |
| 性能 | ⚠️ O(n²) 两两比较，节点数 >200 时建议分批 |
| 可测试性 | ✅ 7 个单元测试 + 3 个 E2E 测试 |
| 向后兼容 | ✅ 纯只读计划接口，Store 初始状态为 idle |

---

## Patch 1 修复记录（上线后发现）

### Bug A：rebuild-node-graph 500 错误
**根因**：`POST /api/memory/rebuild-node-graph` 路由中 SQL 查询了错误的表和字段名。
- 错误：`SELECT embedding FROM memories WHERE conversation_id = ?`
- 正确：`SELECT vector FROM embeddings WHERE conversation_id = ?`

**影响**：点击"整理相似节点"必定 500，功能完全不可用。
**修复**：`src/server/routes/memory.ts` — 更正表名和字段名。

### Bug B：`POST /api/storage/read` 404（历史遗留，v0.2.74 扫描时发现）
**根因**：Canvas.tsx 有 3 处调用了不存在的接口 `POST /api/storage/read`，返回 `{ content }` 对象——该接口从未在后端实现。正确接口为 `GET /api/storage/:filename`，返回 raw text。

**影响**：C3 主动对话提醒、FR-004 深夜/偏好通知功能静默失效（`if (!resp.ok) return` 即退出）。
**修复**：`src/renderer/src/components/Canvas.tsx` — 3 处全部改为 `GET /api/storage/conversations.jsonl` / `GET /api/storage/profile.json`，返回值从 `{ content }` 改为 `.text()`。

### Bug C：conversationIds 可能含 undefined（轻微）
**根因**：`n.conversationIds ?? [n.conversationId]` 在两者均为 undefined 时产生 `[undefined]`。
**修复**：`canvasStore.ts` — 加防御性 guard：`n.conversationId ? [n.conversationId] : []`，并过滤 `conversationIds.length === 0` 的节点。

---

## 后端：`src/server/routes/memory.ts`

### 新增路由：`POST /api/memory/rebuild-node-graph`

**设计亮点**：
- 纯 in-process 计算，无外部 API 调用，响应快且不消耗 embedding token
- 只返回计划（ClusterPlan[]），前端决策是否应用，符合 CQRS 原则
- Union-Find 路径压缩，时间复杂度接近线性

**已知限制**：
1. **O(n²) 复杂度**：节点数 n 时两两比较为 `n*(n-1)/2` 次 cosineSim。n=100 约 4950 次，n=500 约 12.5 万次。当前用户规模（< 200 节点）可接受。
2. **nodes.find() 内层循环**：`nodes.find(n => n.id === nodeIds[i])` 在 O(n²) 外层中调用，整体 O(n³)。建议后续用 `Map<id, node>` 优化。

---

## 前端 Store：`src/renderer/src/stores/canvasStore.ts`

### 新增状态：`nodeGraphRebuild`

- 5 阶段状态机（idle → analyzing → merging → done/error）
- 复用现有 `mergeIntoNode` / `removeNode`，不引入新的持久化逻辑
- nodePayload 构造已加 undefined guard + 空 conversationIds 过滤

---

## 前端 UI：`src/renderer/src/components/Canvas.tsx`

### 菜单项
- disabled 条件：`phase !== 'idle' && phase !== 'done' && phase !== 'error'` — 防止重复触发
- 进度显示：analyzing/merging/done 三态对应不同文案

### 智能横幅
- localStorage `evo_merge_banner_dismissed` 门控，一次性展示
- `bottom-40` 定位（160px），完全浮在输入框（bottom-0 + pb-6）上方
- 仅对 memory 节点计数，排除 capability 节点

### 存储接口修复
- C3 proactive / FR-004 通知中 3 处旧 `POST /api/storage/read` → 正确 `GET /api/storage/:filename`

---

## 测试覆盖

### 单元测试（7 例，390/390 通过）

| 用例 | 覆盖点 |
|------|--------|
| 1 | 单节点 → 短路返回 |
| 2 | 高相似度建边 → 产生 cluster |
| 3 | 时间跨度守卫（61天/score 0.79）|
| 4 | Sanity check（A-C < 0.60）|
| 5 | 无 embeddings → reason 字段 |
| 6 | keepNode：更多 conversationIds |
| 7 | keepNode：tie-break firstDate |

### E2E 测试（3 例）
- Test 31：API 接口格式验证
- Test 32：UI 菜单可见性验证
- Test 33：端到端流程（含 embedding 可用性降级处理）

### TypeScript
- `npx tsc --noEmit` 零错误

---

## 结论

全部已知 bug 已修复，测试全绿。建议后续迭代（v0.2.80+）将 O(n³) 的 `nodes.find` 改为 Map 预索引，支持节点数 >500 的重度用户场景。


**版本**：0.2.74
**日期**：2026-03-09
**特性**：历史节点回溯合并 (Retroactive Node Consolidation)

---

## 总体评分

| 维度 | 评分 |
|------|------|
| 正确性 | ✅ 通过 |
| 安全性 | ✅ 无注入风险（SQLite 参数化查询，输入校验） |
| 性能 | ⚠️ O(n²) 两两比较，节点数 >200 时建议分批 |
| 可测试性 | ✅ 7 个单元测试 + 3 个 E2E 测试 |
| 向后兼容 | ✅ 纯只读计划接口，Store 初始状态为 idle |

---

## 后端：`src/server/routes/memory.ts`

### 新增路由：`POST /api/memory/rebuild-node-graph`

**设计亮点**：
- 纯 in-process 计算，无外部 API 调用，响应快且不消耗 embedding token
- 只返回计划（ClusterPlan[]），前端决策是否应用，符合 CQRS 原则
- Union-Find 路径压缩，时间复杂度接近线性

**潜在问题**：
1. **O(n²) 复杂度**：节点数 n 时两两比较为 `n*(n-1)/2` 次 cosineSim。n=100 时约 4950 次，n=500 时约 12.5 万次。对于当前用户规模（< 200 节点）可接受。
2. **nodes.find() 内层循环**：`nodes.find(n => n.id === nodeIds[i])` 在 O(n²) 外层中每次调用，整体变 O(n³)。建议后续用 `Map<id, node>` 优化。
3. **sanity check 严格性**：对 3 节点 cluster 做两两检查（3 次比较），边界情况下可能丢弃本该合并的高质量 2-pair。可接受，因宁可漏合并不可错合并。

**变量命名冲突修复**：
- 路由回调内 `clusters.reduce((sum, c) => ...)` 中 `c` 与外层 Hono context `c` 同名，已改为 `cl` 避免遮蔽。

---

## 前端 Store：`src/renderer/src/stores/canvasStore.ts`

### 新增状态：`nodeGraphRebuild`

**设计亮点**：
- 5 阶段状态机（idle → analyzing → merging → done/error）提供细粒度 UI 反馈
- 复用现有 `mergeIntoNode` / `removeNode`，不引入新的持久化逻辑

**注意事项**：
- `rebuildNodeGraph` 中使用 `get().nodes.find(...)` 在循环内部，但因 `mergeIntoNode` 会更新 store，每次迭代读取最新状态是正确行为
- 若 `mergeIntoNode` 或 `removeNode` 因网络失败抛出异常，外层 `catch` 可捕获并设置 error 状态

---

## 前端 UI：`src/renderer/src/components/Canvas.tsx`

### 菜单项

- disabled 条件：`phase !== 'idle' && phase !== 'done' && phase !== 'error'` — 正确，防止重复触发
- 进度显示：analyzing/merging/done 三态对应不同文案，UX 清晰

### 智能横幅

- localStorage key `evo_merge_banner_dismissed` 门控，一次性展示，不骚扰用户
- `nodes.filter(n => n.nodeType !== 'capability')` 过滤 capability 节点，避免误计数
- `noMergesYet` 检测：`every(n => (n.conversationIds?.length ?? 1) === 1)` 精确识别未合并状态

---

## 测试覆盖

### 单元测试（7 例）

| 用例 | 覆盖点 |
|------|--------|
| 1 | 单节点 → 短路返回 |
| 2 | 高相似度建边 → 产生 cluster |
| 3 | 时间跨度守卫（61天/score 0.79）|
| 4 | Sanity check（A-C < 0.60）|
| 5 | 无 embeddings → reason 字段 |
| 6 | keepNode：更多 conversationIds |
| 7 | keepNode：tie-break firstDate |

### E2E 测试（3 例）

- Test 31：API 接口格式验证
- Test 32：UI 菜单可见性验证
- Test 33：端到端流程（含 embedding 可用性降级处理）

---

## 结论

代码实现与设计文档高度吻合。无安全漏洞，向后兼容。建议后续迭代（v0.2.80+）将 O(n³) 的 `nodes.find` 改为 Map 预索引，以支持节点数 >500 的重度用户场景。
