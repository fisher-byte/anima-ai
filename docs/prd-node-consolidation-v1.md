# PRD：节点聚合重设计 v1 (Node Consolidation)

**文档状态：** 草稿
**版本：** v1.0
**日期：** 2026-03-09

---

## 1. 产品背景与核心问题

### 1.1 现状

当前每次 `endConversation` 必然调用 `addNode` 生成新节点——100 次对话 = 100 个节点，画布越来越乱。

节点当前字段：

```typescript
interface Node {
  id: string              // = conversationId
  title: string           // 截断自用户消息（max 20字）
  keywords: string[]      // 从 assistantMessage 提取（max 3个）
  date: string
  conversationId: string  // 1:1 映射单条对话
  x: number; y: number
  category?: string       // 固定六类之一
  color?: string
}
```

分类体系固定为 6 个预设类别，通过 `/api/memory/classify`（原型向量 + LLM fallback）赋值：

```
日常生活 | 日常事务 | 学习成长 | 工作事业 | 情感关系 | 思考世界
```

### 1.2 核心痛点

| # | 问题 | 用户感受 |
|---|------|---------|
| P1 | 画布碎片化 | 同一话题反复对话，节点爆炸式增长，视觉噪声远大于信息密度 |
| P2 | 分类过于抽象 | 「学习成长」毫无辨识性，「Python 爬虫学习」才是用户真正认识的话题 |
| P3 | 节点无时间线 | 打开节点只能看一次对话，无法看到同话题随时间的演进积累 |

### 1.3 改造目标

| 维度 | 现在 | 目标 |
|------|------|------|
| 节点增长 | 每次对话必然新增 | 相似对话合并到已有节点，只有新话题才建节点 |
| 节点分类 | 固定6类抽象标签 | 动态语义话题（用户自己的语言） |
| 节点内容 | 单条对话快照 | 多条对话的时间线列表 |

---

## 2. 核心设计思路

### 2.1 话题节点替代对话节点

新对话结束时，先用对话内容查询语义相似度（`/api/memory/search`，传 query text 绕过需要先 index 的问题）：

```
相似度 ≥ 0.75  →  合并入已有节点（追加 conversationId）
相似度 0.65–0.75  →  建新节点 + 语义边连接（相关话题）
相似度 < 0.65  →  建全新独立节点
```

例外：`parentId` 不为空时（用户主动续话），跳过检测，直接合并到父节点。

### 2.2 动态语义话题替代固定六类

不再从固定六类中选一个，改为 LLM 从对话中提炼 1-2 个个人化话题标签（最多 8 个中文字符）：

| 旧分类（抽象） | 新话题（具体） |
|--------------|--------------|
| 工作事业 | 我的创业项目 |
| 学习成长 | Python 爬虫 |
| 情感关系 | 和父母的关系 |
| 学习成长 | 备考英语六级 |

新增 `/api/memory/extract-topic` 接口实现，LLM 失败时 fallback 到六类关键词匹配。

### 2.3 节点内置时间线

- 节点新增 `conversationIds: string[]` 字段（历史所有关联对话 ID）
- NodeCard 显示「N 条对话」角标
- 多对话节点打开时展示时间线视图，每条记录显示日期 + 消息摘要
- 时间线内可展开单条对话，也可发起「续话」

---

## 3. 功能需求

### Phase 1：数据结构扩容（最小破坏性改动）

**FR-001 扩展 Node 数据结构**
- 新增 `conversationIds?: string[]`（所有关联对话 ID）
- 新增 `topicLabel?: string`（语义话题标签，如「Python 学习」）
- 保留 `conversationId`（向后兼容，始终等于 `conversationIds` 最后一项）
- 保留 `category`（过渡期 fallback，Phase 2 后可逐步废弃）
- `loadNodes` 中读时补全：`conversationIds ?? [conversationId]`

**FR-002 NodeCard 对话数角标**
- 底部右侧显示「N 条对话」（仅 `conversationIds.length > 1` 时显示）
- scale < 0.6 时隐藏

### Phase 2：合并逻辑（核心功能）

**FR-003 endConversation 合并检测**

