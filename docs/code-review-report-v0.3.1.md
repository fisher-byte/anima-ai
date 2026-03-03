# Code Review Report — v0.3.1

**日期**: 2026-03-03
**版本**: v0.3.1（缩放性能彻底修复）
**审查范围**: Canvas.tsx, NodeCard.tsx, Edge.tsx, useLodScale.ts, AmbientBackground.tsx

---

## 总体评价

架构设计正确，性能路径清晰。本次改动解决了长期未能根治的缩放卡顿问题，代码质量较高。

---

## 审查结论

### ✅ 已确认正确的设计

**1. `useCanvasStore.getState()` 在 useCallback 中使用**
- 报告提示"可能导致闭包问题"——实际上这是**刻意设计**
- `getState()` 每次调用都读取最新 store 状态，恰好规避了 useCallback 闭包陈旧值问题
- 对比错误做法：把 `scale` 放进依赖数组，会导致 useCallback 随 scale 变化重建，触发重渲染

**2. `window.addEventListener` 不在 useEffect 清理**
- NodeCard 和 Canvas 的 `handleGlobalMouseUp` 里已有 `window.removeEventListener` 自清理
- 这是标准的"drag-on-demand"模式：mousedown 时注册，mouseup 时注销
- Canvas 是全局单例，生命周期与 App 一致，不存在卸载泄漏

**3. `useLodScale` useEffect 依赖数组为空**
- `thresholds` 是调用方传入的字面量数组（每次渲染产生新引用）
- 若加入依赖数组会导致 subscribe → unsubscribe → subscribe 无限循环
- `// eslint-disable-line` 注释是有意为之，正确

**4. `AmbientBackground` sorted[0] 越界风险**
- 第 11 行 `if (nodes.length === 0) return '#E2E8F0'` 已保护
- `nodes.length > 0` 时 `counts` 对象至少有一个 key，`sorted` 长度 ≥ 1，不会越界

---

## ⚠️ 轻微改善项（不阻塞发布）

**1. `handleClusterDrag` 每次调用遍历全部 nodes**
- 文件: `Canvas.tsx:191-195`
- 当前: `nodes.forEach(n => if (cat) updateNodePosition(...))`
- 影响: 集群拖拽是低频手动操作（非动画循环），当前节点数(<100)下无感知影响
- 建议: 若节点数增长到数百，可预建 `categoryNodeMap` 减少遍历

**2. `viewRef` 类型可更明确**
- 当前 `useRef({ offset: ..., scale: ... })` 依赖推断
- 建议显式标注：`useRef<{ offset: { x: number; y: number }; scale: number }>(...)`
- 不影响运行时行为

---

## 性能架构确认

| 场景 | 实际路径 | React 重渲染 |
|------|---------|-------------|
| 滚轮缩放中 | wheel → pendingDelta → RAF → applyTransform(DOM) | 0次 |
| 缩放停止 300ms 后 | setTimeout → useCanvasStore.setState | useLodScale 仅在跨 bucket 时触发 |
| 节点漂浮动画 | CSS @keyframes (compositor thread) | 0次 |
| 节点高亮变化 | highlightedNodeIds selector → 仅对应节点 | 仅受影响节点 |
| 根容器模糊效果 | CSS transition（isModalOpen 变化时） | 0次（平时） |

---

## 结论

**发布状态：✅ 可以发布**

所有 critical 问题经核查均为误报，代码逻辑正确。
轻微改善项不影响当前稳定性和性能，可在后续版本迭代中处理。
