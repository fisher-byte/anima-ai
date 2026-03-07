# Code Review Report — v0.2.51

**Date**: 2026-03-07
**Reviewer**: Claude Code
**Scope**: 代码质量重构 — 大文件拆分 + AI 友好代码规范
**Branch**: main
**Files changed**: 9（4 新增，5 修改）
**Tests**: 289/289 pass（无新增，无回归）

---

## Summary

本次 patch 是纯代码质量重构，零功能变更。目标：将超过 800 行的文件拆分，建立 AI 友好代码规范。

**拆分结果一览**：

| 原文件 | 原行数 | 拆分后 | 行数分布 |
|--------|--------|--------|---------|
| `server.test.ts` | 1610 | 3 文件 | 629 + 703 + 272 |
| `agentWorker.ts` | 853 | 2 文件 | 234 + 626 |
| `AnswerModal.tsx` | 1339 | 2 文件 | 1112 + 255 |
| `canvasStore.ts` | 1551 | 未拆分 | 架构注释 + [SECTION:] |

---

## 拆分详情

### server.test.ts → 3 文件

**拆分依据**：DB 作用域（每个文件只用一种 DB）+ 功能域

| 文件 | DB | 内容 |
|------|-----|------|
| `server.test.ts` (629行) | `testDb` + `resetDb` | health/storage/config/auth + 对话历史 + API key 守卫 + storage fallback |
| `server-integration.test.ts` (703行) | `memDb` + `fileDb` | memory profile/facts/agent + 文件上传/向量化 + 逻辑边 API |
| `server-ai.test.ts` (272行) | 无 DB（纯逻辑） | readRound 逻辑 + 澄清层触发规则 + search_round SSE 格式 |

**设计决策**：测试按 DB 隔离而非业务功能分组，避免跨 DB 引用产生的作用域污染。

### agentWorker.ts → 2 文件

**拆分依据**：调度与实现分离（Orchestrator-Tasks 模式）

| 文件 | 职责 |
|------|------|
| `agentWorker.ts` (234行) | processTask 调度、tick 循环、cleanOldTasks、startAgentWorker、enqueueTask、bootstrapAllEmbeddings |
| `agentTasks.ts` (626行) | consolidateFacts、extractLogicalEdges、extractProfileFromConversation、extractPreferenceFromFeedback、mergeProfile、splitTextIntoChunks、embedFileContent、maybeDecayPreferences |

`agentTasks.ts` 导出所有 AI 任务函数和对应的 Payload 类型，`agentWorker.ts` 只负责路由和调度。

### AnswerModal.tsx → 2 文件

**拆分依据**：纯 UI 组件（无 canvasStore 依赖，无 hooks 闭包）可独立提取

| 文件 | 内容 |
|------|------|
| `AnswerModal.tsx` (1112行) | 主组件：所有 useState/useRef/useCallback/useEffect + 业务 handler |
| `AnswerModalSubcomponents.tsx` (255行) | UserMessageContent / ReferenceBlockBubble / ClosingAnimation / InputArea + InputAreaProps 接口 |

四个子组件均为无副作用的纯 UI 组件，通过 props 接收回调，无 canvasStore 直接访问。

### canvasStore.ts — 未拆分

**决策理由**：Zustand `create((set, get) => ({...}))` 单闭包模式，所有方法共享 `set`/`get` 引用。若拆分需要引入 slice 模式（`createSlice`），属于架构层改动，风险远超收益。

**替代方案**：
- 新增文件头架构注释，说明为什么是单文件设计
- 添加 `[SECTION:]` 标记（共 7 个分区），AI 或开发者可用关键词快速定位：
  ```
  [SECTION:LOAD]         loadNodes / loadProfile / checkApiKey
  [SECTION:NODE]         addNode / updateNodePosition / removeNode
  [SECTION:EDGE]         updateEdges / addSemanticEdges / addLogicalEdges
  [SECTION:CONVERSATION] startConversation / endConversation / appendConversation
  [SECTION:MEMORY]       getRelevantMemories / compressMemoriesForPrompt
  [SECTION:PREFERENCE]   detectFeedback / addPreference / detectIntent
  [SECTION:ONBOARDING]   openOnboarding / completeOnboarding
  ```

