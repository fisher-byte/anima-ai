# Anima 开发笔记

*最后更新: 2026-03-07 | 版本: v0.2.50*

这里记录架构决策、踩坑经历和性能优化心得，供后续维护参考。

---

## 架构决策

### 为什么 Web-first（Hono + SQLite），而不是纯 Electron？

Electron 模式仍保留但已降级为可选桌面打包方式。主要考量：

1. **部署灵活**: Web 模式可直接部署到 VPS，多设备访问；Electron 限定单机
2. **API Key 安全**: 服务端持有 API Key，不暴露给浏览器；Electron 模式 Key 在客户端
3. **多租户支持**: Web 模式天然支持多用户（每个 token 一个数据库）
4. **运维简单**: PM2 + Nginx 比 Electron 更易监控和重启

两种模式共享同一套代码：`storageService.ts` 自动检测 `window.electronAPI` 切换实现。

### 为什么 SQLite 而不是文件系统（JSON/JSONL）？

当前是**混合模式**：

- `nodes.json` / `conversations.jsonl` / `profile.json` 依然存在 SQLite 的 `storage` 表里（以文件名为 key 的 JSON blob）
- 向量索引、记忆事实、用户画像、任务队列等结构化数据用专门的表

这个混合方案保证了前端无需改动（依然通过 storageService 读写"文件名"）的前提下，获得了 SQLite 的原子写入、多租户隔离、WAL 高并发等优势。

### 为什么用置信度系统而非布尔值记录偏好？

偏好不是永恒的：

- 用户多次强调 → 高置信度（更频繁应用）
- 很久以前提过一次 → 低置信度（保留但降权）
- 只应用置信度 > 0.5 的规则

这让 AI "记忆"更自然，不是机械的开关，而是有权重的倾向。

### agentWorker 为什么要独立运行，不在请求链路里做？

对话结束后需要做的事很多：画像提取、偏好分析、向量化、记忆整理。这些任务：

- 用小模型（moonshot-v1-8k）就够，不需要阻塞用户等主模型
- 可以失败重试，不影响主流程
- 每 30s 批处理，而不是每次对话都立即执行

所以用 `agent_tasks` 表作为任务队列，`agentWorker` 异步消费。

**重要**: `enqueueTask(db, type, payload)` 中的 `db` 参数必传，确保任务写入正确的用户数据库（多租户修复 v0.2.43）。

---

## 踩坑记录

### 1. 流式响应的字符处理

**问题**: fetch 返回的 SSE chunks 可能包含不完整的 UTF-8 字符，或一个 chunk 包含多行 SSE 数据。

**解决**: `TextDecoder` stream 模式 + 手动按行解析 SSE：

```typescript
const decoder = new TextDecoder()
let buffer = ''
for await (const chunk of reader) {
  buffer += decoder.decode(chunk, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (line.startsWith('data: ')) { /* 处理 */ }
  }
}
```

### 2. Canvas 拖拽与点击的竞态

**问题**: 单击节点有时触发拖拽，拖拽后节点倾斜或第二次才正确。

**解决**: 引入位移阈值（mousedown 到 mouseup 位移 < 5px 判定为点击），同时拖拽监听挂在 `window` 而非节点本身，避免事件冒泡干扰。

### 3. Zoom 期间全量重渲染

**问题**: 用 React state 存 scale/offset，每次滚轮触发 setState，整棵组件树重渲染，帧率惨不忍睹。

