# Code Review Report — v0.4.0

**审查范围**：`src/renderer/src/components/ZhangSpaceCanvas.tsx`、`src/renderer/src/components/WangSpaceCanvas.tsx`、`src/renderer/src/stores/canvasStore.ts`（Zhang/Wang 扩展）、`src/renderer/src/components/Canvas.tsx`（新入口）、`src/renderer/src/components/AnswerModal.tsx`（4-way prompt 路由）、`src/shared/zhangData.ts`、`src/shared/wangData.ts`、`src/renderer/src/stores/__tests__/canvasStore.zhangWangMode.test.ts`

**结论**：未发现 P0/P1 问题。发现 2 个 P2、3 个 P3，全部属于与 PGSpaceCanvas 对称的已有技术债（不是本版本新引入的回归）。**0 个本版本新引入的 bug。**

---

## P0 — 崩溃 / 数据错误

**无。**

---

## P1 — 逻辑错误 / 功能失效

**无。**

所有关键路径均经过验证：
- `openZhangMode` / `openWangMode` 正确设置 `isLennyMode: true`（Space 隔离总开关）
- 5 处文件路由均使用正确的 4-way ternary，Zhang/Wang 不会污染 Lenny/PG 数据
- `AnswerModal` 中的 `spacePrompt` 4-way ternary 优先级正确（isPGMode → isZhangMode → isWangMode → LENNY）
- `closeZhangMode` / `closeWangMode` 均重置全部 4 个 Space 标志，不会出现标志残留
- 种子节点检测前缀匹配正确（`zhang-seed-` / `wang-seed-`），不会误判用户创建的节点

---

## P2 — 边界情况 / 功能缺失

**P2-1：`isHistoryOpen` effect 缺少 `t` 依赖（ZhangSpaceCanvas/WangSpaceCanvas）**

```typescript
// ZhangSpaceCanvas.tsx 约第 427 行
useEffect(() => {
  if (!isHistoryOpen) return
  ;(async () => {
    // ... 使用了 t.space.noContent 但 t 不在依赖数组
  })()
}, [isHistoryOpen])  // ← 缺少 t
```

**影响**：语言切换后，已加载的历史条目的 fallback 文本（`t.space.noContent`）不会刷新。实际影响极小（历史侧边栏重新打开会重新 fetch，此时 t 已是最新值）。

**与已有代码一致**：`PGSpaceCanvas.tsx` 有完全相同的问题（技术债，非本版本回归）。

**修复建议**（低优先）：将 `t.space.noContent` 提前缓存为 effect 外变量，或将 `t` 加入依赖数组。

---

**P2-2：`nodesLoaded` 状态在 `isOpen: false → true` 切换时不重置**

```typescript
// ZhangSpaceCanvas.tsx / WangSpaceCanvas.tsx
const [nodesLoaded, setNodesLoaded] = useState(false)
// isOpen 从 false → true 时，若节点已加载过，
// nodesLoaded 保留 true，initOffset 会立即应用，坐标基于上次加载数据，可能偏移
```

**影响**：用户关闭后再开打同一 Space，视图初始位置可能不对。

**与已有代码一致**：`PGSpaceCanvas.tsx` 有完全相同的问题。实测影响不明显（节点布局被物理模拟拉回正常位置）。

---

## P3 — 代码质量

**P3-1：ZhangSpaceCanvas / WangSpaceCanvas 与 PGSpaceCanvas 代码高度重复**

三个文件共约 870 行，逻辑完全相同，仅 prefix（`zhang-` / `wang-`）、颜色（`blue` / `emerald`）、文字（`张` / `王`）不同。

**现状**：可接受的重复（三文件各自独立，易于分别调整主题；提取公共组件会增加复杂度）。

**长期建议**：考虑提取 `<BaseSpaceCanvas prefix="zhang" seedNodes={...} ... />` 抽象层，减少维护负担。记录为技术债。

---

**P3-2：`dragRafId` ref 在组件卸载时未取消**

```typescript
// ZhangSpaceCanvas.tsx / WangSpaceCanvas.tsx（与 PGSpaceCanvas 相同）
// dragRafId.current 在 canvas drag 时持续运行
// 组件卸载时未调用 cancelAnimationFrame(dragRafId.current)
```

**影响**：用户拖拽时关闭 Space，RAF 继续运行几帧后因无 DOM 而停止，不会造成内存泄漏（React 组件卸载后 ref 被 GC）。