```
endConversation
  ├─ appendConversation（不变）
  ├─ extractTopic → topicLabel
  └─ findMergeTarget（/api/memory/search，query = 对话文本前500字）
       ├─ score ≥ 0.75 → mergeIntoNode（更新已有节点 conversationIds）
       └─ score < 0.75 → addNode（建新节点，带 topicLabel）
```

**FR-004 新增 `/api/memory/extract-topic` 接口**

```
POST /api/memory/extract-topic
Body: { userMessage, assistantMessage }
Response: { topic: string }  // 1-2词，≤8字，具体个人化

Prompt：
  "请用1-2个词（最多8个汉字）总结这段对话的核心话题，
   要求：具体、个人化（如「Python学习」而非「学习成长」）。
   只输出话题词，不要解释。"

降级：LLM 超时（5s）时返回 classify 六类结果
```

**FR-005 新增 `mergeIntoNode` 方法（canvasStore）**

```typescript
mergeIntoNode: async (targetNodeId: string, newConvId: string) => {
  const updatedNodes = nodes.map(n => {
    if (n.id !== targetNodeId) return n
    const existing = n.conversationIds ?? [n.conversationId]
    if (existing.includes(newConvId)) return n
    return {
      ...n,
      conversationId: newConvId,    // 更新为最新
      conversationIds: [...existing, newConvId],
      date: today(),
    }
  })
  set({ nodes: updatedNodes })
  await storageService.write(STORAGE_FILES.NODES, JSON.stringify(updatedNodes, null, 2))
}
```

### Phase 3：时间线视图（交互升级）

**FR-006 NodeTimelinePanel 组件（新建）**

- `conversationIds.length === 1`：沿用 `openModalById`（原逻辑不变）
- `conversationIds.length > 1`：打开 `NodeTimelinePanel`

时间线展示：
- 话题标签（topicLabel）+ 日期范围（最早 → 最新）
- 垂直列表，每条：`[日期] 用户消息摘要（前50字）`
- 点击展开完整对话（复用 AnswerModal 渲染逻辑）
- 顶部「+ 续话」按钮：以当前节点为 parent 发起新对话

**FR-007 canvasStore：新增 `openNodeById`**

```typescript
openNodeById: async (nodeId: string) => {
  const node = nodes.find(n => n.id === nodeId)
  const ids = node.conversationIds ?? [node.conversationId]
  if (ids.length <= 1) return openModalById(node.conversationId)
  set({ timelineNodeId: nodeId, isTimelineOpen: true })
}
```

### Phase 4：话题筛选（体验完善，可选）

**FR-008 话题标签筛选**
- ConversationSidebar 侧栏历史列表按话题节点聚合
- 搜索框下方展示话题标签云（按频次排序）
- 点击标签 → 高亮画布上对应话题所有节点（复用 `setHighlight`）

---

## 4. 技术方案

### 4.1 数据结构变化（`src/shared/types.ts`）

```typescript
export interface Node {
  // === 现有字段（保持不变）===
  id: string
  title: string
  keywords: string[]
  date: string
  conversationId: string      // 向后兼容：等于 conversationIds 最后一项
  parentId?: string
  x: number; y: number
  category?: string           // 逐步废弃，由 topicLabel 替代
  color?: string
  groupId?: string
  nodeType?: 'memory' | 'capability'
  capabilityData?: CapabilityData
  memoryCount?: number
  files?: FileAttachment[]

  // === 新增字段（Phase 1）===
  conversationIds?: string[]  // 所有关联对话 ID（含 conversationId）
  topicLabel?: string         // 语义话题标签
  firstDate?: string          // 最早对话日期（时间线用）
}
```

### 4.2 合并阈值调优

上线后观察以下指标调整阈值（默认 0.75）：

| 信号 | 调整方向 |
|------|---------|
| 用户删除节点增多（误合并） | 提高阈值 → 0.80 |
| 画布节点总数不降低（阈值过高） | 降低阈值 → 0.70 |
| 用户频繁手动拆分节点 | 提高阈值或增加用户确认弹窗 |

### 4.3 向前兼容规则

