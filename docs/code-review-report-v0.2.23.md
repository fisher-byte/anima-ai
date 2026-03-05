# Code Review Report — v0.2.23

**日期**：2026-03-05
**版本**：0.2.23
**范围**：MVP 上线准备，8 个文件变更

---

## 审查结果摘要

| 分类 | 数量 |
|------|------|
| 严重 Bug | 0 |
| 修复的 Bug（本次引入→修复）| 1 |
| 潜在风险（已接受）| 2 |
| 改进建议（非阻塞）| 2 |

TypeScript 编译：`tsc --noEmit` **零错误**
单元测试：208 tests **全部通过**

---

## 文件级审查

### `src/renderer/src/services/ai.ts`

**变更**：SSE 解析从 `chunk.split('\n')` 改为 `sseBuffer + \n\n` 边界分割

**评价**：✅ 正确。与后端实现完全对称，修复了跨 TCP chunk 的 JSON 截断问题。`sseBuffer` 在函数闭包内，生命周期清晰，无内存泄漏风险。

---

### `src/renderer/src/components/InputBox.tsx`

**变更**：
1. 删除 `useEffect` 实时检索
2. 文件提交前上传

**评价**：✅ 逻辑正确。

**已修复**：`_rawFile` 原用 `as any` 绕过类型检查 → 已补充到 `FileAttachment` 接口，去掉了所有 `as any`。

**潜在风险（已接受）**：`handleSubmit` 变为 `async`，用户如果快速双击发送按钮理论上可以触发两次提交。当前有 `isProcessing` 状态守卫，但 `isProcessing` 初始值是 `false`，两次点击如果在同一 tick 内都能通过检查。后续可考虑加 `useRef` 做幂等锁，MVP 阶段可接受。

---

### `src/renderer/src/components/AnswerModal.tsx`

**变更**：`handleFiles` 追加 `convId` 到 FormData，`useCallback` deps 加入 `currentConversation`

**评价**：✅ 正确。`currentConversation` 在文件上传时可能为 null（首次对话前），此时 `convId` 为 undefined，不追加 FormData 字段，后端兼容（字段可选），无崩溃风险。

---

### `src/renderer/src/App.tsx`

**变更**：加入 token 鉴权探活逻辑，未通过时显示 LoginPage

**评价**：✅ 逻辑正确。

**潜在风险（已接受）**：探活使用 `/api/storage/nodes` 端点，若此端点后续被删除或改路径，探活会静默失败并放行。建议后续增加专用 `/api/health` 端点。MVP 阶段可接受。

---

### `src/renderer/src/components/LoginPage.tsx`（新建）

**评价**：✅ 实现正确。探活 + token 验证逻辑健壮（401/403 拒绝，其他错误放行）。`TOKEN_KEY` 作为具名导出，避免魔法字符串散落。

**改进建议（非阻塞）**：token 在 localStorage 中明文存储，生产环境建议考虑加密或使用 HttpOnly Cookie，MVP 阶段可接受。

---

### `src/server/routes/ai.ts`（新增 `/summarize`）

**评价**：✅ 实现安全。`AbortSignal.timeout(8000)` 防止挂起；失败返回 `{ title: null }` 而非抛出，前端降级逻辑健全。

**改进建议（非阻塞）**：prompt 对 `userMessage` 截断到 200 字、`assistantMessage` 截断到 300 字，中文场景下可能略短。后续可改为按 token 数控制。

---

### `src/renderer/src/stores/canvasStore.ts`

**变更**：
1. `addNode` 追加异步摘要请求
2. `updateEdges` 添加 label 字段

**评价**：✅ 正确。摘要请求完全异步（`.catch(() => {})` 兜底），不影响主流程。`updateEdges` label 填充逻辑简单清晰。

---

### `src/renderer/src/components/Edge.tsx`

**变更**：加入 `label` prop + hover tooltip（SVG `<g>` + 透明 hitbox + tooltip 矩形）

**评价**：✅ 实现正确。透明 hitbox（strokeWidth=12）保证 hover 灵敏度；tooltip 坐标基于贝塞尔中点近似（t=0.5），计算准确。`useState` 仅在有 label 时渲染 hitbox，无 label 连线性能不受影响。

---

## 总结

本次变更质量良好，无阻塞性问题。唯一修复点（`_rawFile` 类型）已在审查中同步修正。208 个单元测试全部通过，TypeScript 零错误。可进行 E2E 测试和部署。
