# Code Review Report — v0.2.48

**Date**: 2026-03-07
**Reviewer**: Claude Code
**Scope**: 连线可解释性 + L3 逻辑边提取 + Bug 修复
**Branch**: main
**Files changed**: 14
**Tests**: 269/269 pass (+6 unit)

---

## Summary

This release delivers the most impactful UX upgrade since node semantic edges were introduced in v0.2.47: users can now understand *why* two nodes are connected, not just *that* they are. Two capabilities land together:

1. **L3 逻辑边提取**：agentWorker 在对话结束后异步执行 `extractLogicalEdges`，用 moonshot-v1-8k 对比当前节点与 top-5 语义邻居，提取 6 种显式逻辑关系（深化/解决/矛盾/依赖/启发/重新思考），存入新的 `logical_edges` 表。
2. **连线可解释性**：Edge.tsx 为每种逻辑关系定义了独立视觉语言（颜色+线型+箭头），点击任意逻辑边弹出 `EdgeInfoPanel`，展示 AI 生成的中文解释和置信度。

此外本 PR 修复了两个持续影响用户体验的 P1 Bug：API Key 无法保存，以及语义/逻辑边 hover/click 无响应。

---

## Architecture Review

### L3 逻辑边提取

| 方面 | 评估 | 说明 |
|------|------|------|
| 设计决策 | ✅ 合理 | fire-and-forget 异步任务，500ms 延迟等待 AI 回复稳定，不阻塞主流程 |
| 数据模型 | ✅ 清晰 | `logical_edges` 表独立于 `memory_facts`，字段语义明确（`relation`, `reason`, `confidence`）|
| 多租户隔离 | ✅ | `conversation_id` 作为分区键，与现有 tenant 架构一致 |
| API 设计 | ✅ | GET/POST 路由职责单一；POST 支持批量写入，减少网络往返 |
| 错误处理 | ✅ 健壮 | AI 提取失败时静默跳过，不影响主节点创建；`confidence` 低于 0.5 的结果丢弃 |
| 幂等性 | ✅ | 重复触发同节点时通过 `_logicalBuildingSet` 防重，与语义边机制对称 |

### 连线可解释性（Edge.tsx）

| 方面 | 评估 | 说明 |
|------|------|------|
| RELATION_STYLES 映射 | ✅ 优秀 | 6 种关系各有独立颜色+虚线组合，视觉语言清晰，无歧义 |
| 交互层分离 | ✅ | 视觉层（细线）和交互层（12px 透明宽 stroke）解耦，彻底解决细线命中问题 |
| LOD 支持 | ✅ | 继承 `useLodScale` hook，缩放 < 0.4 时面板/标签自动隐藏，性能无退化 |
| EdgeInfoPanel | ✅ | 解释面板内容完整（关系类型、置信度、reason、时间戳），UI 简洁不遮挡画布 |
| pointerEvents 修复 | ✅ | `auto` + z-index 层级管理，修复语义边 tooltip 失效问题 |
| 向后兼容 | ✅ | `relation`/`reason`/`confidence` 均为可选，旧 semantic 边不受影响 |

### canvasStore logicalEdges 状态机

| 方面 | 评估 | 说明 |
|------|------|------|
| 与 semanticEdges 对称 | ✅ | `addLogicalEdges`/`clearLogicalEdgesForNode`/`loadLogicalEdges` 与 semantic 边 API 保持一致，降低认知负担 |
| 悬空边防护 | ✅ | `removeNode` 同步清除相关逻辑边；`updateEdges` 过滤无效端点 |
| 持久化 | ✅ | 写入 `logical-edges.json`，重启后恢复，与 `semantic-edges.json` 机制对称 |
| 触发时机 | ✅ | 500ms 延迟（比语义边 300ms 稍长），给 AI 回复写入 DB 留出缓冲时间 |
| 状态组织 | ✅ | `_triggerLogicalEdgeExtraction` 作为模块级函数，在 Zustand store 外定义，避免闭包污染 |

