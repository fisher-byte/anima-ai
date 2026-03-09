# Code Review Report — v0.2.72

**Date**: 2026-03-09
**Reviewer**: Claude Code
**Scope**: "被记住" 体验层 — 画布简化 + 记忆时间感知 + 主动通知 + NodeDetailPanel 重命名
**Branch**: main
**Files changed**: 8
**Tests**: 352/352 unit pass · TS 零错误

---

## Summary

本次迭代围绕 PRD「被记住」三个 Phase 落地，核心目标：让用户感受到"有一个东西在认真地记着他"。
涉及视觉简化（画布去噪）、记忆质量提升（时间感知注入）、主动通知（"我注意到了"）、以及 NodeDetailPanel 完整性修复（重命名 + 摘要）。

---

## 改动文件逐项审查

### 1. `Canvas.tsx` — 画布简化 + 欢迎文案 + 主动通知

#### 连线去色（FR-007）

```typescript
// 旧：9 种分类颜色 CATEGORY_LINE_COLORS
// 新：
const LINE_COLOR = 'rgba(255,255,255,0.15)'
// 同时限制显示数量 .slice(0, 3)，strokeWidth 1，dasharray "4 6"
```

| 审查项 | 结论 |
|--------|------|
| 视觉噪声 | ✅ 去掉 9 色连线后画布更安静，焦点回到节点内容 |
| 性能 | ✅ 限制最多 3 条连线减少 SVG 绘制量 |
| 向后兼容 | ✅ 连线逻辑不变，仅改外观 |

#### 点击画布退出聚焦（Bug Fix）

```typescript
// handleMouseDown 中：
const { focusedCategory, setFocusedCategory } = useCanvasStore.getState()
if (focusedCategory !== null) setFocusedCategory(null)
```

| 审查项 | 结论 |
|--------|------|
| 逻辑正确性 | ✅ 点击画布背景时清除 focusedCategory，交互符合预期 |
| 副作用 | ✅ 仅在有 focusedCategory 时才调用 setter，不触发多余 re-render |

#### 个性化欢迎文案（FR-003）

```typescript
const [welcomeText, setWelcomeText] = useState<string | null>(null)
// useEffect 读取心智模型，生成个性化文案
// 缓存至 sessionStorage，同 session 不重复 fetch
```

| 审查项 | 结论 |
|--------|------|
| 防抖 / 缓存 | ✅ sessionStorage key = `anima_welcome_${今日日期}`，刷新后同日不重复 |
| 降级兜底 | ✅ fetch 失败或无数据时 fallback 为"说点什么吧，我会记住的。" |
| 动画 | ✅ framer-motion 1.2s fade-in，不突兀 |

#### "我注意到了" 主动通知（FR-004）

三个场景，均使用 localStorage 记录 7 天冷却：

| 场景 | 触发条件 | 评估 |
|------|----------|------|
| 深夜陪伴 | 当前 22:00+ 且近 3 次对话也是深夜 | ✅ 需要连续深夜才触发，精准度高 |
| 周一早晨 | 周一 6-11 时 + 近期有关注话题 | ✅ 从心智模型中读近期话题，个性化 |
| 偏好更新 | 近 3 天内有偏好更新 | ✅ 感谢性通知，轻量不打扰 |

**潜在问题**：三个 useEffect 共用 `getRelevantMemories` 等异步 API，若启动时 API 未就绪可能静默失败。当前代码有 `try/catch` 忽略，实际效果是通知不出现（不崩溃），可接受。

---

### 2. `NodeCard.tsx` — 极简化

```typescript
// 左侧 accent 竖条：node.color → rgba(0,0,0,0.08)，宽度 3px → 2px
// 状态圆点：bg-blue-400/20 → bg-gray-300/40
```

| 审查项 | 结论 |
|--------|------|
| 一致性 | ✅ 与 FR-008/009 极简方向一致 |
| 信息损失 | ⚠️ 去掉分类颜色后，NodeCard 本身没有分类颜色区分（但 ClusterLabel 保留颜色，宏观视图可分辨） |

---

### 3. `AmbientBackground.tsx` — 去极光

移除了 `useCanvasStore`、`useMemo` 依赖及分类驱动的 `conic-gradient`，仅保留 0.02 透明度噪声纹理。

| 审查项 | 结论 |
|--------|------|
| 简化效果 | ✅ 背景不再随分类变色，减少视觉干扰 |
| 性能 | ✅ 移除了持续 Framer Motion 动画，减少 GPU 开销 |
| 风险 | ✅ 纯静态噪声，无副作用 |

---

### 4. `constants.ts` — DEFAULT_SYSTEM_PROMPT 记忆关联原则

```
记忆关联原则：
- 当 system prompt 里有【相关记忆片段】时，如果它们与当前问题真的相关，用第一人称自然地提及
- 引用要有时间感：利用记忆片段前的时间标注（如"3周前"）
- 宁缺毋滥：如果相关度不高，不要强行关联
```

