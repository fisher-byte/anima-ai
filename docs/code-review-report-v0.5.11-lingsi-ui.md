# Code Review Report — v0.5.11 LingSi UI

*最后更新: 2026-03-17 | 范围: 灵思脚注与决策轨迹展示*

## Code Review Summary

**Files reviewed**: 6 files, UI + i18n + util tests  
**Overall assessment**: APPROVE

---

## Findings

### P0 - Critical
无

### P1 - High
无

### P2 - Medium
无

### P3 - Low
无

---

## Checked Areas

- `src/renderer/src/components/AnswerModal.tsx`
  - `decisionTrace` 到 UI 的映射、DecisionUnit 标题解析、仅在纯 Lenny 决策对话展示
- `src/renderer/src/components/AnswerModalSubcomponents.tsx`
  - 脚注面板折叠/展开、来源摘录展示、evidence level 标签
- `src/renderer/src/utils/lingsiTrace.ts`
  - fallback label、source label 拼装、matched ids -> 标题解析
- `src/renderer/src/i18n/en.ts`
- `src/renderer/src/i18n/zh.ts`
- `src/renderer/src/utils/__tests__/lingsiTrace.test.ts`

## Review Notes

- 本轮没有改动服务端请求/存储结构，风险面集中在前端渲染与文案。
- `decisionTrace` 仍按“当前对话级别”展示，而不是按单个 turn 拆分；这与现有持久化结构一致，避免为 UI 展示强行改存储模型。
- 当前实现优先展示真实来源片段，而不是在回答正文里做自动编号插桩，降低渲染侵入性和回归风险。

## Validation

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

- `npm test`: `569` tests passed / `25` test files
- `npm run typecheck`: passed
- `npm run build`: passed
- `npm run test:e2e`: `45 passed / 3 skipped`

## Residual Risk

- 构建阶段仍有既有 CSS minify warning 与 chunk size warning；不是本轮引入。
- 如果后续要把脚注编号直接插入回答正文，需要新增一层 markdown/token 级映射，当前版本未做这一步。
