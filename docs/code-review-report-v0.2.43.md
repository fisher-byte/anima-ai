# Anima 代码审查报告 v0.2.43

**审查日期**: 2026-03-06
**审查范围**: v0.2.43 新增/改动文件（5 个）
**审查人**: Claude Code Internal

---

## 审查摘要

**总体评估**: ✅ **APPROVE**

本次变更修复了 agentWorker 多租户架构中的核心 bug：后台任务（记忆提取、画像积累、文件向量化）在多用户场景下全部静默操作错误数据库，本次修复后每个用户的任务在其专属数据库上执行。TypeScript 零编译错误，236 个单元/集成测试全部通过。

---

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/server/agentWorker.ts` | 重构 | 所有工作函数接收 `db` 参数；`tick()` 遍历所有用户 db；`enqueueTask` 新增必传 `db` 参数 |
| `src/server/db.ts` | 新增 | 导出 `getAllUserDbs()`，扫描 data/ 目录下所有用户子目录 |
| `src/server/routes/memory.ts` | 修改 | `/queue` 路由传入 `userDb(c)` 给 `enqueueTask` |
| `src/server/routes/storage.ts` | 修改 | 文件上传后的 `embed_file` 入队使用正确的用户 db |
| `src/server/__tests__/server.test.ts` | 新增 | 补充 4 个 agentWorker 多租户集成测试 |

---

## 问题详情

### P0 - Critical（已修复）

#### 1. agentWorker 在多租户模式下操作错误的数据库

**文件**: `src/server/agentWorker.ts:13`（修复前）

**问题描述**:
```typescript
// 修复前
import { db } from './db'  // 全局默认数据库

// 所有函数都用这个全局 db
async function consolidateFacts(): Promise<void> {
  const rows = db.prepare('SELECT id, fact FROM memory_facts ...').all()
  // ...
}
```

在多租户模式下（`ACCESS_TOKENS` 配置了多个 token），每个用户数据存储在 `data/{userId}/anima.db`，但 agentWorker 的所有操作（记忆提取、画像积累、文件 embedding、记忆整理）全部跑在第一个用户的默认数据库上，其他用户的这些功能完全静默失效。

**修复方案**:
- `db.ts` 新增 `getAllUserDbs()`，扫描 `data/` 目录下所有 12 位 hex userId 子目录
- agentWorker 所有工作函数改为接收 `db: InstanceType<typeof Database>` 参数
- `tick()` 改为遍历 `getAllUserDbs()` 返回的所有用户数据库
- `enqueueTask(db, type, payload)` 新增必传 `db` 参数，确保任务写入正确的用户库
- `routes/memory.ts` 的 `/queue` 端点和 `routes/storage.ts` 的文件上传入队均传入 `userDb(c)`

**影响范围**: 多用户部署场景（单用户 self-hosted 不受影响，因为只有一个用户目录）

**兼容性**: 对单用户场景完全透明，`getAllUserDbs()` 只扫到一个目录时行为与之前一致。

---

### P1 - High（无）

### P2 - Medium（1 项，已知限制，不影响功能正确性）

#### 1. `embeddingDisabledKeys` 缓存在 agentWorker 和 memory.ts 各自独立

**文件**: `src/server/agentWorker.ts:344`，`src/server/routes/memory.ts:44`

**说明**: 两个模块各自维护了一个 `Set<string>` 来缓存已确认不支持 embedding 的 apiKey。如果 embedding API 返回 403，两个模块需要各自收到一次才会缓存。

**评估**: 第一次 403 后单个请求等待 < 1s，之后两个模块各自缓存，实际影响极小。重构为共享模块需要引入新的依赖层，当前代价不值得。

**建议**: 中期可将 `embeddingDisabledKeys` 提取到 `db.ts` 或独立的共享模块。

### P3 - Low（无）

---

## 安全审查

| 检查项 | 结果 |
|--------|------|
| `getAllUserDbs` 目录扫描是否存在路径穿越 | ✅ 安全：正则 `/^[0-9a-f]{12}$/` 严格过滤目录名，只匹配 12 位 hex |
| 用户 db 是否可能互相访问数据 | ✅ 安全：每个 `processTask` 调用只操作传入的那个 `db` 实例 |
| agentWorker 是否会读取其他用户的 tasks | ✅ 安全：`tick()` 对每个 db 独立查询，不跨库 JOIN |
| `enqueueTask` 签名变更是否有遗漏调用点 | ✅ 已全量检查：`routes/memory.ts` 和 `routes/storage.ts` 都已更新；TypeScript 编译无报错 |

---

## 性能评估

- `getAllUserDbs()` 在 tick() 时调用，每 30s 一次，执行 fs.readdirSync，用户数 < 1000 时开销可忽略
- 每个用户 db 的 task 查询带 `LIMIT 5`，不存在全表扫描风险
- 单用户场景下性能与修复前完全一致

---

## 测试覆盖

| 测试类型 | 数量 | 结果 |
|---------|------|------|
| 单元/集成测试（vitest） | 236 | ✅ 全部通过（新增 4 个多租户测试） |
| TypeScript 编译检查 | - | ✅ 零错误 |

**新增测试说明**（`server.test.ts` 末尾 `AgentWorker multi-tenant enqueueTask` 描述块）：
1. `写入正确的 db，不污染其他用户的 db` — 验证两个独立 db 互不干扰
2. `payload 以 JSON 字符串正确存储` — 验证 payload 序列化正确
3. `多次 enqueueTask 任务累积在同一 db 中` — 验证批量入队顺序正确
4. `任务初始状态为 pending` — 验证初始状态字段

**结论**: 本次变更可以合并并部署到生产环境。
