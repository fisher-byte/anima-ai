# Code Review Report — v0.5.12 Inline Citations

*最后更新: 2026-03-17 | 范围: 灵思正文脚注编号 / anima-base 增量评估*

## Code Review Summary

**Files reviewed**: 4 files, UI + util logic + docs  
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

- `src/renderer/src/utils/lingsiTrace.ts`
  - 正文脚注插入点、重复注入保护、非段落 block 过滤
- `src/renderer/src/components/AnswerModal.tsx`
  - 仅对最后一轮、纯 Lenny 决策对话插入正文脚注
- `src/renderer/src/components/AnswerModalSubcomponents.tsx`
  - 来源面板锚点 id 与正文链接目标一致
- `src/renderer/src/utils/__tests__/lingsiTrace.test.ts`
  - 新增脚注插入和去重测试

## Review Notes

- 当前正文内编号是“回答级别脚注”，不是句子级证据对齐；这是刻意控制范围，先解决可见性，再决定是否做细粒度映射。
- `anima-base` 远端新增内容中，最有价值的是结构化决策案例和决策框架，不建议把新 collection 全量导入 LingSi。
- 已确认远端较本地多 `12` 个提交，本轮只做价值评估，不直接更新本地 `anima-base` 工作树，避免把数据导入和 UI 变更混在一个提交里。

## Validation

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

- `npm test`: `571` tests passed / `25` test files
- `npm run typecheck`: passed
- `npm run build`: passed
- `npm run test:e2e`: `45 passed / 3 skipped`

## Residual Risk

- 如果后续要求“每个判断绑定到具体句子”，当前正文级插入策略不够，需要单独引入句子级 citation mapper。
- `anima-base` 远端内容已完成筛选，但尚未转为新的 seeds；这部分仍在下一轮数据层任务中。
