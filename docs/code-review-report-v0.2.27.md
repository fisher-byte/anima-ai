# Code Review Report — v0.2.27

**日期**：2026-03-05
**版本**：0.2.27
**范围**：五项前端体验修复（authFetch 基础设施、API Key 校验、InputBox badge、连线残留、拖拽实时更新）
**变更文件**：8 个

---

## 审查结果摘要

| 分类 | 数量 |
|------|------|
| 严重 Bug（修复）| 2 |
| 中等 Bug（修复）| 3 |
| 潜在风险（已接受）| 0 |
| 改进建议（非阻塞）| 0 |

TypeScript 编译：`tsc --noEmit` **零错误**
单元测试：210 tests **全部通过**

---

## 逐文件审查

### `src/renderer/src/services/storageService.ts`
- **新增** `getAuthToken()` 导出函数：从 `_webStorage.getToken()` 读取，Electron 模式返回 `null`
- 正确：无副作用，幂等，与现有 `setAuthToken()` 对称
- 无风险

### `src/renderer/src/services/ai.ts`
- **修复**：`streamAI` 在 fetch 前读取 token 并注入 `Authorization` 头
- 正确：token 为 null 时不添加头，Electron/无鉴权模式不受影响
- 无风险

### `src/renderer/src/stores/canvasStore.ts`
**变更 1 — authFetch 辅助函数**
- 模块级函数，不注入 store，避免序列化问题
- `Headers` 构造支持继承调用方自定义 headers，Content-Type 设为默认 JSON，可被覆盖
- 6 处替换均去掉了冗余的 `headers: { 'Content-Type': 'application/json' }`，与 authFetch 内部一致
- **潜在注意**：`/api/memory/classify` 的 `AbortSignal.timeout(5000)` 保留在 init 中，authFetch 正确透传 — ✓

**变更 2 — startConversation 去掉第 5 参数**
- 从 `(userMessage, images?, files?, parentId?, appliedMemories?)` 简化为 `(userMessage, images?, files?, parentId?)`
- 内部已有 `getRelevantMemories` 调用结果直接赋给 `appliedMemories`，语义正确
- 接口定义与实现已同步

**变更 3 — closeModal 清 highlight**
- 新增 `highlightedCategory: null, highlightedNodeIds: []` 到 set()，清理彻底
- 无副作用

**变更 4 — updateEdges 距离约束**
- `Math.hypot` 计算两节点欧几里得距离，> 600px 跳过星型连线
- 600px 是合理阈值（Category Island 布局节点间距约 240px，2~3 个节点间距内才连）

**变更 5 — updateNodePositionInMemory**
- 仅 `set({ nodes: ... })`，不触发 storageService.write，不调 updateEdges
- 每次仍生成新 nodes 数组（不可避免），但通过 rAF 节流控制频率（≤ 60 次/秒）
- 无内存泄漏风险

### `src/renderer/src/components/NodeCard.tsx`
- `rafRef` 用于取消未执行帧，mouseUp 时 `cancelAnimationFrame` 清理
- handleGlobalMouseMove deps 新增 `updateNodePositionInMemory`（正确）
- `handleGlobalMouseUp` 逻辑顺序：先 cancelAnimationFrame → 再 updateNodePosition，确保磁盘写入的坐标是最终值 ✓
- **注意**：`CapabilityNodeCard` 未添加 rAF 支持，连线实时性略差，但 capability 节点不参与 updateEdges 连线逻辑（`n.nodeType === 'capability'` 被跳过），故无问题

### `src/renderer/src/components/InputBox.tsx`
- **核心改动**：记忆检索从"提交时"移到"输入时（handleChange 600ms 防抖）"
- 600ms 防抖合理（避免每次按键请求，但用户停止输入后响应及时）
- `debounceRef` 在卸载时清理（cleanup effect）
- `useEffect([isModalOpen])` 监听 modal 关闭归零 badge，解决重挂载后残留
- handleSubmit 中 `clearTimeout(debounceRef.current)` 确保提交时不会有延迟回调写入 matchCount
- handleSubmit 提交后显式 `setHighlight(null, [])` 清空高亮 ✓
- deps 数组已更新（`handleSubmit` 不再依赖 `detectIntent/getRelevantMemories`，`handleChange` 正确依赖它们）

### `src/renderer/src/components/SettingsModal.tsx`
- `keyError` 初始为 `''`，`handleSave` 入口清空，避免旧错误残留
- 验证为"保存后"异步执行，不阻断保存，符合产品设计（key 已存储，用户可看到警告后再更新）
- 8s AbortSignal.timeout 合理（后端向 upstream /models 有 6s 超时，前端预留 2s 余量）
- `keyError` 渲染在 API Key 输入框下方，不会遮挡其他表单元素

### `src/server/routes/config.ts`
- `POST /api/config/verify-key` 不存储任何数据，仅做代理验证，无副作用
- baseUrl 末尾 `/` 被 `replace(/\/$/, '')` 去掉，避免 double-slash
- AbortSignal.timeout(6000) 防止 upstream 超时挂起
- `resp.ok` 涵盖所有 2xx 状态，401/403 返回 `valid: false` ✓
- catch 返回 `{ valid: false, reason: 'network' }` 而非抛错 ✓

---

## 架构一致性

| 检查项 | 结论 |
|--------|------|
| 双模式兼容（Web/Electron）| authFetch 在 Electron 中 token 为 null，不添加 Authorization 头，行为与原来一致 ✓ |
| 类型安全 | CanvasState 接口新增 `updateNodePositionInMemory` 签名，与实现匹配 ✓ |
| 无循环依赖 | storageService ← ai.ts / canvasStore，无循环 ✓ |
| 向后兼容 | startConversation 减少一个可选参数，InputBox 唯一调用方已更新 ✓ |

---

## 结论

**通过**。本次 8 个文件修复了 5 个独立的前端体验 bug，均有清晰的根因分析和针对性修复。改动最小化，无副作用，测试全绿。
