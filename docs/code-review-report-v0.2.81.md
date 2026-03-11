# Code Review Report — v0.2.80 → v0.2.81

**Reviewed by**: Claude Sonnet 4.6 (automated)
**Date**: 2026-03-11
**Files reviewed**:
- `src/shared/pgData.ts` (new)
- `src/shared/constants.ts` (modified)
- `src/renderer/src/components/Canvas.tsx` (modified)
- `src/renderer/src/components/PGSpaceCanvas.tsx` (new)
- `docs/ADD_FIGURE_SOP.md` (new)
- `src/renderer/src/stores/__tests__/canvasStore.pgMode.test.ts` (new)
- `e2e/features.spec.ts` (modified)

---

## Summary

| Severity | Count |
|----------|-------|
| Bug | 0 |
| Warning | 2 |
| Info | 4 |

Overall quality: **Good** — The PG Space architecture correctly reuses the Lenny mode mechanism with full storage isolation. No functional bugs found. Two minor warnings noted below, both are acceptable trade-offs given the design intent.

---

## pgData.ts

### [INFO] 35 seed nodes, all IDs follow `pg-seed-{slug}` convention

Verified: all `conversationId` and `id` fields are identical and use `pg-seed-` prefix. The `pos()` helper is local and not exported, which is correct (it's only needed for initial layout calculation).

### [INFO] Edge confidence values are in [0.75, 0.95] range as required by SOP

All 20 edges have `confidence` between 0.75 and 0.95. `relation` values are drawn from the allowed set (`深化了 | 启发了 | 依赖于 | 重新思考了`).

---

## constants.ts

### [INFO] `ALLOWED_FILENAMES` correctly includes all three pg-* files

`pg-nodes.json`, `pg-conversations.jsonl`, and `pg-edges.json` are all present. The storage security boundary is maintained.

### [INFO] `PG_SYSTEM_PROMPT` contains required `{{DATE}}` placeholder

The backend correctly substitutes `{{DATE}}` at request time. Verified the placeholder is present.

---

## PGSpaceCanvas.tsx

### [WARNING] Component is ~530 lines — same as LennySpaceCanvas

**Location**: entire file

**Observation**: `PGSpaceCanvas` and `LennySpaceCanvas` share nearly identical structure (physics simulation, drag, node rendering, sidebar). This is intentional duplication per the SOP design (each Space is self-contained for independent evolution), but if 5+ figures are added, a shared `SpaceCanvas` base component would reduce maintenance burden.

**Recommendation**: acceptable for now. If 3+ more figures are added, consider extracting a `BaseSpaceCanvas` HOC/hook. Not a bug.

---

## Canvas.tsx

### [WARNING] `isPGSpaceOpen` and `isLennySpaceOpen` are independent `useState` — no mutual exclusion

**Location**: Canvas.tsx state declarations

**Observation**: Both spaces can theoretically be open simultaneously (both flags `true`). In practice the user would need to click both buttons without closing either, and the z-index stacking (both `z-[100]`) would visually overlap them.

**Recommendation**: Could add mutual exclusion logic (`setIsLennySpaceOpen(false)` when opening PG and vice versa). This is a minor UX concern, not a data corruption risk, since each space writes to separate storage files. Acceptable for v0.2.81.

---

## canvasStore.pgMode.test.ts

### [INFO] Test coverage is appropriate

17 tests cover:
1. `openLennyMode` / `closeLennyMode` reuse (behavioral contract)
2. `endConversation` storage isolation (6 tests: no `nodes.json`, no `lenny-nodes.json`, no `/api/memory/classify`, no `/api/memory/index`)
3. Seed data integrity (7 tests: count, IDs, fields, edges, `PG_SYSTEM_PROMPT`, `ALLOWED_FILENAMES`, center coordinates)
4. `appendConversation` isolation (no user `conversations.jsonl`, no `/api/memory/queue`)

All 422 unit tests pass. No flaky tests introduced.

---

## Security

- No new API endpoints added
- `pg-*.json/jsonl` file names are all in `ALLOWED_FILENAMES` — the existing filename whitelist blocks any path traversal
- `PG_SYSTEM_PROMPT` does not contain any user-supplied content; it is a static string
- Storage isolation is enforced at the component level (PGSpaceCanvas explicitly calls `STORAGE_FILES.PG_*` keys)

---

## Verdict

**Approve for release.** The two warnings are known trade-offs with acceptable risk for v0.2.81. No action required before deployment.
