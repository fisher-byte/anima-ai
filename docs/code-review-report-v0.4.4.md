# Code Review Report — v0.4.4

**审查范围**：`src/server/routes/ai.ts`（`loadSessionMemory` / `saveSessionMemory` / `generateSessionSummary` / 层 3.5 注入 / 轮数触发守卫）、`src/shared/constants.ts`（`session_memory.json` 白名单）、`src/server/__tests__/server-ai.test.ts`（新增 10 个用例）

**结论**：发现 0 个 P0/P1，1 个 P2（可接受设计取舍），1 个 P3。**会话摘要核心逻辑正确，异步生成不阻塞响应，降级路径完备。**

---

## P0 — 崩溃 / 数据错误

**无。**

核心路径验证通过：
- `loadSessionMemory` 在 JSON 解析失败时返回 `null`（静默 catch），不影响主流程
- `saveSessionMemory` 写入失败静默 catch，不阻塞响应
- `generateSessionSummary` 整体包在 try/catch 中，任何 embedding API 失败均静默
- `setImmediate` 包裹 generateSessionSummary 确保异步执行，不阻塞 SSE 流
- 50 条上限清理逻辑：按 `updated_at` 排序后淘汰最旧，不会数组越界（单元测试覆盖）

---

## P1 — 逻辑错误 / 功能失效

**无。**

- 层 3.5 注入在 `!isOnboarding` 守卫下，onboarding 模式完全隔离
- 注入条件：`session?.summary && messages.length >= 10`，短对话不注入（单元测试覆盖）
- 触发条件守卫：`!existing`（已有摘要不重复生成），`messages.filter(role=user).length >= 10`（计用户轮而非总消息数，更准确）

---

## P2 — 边界情况 / 功能缺失

**P2-1：会话摘要每 5 轮更新（incremental）尚未实现**

**文件**：`src/server/routes/ai.ts`

**观察**：当前实现只在"无摘要时"触发一次生成（`if (!existing)`），`memory-strategy.md` 中规划了"每 5 轮增量更新"，但当前版本尚未实现。

**评估**：可接受设计取舍。第一版先做"首次生成"，后续版本加增量更新。当前对话超过 10 轮后会有摘要，只是不再随对话增长而更新。**不阻塞发版**。

---

## P3 — 代码质量 / 文档

**P3-1：`generateSessionSummary` 使用与主对话相同的 model**

**文件**：`src/server/routes/ai.ts:generateSessionSummary`

**观察**：摘要生成使用 `model` 参数（可能是 kimi-k2.5 或 fast model），而实际上摘要任务只需要轻量模型（FAST_MODEL 即可）。当对话使用更强大/更贵的模型时，摘要调用会消耗不必要的 token。

**评估**：P3，功能正确，仅涉及成本优化。后续可改为显式传入 `FAST_MODEL`。

---

## 安全审查

| 检查项 | 结果 |
|--------|------|
| `session_memory.json` 文件名白名单 | ✅ 已加入 `ALLOWED_FILENAMES` |
| `storage` 表写入 SQL 注入防护 | ✅ 参数化 `?` 占位符 |
| 50 条上限防止 JSON 体积无限增长 | ✅ `saveSessionMemory` 中清理逻辑 |
| onboarding 模式下不生成/不注入 | ✅ 双重守卫（层 3.5 + 触发条件） |
| `setImmediate` 内 db 引用安全 | ✅ db 是模块级 singleton |

---

## 测试覆盖评估

| 覆盖面 | 状态 |
|--------|------|
| 轮数 < 10 不触发 | ✅ |
| 轮数 = 10 触发 | ✅ |
| 轮数 > 10 触发 | ✅ |
| 已有摘要不重复触发 | ✅ |
| onboarding 守卫 | ✅ |
| 无 convId 守卫 | ✅ |
| 有摘要+轮数注入 | ✅ |
| 轮数不足不注入 | ✅ |
| 无摘要不注入 | ✅ |
| 50 条上限清理 | ✅ |
| `loadSessionMemory` DB 集成 | ❌ 需真实 SQLite，低优先级 |
| `generateSessionSummary` E2E | ❌ 需真实 AI API |

---

## 总结

v0.4.4 的会话摘要系统实现正确：首次生成触发准确，异步非阻塞，降级完备，安全防护到位。P2-1 增量更新是后续迭代点，不影响当前版本功能完整性。

**vitest 512/512 | tsc 0 errors | 无 P0/P1**
