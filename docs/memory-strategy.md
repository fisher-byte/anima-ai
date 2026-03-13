# Anima 记忆系统策略文档

*最后更新: 2026-03-13 | 版本: v0.4.5*

本文档整合了记忆系统的架构分析与策略方案，作为 v0.4.x 迭代的路线图基础。

---

## 一、当前记忆 Flow（v0.3.x 基线）

### 记忆写入

```
用户对话结束
  → agentWorker.ts: extract_facts 任务
    → AI 提取 memory_facts（结构化事实）
    → 写入 memory_facts 表（id, fact, source_conv_id, created_at）
    → FTS5 全文索引自动同步（memory_facts_fts）
    → embedding 向量写入 embeddings 表（按 conversation_id）
  → extract_mental_model 任务（10 分钟冷却）
    → AI 更新 user_mental_model（认知框架/长期目标/思维偏好/领域知识/情绪模式）
```

### 记忆读取（每轮对话前）

```
ai.ts POST /stream
  → 层 1: 进化基因（preference_rules）
  → 层 2: 用户画像（user_profile）
  → 层 3: 记忆事实（fetchRelevantFacts）
      → 语义检索: embedding cosine similarity (top-10, threshold 0.2)
      → BM25 fallback: FTS5 全文检索
      → 最终 fallback: 最近 10 条有效事实
  → 层 2.5: 心智模型（user_mental_model）
  → 层 2.7: 逻辑推理边（logical_edges）
  → 层 4: 前端传入的压缩记忆片段
  → CONTEXT_BUDGET: 1500 tokens 总预算
```

### v0.3.2 新增：主动记忆查询

```
AI 判断需要查记忆时
  → function calling: search_memory({ query })
  → 服务端拦截 tool_call
  → 调用 fetchRelevantFacts(db, query, apiKey, baseUrl)
  → 返回相关事实列表
  → AI 使用结果继续回答
```

---

## 二、记忆策略 Preset 设计

通过 `MEMORY_STRATEGY` 环境变量切换策略，便于 A/B 测试。

### Preset: `baseline`（当前默认）

- 纯语义检索 + BM25 fallback
- 所有 facts 等权重注入
- CONTEXT_BUDGET 1500 tokens

### Preset: `scored`（v0.4.x 计划）

- 每条 fact 附带重要性评分（0.0~1.0）和情绪标签
- 注入时按评分排序，高分 facts 优先
- 冷门 facts（低频访问 + 低评分）降权
- 评分存储在 `memory_scores.json` 旁路文件

```json
// memory_scores.json 格式（旁路于 SQLite，避免 schema 变更）
{
  "fact_id_1": { "importance": 0.9, "emotion": "positive", "access_count": 5 },
  "fact_id_2": { "importance": 0.3, "emotion": "neutral",  "access_count": 1 }
}
```

### Preset: `mental_model`（v0.4.x+ 计划）

- 优先注入 user_mental_model（结构化摘要）而非原始 facts
- facts 仅用于 search_memory 主动查询
- 减少 CONTEXT_BUDGET 占用，给对话内容更多空间

---

## 三、记忆评分字段设计

### 字段说明

| 字段 | 类型 | 含义 |
|------|------|------|
| `importance` | float 0~1 | AI 提取时判断的重要性（0.9=核心偏好，0.3=偶然提及） |
| `emotion` | string | `positive`/`negative`/`neutral`/`mixed` |
| `access_count` | int | 被注入上下文的次数（越高越"活跃"） |
| `last_accessed_at` | ISO timestamp | 最后一次被访问时间（用于时间衰减） |

### 旁路方案（`memory_scores.json`）

不修改 SQLite schema，将评分存在 JSON 文件中：

```
data/{userId}/memory_scores.json
```

优点：
- 零 migration 风险
- 可随时清空重算
- 与 fact 的 `invalid_at` 字段解耦

---

## 四、会话级记忆设计（`session_memory.json`）

### 动机

长对话（20+ 轮）时，早期信息会被 token 限制挤出上下文。会话级记忆在对话中途生成摘要，保留关键信息。

