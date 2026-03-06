# Code Review Report — v0.2.49

**Date**: 2026-03-07
**Reviewer**: Claude Code
**Scope**: Edge 视觉白色毛玻璃重设计 + 逻辑边去重提取
**Branch**: main
**Files changed**: 2
**Tests**: 269/269 pass (无新增)

---

## Summary

本次 patch 修复两个独立问题：

1. **视觉不一致（P2）**：Edge 点击面板与 hover 标签沿用深黑色背景，与整体白色毛玻璃画布风格不符。重设计后与 NodeCard 视觉语言统一。
2. **逻辑边重复提取（P2）**：`addNode` 每次无条件触发 `_triggerLogicalEdgeExtraction`，即使同一 `conversationId` 已在 SQLite 中有逻辑边记录，仍会发出 AI 请求浪费配额。加入前置 GET 检查后实现"一次提取，永久缓存"。

---

## Architecture Review

### Edge.tsx 视觉重设计

| 方面 | 评估 | 说明 |
|------|------|------|
| 设计一致性 | ✅ 显著改善 | 面板/标签与 NodeCard 共享白底 + 浅描边 + 轻投影的视觉语言，画布整体风格统一 |
| accent 竖条 | ✅ 信息密度提升 | 左侧 3px 竖条比顶部色条更直观传达"这条边属于哪种关系类型" |
| 分数 badge | ✅ 层级更清晰 | 主色 12% 填充背景替代灰色小字，置信度/相似度信息更易读 |
| 宽度自适应 | ✅ | hover label 宽度从固定 52px 改为 `label.length * 13 + 24`，避免长文字截断 |
| IIFE 重构 | ✅ | panelW/panelH 变量移入局部 IIFE 作用域，消除外层未使用变量，代码更整洁 |
| 向后兼容 | ✅ | 仅改视觉，所有逻辑（交互层、LOD、dashArray）未变动 |

### canvasStore.ts 逻辑边去重

| 方面 | 评估 | 说明 |
|------|------|------|
| 策略正确性 | ✅ | `GET /api/memory/logical-edges/:id` 已存在且按 `source_conv OR target_conv` 查询，能准确反映"该节点是否已参与过提取" |
| fail-safe | ✅ | fetch 失败时 catch 静默，继续触发提取，不引入新故障点 |
| 请求时机 | ✅ | 检查在 3000ms 延迟后执行，不增加主流程延迟 |
| 边界情况 | ✅ | `checkData.edges && checkData.edges.length > 0` 双重检查防空值 |
| 幂等性 | ✅ 完整 | 配合现有 `_logicalBuildingSet` 内存防重，形成双层保护（进程内 + 持久化层）|

---

## Code Quality

### 亮点

- **视觉语言系统化**：accent 颜色统一从 `RELATION_STYLES` 取值，新增关系类型自动继承正确颜色，零额外改动
- **最小改动原则**：两处改动均严格局限于问题范围，未引入任何额外功能或重构
- **双层去重**：进程内 `_logicalBuildingSet`（防同进程内并发重复）+ DB 持久化检查（防重启后重复），覆盖所有场景

### 无需改动项（确认）

- `RELATION_STYLES` 映射：无变化
- 交互层 hitbox：无变化
- LOD 逻辑：无变化
- `_triggerLogicalEdgeExtraction` 函数体：无变化

---

## Test Coverage

无新增测试用例。现有 269 个测试覆盖以下相关场景：

- `GET /api/memory/logical-edges/:id` 空结果返回（v0.2.48 已覆盖）
- `clearLogicalEdgesForNode` 正确隔离（v0.2.48 已覆盖）
- `_triggerLogicalEdgeExtraction` 重复调用防重（v0.2.48 已覆盖）

视觉变更（SVG 属性）为纯渲染层改动，不适合单元测试，通过目视验证。

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 白色面板在白色背景上对比度不足 | 低 | `rgba(220,220,235,0.8)` 描边 + `drop-shadow(0 8px 24px rgba(0,0,0,0.10))` 保证与画布区分 |
| GET 检查增加 3s 后的额外网络请求 | 极低 | 本地服务器，延迟 < 5ms；仅在逻辑边为空时继续触发，存在边时直接返回，净效果为节省请求 |
| `conversation.id` 与路由 `:conversationId` 语义对齐 | 无 | 已确认：`addNode` 中 `conversation.id` = 节点的 `conversationId`，与 `GET /api/memory/logical-edges/:id` 路由及 `source_conv`/`target_conv` 字段一致 |

---

## 结论

**评级：APPROVED ✅**

两处改动目标明确、改动最小，无新增复杂度。视觉修复解决了长期存在的风格不一致问题；去重逻辑在不改变任何功能行为的前提下节省了 API 配额。TS 零错误，全部 269 个测试通过。
