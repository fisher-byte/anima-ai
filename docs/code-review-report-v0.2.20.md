# Code Review Report — v0.2.20

**日期**: 2026-03-04
**版本**: v0.2.20（对话历史持久化专项）
**审查范围**: src/server/db.ts、src/server/routes/storage.ts、src/renderer/src/services/storageService.ts、src/renderer/src/stores/canvasStore.ts、src/renderer/src/hooks/useAI.ts、src/renderer/src/components/AnswerModal.tsx

---

## 总体评价

本版本解决了多轮对话上下文跨会话丢失的核心问题：之前 `conversationHistory: AIMessage[]` 仅存于 Zustand 内存，刷新页面后所有多轮上下文丢失，AI 无法"记得"本次会话以外的对话脉络。v0.2.20 实现了完整的服务端持久化闭环。

---

## ✅ CRITICAL 修复

### 对话历史持久化（Conversation History Persistence）

**问题**：`conversationHistory: AIMessage[]` 仅存于 Zustand 内存，刷新页面后丢失，导致：
- 打开旧对话时无法延续多轮上下文
- AI 会把续聊当全新对话处理，失去记忆连续性

**解决方案**：参照 ChatGPT、Claude.ai、Open WebUI 的最佳实践，实现服务端 per-conversation 历史存储：

1. **后端 Schema**（`db.ts`）：
```sql
CREATE TABLE conversation_history (
  conversation_id TEXT PRIMARY KEY,
  messages        TEXT NOT NULL DEFAULT '[]',
  updated_at      TEXT NOT NULL
);
```

2. **后端 API**（`routes/storage.ts`）：
   - `GET /api/storage/history/:conversationId` → 返回 `{ messages: AIMessage[] }`
   - `PUT /api/storage/history/:conversationId` → 保存，自动截断至 100 条消息
   - `DELETE /api/storage/history/:conversationId` → 节点删除时清理

3. **前端 HistoryService**（`services/storageService.ts`）：
   - 新增 `WebHistoryService` 类，封装 GET/PUT/DELETE，自动携带 Bearer token
   - `NoopHistoryService` 用于 Electron 模式（本地无需跨页面恢复）
   - 导出 `historyService` 单例

4. **Store 集成**（`canvasStore.ts`）：
   - `openModal`/`openModalById`：打开对话时异步加载历史，不阻塞 UI
   - `closeModal`：关闭时持久化当前历史（fire-and-forget）
   - `removeNode`：删除节点时同步删除对应历史

5. **Hook 集成**（`useAI.ts`）：
   - `sendMessage` 新增可选参数 `conversationId`
   - 每轮生成完成后立即持久化（双重保障：生成完成 + 关闭弹窗各保存一次）

6. **AnswerModal 集成**（`AnswerModal.tsx`）：
   - replay 模式优先使用服务器加载的历史，而非从 turns 重建
   - 所有 `sendMessage` 调用传入 `conversationId`

**技术亮点**：
- 100 条消息上限防止单条历史无限增长
- 服务器历史优先于本地重建（数据更精确）
- 节点删除时级联清理历史，无孤立数据

---

## 测试覆盖

### 新增测试（`server.test.ts`）

| 用例 | 覆盖点 |
|------|--------|
| GET 不存在的对话返回空数组 | 边界：未初始化时不报错 |
| PUT 保存 + GET 读取 | 核心 CRUD 闭环 |
| PUT 覆盖写入 | 幂等性 |
| PUT 非数组 messages 返回 400 | 输入校验 |
| PUT 150 条消息截断为 100 | 防增长策略 |
| DELETE 删除后 GET 返回空数组 | 级联清理 |
| 不同对话历史相互隔离 | 数据隔离性 |

**测试数量**: 66 → 73 (+7)，全部通过

---

## ⚠️ 已知待改善项（不阻塞发布）

| 优先级 | 位置 | 问题 | 建议 |
|--------|------|------|------|
| LOW | `AnswerModal.tsx replay` | 服务器历史与本地重建历史存在竞态（fetch 异步，useEffect 同步） | 考虑在 openModalById 中 await 历史加载后再 set currentConversation |
| LOW | `historyService` | Electron 模式不持久化，只持久化 Web 模式 | 如需 Electron 也持久化可通过 IPC 扩展 |
| LOW | `conversation_history` | 未清理超过 N 天未访问的历史 | 可加 TTL 清理任务 |

---

## 发布状态

**✅ v0.2.20 可以发布** — 对话历史持久化完整实现，7 项新测试全绿，208 用例全部通过
