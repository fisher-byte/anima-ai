# Code Review Report — v0.2.65

**Date**: 2026-03-08
**Reviewer**: Claude Code
**Scope**: 初始加载重叠检测 + 自动 kick
**Branch**: main
**Files changed**: 2（Canvas.tsx, package.json）
**Tests**: 282/282 unit pass · 26/26 E2E pass · TS 零错误

---

## Summary

v0.2.65 解决 v0.2.64 冷启动冻结引入的副作用：存储坐标本身有重叠时，布局力被冻结导致节点堆叠无法散开，只有手动拖拽触发 kick 才能恢复正常。

本次修复在初始加载完成后做一次 O(N²) 重叠检测，有重叠则自动 kick，无重叠则保持冻结状态（不重排用户已有布局）。

---

## 改动审查

### Canvas.tsx — 初始加载重叠检测

```typescript
// 新增逻辑（原 effect 只处理 prevNodeCountRef > 0 的情况）
} else if (nodes.length > 0) {
  // 初始加载：检测是否有重叠节点，有则 kick 做初始布局
  const NODE_W = 208, NODE_H = 160
  let hasOverlap = false
  outer: for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) {
        hasOverlap = true; break outer
      }
    }
  }
  if (hasOverlap) forceSim.kick()
}
```

| 审查项 | 结论 |
|--------|------|
| 逻辑正确性 | ✅ 检测条件 `abs(dx) < NODE_W && abs(dy) < NODE_H` 等价于矩形碰撞，保守但准确 |
| 性能影响 | ✅ 仅在初始加载时执行一次，O(N²) 但 N 通常 <100，开销 <1ms |
| 短路优化 | ✅ 使用 labeled `break outer` 找到第一个重叠立即退出双重循环 |
| 边界：0 节点 | ✅ `nodes.length > 0` 守卫，空画布不触发 |
| 边界：1 节点 | ✅ 单节点无 j 循环迭代，不 kick（符合预期） |
| 依赖数组 | ⚠️ `useEffect` 依赖 `[nodes.length, forceSim, nodes]`，`nodes` 引用变化会重新运行 effect；但 `prevNodeCountRef.current = nodes.length` 在 effect 末尾更新，第二次执行时 `nodes.length === prevNodeCountRef.current` 条件不成立，不会重复 kick。逻辑安全。 |

### 副作用分析

- 若用户坐标分散（正常情况）：`hasOverlap=false`，不 kick，维持冷启动冻结
- 若存储坐标重叠（新用户 / 历史数据 / 大量节点堆叠）：自动 kick，布局力推散，用户看到一次自然散开动画
- 散开后坐标写回 store 持久化，下次刷新不会再重叠，不会再 kick

---

## 已知局限

| # | 说明 |
|---|------|
| 1 | 重叠检测用 store 坐标，但 DOM 可能已被 force sim 移动（首帧前）；理论上 DOM 和 store 在初始加载时一致，无实际影响 |
| 2 | `nodes` 加入 effect 依赖导致 `nodes` 引用变化时重新检测；Zustand selector 返回稳定引用，通常无问题，但极端情况下（store replace）可能触发多次检测。可考虑用 `nodesLoaded` flag 单次触发代替，作为后续优化 |

---

## 测试覆盖

| 类型 | 结果 |
|------|------|
| TypeScript | ✅ 零错误 |
| 单元测试 | ✅ 282/282 |
| E2E 测试 | ✅ 26/26 |
| 构建 | ✅ |

---

## 结论

改动范围极小（15 行），逻辑清晰，边界安全。正确解决了冷启动冻结与存储重叠坐标之间的矛盾：**布局好的不动，堆叠的自动散开。**
