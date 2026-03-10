# Code Review Report — v0.2.77 → v0.2.78

**Reviewed by**: Claude Sonnet 4.6 (automated)
**Date**: 2026-03-10
**Commit**: 96c6cb2
**Files reviewed**:
- `src/renderer/src/components/AnswerModal.tsx`
- `src/server/routes/storage.ts`

---

## Summary

| Severity | Count |
|----------|-------|
| Bug (fixed) | 1 |
| Style / warning | 0 |
| Info | 2 |

Overall quality: **Good** — the Lenny memory injection logic is correct. One React hook dependency bug found and fixed.

---

## AnswerModal.tsx

### [BUG - FIXED] `isLennyMode` missing from `prepareConversation` useEffect dependency array

**Location**: line 449 (original commit)

**Problem**: `isLennyMode` controls the conditional branches inside `prepareConversation` (which system prompt to use and whether to persist `conversationId`), but it was absent from the `useEffect` dependency array. This meant that if the user navigated between normal mode and Lenny mode while the modal was open (or if `isLennyMode` changed before the effect ran), React would use a stale closure and execute the wrong branch.

```typescript
// BEFORE (buggy):
}, [isModalOpen, currentConversation, isOnboardingMode, isLoading,
    resetHistory, sendMessage, getPreferencesForPrompt, getRelevantMemories])

// AFTER (fixed):
}, [isModalOpen, currentConversation, isOnboardingMode, isLoading,
    resetHistory, sendMessage, getPreferencesForPrompt, getRelevantMemories, isLennyMode])
```

**Impact**: Low probability in practice (Lenny mode switch usually happens before modal opens), but a correctness bug that could cause subtle misbehavior.

**Status**: Fixed in this review pass.

---

### [INFO] Lenny `doSend` memory injection — correct

**Location**: lines 662–677

The fix correctly handles both branches:
- Normal mode: calls `getRelevantMemories`, highlights nodes, compresses memories
- Lenny mode: calls `getRelevantMemories` (from lenny store), compresses, does NOT highlight nodes (correct — Lenny has its own canvas)

No issues found.

---

### [INFO] `prepareConversation` Lenny path — correct

**Location**: lines 439–443

Correct behavior:
- `preferences` set to `[]` for Lenny (no user preference rules in Lenny persona)
- `conversationId` passed as `undefined` (prevents server from writing to user `conversation_history`)
- `LENNY_SYSTEM_PROMPT` passed as `systemPromptOverride`
- `compressed` memory from `getRelevantMemories` injected

No issues found.

---

## storage.ts

### [INFO] Lenny file 404 fix — correct and complete

**Location**: lines 240–249 (GET `/:filename` handler)

The three Lenny files are now handled:
```typescript
if (filename === 'lenny-nodes.json' || filename === 'lenny-edges.json') {
  return c.text('[]')
}
if (filename === 'lenny-conversations.jsonl') {
  return c.text('')
}
```

All three filenames are in the `isValidFilename` whitelist (`src/shared/constants.ts` lines 295–297), so the guard at the top of the handler will not reject them.

Returning `[]` for JSON files and `''` for JSONL is the correct default — it matches what the frontend expects when files don't exist yet, and it means the frontend's seed initialization code runs normally on first load.

No issues found.

---

## Test Coverage

- Unit tests: 404/404 passing (no new tests needed — existing `canvasStore.lennyMode.test.ts` covers the Lenny store behavior)
- E2E tests: 35/35 passing (test #36 `GET /api/storage/lenny-nodes.json` directly validates the 404 fix; test #37 validates seed initialization)
