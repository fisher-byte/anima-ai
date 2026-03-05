# Code Review Report — v0.2.28

**日期**：2026-03-05
**版本**：0.2.28
**范围**：全站 auth header 全量修复（记忆 tab 空白根因修复）
**变更文件**：4 个

---

## 审查结果摘要

| 分类 | 数量 |
|------|------|
| 严重 Bug（修复）| 1（15 处遗漏 auth header） |
| 中等 Bug（修复）| 0 |
| 潜在风险（已接受）| 0 |
| 改进建议（非阻塞）| 0 |

TypeScript 编译：`tsc --noEmit` **零错误**
单元测试：210 tests **全部通过**

---

## 根因分析

v0.2.27 修复了 `canvasStore.ts` 和 `ai.ts` 中的 auth header 缺失问题，但**三个组件文件**的所有 `fetch('/api/...')` 调用均未被覆盖：

| 文件 | 遗漏数量 | 影响 |
|------|----------|------|
| `ConversationSidebar.tsx` | 8 处 | 记忆 tab 全空（profile + facts + 编辑/删除） |
| `AnswerModal.tsx` | 5 处 | 对话内偏好提取失败、文件上传失败、导出 401 |
| `canvasStore.ts` L752 | 1 处 | 节点删除时向量索引残留 |
| `InputBox.tsx` L220 | 1 处 | 附件上传 401 失败 |

**合计**：15 处裸 `fetch` 调用在 `AUTH_DISABLED=false` 模式下全部返回 401，异常被 `.catch(() => {})` 静默吞掉，导致用户界面静默显示空数据。

---

## 逐文件审查

### `src/renderer/src/components/ConversationSidebar.tsx`

**修复方式**：导入 `getAuthToken`，模块内新增局部 `authFetch` helper（与 canvasStore 同一模式），替换 8 处裸 fetch：

| 位置 | API 路径 | 操作 |
|------|----------|------|
| `useEffect([isOpen])` | `GET /api/memory/profile` | 加载用户画像 |
| `fetchMemoryFacts` | `GET /api/memory/facts` | 加载记忆事实列表 |
| `handleDeleteFact` | `DELETE /api/memory/facts/:id` | 删除记忆条目 |
| `handleSaveFact` | `PUT /api/memory/facts/:id` | 编辑记忆条目 |
| `handleSaveProfile` (×2) | `PUT /api/memory/profile` + `GET /api/memory/profile` | 保存后重新拉取 |
| 清空按钮 | `DELETE /api/memory/profile` | 清空用户画像 |

- `authFetch` 实现：`Content-Type: application/json` 为默认值（`FormData` 时不设），token 存在时注入 `Authorization` 头
- 无副作用，与 v0.2.27 的 `canvasStore.authFetch` 实现完全一致

### `src/renderer/src/components/AnswerModal.tsx`

**修复方式**：导入 `getAuthToken`，模块内新增局部 `authFetch` helper，替换 5 处裸 fetch：

| 位置 | API 路径 | 操作 |
|------|----------|------|
| `handleFiles` | `POST /api/storage/file` | 对话内文件上传（FormData） |
| `appendConversation` 末尾 | `POST /api/memory/queue` | 偏好提取入队 |
| onboarding phase2 | `POST /api/memory/queue` | 进化基因提取入队 |
| onboarding phase0 | `POST /api/memory/queue` | 用户画像提取入队 |
| `handleExportAll` | `GET /api/storage/export` | 全量数据导出 |

- 三处 `fetch('/api/memory/queue', { headers: { 'Content-Type': ... } })` 替换为 `authFetch`，Content-Type 由 helper 统一注入，原有 `headers` 参数移除（避免重复）— 逻辑等价
- `FormData` 上传：`authFetch` 的 Content-Type 跳过逻辑（`!(init?.body instanceof FormData)`）确保不覆盖 multipart boundary

### `src/renderer/src/stores/canvasStore.ts`

- L752：`fetch(\`/api/memory/index/${nodeToRemove.conversationId}\`, { method: 'DELETE' })` → `authFetch(...)`
- 此处为 fire-and-forget，authFetch 不改变错误处理语义

### `src/renderer/src/components/InputBox.tsx`

- 导入 `getAuthToken`
- 文件上传：手动构造 `Headers`（因为是 FormData，不用 authFetch helper）——`token` 存在时注入 `Authorization` 头，不设 `Content-Type`（由浏览器自动添加 multipart boundary）
- 与 AnswerModal 的 FormData 处理方式一致

---

## 架构一致性

| 检查项 | 结论 |
|--------|------|
| authFetch 复用模式 | 三处组件各自定义局部 `authFetch`，与 canvasStore 模块级 `authFetch` 实现完全一致 ✓ |
| FormData 不污染 Content-Type | 所有 authFetch 实现均判断 `FormData` 跳过 Content-Type 设置 ✓ |
| Electron 兼容 | `getAuthToken()` 在 Electron 模式返回 `null`，不添加头，行为与原来一致 ✓ |
| 双重修复 | 此前 v0.2.27 只修了 canvasStore 层；本次覆盖了 UI 组件层，全站 fetch 无遗漏 ✓ |

---

## 结论

**通过**。本次修复了 v0.2.27 遗漏的 15 处 auth header 缺失问题，消除了记忆 tab 长期显示空白的根因。修改最小化，均为机械性替换，无逻辑变更，无新增风险。
