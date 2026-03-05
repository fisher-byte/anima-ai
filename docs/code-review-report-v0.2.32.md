# Anima 代码审查报告 v0.2.32

**审查日期**: 2026-03-06
**审查范围**: v0.2.32 新增/改动文件（5 个）
**审查人**: Claude Code Internal

---

## 审查摘要

**总体评估**: ✅ **APPROVE**

本次变更修复了老用户数据迁移和新手引导误触发两个核心 bug，代码质量良好，逻辑清晰，无 P0/P1 级问题。E2E 测试覆盖完整，216 个单元测试 + 10 个 E2E 全部通过。

---

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/server/db.ts` | 修改 | 新增 `migrateFromDefault()`，老数据自动迁移 |
| `src/renderer/src/App.tsx` | 修改 | 自动登录时先设 onboarding 标记再 setAuthed |
| `src/renderer/src/components/LoginPage.tsx` | 修改 | 手动登录时先设 onboarding 标记再 onLogin |
| `src/renderer/src/components/OnboardingGuide.tsx` | 修改 | 新增兜底检测：有节点则跳过引导 |
| `.env` | 修改 | 新增 `ACCESS_TOKEN` 单数形式供 E2E 使用 |

---

## 详细发现

### P0 - Critical（无）

### P1 - High（无）

### P2 - Medium（1 项，已知边界案例，不影响生产）

#### 1. `migrateFromDefault` 不迁移 `conversation_history` 和 `uploaded_files`

**文件**: `src/server/db.ts:158-224`

**说明**: 迁移只覆盖了 `storage` / `config` / `user_profile` / `memory_facts` 四张表，`conversation_history`（多轮上下文）和 `uploaded_files`（文件附件）未迁移。

**评估**: 节点数据（`storage.nodes.json`）和对话记录（`storage.conversations.jsonl`）通过 `storage` 表迁移，核心功能不受影响。`conversation_history` 是对话内的多轮 AI 消息上下文，缺失不影响历史节点展示，只影响续聊时的上下文（老用户重新对话时会从头开始）。`uploaded_files` 迁移代价较大（含二进制 BLOB），当前不迁移合理。

**建议**: 可在 changelog/troubleshooting 文档中注明此已知限制，便于用户理解。

### P3 - Low（1 项）

#### 1. `ACCESS_TOKEN` 和 `ACCESS_TOKENS` 同时存在于 `.env`，语义略有重叠

**文件**: `.env`

**说明**: `ACCESS_TOKEN` 是 E2E 专用变量（仅被 `playwright.config.ts` 读取），`ACCESS_TOKENS` 是服务端多 token 配置。两者含义不同但命名相似，后续维护者可能混淆。

**建议**: 在 `.env` 中加注释说明两者用途差异。

---

## 安全审查

| 检查项 | 结果 |
|--------|------|
| `migrateFromDefault` 是否存在路径穿越 | ✅ 安全：`defaultDbPath` 完全由 `DATA_DIR` 常量拼接，无用户输入 |
| 迁移操作是否幂等 | ✅ 安全：全部使用 `INSERT OR IGNORE`，重复执行不会覆盖已有数据 |
| `readonly` 模式打开 `_default` 库 | ✅ 正确：`new Database(defaultDbPath, { readonly: true })` |
| 迁移失败时是否影响目标库 | ✅ 安全：`migrateFromDefault` 内异常被 catch，仅打印错误，不影响 `getDb` 返回 |

---

## 性能评估

- `migrateFromDefault` 只在 `isNewDb && userId` 时执行（首次建库），后续调用完全不走迁移路径
- 读取 `_default` 库用 `readonly` 模式，SQLite 不加写锁，性能无影响
- 迁移行数通常 < 1000，同步执行对启动时间影响可忽略

---

## 测试覆盖

| 测试类型 | 数量 | 结果 |
|---------|------|------|
| 单元测试（vitest） | 216 | ✅ 全部通过 |
| E2E 测试（playwright） | 10 | ✅ 全部通过（修复前 6 个因无 auth header 失败）|

**结论**: 本次变更可以合并并部署。
