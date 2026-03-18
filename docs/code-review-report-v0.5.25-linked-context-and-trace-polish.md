# Code Review Report — v0.5.25 Linked Context And Trace Polish

- Date: 2026-03-18
- Scope: `AnswerModal` 历史对话窗、LingSi 产品状态 fallback、历史重发链路、关联空间提示净化
- Reviewer: Codex (`$code-review-expert` workflow)
- Verdict: APPROVE

## Summary

本轮修改聚焦在一个很具体但很影响体验的问题：系统为了帮 `@persona` 更稳定地路由请求，会在内部追加“已关联空间”的增强提示；这本来应该只存在于发送链路里，不应该反向污染用户在历史对话窗里看到、复制、编辑和重发的内容，也不应该因为这些附加词而误触发产品状态包。

这轮实现把“用户真实问题”和“系统内部增强提示”重新分层了。历史窗里的用户消息回到可理解、可重发的原始文本；Decision matching 与状态包 fallback 也改成只看净化后的问题文本，因此 `@Lenny` 的职业问题不会再被错误解释成“当前项目状态问题”。同时，历史窗顶部保留拖拽调高能力，但视觉上收敛成更轻的悬浮手柄。

## Findings

本轮 review 未发现新的 `P0 / P1 / P2 / P3` 阻塞问题。

## Checked Areas

- 历史对话窗中用户消息展示是否仍会泄露 `【已关联空间：...】` 内部提示
- 编辑 / 复制 / 重发 / 再次发送是否会把内部增强提示再次带回模型或暴露给用户
- 产品状态包 fallback 是否仍会被 `@ / mention / space / 卡片 / badge` 这类低信号词误触发
- Lenny fallback 是否还会展示张小龙评测基线或内部飞轮文档
- 历史对话窗顶部拖拽手柄视觉调整是否影响窗口调高能力

## Residual Risks

- 当前产品状态 fallback 仍然是“类别级依据”，不是句子级证据映射；它适合解释“这次主要依据了哪些当前项目事实”，但还不适合精细到逐段回答的证据归因。
- 目前没有单独的浏览器级 E2E 专门覆盖“历史窗重发 + `@persona` + 决策 fallback 不误触发”的复合路径；现阶段依赖 component/shared tests 与整套 `test:e2e` 冒烟。

## Validation

- `npm run typecheck`
- `npx vitest run src/shared/__tests__/lingsiDecisionEngine.test.ts src/renderer/src/components/__tests__/AnswerModalSubcomponents.test.tsx src/renderer/src/utils/__tests__/conversationUtils.test.ts`
- `npm test`
- `npm run build`
- `npm run test:e2e`

All passed in this release batch.
