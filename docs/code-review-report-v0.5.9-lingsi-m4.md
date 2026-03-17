# Code Review Report — v0.5.9 LingSi M4

*最后更新: 2026-03-17 | 范围: LingSi 数据层 / 决策模式 / M4 对照评测*

## Summary

- Review scope:
  - `src/renderer/src/components/AnswerModal.tsx`
  - `src/renderer/src/services/lingsi.ts`
  - `src/renderer/src/stores/canvasStore.ts`
  - `src/server/routes/ai.ts`
  - `src/shared/lingsiDecisionEngine.ts`
  - `scripts/extract-lingsi-seeds.ts`
  - `scripts/evaluate-lingsi.ts`
- Review result: `3` findings fixed
- Residual risk:
  - `prioritize-roadmap` 仍是唯一 `normal` 胜出的 case
  - `npm run build` 存在既有 CSS minify warning，未在本轮处理

## Fixed Findings

### P1

1. `systemPromptOverride` 下仍会丢失 `compressedMemory`
   - 修复：抽出 `appendClientContextBlocks()`，让 override / non-override 都能追加 `compressedMemory` 与 `extraContext`
   - 文件：`/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/src/server/routes/ai.ts`

2. 决策模式 toggle 被锁死在会话初始值
   - 修复：发送请求时以实时 `lennyDecisionMode` 为准；store 切换时同步当前纯 Lenny 对话的 `decisionTrace.mode`
   - 文件：
     - `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/src/renderer/src/components/AnswerModal.tsx`
     - `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/src/renderer/src/stores/canvasStore.ts`

### P2

3. LingSi storage 部分写入会被误判为已初始化
   - 修复：初始化时同时校验 `decision-personas.json`、`decision-source-manifest.json`、`decision-units.json`
   - 文件：`/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/src/renderer/src/services/lingsi.ts`

## Validation

### Full test pass

```bash
npm test
```

- 结果：`559` tests passed / `23` test files

### Targeted validation

```bash
npm run typecheck
npm run lingsi:extract
npm run lingsi:evaluate
npx vitest run src/renderer/src/services/__tests__/lingsi.test.ts \
  src/renderer/src/stores/__tests__/canvasStore.lennyMode.test.ts \
  src/server/__tests__/server-ai.test.ts \
  src/shared/__tests__/lingsiDecisionEngine.test.ts \
  src/shared/__tests__/lingsiSeeds.test.ts
```

- `decision` vs `normal`：`14 : 1`
- 评测结果文件：
  - `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/docs/lingsi-eval-m4.md`
  - `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/reports/lingsi-m4-eval.json`

### Build

```bash
npm run build
```

- 构建成功
- 已知 warning：CSS minify 阶段存在模板字符串残留告警；当前不阻塞 LingSi 里程碑备份

## Recommendation

- 当前可以进入 GitHub 备份
- 备份后优先处理：
  1. `prioritize-roadmap` 的决策模式直给能力
  2. 脚注展示
  3. 复跑 M4 验证
