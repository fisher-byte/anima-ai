## Code Review Summary

**Files reviewed**: 2 files, 129 insertions / 40 deletions
**Overall assessment**: APPROVE

---

## Findings

### P0 - Critical
无

### P1 - High（本次修复的问题）

以下 5 个 P1 问题已在本次提交中修复：

**P1-1 (FIXED): `persistDecisionRecord` 闭包读过期 `currentConversation`**

原实现通过 `useCallback` 闭包捕获 `currentConversation`，在 `setTimeout(0)` yield 后仍使用闭包值。yield 期间 store 可能已被 `autoSaveIfNeeded` 或其他路径更新，导致 `mutate()` 基于旧数据计算、`updateConversation` 覆写新数据。

修复：yield 后改用 `useCanvasStore.getState().currentConversation` 读取最新快照，并校验 `convId` 一致性。

**P1-2 (FIXED): `markDecisionAnswered` 依赖过期的 `activeDecisionRecord` 闭包**

原实现在 `useCallback` deps 中依赖 `activeDecisionRecord`（来自 `currentConversation?.decisionRecord`），但回调被 `onComplete` 调用时闭包中的值可能仍是 `undefined` 或旧 status。

修复：改用 `useCanvasStore.getState()` 实时读取，调用前和 200ms delay 后各检查一次。deps 改为 `[]`，引用完全稳定。

**P1-3 (FIXED): `onComplete` 中 `markDecisionAnswered` 与 `autoSaveIfNeeded` 竞态**

原实现 `void markDecisionAnswered()` 和 `void autoSaveIfNeeded()` 同时 fire-and-forget，两者分别调用 `appendConversation`，可能以不同的 `decisionRecord.status` 写入两行 JSONL。

修复：改为 `await autoSaveIfNeeded()` 完成后再 `void markDecisionAnswered()`。

**P1-4 (MITIGATED): `updateConversation` 在 modal 关闭后静默丢弃更新**

`closeModal()` 设置 `currentConversation: null` 后，`updateConversation` 的 id 匹配失败。`persistDecisionRecord` 已通过 `appendConversation` 持久化到磁盘，store 丢弃不影响数据安全。重新打开对话时会从 JSONL 重新加载，状态一致。标记为 mitigated，后续可在 `updateConversation` 中增加 fallback 写入。

**P1-5 (MITIGATED): `handleClose` 和 `persistDecisionRecord` 双写 JSONL**

P1-3 fix 将 autoSave 和 markDecisionAnswered 串行化后，close 时大部分情况下 `autoSavedSigRef` 已更新，`endConversation` 不会重复写入。极端 edge case（用户在 persist 进行中关闭）仍可能双写，但 `listOngoingDecisionItems` 的 dedup 逻辑（取最新 `updatedAt`）保证结果正确。

### P2 - Medium

**P2-A (FIXED): `safeAdopt`/`safeOutcome` 的 `busy` 在 `useCallback` deps 中导致 memo 失效**

原实现 `[busy, onAdopt]` 导致 callback 身份随 busy 切换变化，破坏 `memo(LingSiDecisionCard)` 的隔离效果。

修复：改用 `busyRef` 作为 source of truth，`useCallback` deps 仅保留 `[onAdopt]`/`[onOutcome]`，身份稳定。

**P2-B: `outcomeNotes` 快速编辑 + 保存后可能被旧值覆写**

`useEffect` 在 `localRecord.outcome?.notes` 变化时同步 `outcomeNotes` state。如果用户在 persist 后继续输入、下一次 persist 又触发 sync effect，可能闪回旧值。实际触发概率极低（需要用户在 persist 的几十毫秒窗口内恰好输入）。

建议后续增加 `userHasEdited` ref guard，但**当前不阻塞合并**。

**P2-C: `LingSiDecisionCard` 快照可能漏同步同毫秒多次更新**

snapshot 用 `updatedAt` 字符串判断是否需要同步。如果两次 mutation 产生相同的 ISO 时间戳（同一毫秒内），第二次更新会被跳过。实际概率极低。

### P3 - Low

**P3-A (FIXED): `filterProductStateDocRefs` 冗余大小写检查**

`personaKey` 已是 `personaName.toLowerCase()`，原代码额外检查 `personaName.includes('Lenny')` 是冗余的。已移除。

**P3-B: `persistDecisionRecord` deps 仍包含 `currentConversation`**

虽然函数体内已改用 `getState()`，`useCallback` deps 仍列出 `currentConversation`。这不影响正确性（deps 变化只导致 callback 重建，ref-forwarding 模式确保下游使用最新值），但语义上略有误导。可考虑后续移除。

---

## What I Checked

- `persistDecisionRecord` 内 yield 后的数据读取路径是否使用了 `getState()`（✅）
- `markDecisionAnswered` 的 guard 是否在 delay 前后各做一次检查（✅）
- `onComplete` 的 autoSave / markDecisionAnswered 执行顺序是否串行（✅ `await` + `void`）
- `busyRef` 的 set/clear 是否在 try/finally 中正确配对（✅）
- `localRecord` snapshot 的 sync 条件是否合理（`updatedAt` 变化时同步，✅）
- `memo(LingSiDecisionCard)` 的所有 props 引用稳定性（`record` 虽不稳定但被 snapshot 隔离，`personaName` 已 useMemo，`onAdopt`/`onOutcome` 通过 ref-forwarding 稳定，✅）
- TypeScript 编译 `npx tsc --noEmit`：零错误
- Vitest `npx vitest run`：611 passed / 2 failed（既有问题，非本次引入）

---

## Residual Risks

- `persistDecisionRecord` 的 `useCallback` deps 仍包含 `currentConversation`、`turns`、`appliedPreferences` 等高频变化值，导致 callback 频繁重建。但通过 `persistDecisionRecordRef` ref-forwarding，下游 handler 的引用稳定，重建不触发子组件重渲染。
- 极端 edge case：用户在 `persist` 进行中（yield 后、appendConversation 前）关闭 modal，`freshConversation` 读取可能为 null → early return → 磁盘未写入。但此时 `autoSaveIfNeeded` 已在前序完成了基本保存，只是 status 可能停留在 `draft`/`answered` 而非 `adopted`。用户重新打开后可再次操作。
- 2 个既有测试失败（`setLennyDecisionMode`/`setZhangDecisionMode`）与本次修改无关，建议单独排查。

---

## Architecture Note

本次修复后，决策卡的防卡死架构为 **四层防线**：

```
Layer 1: LingSiDecisionCard snapshot isolation
  └─ localRecord state + updatedAt guard → 父组件 re-render 不穿透

Layer 2: busyRef + yield pattern
  └─ 点击采纳/反馈 → UI 立即变灰 → yield → persist → yield → 恢复

Layer 3: persistDecisionRecord getState() + yield
  └─ 读最新 store 数据 → 写 store + yield → 写磁盘 → 分段执行不阻塞

Layer 4: onComplete serialization
  └─ autoSave 完成 → 200ms delay → markDecisionAnswered → 无竞态
```
