# Code Review Report — v0.5.18

*最后更新: 2026-03-17 | 范围: LingSi stability / onboarding exit fix / release sync*

## Code Review Summary

**Files reviewed**: 21 files（UI、store、tests、eval 产物、版本与发布文档）  
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

- `src/renderer/src/components/Canvas.tsx`
  - Space 入口卡片宽度与 `灵思` badge 是否稳定共存，不再挤压长标题
- `src/renderer/src/stores/canvasStore.ts`
  - onboarding 弹层关闭后是否退出教程模式
  - onboarding 关闭是否错误写入普通 `conversation_history`
- `src/renderer/src/stores/__tests__/canvasStore.lennyMode.test.ts`
  - 是否补上对应回归断言，避免以后再次退化
- `docs/lingsi-eval-m4.md` / `reports/lingsi-m4-eval.json`
  - Lenny 全量 eval 产物是否重新生成、结果是否一致
- 版本同步链路
  - `package.json` / `package-lock.json` / `src/shared/constants.ts`
  - `docs/PROJECT.md` / `docs/ROADMAP.md` / `docs/README.md` / `docs/changelog.md`
  - `docs/dev-guide.md` / `docs/testing.md` / `docs/deployment.md` / `docs/sop-release.md`

## Removal/Iteration Plan

无本轮可安全删除项。

## Residual Risks

- `npm run build` 仍保留既有 CSS minify warning 与 chunk size warning；这不是本轮引入的问题，但仍值得后续单独治理。
- Lenny 全量 eval 目前仍是 live model output，结果受外部模型状态影响；本轮已重新规范化产物，但后续如要做稳定回归，建议把评测集分层成 live eval 和 deterministic smoke eval。

## Validation Referenced

- `npm run lingsi:extract` → `Files changed: 0`
- `npm run lingsi:evaluate` → `decision 14 : normal 1`
- `npm run lingsi:evaluate:zhang` → `decision 6 : normal 0 : tie 1`
- `npm test` → `589 passed / 27 files`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e` → `44 passed / 4 skipped`

## Conclusion

本轮是收口型改动，没有发现新的阻塞项：
- onboarding 状态修复直接落在正确的状态边界上，没有把行为分散到多个组件里打补丁
- 样式修复是局部、可控的，不影响 persona 调用链路
- 版本、文档、评测产物已经重新对齐，当前可以作为新的发布基线

可以合入并部署。
