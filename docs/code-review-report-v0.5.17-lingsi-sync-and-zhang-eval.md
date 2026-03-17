# Code Review Report — v0.5.17

*最后更新: 2026-03-17 | 范围: LingSi latest source sync / 张小龙 case-based eval baseline*

## Code Review Summary

**Files reviewed**: 11 files（脚本、tests、seed 产物、评测产物、文档入口）  
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
  - 新增 Lenny / 张小龙 source spec 与 unit seed 是否保持 persona 边界
  - 既有稳定时间戳策略是否保留，避免 seed 文件重复运行产生纯噪音 diff
  - source manifest / personas / units 数量是否与生成产物一致
- `scripts/evaluate-lingsi.ts`
  - persona-scoped eval 是否正确隔离 `lenny` / `zhang`
  - 新增 `npm run lingsi:evaluate:zhang` 是否输出到独立报告路径，不覆盖 Lenny M4 报告
  - 超时、重试、case filter 是否沿用既有保护
- `src/shared/__tests__/lingsiSeeds.test.ts` / `src/shared/__tests__/lingsiDecisionEngine.test.ts`
  - 数量基线与新命中场景是否覆盖最新 seeds
- `seeds/lingsi/*`
  - `repoCommit` 是否统一绑定到 `anima-base@851effb`
  - 新增单位是否具备 personaId、sourceRefs、locator/excerpt 等审计信息
- `docs/lingsi-eval-zhang.md` / `reports/lingsi-zhang-eval.json`
  - 报告内容与脚本输出、命中 unit 与评测结论是否一致

## Removal/Iteration Plan

无本轮可安全删除项。

## Residual Risks

- 本轮新增的是张小龙独立基线；Lenny 侧本次没有重跑全量 live eval，只做了 seed / tests / build 回归。当前不构成阻塞，但后续如再大幅扩张 Lenny sources，建议再跑一次完整 15 题基线。
- `evaluate-lingsi.ts` 当前仍把 persona 配置硬编码在脚本内。现阶段只有 `lenny` / `zhang` 两个 persona，这种显式配置最稳；第三个 persona 开始时，适合再抽成数据驱动配置。

## Validation Referenced

- `npm run lingsi:extract`
- `npm run typecheck`
- `npx vitest run src/shared/__tests__/lingsiSeeds.test.ts src/shared/__tests__/lingsiDecisionEngine.test.ts`
- `LINGSI_EVAL_PERSONA=zhang npm run lingsi:evaluate`
- `npm test`
- `npm run build`
- `npm run test:e2e`

## Conclusion

本轮 diff 主要是数据层扩充与评测脚本扩展，边界控制是清晰的：
- data sync 与 persona eval 没有互相污染
- 张小龙评测产物走独立路径，不会覆盖 Lenny 既有基线
- 时间戳稳定策略仍然存在，没有回退到每次重写 seed 的状态
- 新增单位和来源都能回溯到 `anima-base@851effb`

可以合入。
