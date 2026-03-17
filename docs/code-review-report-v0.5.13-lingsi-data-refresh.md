# Code Review Report — v0.5.13 LingSi Data Refresh

*最后更新: 2026-03-17 | 范围: LingSi 数据层扩充 / anima-base 新材料导入*

## Code Review Summary

**Files reviewed**: 13 files, 964 lines changed  
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

- `scripts/extract-lingsi-seeds.ts`
  - 新来源 `mustInclude` 校验、excerpt 定位、可复现时间戳合并逻辑未退化
  - 新增 `DecisionUnit` 的 tags / triggerKeywords / evidenceRefs 与现有匹配引擎契约一致
- `seeds/lingsi/decision-source-manifest.json`
  - 来源条目已绑定 `anima-base@4d27b3b`，路径均能回到真实文件
- `seeds/lingsi/decision-units.json`
  - 所有新增 unit 均带 `locator` 和 `excerpt`，无孤立 source id
- `src/shared/__tests__/lingsiSeeds.test.ts`
  - 基线断言已同步更新为 `11` sources / `20` units
- 文档同步
  - `PROJECT.md` / `ROADMAP.md` / `README.md` / `lingsi-data-schema.md` / `changelog.md` 与当前数据基线一致

## Review Notes

- 这轮改动主要是数据扩充，不改动请求链路和多租户边界，因此风险集中在“来源是否可追溯”和“匹配是否误召回”。目前两项都通过了现有校验。
- 新增材料里 `decision-case` / `article` 仍复用 `framework` 类型，这是当前 `DecisionSourceType` 枚举的限制，不影响现有展示与审计，但如果后续需要更细粒度过滤，建议单独补 source type 扩展。
- `npm run test:e2e` 当前是 `44 passed / 4 skipped`。skip 仍是条件性场景，不是失败回归。

## Validation

```bash
npm run lingsi:extract
npx vitest run src/shared/__tests__/lingsiSeeds.test.ts src/shared/__tests__/lingsiDecisionEngine.test.ts
npm run lingsi:evaluate
npm test
npm run typecheck
npm run build
npm run test:e2e
```

- `npm run lingsi:extract`: passed
- `npx vitest run ...lingsiSeeds... ...lingsiDecisionEngine...`: `7` tests passed
- `npm run lingsi:evaluate`: `decision 15 : normal 0`
- `npm test`: `571` tests passed / `25` test files
- `npm run typecheck`: passed
- `npm run build`: passed
- `npm run test:e2e`: `44 passed / 4 skipped`

## Residual Risk

- `DecisionSourceType` 仍未细分 `article` 和 `decision_case`，后续若要做来源筛选或按来源类型统计，需要扩展枚举与展示层。
- `npm run build` 仍有既有 CSS minify warning 和 chunk size warning；这轮没有新增构建阻塞。
