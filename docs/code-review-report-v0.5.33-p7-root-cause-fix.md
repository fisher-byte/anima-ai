## Code Review Summary

**Version**: v0.5.33
**Date**: 2026-03-19
**Files reviewed**: 1 file (`src/renderer/src/components/AnswerModal.tsx`), 81 insertions / 45 deletions
**Branch**: `codex/lingsi-m4-backup`
**Commit**: `59f392a`
**Overall assessment**: APPROVE

---

## Context

This is the 7th iteration fixing the "decision card click freeze" bug. Previous fixes (P1–P6) addressed symptoms:
- P1: ReactMarkdown re-parsing all turns on every SSE token (memo fix)
- P2: LingSiTraceModal Portal inside turns loop (lift to root level)
- P3: persistDecisionRecord stale closure data (getState() after yield)
- P4: No event-loop yields before heavy sync work (setTimeout(0) inserts)
- P5: markDecisionAnswered race with autoSaveIfNeeded (serialize to await chain)
- P6: LingSiDecisionCard snapshot isolation (localRecord state cache)

**Root cause (P7)**: The fundamental issue was never fixed — `AnswerModal` subscribes to the entire `currentConversation` object via `useCanvasStore(state => state.currentConversation)`. Every `updateConversation()` call spreads a new object `{...currentConversation, ...updates}`, causing the full component to re-render and rebuild all useCallback/useMemo hooks.

---

## Findings

### P0 - Critical
None.

### P1 - High

**P1-1 (FIXED): `persistDecisionRecord` deps caused cascade re-renders**

Previous deps included `currentConversation`, `turns`, `appliedPreferences`. On every `updateConversation()` call, these deps changed → callback rebuilt → `persistDecisionRecordRef` useEffect triggered → `handleAdoptDecision`/`handleDecisionOutcome` got new references → `LingSiDecisionCard` memo invalidated.

Fix: Added `turnsRef` and `appliedPreferencesRef` (useRef synced every render). Function body reads from refs and `getState()` instead of closure. Removed `currentConversation`/`turns`/`appliedPreferences` from deps. Callback identity is now stable.

**P1-2 (FIXED): `prepareConversation` useEffect re-ran on every store update**

Previous dep was the full `currentConversation` object. Every `updateConversation()` within the same conversation triggered the effect, which would call `getPreferencesForPrompt()`, check `assistantMessage`, potentially call `handleRegenerate()` — wasted work and potential side effects.

Fix: Changed dep to `currentConversation?.id`. Body reads from `useCanvasStore.getState().currentConversation`. Effect only re-runs when switching to a different conversation.

### P2 - Medium

**P2-1 (FIXED): `activeDecisionRecord`/`activeDecisionTrace` derived from full object**

Previous code: `const activeDecisionRecord = currentConversation?.decisionRecord`. Any field change in `currentConversation` (e.g. updating `assistantMessage` during auto-save) would create a new `decisionRecord` reference even if the record itself was unchanged → downstream `useMemo` and JSX re-evaluations.

Fix: Both now use `useCanvasStore()` with custom equality functions:
- `activeDecisionRecord`: only re-renders when `updatedAt` or `status` changes
- `activeDecisionTrace`: only re-renders when `mode`, `sourceRefs`, `matchedDecisionUnitIds`, `productStateUsed`, or `productStateDocRefs` changes

**P2-2 (ACKNOWLEDGED): `currentConversationRef` added but not yet widely used**

`currentConversationRef` is added and synced every render, but the current PR doesn't migrate existing callbacks to use it. This is intentional — the three targeted fixes are sufficient to break the freeze loop without a larger refactor. The ref is available for future use if needed.

### P3 - Low

**P3-1 (OBSERVATION): `turnsRef.current = turns` assignment in render body**

Assigning to a ref during render is technically valid in React (refs are mutable and don't trigger re-renders), but the idiomatic pattern would be a useEffect. The current inline assignment pattern is used consistently in the React docs and in React Query's codebase for "always fresh" refs. No action needed.

**P3-2 (OBSERVATION): `activeDecisionRecord` equality check covers `updatedAt` + `status` only**

If a future field (e.g. `outcome.notes`) is updated without bumping `updatedAt`, the UI won't re-render. Mitigation: `persistDecisionRecord` always sets `updatedAt: new Date().toISOString()` before calling `updateConversation`. This invariant should be maintained in future changes.

---

## Correctness Analysis

### Stale data risks

| Path | Previous | After P7 |
|------|----------|----------|
| `persistDecisionRecord` initial guard | Closure `currentConversation` (may be stale) | `getState()` (always fresh) |
| `persistDecisionRecord` turns serialization | Closure `turns` (may be stale) | `turnsRef.current` (synced each render) |
| `persistDecisionRecord` appliedPreferences | Closure `appliedPreferences` (may be stale) | `appliedPreferencesRef.current` (synced each render) |
| `prepareConversation` fields | Closure `currentConversation` (rebuilt on every store update) | `getState().currentConversation` (snapshot at effect run time) |

### Re-render frequency reduction

| Trigger | Before | After |
|---------|--------|-------|
| `updateConversation({decisionRecord})` | Full AnswerModal re-render + all deps rebuilt | `activeDecisionRecord` selector check → no re-render if `updatedAt`+`status` unchanged |
| `updateConversation({assistantMessage})` | `persistDecisionRecord` rebuilt (turns in deps) | No callback rebuild |
| `updateConversation({deepSearch})` | `prepareConversation` useEffect re-ran | No re-run (id unchanged) |

---

## Test Coverage

- `npm run build`: ✅ 0 compilation errors
- No TypeScript errors
- Pre-existing CSS warnings (unrelated template literal in CSS variable)
- Production deployment: https://chatanima.com health check 200

## Recommendation

**APPROVE.** The three changes are minimal, targeted, and correct. They address the actual root cause without architectural refactoring. The PR is safe to merge.