- `conversationIds` 缺失 → 读时补全为 `[conversationId]`
- `topicLabel` 缺失 → UI 展示时 fallback 为 `category ?? '其他'`
- 旧版代码回滚时：带 `conversationIds` 的节点，旧版只能访问 `conversationId`（最新一条），不丢数据

---

## 5. 数据迁移策略

**原则：零停机，读时补全（lazy migration），不批量回写磁盘。**

`loadNodes` 中加一次 map 补全：

```typescript
nodes = nodes.map(n => ({
  ...n,
  conversationIds: n.conversationIds ?? [n.conversationId],
  topicLabel: n.topicLabel ?? n.category ?? '其他',
}))
```

存量节点的 `topicLabel` 批量 AI 提炼作为可选的 Phase 4 后台任务（遍历无 topicLabel 的节点，调用 extract-topic，写回 nodes.json），避免 Phase 2 上线时 API 调用量激增。

---

## 6. 推进计划

### 里程碑

| Phase | 核心工作 | 关键 AC |
|-------|---------|---------|
| **Phase 1** | 类型扩展 + loadNodes 补全 + NodeCard 角标 | 旧节点不报错，新节点可展示 N 条对话角标 |
| **Phase 2** | extract-topic 接口 + endConversation 合并检测 + mergeIntoNode | 同话题第二次对话不建新节点，合并入已有节点 |
| **Phase 3** | NodeTimelinePanel + openNodeById | 多对话节点打开时显示时间线 |
| **Phase 4** | 侧栏话题聚合 + 存量 topicLabel 补全 | 历史列表按话题分组展示 |

### Phase 1 任务清单

- [ ] `src/shared/types.ts`：Node 接口新增 `conversationIds?`、`topicLabel?`、`firstDate?`
- [ ] `canvasStore.ts`：`loadNodes` 加 map 补全逻辑
- [ ] `NodeCard.tsx`：底部角标（`N 条对话`）
- [ ] 单元测试：补全逻辑 + 角标条件渲染

### Phase 2 任务清单

- [ ] `src/server/routes/memory.ts`：新增 `POST /api/memory/extract-topic`
- [ ] `canvasStore.ts`：新增 `mergeIntoNode` 方法
- [ ] `canvasStore.ts`：`endConversation` 插入 `findMergeTarget` 分支
- [ ] 功能开关：`FEATURE_NODE_CONSOLIDATION`（环境变量），默认关闭，测试完成后打开
- [ ] 集成测试：同话题合并 + 不同话题建新节点

### Phase 3 任务清单

- [ ] 新建 `src/renderer/src/components/NodeTimelinePanel.tsx`
- [ ] `canvasStore.ts`：新增 `timelineNodeId`、`isTimelineOpen` 状态 + `openNodeById` 方法
- [ ] `NodeCard.tsx`：`handleClick` 改为调用 `openNodeById`
- [ ] `NodeTimelinePanel`：时间线列表 + 展开单条对话 + 续话按钮

### Phase 4 任务清单

- [ ] `ConversationSidebar.tsx`：历史列表按话题聚合
- [ ] 话题标签云组件（按频次排序）
- [ ] `canvasStore.ts`：`setFocusedTopic` 按 topicLabel 筛选
- [ ] 存量节点 topicLabel 批量提炼 agent task（可选）

---

## 附录：受影响文件

| 文件 | 改动类型 | Phase |
|------|---------|-------|
| `src/shared/types.ts` | 扩展 Node 接口 | 1 |
| `src/renderer/src/stores/canvasStore.ts` | loadNodes 补全、endConversation 合并、mergeIntoNode、openNodeById | 1–3 |
| `src/renderer/src/components/NodeCard.tsx` | 对话数角标 | 1 |
| `src/renderer/src/components/NodeTimelinePanel.tsx` | 新建 | 3 |
| `src/renderer/src/components/ConversationSidebar.tsx` | 历史列表聚合 | 4 |
| `src/server/routes/memory.ts` | 新增 extract-topic 路由 | 2 |

## 附录：不在本 PRD 范围

- 节点手动合并/拆分 UI
- 跨设备同步
- 话题节点"遗忘"机制（长时间不访问自动归档）
