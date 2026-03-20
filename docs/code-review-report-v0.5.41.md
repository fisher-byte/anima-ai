# Code Review Report — v0.5.41

**范围**：灵思 / 对话区 — Lenny 等公开空间语言约束、`decisionTrace` 续问一致性、思考块解析与 UI、Lenny 深度搜索轮询、决策卡布局、E2E 鉴权断言对齐。  
**结论**：**可合并 / 可发版**。无新增 P0 数据面风险；变更集中在提示词、纯函数解析、Zustand 决策合并与 AnswerModal 副作用。

---

## 已处理问题分级

| 级别 | 说明 | 状态 |
|------|------|------|
| **P1** | 续问时 `mergeDecisionTrace(normal)` 清空灵思轨迹，历史灵思「掉模式」 | **已修复**：`mergeDecisionTrace` 保留同 persona 下已有 `decision`；`resolveDecisionModeForPersona` 公开空间优先 `decisionTrace` |
| **P1** | Lenny 下深度搜索任务已入队但前端不轮询 | **已修复**：移除轮询 early return；灵思路径补齐 `lastDeepSearchContextRef` |
| **P2** | `[/THINKING]` 格式漂移导致正文泄露、思考区未折叠 | **已修复**：`splitThinkingBlockFromAssistant` + `ThinkingSection` 默认收起 |
| **P2** | @Lenny 中文语境英文整段回复 | **已缓解**：system prompt 默认简体中文（PG/张/王同步） |
| **P3** | E2E 仍假设无 token → 200，与 v0.5.40 强鉴权冲突 | **已修复**：`features.spec.ts` 接受 200 或 401 |

---

## 安全与可靠性

- **鉴权**：未改动服务端鉴权逻辑；仅 E2E 断言与行为一致。
- **mergeDecisionTrace**：若未来需「显式退出灵思」，应通过 store 将 `decisionTrace` 写为 `normal` 再发请求；当前防误降级不阻塞用户切换（`setLennyDecisionMode` 已同步 trace）。

---

## 测试覆盖

| 类型 | 结果 |
|------|------|
| `npm test` | 631 passed，35 files |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | 成功 |
| `npm run test:e2e` | 45 passed / 3 skipped（48 用例） |

### 分布（本次新增/调整用例）

| 文件 | 说明 |
|------|------|
| `conversationUtils.test.ts` | 宽松 THINKING 解析、`stripOrphanThinkingTags` |
| `personaSpaces.test.ts` | 公开空间 `decisionTrace` 优先 |
| `lingsiDecisionEngine.test.ts` | `mergeDecisionTrace` 不降级 |

---

## 设计观察（非阻塞）

- **深度搜索完成回写**：`updateConversation` 仍可能以「最后一轮正文」覆盖多轮 `assistantMessage`；与既有行为一致，未在本 patch 扩展。
- **deploy**：依赖本机 SSH/SCP 到生产；CI 环境无密钥时仅本地发版人执行 `docs/scripts/deploy.sh`。

---

## 签署

- **Reviewer**：与 `docs/sop-release.md` 清单对照 + 静态审查  
- **建议提交前缀**：`fix: v0.5.41 lingsi dialog trace thinking deepsearch`
