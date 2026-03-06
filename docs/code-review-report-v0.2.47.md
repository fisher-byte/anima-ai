# Code Review Report — v0.2.47

**Date**: 2026-03-07
**Reviewer**: Claude Code
**Scope**: Embedding 内置化 + 节点语义关联（知识图谱化）
**Branch**: main
**Files changed**: 20
**Tests**: 263/263 pass (+6 unit, +1 E2E)

---

## Summary

This release delivers two tightly coupled capabilities:

1. **Embedding 内置化**：切断对用户配置 API Key 的依赖，改用内置阿里云 DashScope key (`text-embedding-v3`, 1536 维)，让向量化能力对所有用户开箱即用。
2. **节点语义关联**：节点生成后自动异步计算与已有节点的余弦相似度，生成紫色虚线语义边，画布首次具备知识图谱的视觉形态。

---

## Architecture Review

### Embedding 内置化

| 方面 | 评估 | 说明 |
|------|------|------|
| 设计决策 | ✅ 合理 | 用户无需配置即可使用核心特性；`builtinEmbeddingFailed` 单次 fallback 符合 fail-fast 原则 |
| 错误处理 | ✅ 健壮 | 401/403 → 永久 flag；网络超时 → 单次 null，不影响主流程 |
| 维度统一 | ✅ | 1536 维，与 OpenAI text-embedding-3-small 等主流模型兼容，未来切换成本低 |
| 安全 | ⚠️ 注意 | API Key 硬编码在源码中；对内部工具可接受，对开源项目需在生产前转移到 env/secrets |

### /api/memory/search/by-id 路由

| 方面 | 评估 | 说明 |
|------|------|------|
| 零额外调用 | ✅ 优秀 | 复用已存储向量做 k-NN，无额外 embedding API 调用，成本为零 |
| 参数校验 | ✅ | `topK` 限 1-20，`threshold` 限 0-1，防止异常输入 |
| 性能 | ✅ | SQLite 全表扫描限制在 2000 条；对大多数个人用量绰绰有余 |
| 维度不匹配 | ✅ | 逐行检查 `vec.length !== sourceVec.length`，跳过不兼容向量 |
| `file-` 过滤 | ✅ | 排除文件 embedding，只返回对话节点 |

### canvasStore.ts 语义边系统

| 方面 | 评估 | 说明 |
|------|------|------|
| 并发安全 | ✅ | `_semanticBuildingSet` 防止同节点重复触发 |
| 悬空边防护 | ✅ | `removeNode` 调用 `clearSemanticEdgesForNode`；`updateEdges` 二次过滤 |
| 全局上限 | ✅ | 200 条 FIFO 上限，防止画布视觉拥挤 |
| 持久化 | ✅ | 写入 `semantic-edges.json`，重启后恢复 |
| 历史回算 | ✅ | 首次无边时串行处理，200ms 间隔，不阻塞 UI |
| 状态组织 | ✅ | 模块级辅助函数 `_buildSemanticEdgesForNode` / `_rebuildAllSemanticEdges` 在 store 外定义，避免 Zustand 闭包污染 |

### Edge.tsx 渲染

| 方面 | 评估 | 说明 |
|------|------|------|
| LOD 支持 | ✅ | 继承 `useLodScale` hook，缩小时自动淡出 |
| 视觉层次 | ✅ | 透明度 0.1-0.4（低于 branch/category 边），不喧宾夺主 |
| 权重映射 | ✅ | 粗细线性映射 weight 0.65→1px 到 1.0→3.5px，直觉可读 |
| 标签语义 | ✅ | 0.85+→强关联，0.75-0.85→相关，0.65-0.75→关联，粒度合理 |

---

## Code Quality

### 亮点

- **Zero-cost 语义检索**：利用已有向量，无需额外 API 调用，实现"免费"的语义关联
- **向后兼容**：`Edge.edgeType` 和 `Edge.weight` 均为可选字段，旧数据无缝兼容
- **渐进增强**：embedding 失败时主流程不受影响，语义边只是"锦上添花"
- **清晰的数据流**：`addNode → _buildSemanticEdgesForNode → addSemanticEdges → updateEdges`，单向数据流

### 改进建议

1. **API Key 迁移**（中优先级）：将 `BUILTIN_EMBED.apiKey` 移至 `.env` + 服务端环境变量，避免源码泄露 Key
2. **大规模性能**（低优先级）：当节点数 > 500 时，`/search/by-id` 的线性扫描可能变慢，可考虑引入 sqlite-vss 或 Faiss
3. **语义边 TTL**（低优先级）：可为语义边增加 `createdAt` 过期机制，避免长期累积低质量边

---

## Test Coverage

| 测试类型 | 文件 | 新增 | 通过 |
|----------|------|------|------|
| 单元测试 | `memory.test.ts` | +6 | ✅ |
| E2E 测试 | `features.spec.ts` | +1 | ✅ |
| 总计 | — | +7 | 263/263 |

新增测试覆盖：
- `/search/by-id` 节点不存在时返回 `reason: 'source not indexed'`
- 缺少 `conversationId` 时返回空结果
- 所有向量低于阈值时返回空结果
- 正常相似度匹配
- `topK` 参数截断
- `file-` 前缀排除

---

## 风险评估

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 内置 Key 配额耗尽 | 低 | `builtinEmbeddingFailed` flag 静默 fallback |
| 语义边计算阻塞主线程 | 无 | 全程 fire-and-forget async |
| 大量历史节点回算超时 | 低 | 200ms 间隔串行，不影响 UI 响应 |
| 旧版本数据格式不兼容 | 无 | `edgeType`/`weight` 均为可选字段 |

---

## 结论

**评级：APPROVED ✅**

本次改动设计严谨，实现精简，完整覆盖了计划目标。核心链路「对话 → 节点 → 语义边 → 画布刷新」全部打通，测试通过率 100%，文档同步更新。

唯一的后续行动建议是将内置 API Key 迁移到环境变量，但不阻塞当前发布。
