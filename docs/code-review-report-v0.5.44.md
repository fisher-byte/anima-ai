# Code Review Report — v0.5.44

**范围**：主画布力模拟（`useForceSimulation` / `Canvas` kick）、`OngoingDecisionsSidebar`、i18n。  
**结论**：**可合并 / 可发版**。无鉴权/存储路径变更；力参数为经验调优，可后续按线上反馈微调。

---

## 根因与修复

| 问题 | 处理 |
|------|------|
| 首次加载仅 `startRotation()`，`temp=0` 时布局力不推动位移 | 有记忆节点时与增量一致调用 `kick()` |
| 同类弹簧 + 重心引力导致局部重叠 | 提高斥力、近距软斥力、略降弹簧与 `CENTER_GRAVITY` |
| 进行中决策与 Spaces 视觉粘连 | 独立组件 + 分区间距 + 琥珀主题 |

---

## 风险与注意

- 力常数为启发式，极端节点数下若仍重叠，可再提高 `COMFORT_PUSH` 或 `MIN_COMFORT_DIST`。
- `AnimatePresence` 内包裹 `div` + 两个 `motion.div`，退出动画依赖子项 `key`，行为与 v0.5.43 侧栏一致。

---

## 测试

| 项 | 结果 |
|----|------|
| `npm test` | 631 passed |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | 成功 |
| `npm run test:e2e` | 45 passed / 3 skipped |

---

## 签署

- **建议提交前缀**：`fix: v0.5.44 canvas layout kick + ongoing decisions sidebar`
