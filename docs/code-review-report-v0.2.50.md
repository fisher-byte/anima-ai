# Code Review Report — v0.2.50

**Date**: 2026-03-07
**Reviewer**: Claude Code
**Scope**: 多轮 web_search + 调研澄清层 + P0/P1 代码质量修复 + 20 新单元测试
**Branch**: main
**Files changed**: 5
**Tests**: 289/289 pass (+20 新增)

---

## Summary

本次 patch 包含三个独立方向：

1. **多轮搜索（P1 功能）**：后端 `ai.ts` 将单次 `if tool_calls` 改为 while 循环（最多 5 轮），提取 `readRound()` helper，前端新增 `search_round` SSE 事件解析 + 搜索进度指示器。
2. **调研澄清层（P1 功能）**：`AnswerModal.tsx` 在检测到调研意图但无具体锚点时，在输入框上方弹出澄清卡片，引导用户细化方向后再发起搜索。
3. **代码质量（P0/P1 修复）**：`readRound` 添加 `try/finally reader.releaseLock()`（P0 资源泄漏修复），澄清层添加 `!isOnboardingMode` 守卫（P1），`sendClarifiedMessage` 提取消除重复代码。

---

## Architecture Review

### ai.ts — 多轮搜索架构

| 方面 | 评估 | 说明 |
|------|------|------|
| 循环边界 | ✅ 安全 | `MAX_SEARCH_ROUNDS = 5` 硬上限，防止无限循环 |
| 资源管理 | ✅ P0 修复完成 | `try/finally reader.releaseLock()` 确保任意退出路径（包括 AbortError）均释放锁 |
| tool_calls 消息格式 | ✅ 正确 | Moonshot `$web_search` 回传 `content: tc.function.arguments`，服务端内部执行搜索，caller 只回传 arguments 即可 |
| 续轮 tools 声明 | ✅ | 每轮续轮请求均包含 `tools: [{ type: 'builtin_function', function: { name: '$web_search' } }]` |
| 首轮降级 | ✅ | tools 初始化失败时 catch → 去掉 tools 重试，保障基本可用性 |
| 续轮失败 | ✅ fail-safe | 续轮 HTTP 不 ok 时 break 退出，已有 content 正常返回给用户 |

### AnswerModal.tsx — 澄清层架构

| 方面 | 评估 | 说明 |
|------|------|------|
| 触发条件准确性 | ✅ 合理 | 关键词检测 + 锚点缺失双重过滤，实际误触发率极低 |
| onboarding 守卫 | ✅ P1 修复完成 | `!isOnboardingMode` 确保引导流程不被打断 |
| clarifyPending 幂等 | ✅ | 二次调用不重复弹出 |
| `sendClarifiedMessage` | ✅ | 提取为 `useCallback`，依赖数组完整，两处调用点代码消除 |
| 布局正确性 | ✅ | `absolute bottom-full` 浮于 InputArea 上方，`z-10` 层级正确 |
| 取消操作 | ✅ | 取消按钮正确清空 `clarifyPending` 和 `clarifyCustom` |

### services/ai.ts + useAI.ts — SSE 扩展

| 方面 | 评估 | 说明 |
|------|------|------|
| 类型兼容 | ✅ | `AIStreamChunk` 新增 `search_round` 类型，向后兼容（`round?` 可选） |
| 回调分发 | ✅ | `onSearchRound` 通过 `callbacksRef` 分发，不引入新的 re-render |

---

## Code Quality

### 亮点

- **readRound 提取**：单函数职责清晰，可独立单元测试
- **try/finally 模式**：P0 修复采用最小改动，不改变任何业务逻辑
- **shouldTriggerClarify 可测试**：触发条件被完整提取为独立逻辑，20 个新单元测试覆盖所有边界

### 潜在改进（非阻塞，留作后续）

| 项 | 优先级 | 建议 |
|---|---|---|
| 澄清层快捷选项硬编码 | P3 | 当前两个选项写死在 JSX，未来可从配置文件读取 |
| `MAX_SEARCH_ROUNDS` 未暴露为配置 | P3 | 默认 5 轮合理，但可考虑从 DB config 读取以支持调整 |
| `search_round` 消息 i18n | P3 | 目前中文硬编码，多语言场景需提取 |

---

## Test Coverage

新增 20 个单元测试，覆盖：

| 测试套件 | 数量 | 覆盖点 |
|---------|------|--------|
| `readRound` 逻辑 | 6 | content 流、tool_call 累积、reader.releaseLock、多 tool_calls、[DONE] 跳过、空 body |
| 澄清层触发规则 | 9 | 关键词、引号/年份/英文锚点、长度>20、onboarding 守卫、重复触发、无关键词、短英文边界 |
| search_round SSE 格式 | 5 | round=2/3/5 消息、MAX_SEARCH_ROUNDS 边界、finishReason 提前退出 |

现有 269 个测试无变动，全部通过。总计 289/289。

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 多轮搜索增加延迟 | 低 | 每轮实际搜索由 Moonshot 服务端执行，网络延迟约 1-3s/轮；前端进度指示器给用户明确反馈 |
| 澄清层误触发 | 极低 | 需同时满足：含调研关键词 + 无引号/年份/英文/长度 ≤20 + 非 onboarding；三重过滤后误触发率极低 |
| reader.releaseLock 在 `res.body = null` 时 | 无 | 已有 `if (!reader) return` 早返回保护 |
| while 循环与 AbortError | 无 | AbortError 在 `fetchCompletionStream` 层抛出，被最外层 catch 捕获并发送 done 事件，循环不会继续 |

---

## 结论

**评级：APPROVED ✅**

三个方向均目标明确、改动最小。P0 资源泄漏修复完整；功能新增（多轮搜索、澄清层）在不破坏现有功能的前提下扩展能力；+20 单元测试显著提升核心逻辑的可信度。TS 零错误，289/289 通过。
