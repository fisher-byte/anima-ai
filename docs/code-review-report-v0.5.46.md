# Code Review Report — v0.5.46

**范围**：`OngoingDecisionsDock.tsx`（新）、`Canvas.tsx`（移除侧栏内决策卡片）、删除 `OngoingDecisionsSidebar.tsx`、i18n `ongoingDecisionsDueChip`、公共空间灵思徽标 stone 化。  
**结论**：**可合并**。无服务端/鉴权变更；详情仍在 `DecisionHubPanel`。

---

## 产品与交互

| 点 | 处理 |
|----|------|
| 亮黄与主站不符 | 侧栏大块琥珀移除；Dock 用 stone/白底 |
| 占地过长 | 单行标题 + 一行摘要 + 细条，**固定高度**远小于旧侧栏 |
| 挤压新建空间 | 决策模块**移出**空间 `flex` 堆叠，左下仅空间列 |

---

## 测试

| 项 | 结果 |
|----|------|
| `npm test` | 635 passed |
| `npx tsc --noEmit` | 0 errors |

---

## 签署

- **建议提交前缀**：`fix: v0.5.46 ongoing decisions dock (decouple from spaces sidebar)`
