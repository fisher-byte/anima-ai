# Code Review Report — v0.5.16

## Scope
- Reviewed tracked diff in `docs/*`, `InputBox.tsx`, `AnswerModal.tsx`, `AnswerModalSubcomponents.tsx`, `Canvas.tsx`, `canvasStore.ts`, `types.ts`
- Reviewed new helper/test files: `inputMentions.ts`, `personaSpaces.ts`, `inputMentions.test.ts`, `personaSpaces.test.ts`
- Excluded unrelated pre-existing dirty artifacts:
  - `docs/lingsi-eval-m4.md`
  - `reports/lingsi-m4-eval.json`

## Code Review Summary

**Files reviewed**: 20 files, 567 insertions / 194 deletions in tracked diff plus 4 new helper/test files  
**Overall assessment**: APPROVE

---

## Findings

### P0 - Critical
- none

### P1 - High
- none

### P2 - Medium
- none

### P3 - Low
- none

---

## What Was Checked
- Homepage Space entry badges and discoverability path
- Homepage `@persona` invocation path: suggestion -> token insertion -> submit -> `startConversation` -> `AnswerModal` prompt override
- Decision mode resolution priority across public Space toggle, homepage `invokedAssistant`, and persisted `decisionTrace`
- Whole-token Backspace/Delete behavior for structured mentions
- Independent LingSi trace view rendering and source/reference exposure
- i18n coverage and regression tests for new helpers

## Residual Risks
- 当前主页 `@persona` 仍只支持一次激活一个 assistant；如果后续要支持同一条消息中多 persona 对照，需要把 `invokedAssistant` 从单值扩成列表。
- mention token 当前按 `tokenText` 同步；若未来允许同一 persona/file 在同一消息中重复出现，需要补更强的位置信息模型。

## Validation
- `npm run typecheck`
- `npm test` → `586 passed / 27 files`
- `npm run build` → passed
- `npm run test:e2e` → `44 passed / 4 skipped`

## Conclusion
- 本轮主页灵思入口、结构化 `@mention`、独立决策轨迹视图三条链路已打通。
- 未发现新的正确性、隔离性或安全阻塞项，可进入备份与提交。
