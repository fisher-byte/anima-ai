# Anima 测试手册

## 测试策略

### 1. 单元测试 (Unit Test)

**目标**: 核心业务逻辑覆盖率 > 80%

**已覆盖模块**:
- ✅ `feedback.ts` — 负反馈检测（21 个用例）
- ✅ `profile.ts` — 偏好管理（24 个用例）
- ✅ `prompt.ts` — Prompt 组装（23 个用例）
- ✅ `storageService.ts` — Web 存储服务（21 个用例）
- ✅ `conversationUtils.ts` — 对话工具函数（27 个用例）
  - `compressMemoriesForPrompt`：截断、省略号、多条拼接
  - `parseTurnsFromAssistantMessage`：单轮、多轮、reasoning 提取
  - `stripLeadingNumberHeading`：THINKING 哨兵、#N 前缀、多轮前缀剥离
  - `buildAIHistory`：空消息过滤、用户/AI 交替构建

**运行命令**:
```bash
npm test              # 运行所有测试（CI 模式）
npm run test:watch    # 监听模式（开发时用）
```

---

### 2. 集成测试 (Integration Test)

**目标**: 所有 HTTP API 端点在真实 SQLite（内存模式）下行为正确

**已覆盖模块**:
- ✅ `server.test.ts` — 核心路由集成测试（73 个用例）
  - `GET /api/health`
  - Storage API（GET / PUT / POST append）：文件名白名单、路径遍历防御、JSONL 多次追加
  - Config API（apikey、settings）：GET / PUT / 覆盖写入
  - Conversation History API（GET / PUT / DELETE）：保存/读取/删除、100 条截断、多对话隔离

- ✅ `memory.test.ts` — 记忆路由集成测试（21 个用例）
  - **User Profile CRUD**：新建、GET、merge 更新（interests/tools 数组去重合并）、DELETE 清空
  - **Memory Facts CRUD**：GET 过滤失效条目、单条软删除、批量软删除（DB 行仍保留）
  - **全量清空附带清理**：`DELETE /api/memory/facts` 同时清空 config.preference_rules + 删除 pending tasks（v0.2.24 新增）
  - **Queue API**：任务写入、缺少 type 时 400
  - **Classify / Extract 无 Key 降级**：无 API Key 时返回 fallback 响应
  - **Embedding Index**：DELETE 单条 / 全量

**总测试数**: **210 个用例，7 个测试文件，全部通过**

---

### 3. E2E 测试 (Playwright)

Playwright 已安装（`@playwright/test ^1.58.2`），尚未启用自动化 E2E 套件。
当前 E2E 以**手动核查清单**形式执行：

#### 3.1 启动测试

```bash
npm run dev
```

- [ ] 服务端 3000 端口正常启动
- [ ] 浏览器打开后画布显示提示文案
- [ ] 底部输入框 placeholder 正常

#### 3.2 对话流程测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 点击底部输入框 | 输入框获得焦点 |
| 2 | 输入"你好"后 Enter | 进入全屏回答层 |
| 3 | 等待 AI 回复 | 看到流式输出 |
| 4 | 关闭回答层 | 画布出现节点卡片 |
| 5 | 刷新页面 | 节点依然存在 |

#### 3.3 文件上传测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 点击回形针上传 10MB+ 文件 | 前端拦截，显示错误提示 |
| 2 | 上传合法 PDF | FileBubble 显示文件名 |
| 3 | 断网后上传文件 | FileBubble 显示 ⚠ 图标 + 错误原因 |

#### 3.4 错误体验测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 配置错误 API Key 后发消息 | 错误提示"API Key 无效或已过期" |
| 2 | 设置界面点保存（断网） | 红色"保存失败，请检查网络" |

#### 3.5 负反馈学习测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 发送问题获得回答 | 看到 AI 回复 |
| 2 | 回复"简洁点" | 检测到偏好 |
| 3 | 再次问同类问题 | 灰字偏好提示出现 |

---

### 4. API 连通测试（手动）

```bash
# 健康检查
curl http://localhost:3000/api/health
# 预期：{"status":"ok","timestamp":"..."}

# 配置验证
curl http://localhost:3000/api/config/settings
# 预期：{"model":"kimi-k2.5","baseUrl":"https://api.moonshot.cn/v1"}

# 记忆搜索（需有对话数据）
curl -X POST http://localhost:3000/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query":"编程","topK":3}'
```

---

### 5. 数据存储验证

| 测试项 | 验证方法 |
|--------|---------|
| 节点/对话持久化 | 检查 `./data/anima.db`（Web 模式）或 `~/Library/Application Support/anima/data/anima.db`（Electron） |
| 偏好/配置 | 同上，存于 SQLite `config` / `storage` 表 |
| 记忆事实 | `SELECT * FROM memory_facts WHERE invalid_at IS NULL` |
| 向量索引 | `SELECT count(*) FROM embeddings` |
| 文件上传 | `SELECT id, filename, embed_status FROM uploaded_files` |

---

### 6. UI/UX 测试清单

- [ ] 画布拖拽流畅
- [ ] 节点卡片显示正确
- [ ] 搜索面板正常弹出
- [ ] 侧边栏正常滑出
- [ ] 过渡动画平滑
- [ ] FileBubble 展开/收起正常
- [ ] 输入框文件预览（loading → done / error）
- [ ] 设置弹窗保存成功/失败 toast 均正常显示

---

### 7. 安全测试

- [ ] 文件路径验证阻止非法访问（已有自动化测试覆盖）
- [ ] API Key 不暴露在渲染进程（通过 Network 面板核查）
- [ ] 超时机制正常（AI 流式请求停止后 abort 有效）
- [ ] AUTH_DISABLED 未设置时 API 返回 401（有自动化测试覆盖）

---

## 手动测试报告模板

```markdown
## 测试日期: YYYY-MM-DD
## 测试版本: vX.X.X
## 测试人员: XXX

### 测试结果
- [ ] 启动测试: 通过/失败
- [ ] 对话测试: 通过/失败
- [ ] 文件上传测试: 通过/失败
- [ ] 错误体验测试: 通过/失败
- [ ] 学习测试: 通过/失败
- [ ] 存储测试: 通过/失败

### 自动化测试
npm test → X 个用例，X 个通过，0 失败

### 发现问题
1. 问题描述: xxx
   - 复现步骤: xxx
   - 期望结果: xxx
   - 实际结果: xxx

### 测试结论
[ ] 可以发布
[ ] 需要修复后重测
```
