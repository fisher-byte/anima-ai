# Anima 测试手册

## 测试策略

### 1. 单元测试 (Unit Test)

**目标**: 核心业务逻辑覆盖率 > 80%

**已覆盖模块**:
- ✅ `feedback.ts` - 负反馈检测 (15个用例)
- ✅ `profile.ts` - 偏好管理 (12个用例)
- ✅ `prompt.ts` - Prompt组装 (11个用例)

**运行命令**:
```bash
npm test              # 运行所有测试
npm run test:watch    # 监听模式
```

### 2. 集成测试 (Integration Test)

**目标**: 端到端功能验证

#### 2.1 启动测试

```bash
# 测试步骤
1. 运行 npm run dev
2. 验证窗口正常打开
3. 验证画布显示"画布空空如也..."
4. 验证底部输入框显示"问我任何事"
```

#### 2.2 对话流程测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 点击底部输入框 | 输入框获得焦点 |
| 2 | 输入"你好" | 文字显示在输入框 |
| 3 | 按Enter发送 | 进入全屏回答层 |
| 4 | 等待AI回复 | 看到流式输出 |
| 5 | 关闭回答层 | 画布出现节点卡片 |
| 6 | 刷新应用 | 节点依然存在 |

#### 2.3 负反馈学习测试

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 发送问题获得回答 | 看到AI回复 |
| 2 | 输入反馈"简洁点" | 检测到偏好 |
| 3 | 点击"重新回答" | 获得简洁回复 |
| 4 | 再次问同类问题 | 灰字提示出现 |

### 3. API连通测试

**测试命令**:
```bash
# 测试Kimi API
curl -X POST https://api.moonshot.cn/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshot-v1-8k",
    "messages": [{"role": "user", "content": "测试"}]
  }'
```

**预期响应**:
```json
{
  "id": "chatcmpl-xxx",
  "choices": [{"message": {"content": "回复内容"}}]
}
```

### 4. 数据存储测试

| 测试项 | 验证方法 |
|--------|---------|
| 节点持久化 | 检查 `~/Library/Application Support/anima/data/anima.db` 或 `./data/anima.db`（Web 模式） |
| 偏好/配置 | 同上，存于 SQLite `config` / `storage` 表 |
| 对话与记忆 | 同上，存于 `anima.db` |

### 5. UI/UX测试清单

- [ ] 画布拖拽流畅
- [ ] 节点卡片显示正确
- [ ] 搜索面板正常弹出
- [ ] 侧边栏正常滑出
- [ ] 过渡动画平滑
- [ ] 响应式布局正确

### 6. 安全测试

- [ ] 文件路径验证阻止非法访问
- [ ] API Key不暴露在渲染进程
- [ ] 超时机制正常工作

## 自动化测试计划

### 待实现 (v0.1.3)

- [ ] Store集成测试
- [ ] 组件UI测试 (React Testing Library)
- [ ] E2E测试 (Playwright)

## 手动测试报告模板

```markdown
## 测试日期: YYYY-MM-DD
## 测试版本: vX.X.X
## 测试人员: XXX

### 测试结果
- [ ] 启动测试: 通过/失败
- [ ] 对话测试: 通过/失败
- [ ] 学习测试: 通过/失败
- [ ] 存储测试: 通过/失败

### 发现问题
1. 问题描述: xxx
   - 复现步骤: xxx
   - 期望结果: xxx
   - 实际结果: xxx

### 测试结论
[ ] 可以发布
[ ] 需要修复后重测
```
