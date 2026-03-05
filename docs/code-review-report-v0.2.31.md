# Anima 代码审查报告 v0.2.31

**审查日期**: 2026-03-05
**审查范围**: v0.2.31 新增/改动文件（7 个）
**审查人**: Claude Code Internal

---

## 审查摘要

**总体评估**: ✅ **APPROVE**

本次变更引入 API Key 引导流和 GlobalUI 交互组件系统，代码质量良好，无 P0/P1 级问题。Code Review 发现 2 处 P2 问题并已在本次提交前修复。

---

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/server/routes/ai.ts` | 修改 | 引导模式 ONBOARDING_API_KEY fallback |
| `.env` | 修改 | 新增占位行 |
| `src/renderer/src/components/GlobalUI.tsx` | 新增 | Toast + ConfirmDialog 全局系统 |
| `src/renderer/src/App.tsx` | 修改 | 挂载 GlobalUI |
| `src/renderer/src/components/NodeCard.tsx` | 修改 | 删除按钮放大 + Web confirm |
| `src/renderer/src/components/ConversationSidebar.tsx` | 修改 | 替换 2 处原生 confirm |
| `src/renderer/src/components/InputBox.tsx` | 修改 | API Key 提示 + 内联配置流 |
| `src/renderer/src/stores/canvasStore.ts` | 修改 | hasApiKey state + checkApiKey action |
| `src/server/__tests__/ai-onboarding.test.ts` | 新增 | 6 个集成测试 |
| `e2e/canvas.spec.ts` | 修改 | 新增 2 个 E2E 测试 |

---

## 详细发现

### P0 - Critical（无）

未发现严重安全漏洞或数据丢失风险。

### P1 - High（无）

### P2 - Medium（2 项，已修复）

#### 1. toastAPI 对象每次渲染重建（已修复）

**文件**: `src/renderer/src/components/GlobalUI.tsx`

**问题**: 原始实现中 `toastAPI` 对象字面量在每次渲染时重新创建，导致所有通过 `useToast()` 消费该 context 的子组件不必要地重渲染。

**修复**: 用 `useMemo(() => ({ ... }), [addToast])` 稳定对象引用，仅当 `addToast` 变化时重建（而 `addToast` 本身是 `useCallback([], [])` 稳定的，故实际上永不重建）。

#### 2. setTimeout 未在组件卸载时清理（已修复）

**文件**: `src/renderer/src/components/GlobalUI.tsx`

**问题**: 原始 `addToast` 内的 `setTimeout` 在组件卸载后仍可触发 `setToasts`，虽然 React 18 已不产生 warning，但属于资源泄漏。

**修复**: 引入 `timerRefs = useRef<Set<...>>()` 追踪所有 timer id，`useEffect` 返回清理函数在卸载时 `forEach(clearTimeout)`。

### P3 - Low（2 项，已知，暂不修复）

#### 1. needsApiKey 依赖 localStorage 同步读取

**文件**: `src/renderer/src/components/InputBox.tsx:58`

**说明**: `onboardingDone` 使用 `localStorage.getItem(...)` 同步读取，在 SSR/Worker 环境下会抛出异常。项目当前为纯浏览器环境，已有 `typeof localStorage !== 'undefined'` 保护，风险可控。后续若引入 SSR 需注意。

#### 2. ConfirmDialog 不支持 Escape 键关闭

**文件**: `src/renderer/src/components/GlobalUI.tsx`

**说明**: 当前 confirm dialog 点击蒙层或关闭按钮可取消，但未监听 `keydown Escape`。不影响核心功能，后续可作为 UX 优化补充。

---

## 安全审查

| 检查项 | 结果 |
|--------|------|
| ONBOARDING_API_KEY 是否泄露到前端 | ✅ 安全：仅在服务端 `src/server/routes/ai.ts` 读取 `process.env`，不暴露到客户端 |
| API Key 内联输入是否有注入风险 | ✅ 安全：key 通过 `configService.setApiKey()` PUT 到后端，不拼接到 SQL/HTML |
| confirm dialog 是否可被 XSS 滥用 | ✅ 安全：title/message 通过 React JSX 渲染，自动 escape |

---

## 测试覆盖

| 类型 | 新增 | 总计 |
|------|------|------|
| 单元/集成测试（Vitest） | +6 | 216 |
| E2E 测试（Playwright） | +2 | 10 |
| TypeScript 编译错误 | 0 | 0 |