| 审查项 | 结论 |
|--------|------|
| 指令明确性 | ✅ 三条原则清晰，正向+反向引导都有 |
| 时间感 | ✅ 明确引导 AI 利用 `[3天前]` 格式标注，与 conversationUtils 改动配套 |
| 副作用 | ✅ 仅追加，不替换现有 prompt 逻辑 |

---

### 5. `conversationUtils.ts` — relativeTime + 时间前缀

```typescript
function relativeTime(dateStr?: string): string {
  // 今天 / 昨天 / N天前 / N周前 / N个月前 / N年前
}
// compressMemoriesForPrompt 每条记忆前缀 [${when}]
```

| 审查项 | 结论 |
|--------|------|
| 边界：undefined | ✅ `if (!dateStr) return ''` 守卫，无前缀 |
| 边界：今天 | ✅ `days === 0` → "今天" |
| 边界：昨天 | ✅ `days === 1` → "昨天" |
| 精度 | ⚠️ 以天为单位，忽略时区，同一天 23:59 和 00:01 都是"今天"（可接受，语义层面无影响） |
| 测试覆盖 | ✅ 新增 7 个测试用例，覆盖今天/昨天/3天/7天/30天/365天/无 createdAt |

---

### 6. `AnswerModal.tsx` — 偏好可见 + 即时反馈

- **Header 偏好预览（FR-005）**：对话框顶部显示 `已记住：{appliedPreferences[0]}`，仅在有偏好且非引导模式时展示
- **反馈触发 Toast（FR-006）**：检测 `FEEDBACK_TRIGGERS`，每次对话最多 2 条 Toast，不骚扰

| 审查项 | 结论 |
|--------|------|
| 频率控制 | ✅ `feedbackToastCountRef.current < 2`，handleClose 时重置 |
| 引导模式守卫 | ✅ `!isOnboardingMode` 保护 |
| 文案 | ✅ "好的，我记住了。" 轻量自然 |

---

### 7. `canvasStore.ts` — renameNode

```typescript
renameNode: async (id: string, newTitle: string) => {
  const { nodes } = get()
  const updatedNodes = nodes.map(n => n.id === id ? { ...n, title: newTitle } : n)
  set({ nodes: updatedNodes })
  await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
},
```

| 审查项 | 结论 |
|--------|------|
| 乐观更新 | ✅ 先 set store，再 write 持久化，UI 即时响应 |
| 持久化 | ✅ 与 removeNode / addNode 方式一致 |
| 边界：空标题 | ✅ NodeDetailPanel 调用方已做 `trimmed && trimmed !== node.title` 守卫 |

---

### 8. `NodeDetailPanel.tsx` — 重命名 UI + 摘要展示

- 重命名：inline 输入框 + Check 确认 + Enter/Esc 键盘支持 + onBlur 自动确认
- 摘要：`node.keywords.join(' · ')` 展示关键词（无独立 summary 字段）

| 审查项 | 结论 |
|--------|------|
| 键盘交互 | ✅ Enter 确认，Esc 取消，onBlur 自动确认，符合直觉 |
| 空标题守卫 | ✅ `trimmed` 验证 + 相同标题不重复写 |
| 摘要方案 | ⚠️ 当前用 keywords 替代 summary，信息密度较低；若后续想展示真正摘要，需在 Node 类型加 `summary?: string` 并在 `addNode` 时写入 conversation.assistantMessage 前 N 句 |
| TypeScript | ✅ 零错误，`node.summary` 引用已移除 |

---

## 已知局限与后续建议

| # | 说明 | 优先级 |
|---|------|--------|
| 1 | NodeCard 去掉分类颜色后，密集画布下节点间区分度降低；可考虑在 hover 态短暂显示分类色 | P2 |
| 2 | `relativeTime` 未导出，只能通过 `compressMemoriesForPrompt` 间接测试；若后续有更多调用方，建议 export | P3 |
| 3 | NodeDetailPanel 摘要用 keywords 代替，语义有限；建议在 `addNode` 时截取 assistantMessage 前 60 字写入 `Node.summary` | P2 |
| 4 | "我注意到了" 通知的 3 个 useEffect 在 Canvas.tsx 中较重，建议抽成独立 hook `useProactiveNotifications` | P3 |

---

## 测试覆盖

| 类型 | 结果 |
|------|------|
| TypeScript | ✅ 零错误 |
| 单元测试 | ✅ 352/352（新增 7 例：relativeTime 时间前缀覆盖 today/yesterday/3d/7d/30d/365d/no-date） |
| 构建 | ✅ |

---

## 结论

改动范围适中（8 文件），方向明确（视觉简化 + 记忆质量 + 主动通知）。核心链路：`relativeTime` → `compressMemoriesForPrompt` → 系统 prompt → AI 自然引用历史 形成完整闭环。NodeDetailPanel 重命名功能补齐了之前只有 UI 没有逻辑的空洞。主要遗留问题是 NodeCard 分类颜色和 NodeDetailPanel 摘要质量，优先级 P2，不影响主流程。