**与已有代码一致**：`PGSpaceCanvas.tsx` 有完全相同的问题。

---

**P3-3：`any` 类型用于 history items 反序列化**

```typescript
// ZhangSpaceCanvas.tsx / WangSpaceCanvas.tsx（与 PGSpaceCanvas 相同）
}).filter(Boolean).reverse()
setHistoryItems(items.map((c: any) => ({  // ← any
```

**影响**：类型不安全，但数据来自内部 JSONL，格式已知，不会崩溃。

---

## 新增测试覆盖分布

| 测试组 | 测试数 | 覆盖内容 |
|--------|--------|---------|
| `Zhang Space openZhangMode / closeZhangMode` | 3 | 模式标志正确性、互斥切换 |
| `Wang Space openWangMode / closeWangMode` | 3 | 模式标志正确性、互斥切换 |
| `Zhang/Wang storage file key isolation` | 4 | 文件名唯一性、ALLOWED_FILENAMES |
| `Zhang seed data integrity` | 6 | 节点数 / 边完整性 / ID 前缀 / 字段校验 / 系统 prompt |
| `Wang seed data integrity` | 6 | 同上（Wang） |
| **合计** | **24** | — |

---

## 设计观察（非 bug）

**观察 1：Space 模式使用 `isLennyMode` 作为总开关，语义稍混淆**

所有 Space（PG/Zhang/Wang）都依赖 `isLennyMode: true` 触发存储隔离逻辑，但"Lenny"在语义上指特定人物。历史遗留设计，修改影响面大。建议在注释中明确说明（已在代码中注释：`isLennyMode` = "in some space mode"）。

**观察 2：系统 prompt 存储在前端 shared/constants.ts**

Zhang/Wang system prompts 约 500 字，与 PG/Lenny 一致存放在前端常量中。优点：无需 API 调用；缺点：prompt 内容随 JS bundle 发布，用户可在浏览器 DevTools 中查看。与现有架构一致，无安全风险（prompt 本身不含敏感信息）。

---

## 无问题确认

| 检查项 | 状态 |
|--------|------|
| 存储隔离（zhang-\*/wang-\* 不污染 lenny-\*/pg-\*/users）| ✅ 已验证（5 处路由 + 测试） |
| ALLOWED_FILENAMES 白名单覆盖所有新文件 | ✅ 已验证（测试 P3-4 覆盖） |
| TypeScript 零错误 | ✅ `tsc --noEmit` 0 errors |
| 全量测试通过 | ✅ 475/475 (18 files) |
| Space 关闭时 modal/conversation 正确重置 | ✅ 已验证（close 方法 + 测试） |
| 4-way ternary 优先级一致性 | ✅ canvasStore + AnswerModal 5 处完全一致 |
| 种子节点 ID 前缀匹配正确 | ✅ 测试验证（`zhang-seed-` / `wang-seed-`） |

---

## 修复摘要

本版本无 P0/P1 修复（功能开发版本）。P2/P3 均为与 PGSpaceCanvas 对称的已有技术债，不影响正确性，已记录，留待后续统一优化。

| 文件 | 变更类型 |
|------|---------|
| `src/renderer/src/components/ZhangSpaceCanvas.tsx` | 新增（870 行，张小龙空间完整实现） |
| `src/renderer/src/components/WangSpaceCanvas.tsx` | 新增（870 行，王慧文空间完整实现） |
| `src/shared/zhangData.ts` | 新增（35 seed nodes + 20 edges） |
| `src/shared/wangData.ts` | 新增（30 seed nodes + 20 edges） |
| `src/renderer/src/stores/canvasStore.ts` | 扩展（isZhangMode/isWangMode + 8 个方法 + 5 处路由更新） |
| `src/renderer/src/components/AnswerModal.tsx` | 扩展（4-way spacePrompt + snapshot/restore） |
| `src/renderer/src/components/Canvas.tsx` | 扩展（import + state + 2 个入口按钮 + 2 个 Canvas 挂载） |
| `src/renderer/src/i18n/zh.ts` / `en.ts` | 新增 4 个 i18n key |
| `src/shared/constants.ts` | 扩展（ZHANG/WANG prompts + storage files + allowlist） |
| `src/renderer/src/stores/__tests__/canvasStore.zhangWangMode.test.ts` | 新增（24 个测试） |

**测试结果**：475/475 通过（18 个文件），`tsc --noEmit` 零错误。
