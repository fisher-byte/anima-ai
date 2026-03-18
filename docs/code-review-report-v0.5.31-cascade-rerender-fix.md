## Code Review Summary

**Files reviewed**: 3 files, 99 insertions / 68 deletions
**Overall assessment**: APPROVE (with 1 minor note)

---

## Findings

### P0 - Critical
无

### P1 - High
无

### P2 - Medium

**P2-A: `matchedDecisionUnits` 数组引用不完全稳定**

`matchedDecisionUnits` 来自 `useState`，每次 `setMatchedDecisionUnits()` 都会创建新引用。虽然 `LingSiTracePanel` 已被 `memo()` 包裹，但当 `matchedDecisionUnits` 引用变化时仍会触发重渲染。实际影响很小（只在 `matchedDecisionUnitIds` 真正变化时才 set），但若后续要进一步优化，可考虑对 `matchedDecisionUnits` 做 `useMemo` 包裹或自定义 equality 比较。

**当前不阻塞合并**——实际触发频率极低。

### P3 - Low

**P3-A: 决策面板布局微调**

`LingSiTracePanel` 和 `LingSiDecisionCard` 从 turns 循环内移到循环外后，它们不再嵌套在最后一轮的 `<div className="text-gray-800 ...">` 内部。视觉上组件仍在同一个 `max-w-2xl` 容器内紧随 turns 内容后方，但 CSS 继承关系变化可能导致细微的间距/字体差异。建议手动验证一下视觉效果。

---

## What I Checked

- `useMemo` deps 是否使用了稳定的标识符（已修复 `turns[turns.length - 1]?.assistant` → 提取为 `lastTurnAssistant` 变量）
- `persistDecisionRecordRef` ref-forwarding 模式是否符合 React hooks 规则（✅ 无条件 hooks、无循环 hooks）
- `handleAdoptDecision` / `handleDecisionOutcome` 的 `[]` deps 是否安全（✅ 通过 ref.current 读取最新值）
- `memo()` 包裹后各 prop 的引用稳定性（`stableSourceRefs`、`stableProductStateDocRefs`、`stablePersonaName` 均已 `useMemo`；`onOpenTrace={setTraceData}` 是 useState setter，React 保证稳定）
- `canvasStore` 的 `get().lennyDecisionMode` early-return 是否安全（✅ `get()` 在 zustand `create((set, get) => ...)` 闭包内可用）
- TypeScript 编译 `npx tsc --noEmit`：零错误

---

## Residual Risks

- `LingSiDecisionCard` 的 `record` prop 来自 `currentConversation?.decisionRecord`，当 `currentConversation` 被 store 重建时 `record` 引用也会变化。但由于 `onAdopt`/`onOutcome` 已稳定，重渲染只涉及 DecisionCard 自身的浅 diff，不会产生级联影响。
- 目前的优化针对"点击决策 UI 后的卡死"。streaming 期间每个 SSE token 仍会触发 turns 更新 → AssistantMarkdown 重渲染，但 `memo(AssistantMarkdown)` 已在 v0.5.30 中处理了这一问题。

---

## Additional Suggestions

- 下一步可考虑对 `matchedDecisionUnits` 做引用稳定化（P2-A），但优先级低于功能迭代。
- 如果后续引入 React DevTools Profiler 的 "why did this render" 功能做性能基线测试，可以量化本次优化的实际效果（预期：决策 UI 交互时 re-render 次数从 O(turns) 降至 O(1)）。