### API Key 保护

| 方面 | 评估 | 说明 |
|------|------|------|
| 服务端守卫 | ✅ | `key.trim() === ''` 短路返回 400，防止空 key 覆盖有效配置 |
| 前端 UX | ✅ | `hasExistingKey` 掩码提示降低用户困惑，不再需要重复粘贴 key |
| 安全性 | ✅ | Key 仅在服务端存储，SettingsModal 从不回传明文给前端（仅返回 `hasKey: boolean`）|

---

## Code Quality

### 亮点

- **完整的视觉语言系统**：`RELATION_STYLES` 建立了一套可扩展的关系类型 → 视觉样式映射，未来新增关系类型只需添加一行配置
- **交互层 / 视觉层分离**：解决了 SVG 细线可点击性这一经典问题，方案通用且干净
- **状态对称性**：`logicalEdges` 与 `semanticEdges` 完全对称，新人阅读代码时认知负担极低
- **防御性编程**：API Key 的空字符串守卫、逻辑边提取的低置信度过滤、`_logicalBuildingSet` 防重——均体现了对边界情况的充分考虑

### 改进建议

1. **逻辑边 TTL**（低优先级）：为 `logical_edges` 增加 `expires_at` 字段，避免大量低置信度旧边长期驻留画布，建议默认 30 天
2. **EdgeInfoPanel 位置自适应**（低优先级）：面板当前固定在边的中点弹出，当边靠近画布边缘时可能被裁剪，可加入视口边界检测
3. **批量提取优化**（中优先级）：当历史节点数量 > 50 时，启动时回算所有节点的逻辑边会产生大量 AI API 调用，建议增加每日调用次数上限或仅对最近 N 个节点回算
4. **关系类型本地化**（低优先级）：`relation` 字段当前存英文枚举（`deepens`, `solves` 等），建议在 `RELATION_STYLES` 中统一管理中文显示名，避免分散在多处

---

## Test Coverage

| 测试类型 | 文件 | 新增 | 通过 |
|----------|------|------|------|
| 单元测试 | `memory.test.ts` | +4 | ✅ |
| 单元测试 | `canvasStore.test.ts` | +2 | ✅ |
| 总计 | — | +6 | 269/269 |

新增测试覆盖：
- `POST /api/memory/logical-edges` 写入后可通过 GET 读回
- `GET /api/memory/logical-edges` 按 `conversationId` 正确隔离
- 空 key PUT 请求返回 400，不覆盖原有 key
- 有效 key 正常保存
- `clearLogicalEdgesForNode` 只清除目标节点相关边，不影响其他边
- `_triggerLogicalEdgeExtraction` 重复调用同节点时只执行一次

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| AI 逻辑边提取 API 调用成本 | 中 | 仅对 top-5 语义邻居提取，每节点最多 1 次 API 调用；`confidence < 0.5` 结果丢弃 |
| `EdgeInfoPanel` 遮挡其他节点 | 低 | 面板 z-index 低于 AnswerModal，点击任意空白处关闭 |
| `logical-edges.json` 体积增长 | 低 | 与 `removeNode` 联动清理；暂无全局上限（建议后续添加） |
| pointerEvents 修改影响其他边类型 | 无 | 只修改语义边和逻辑边；branch/category 边未变动，测试通过确认 |
| API Key 空字符串守卫破坏现有集成 | 无 | 守卫仅拦截真正的空串，正常 key 写入路径不变 |

---

## 结论

**评级：APPROVED ✅**

本次改动完成了产品文档中"让连线从'我不知道为什么'变成'我一眼看懂它们的关系'"的核心目标，技术实现上与现有语义边系统保持高度对称，状态管理清晰，边界情况处理充分。两个 P1 Bug 修复（API Key + 连线交互）显著提升了产品可用性。

测试通过率 100%（269/269），新增 6 个单元测试，建议后续迭代时重点补充 `EdgeInfoPanel` 的视口边界场景测试。
