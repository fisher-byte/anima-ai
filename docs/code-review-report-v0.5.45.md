# Code Review Report — v0.5.45

**范围**：`decisionDisplay.ts`、`decisionRecords.ts`、`DecisionHubPanel.tsx`、`OngoingDecisionsSidebar.tsx`、`Canvas.tsx`、相关单测；文档与 `.env.example`。  
**结论**：**可合并 / 可发版**。无服务端鉴权逻辑变更；展示层纯函数可单测覆盖，风险可控。

---

## 已处理问题

| 级别 | 问题 | 处理 |
|------|------|------|
| P1 | 列表标题含 `@人名` 长问句，语义不清 | `stripLeadingMentions` + `buildDecisionListTitle`；内部拉丁 slug 型 `decisionType` 回退用户问题 |
| P1 | 决策追踪面板压住底部输入 | 面板 `bottom-44` + `max-h` + 列表区 `min-h-0` 可滚动 |
| P2 | 白底卡片 + 亮蓝徽标与琥珀主风格冲突 | 面板与卡片改为 stone/amber 低对比 |
| P2 | 左侧空间区与底部过挤 | `Canvas` 左侧容器 `bottom-44` |
| P3 | 摘要区重复堆叠整段 recommendation | `buildDecisionPreviewLine` 首行预览 |

---

## 安全与数据

- **鉴权 / 存储**：未改 `auth.ts`、存储 API；仅前端展示与聚合 `title` 字符串。
- **隐私**：标题仍来自已有 `userQuestion` / `recommendationSummary`，未新增上传字段。

---

## 测试分布

| 类型 | 说明 |
|------|------|
| 单元 | `decisionDisplay.test.ts`（4）、`decisionRecords.test.ts`（2）等，合计 **635** |
| 类型 | `tsc --noEmit` 0 错误 |
| E2E | 45 passed / 3 skipped（基线不变） |

---

## 设计观察（非阻塞）

- 若未来模型直接产出「决策主题」字段，可在 `DecisionRecord` 增加 `shortLabel` 并优先于启发式标题。
- `latinMention` / `cjkMention` 对无空格粘连的 `@名` 可能残留，属边界情况，可迭代。

---

## 签署

- **建议提交前缀**：`fix: v0.5.45 decision list titles, hub layout, sidebar polish`