**解决**: 参见 [架构文档 - 画布渲染性能架构](./architecture.md#画布渲染性能架构)。核心：scale/offset 存 ref，直接操作 DOM transform，300ms debounce 后才写 React state。

### 4. 多租户 agentWorker 静默失效（v0.2.43 修复）

**问题**: `agentWorker.ts` 通过 `import { db } from './db'` 使用全局默认数据库。在多租户场景下，每个用户的 `agent_tasks` 在自己的数据库里，但 Worker 只读默认库，导致其他用户的后台任务全部静默失效。

**解决**:
- `db.ts` 新增 `getAllUserDbs()`，扫描 `data/` 目录下 12 位 hex userId 子目录
- `tick()` 遍历所有用户 db
- 所有工作函数接收 `db` 参数
- `enqueueTask` 签名变为 `enqueueTask(db, type, payload)`

### 5. onboarding 跨账号状态污染

**问题**: 同一浏览器切换账号时，上一个账号的 `localStorage.evo_onboarding_v3=done` 会让新账号跳过引导。

**解决**: 双重验证——`localStorage` 标记 **AND** 服务端节点数据同时存在才判定已完成。二者不一致时自动清除本地标记。

### 6. Kimi 2.5 的 reasoning_content 要求

**问题**: 联网搜索工具调用返回结果后，第二轮请求必须在 `assistant` 消息里携带非空的 `reasoning_content`，否则 API 报 400。

**解决**: 第一轮响应里解析出 `reasoning_content`；第二轮构建 history 时自动填入，如果为空则填充占位符 `"..."`。

### 7. embedding 403 导致每次请求等待超时（v0.2.42 修复）

**问题**: Moonshot embedding API 对部分 key 未开通，每次请求都等 5-10s 超时才降级到关键词搜索，严重拖慢响应。

**解决**: 首次收到 403 后将 apiKey 加入内存黑名单（`embeddingDisabledKeys: Set<string>`），后续请求直接跳过，零等待。服务重启后自动清空缓存（下次重新尝试一次即可）。

### 8. ReadableStream reader.releaseLock 资源泄漏（v0.2.50 修复）

**问题**: `readRound()` 在正常路径返回时正确 releaseLock，但如果 `sendEvent` 内部抛出异常或请求被 abort，reader 永远不会释放，导致 Response.body 锁死，后续无法再 getReader。

**解决**: 用 `try { ... } finally { reader.releaseLock() }` 包裹整个读取循环，确保任意退出路径（正常/异常/abort）均执行 releaseLock。

### 9. 多轮 web_search 续轮请求必须携带 tools 声明（v0.2.50）

**问题**: 首轮请求带 `tools`，Moonshot 返回 `finish_reason: 'tool_calls'`，续轮请求如果不带 `tools`，模型无法继续调用 `$web_search`，表现为第二轮直接返回 stop 但结果不完整。

**解决**: 每次续轮请求（`nextBody`）都显式声明 `tools: [{ type: 'builtin_function', function: { name: '$web_search' } }]`。

---

## 性能优化

### 1. 节点位置轻量更新

拖拽中只更新内存里的 `nodes` 数组（不 trigger edge 重算、不写磁盘）。拖拽结束后才写一次 SQLite。

### 2. 聚类布局预计算

`loadNodes` 时一次性计算所有节点的聚类分组和 `depth` 值，存入 Map，渲染时直接读取，不在每个 NodeCard 组件里各自 O(n) 查找。

### 3. Agent 任务批处理

每次 tick 最多处理 5 个任务（`LIMIT 5`），避免同时大量 API 调用。任务顺序按 id ASC（先入先出）。

### 4. 文件 embedding 分块重叠

`splitTextIntoChunks` 保留 10% 重叠（overlap=80 chars），维持块间语义连续性，提升检索召回率。

---

## 调试技巧

### 查看后端数据

```bash
# 连接 SQLite
sqlite3 data/{userId}/anima.db

# 查看节点数据
SELECT json_extract(content, '$.length') FROM storage WHERE filename='nodes.json';

# 查看偏好规则
SELECT value FROM config WHERE key='preference_rules';

# 查看记忆事实
SELECT fact, created_at FROM memory_facts WHERE invalid_at IS NULL ORDER BY created_at DESC;

# 查看后台任务状态
SELECT type, status, retries, created_at, error FROM agent_tasks ORDER BY id DESC LIMIT 20;

# 查看用户画像
SELECT occupation, interests, tools FROM user_profile WHERE id=1;
```

### 查看实时日志（生产环境）

```bash
pm2 logs evocanvas --lines 50 --follow
```

### 手动触发 Agent 任务

```bash
curl -X POST http://localhost:3000/api/memory/consolidate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 前端调试

开发模式按 `F12`，Network 面板中过滤 `/api` 查看所有后端请求。SSE 流可在 EventStream 标签页实时查看。

---

## 未来想法

### 值得做的方向

1. **结构化用户模型**（v0.3.0）：将碎片 memory_facts 升级为有层次的 User Mental Model（认知框架 / 长期目标 / 领域知识图）
2. **主动记忆触发**：AI 在对话结束后主动判断"这次对话是否更新了我对用户的理解"
3. **Canvas 节点虚拟化**：超过 100 个节点时只渲染视口内节点，解决大画布性能问题
4. **时间轴视图**：X 轴时间、Y 轴话题，帮助用户看到"我最近在想什么"
5. **多模型路由**：简单问答走小模型，复杂推理走大模型；隐私内容走本地 Ollama

### 有意克制不做的功能

- 社交分享 / 多人实时协作（破坏本地优先的信任感）
- 广告或推荐系统
- 复杂权限管理（RBAC 等）
- 内置浏览器

---

## 开发者心得

> "最好的功能是不存在的功能。"

- 砍掉一切不直接服务于"默契感"的功能
- 简单规则系统（偏好触发词）比复杂 NLP 更可控、更可预期
- 本地存储比云端同步更能建立信任感
- 一行灰字提示比任何解释 UI 都更优雅