---

## 规范落地

本次拆分同步落地以下编码规范（适用所有后续工作）：

| 规范 | 标准 |
|------|------|
| 文件行数 | < 800 行理想，< 1000 行目标，绝对上限 1500 行 |
| 职责注释 | 每个模块文件头部写清"职责 + 公开接口 + 关键约束" |
| 分区标记 | 大文件用 `[SECTION:XXX]` 分区，便于 AI 和开发者定位 |
| 测试分组 | 按 DB 作用域隔离测试文件，避免跨 DB 污染 |
| 子组件提取 | 纯 UI 子组件（无 store 依赖）提取为独立文件 |

---

## Architecture Review

### 拆分安全性评估

| 拆分 | 耦合风险 | 处理方式 |
|------|---------|---------|
| server.test.ts | 低 — DB 作用域明确 | 按 DB 类型边界划分，各文件无交叉引用 |
| agentWorker.ts | 中 — 需正确导出类型 | agentTasks.ts 完整导出所有 Payload 类型，agentWorker.ts 一次性 import |
| AnswerModal.tsx | 高 — React hooks 顺序不可打乱 | 只提取无 hooks 的纯 UI 组件，主组件 hooks 原封不动 |
| canvasStore.ts | 极高 — Zustand 闭包 | 不拆分，文档化代替拆分 |

### 导入关系图（新增后）

```
agentWorker.ts
  └── imports → agentTasks.ts（全部 AI 任务函数）
  └── imports → db.ts（getAllUserDbs）

AnswerModal.tsx
  └── imports → AnswerModalSubcomponents.tsx（4 个子组件）
  └── imports → conversationUtils.ts（工具函数）

server-integration.test.ts  server-ai.test.ts
  └── (独立，不互相引用)  └── (独立，无 DB）
```

---

## Code Quality

### 亮点

- **Orchestrator-Tasks 模式**：agentWorker.ts 职责清晰，只做调度；agentTasks.ts 只做实现，相互不依赖
- **测试文件可读性大幅提升**：每个测试文件只需理解一种 DB 作用域，减少认知负担
- **AnswerModalSubcomponents.tsx 可复用**：InputArea 等子组件现在可被其他对话相关 UI 复用
- **canvasStore.ts 可导航**：[SECTION:] 标记让 AI 代码生成时不需要全文扫描

### 潜在改进（非阻塞）

| 项 | 优先级 | 建议 |
|---|---|---|
| canvasStore.ts Zustand slice 重构 | P3 | 未来可用 `zustand/middleware` 的 slice 模式拆分，需专项设计 |
| agentTasks.ts 逐步继续拆分 | P3 | 626行仍偏大，`embedFileContent` + `splitTextIntoChunks` 可进一步提取为 `embeddingUtils.ts` |
| AnswerModal.tsx 内 handler 提取 | P3 | `handleFiles`、`doSend`、`sendClarifiedMessage` 等可提取为 custom hook `useAnswerModalHandlers` |

---

## Test Coverage

| 维度 | 结果 |
|------|------|
| 单元测试 | 289/289 通过，无回归 |
| TS 编译 | 零错误 |
| E2E 准备 | e2e/ 目录含 canvas.spec.ts + features.spec.ts（27 个场景），需 dev server 运行时执行 |

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 导入路径错误 | 低 | TS 编译检查；所有路径均通过 `npx tsc --noEmit` 验证 |
| 测试 DB 作用域混用 | 极低 | 每个文件只声明自己需要的 DB，无跨文件 DB 引用 |
| React hooks 顺序 | 无 | 只提取零 hooks 的纯 UI 组件；主组件 hooks 代码未动 |
| canvasStore 未拆分留下技术债 | 中 | 已文档化设计决策，明确 slice 重构路径，不是隐藏债务 |

---

## 结论

**评级：APPROVED ✅**

纯质量改进，零功能回归。拆分策略保守（优先低风险边界），高风险目标（canvasStore）用文档化代替强行拆分。所有新文件均有完整职责注释。建立了文件大小规范和 AI 友好代码规范，为后续迭代提供清晰的参考基准。
