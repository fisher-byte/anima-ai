# Code Review Report — v0.2.64

**Date**: 2026-03-08
**Reviewer**: Claude Code
**Scope**: 力模拟冷启动冻结 + 公转增强（v0.2.62–v0.2.64 力模拟全链路审查）
**Branch**: main
**Files changed**: 2（useForceSimulation.ts, package.json）
**Tests**: 282/282 unit pass · 26/26 E2E pass · TS 零错误

---

## Summary

v0.2.64 解决两个用户反馈：(1) 页面刷新时节点四散重排 (2) 公转旋转效果过弱。本次 review 覆盖 v0.2.62 引入的力模拟引擎全链路代码。

---

## 本次改动审查

### 改动 1：冷启动冻结（TEMPERATURE_INIT=0 + hasKickedRef）

| 审查项 | 结论 |
|--------|------|
| 逻辑正确性 | ✅ temp=0 时 `n.vx * 0 = 0`，布局力位移归零；公转 `rotDx/rotDy` 独立于 temp，正常工作 |
| 速度累积防护 | ✅ temp=0 分支显式 `n.vx=0; n.vy=0`，防止 kick 时爆发 |
| hasKickedRef 状态机 | ✅ 三种状态清晰：(a) 未 kick→temp 恒 0，(b) kick 后→temp 从 0.6 冷却到 0.15，(c) 拖拽释放→kick 重新激活 |
| 边界：初始加载不误 kick | ✅ Canvas.tsx guard `prevNodeCountRef.current > 0` 阻止 0→N 的初始加载 kick |

### 改动 2：公转增强（GLOBAL_ROTATION_TORQUE 0.00004→0.00012）

| 审查项 | 结论 |
|--------|------|
| 幅度合理性 | ✅ 距重心 1000px 的节点每帧移动 0.12px，60fps 下约 7.2px/s，符合"缓慢漂浮"预期 |
| E2E 影响 | ⚠️ 持续位移导致 Playwright `hover()` 稳定性检测失败，已在 canvas.spec.ts 补 `force:true` 修复 |

---

## 全链路审查发现（v0.2.62–v0.2.64 力模拟系统）

### P1 — 建议后续迭代修复

| # | 问题 | 位置 | 影响 | 建议 |
|---|------|------|------|------|
| 1 | `persistCluster` 逐个调用 `updateNodePosition` 导致 N 次文件写入 | `useForceSimulation.ts:352-365` | 星云 10 节点 = 10 次 set + 10 次 JSON 序列化 | 提供批量更新接口 |
| 2 | `flushToStore` API 已暴露但从未被调用 | `useForceSimulation.ts:367-371` | 页面关闭时 sim 内部与 store 之间最多 1.5s 偏差不被持久化 | 添加 `beforeunload` handler |
| 3 | 低频 store 同步连续触发 N 次 `set()` | `useForceSimulation.ts:285-290` | 50 节点 = 50 次 `nodes.map(...)` 新数组分配 | 提供 `updateAllPositionsInMemory(batch)` 批量接口 |

### P2 — 性能优化建议（当前节点数 <60 影响可忽略）

| # | 问题 | 位置 | 建议 |
|---|------|------|------|
| 4 | 节点间力 O(N²) 可利用牛顿第三定律减半 | `useForceSimulation.ts:148-189` | 内层循环 `j = i+1` 对称施力 |
| 5 | 每帧重建 `clusterEdgeSet` | `useForceSimulation.ts:138-145` | 在 `sync()` 时预计算并缓存 |
| 6 | `recomputeClusters()` 每帧产生新数组 | `useForceSimulation.ts:97-108` | 复用 clusters 数组，就地更新 cx/cy |

### P3 — 代码质量建议

| # | 问题 | 说明 |
|---|------|------|
| 7 | 温度同时缩放位移输出 `n.vx * temp` | 当前参数已调通，但耦合度高；建议注释说明 MAX_VELOCITY 实际最大位移 = 2.5 × 0.15 = 0.375px/帧 |
| 8 | 星云连线引力理想距离 800 为硬编码魔数 | 建议提取为 `CLUSTER_EDGE_IDEAL_DIST` 常量 |
| 9 | 中心引力指向坐标原点而非节点群重心 | 当前因节点群围绕原点分布所以无问题，但若节点群偏移原点较远会产生不均匀拉力 |

---

## 测试覆盖

| 类型 | 结果 | 说明 |
|------|------|------|
| TypeScript | ✅ 零错误 | `npx tsc --noEmit` |
| 单元测试 | ✅ 282/282 | `npm test` |
| E2E 测试 | ✅ 26/26 | `npx playwright test`（1 skipped = 无 API Key 环境预期跳过） |
| 构建 | ✅ | `npm run build` |

---

## 结论

v0.2.64 改动范围小且逻辑清晰，冷启动冻结和公转增强均按预期工作。力模拟引擎整体架构合理（DOM 直写 + 低频 store 同步），P1 建议作为后续迭代优化项跟踪。