### 格式

```json
// data/{userId}/session_memory.json
{
  "conv_id_1": {
    "summary": "用户在讨论 React 性能优化，重点关注 useMemo 的适用场景",
    "key_decisions": ["使用 React.memo 包裹列表项", "避免匿名函数作为 props"],
    "created_at": "2026-03-13T10:00:00Z",
    "turn_count": 15
  }
}
```

### 触发时机

- 对话轮数 >= 10 且无会话摘要时，后台异步生成
- 每 5 轮更新一次（增量追加，不覆盖）

### 注入方式

```typescript
// 在 ai.ts 层 4 之前注入（CONTEXT_BUDGET 之外）
if (sessionMemory?.summary) {
  fullMessages.unshift({
    role: 'system',
    content: `【本次对话摘要】\n${sessionMemory.summary}`
  })
}
```

---

## 五、渐进式遗忘策略

### 动机

随着时间推移，过时的 facts 会干扰 AI 回答（如用户职业变化、过期的目标）。需要自动降权旧记忆。

### 方案

**1. 时间衰减因子**

在 cosine similarity 计算后叠加时间权重：

```typescript
const daysSince = (Date.now() - fact.created_at) / 86400000
const decayFactor = Math.exp(-0.01 * daysSince) // 半衰期 ~69 天
const adjustedScore = cosineSim * decayFactor
```

**2. 访问频率权重**

高频被召回的 facts 维持高权重（表明持续相关）：

```typescript
const accessBonus = Math.min(0.2, fact.access_count * 0.02)
const finalScore = adjustedScore + accessBonus
```

**3. 显式失效**

AI 提取新 facts 时，检测与现有 facts 的矛盾关系，自动设置 `invalid_at`（已有机制，继续沿用）。

---

## 六、实验框架设计

### 环境变量

```bash
MEMORY_STRATEGY=baseline  # baseline | scored | mental_model
MEMORY_DECAY=false         # 是否启用时间衰减
MEMORY_BUDGET=1500         # CONTEXT_BUDGET token 预算（可调）
```

### 切换逻辑（`ai.ts` 层 3 改造）

```typescript
const strategy = process.env.MEMORY_STRATEGY ?? 'baseline'

if (strategy === 'scored') {
  // 读取 memory_scores.json，按评分排序后注入
  relevantFacts = await fetchScoredFacts(db, trimmedText, effectiveApiKey, baseUrl)
} else {
  // 默认 baseline：语义检索 + BM25
  relevantFacts = await fetchRelevantFacts(db, trimmedText, effectiveApiKey, baseUrl)
}
```

---

## 七、v0.4.x 实施优先级

| 优先级 | 功能 | 复杂度 | 预期收益 |
|--------|------|--------|----------|
| P0 | `memory_scores.json` 旁路评分 | 中 | 高（减少噪音 facts） |
| P0 | `MEMORY_STRATEGY` 环境变量 | 低 | 高（A/B 测试基础） |
| P1 | 会话级记忆摘要 | 中 | 高（长对话体验） |
| P1 | 时间衰减因子 | 低 | 中（自动清理过时信息） |
| P2 | mental_model 策略 | 高 | 高（减少 token 占用） |
| P3 | 访问频率权重 | 低 | 中 |

---

## 八、技术债记录

1. **embedding 与 fact 解耦**：当前 embedding 按 `conversation_id` 存储，fact 通过 `source_conv_id` 关联。多条 facts 共享同一 embedding，精度损失约 20%。理想方案是按 fact_id 独立存 embedding（需 schema 变更）。

2. **BM25 查询词处理**：当前 `bm25FallbackFacts` 只做基本分词，未处理停用词、同义词扩展。可引入 jieba 分词提升中文检索质量。

3. **CONTEXT_BUDGET 静态值**：1500 tokens 对长系统提示可能不足。建议改为动态计算（max_tokens - 消息 tokens - safety_margin）。

---

*本文档综合了 memory-flow、记忆策略 Preset、memory_scores、session_memory、渐进遗忘五份设计方案，作为 v0.4.x 迭代的统一参考。*
