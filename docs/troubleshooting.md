# Anima 问题排查指南

*最后更新: 2026-03-06 | 版本: v0.2.44*

---

## 常见问题速查

### 问题1: AI不回复 / 一直显示"等待AI回复" / API error: 400

**症状**: 发送问题后，回答层显示"等待AI回复..."但无响应，或顶部提示 "API error: 400"。

**排查步骤**:

1. **检查 API Key 是否已配置**
   ```bash
   # 查询该用户数据库中的 apiKey
   sqlite3 data/{userId}/anima.db "SELECT value FROM config WHERE key='apiKey'"
   ```
   若为空，打开 UI → 右上角设置 → 填写 API Key → 保存。

2. **检查 Kimi 2.5 模型配置**（针对最新模型）
   - **Temperature**: 必须设置为 `1.0`。Moonshot API 对 Kimi 2.5 有硬性校验。
   - **Reasoning Content**: 联网搜索工具调用时，第二轮请求必须携带非空的 `reasoning_content`。系统已自动填充占位符，若仍报错请检查 `routes/ai.ts` 逻辑。

3. **验证 API 连通性**
   ```bash
   curl -X POST https://api.moonshot.cn/v1/chat/completions \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model": "kimi-k2.5", "messages": [{"role": "user", "content": "测试"}], "temperature": 1.0}'
   ```

4. **检查服务端日志**
   ```bash
   # 开发环境
   npm run dev:server

   # 生产环境
   pm2 logs evocanvas --lines 50
   ```

5. **常见错误码**:
   - `Invalid Authentication` → API Key 无效或过期，重新配置
   - `400 Bad Request` → Kimi 2.5 temperature 不为 1.0，或 reasoning_content 为空
   - `timeout` → 网络问题或 API 服务异常，检查网络
   - `401 Unauthorized` → Bearer token 未配置或错误

**生产环境补充（v0.2.44）**：若出现「重新进入对话后报错」「一直思考无内容」「简单问句很慢」「联网时网络连接中断」或控制台 `profile.json` 404，多为接口与前端状态不一致或流式/联网降级问题，已在该版本修复。详见项目根目录《0306生产环境问答修复与总结.md》。

---

### 问题2: 画布没有节点 / 数据丢失

**症状**: 关闭回答层后，画布没有出现节点卡片；或刷新后数据消失。

**排查步骤**:

1. **确认数据目录存在**
   ```bash
   ls data/
   # 应有 12 位 hex 子目录，如 a1b2c3d4e5f6/

   ls data/{userId}/
   # 应有 anima.db
   ```

2. **查看节点数据**
   ```bash
   sqlite3 data/{userId}/anima.db \
     "SELECT json_extract(content, '$.length') FROM storage WHERE filename='nodes.json'"
   ```

3. **检查磁盘空间**
   ```bash
   df -h
   ```

4. **检查写入权限**
   ```bash
   touch data/test.txt && rm data/test.txt
   ```

**解决方案**:
- 确认 `DATA_DIR` 环境变量指向正确目录
- 确保目录可写
- 检查磁盘空间是否充足

---

### 问题3: 后台任务不执行（记忆/画像不更新）

**症状**: 偏好规则没有被学习；用户画像长时间不更新；文件向量化没有进行。

**排查步骤**:

1. **查看后台任务状态**
   ```bash
   sqlite3 data/{userId}/anima.db \
     "SELECT type, status, retries, error, created_at FROM agent_tasks ORDER BY id DESC LIMIT 20"
   ```

2. **常见状态说明**:
   - `pending` — 等待处理（正常）
   - `running` — 正在处理（若长期 running 说明服务重启后未恢复，重启服务自动修复）
   - `failed` — 失败（查看 `error` 字段了解原因）

3. **检查 API Key 是否配置**（后台任务也需要 API Key）
   ```bash
   sqlite3 data/{userId}/anima.db "SELECT value FROM config WHERE key='apiKey'"
   ```

4. **手动触发任务处理**
   ```bash
   curl -X POST http://localhost:3000/api/memory/consolidate \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

5. **查看 agentWorker 日志**
   ```bash
   pm2 logs evocanvas --lines 100 | grep agentWorker
   ```

**解决方案**:
- 重启服务（会自动将 `running` 状态重置为 `pending` 并重试）
- 检查 API Key 是否有效（后台任务使用 moonshot-v1-8k 小模型）

---

### 问题4: 应用白屏 / 无法启动

**症状**: 浏览器显示空白或连接拒绝。

**排查步骤**:

1. **检查服务是否在运行**
   ```bash
   # 开发环境
   curl http://localhost:3000/api/health
   curl http://localhost:5173/

   # 生产环境
   pm2 list
   pm2 logs evocanvas --lines 20
   ```

2. **检查端口占用**
   ```bash
   lsof -i :3000
   lsof -i :5173
   ```

3. **重启服务**
   ```bash
   # 开发
   npm run dev

   # 生产
   pm2 restart evocanvas
   ```

4. **检查 Node.js 版本**
   ```bash
   node --version  # 需要 20+
   ```

---

### 问题5: 搜索无结果

**症状**: 使用搜索功能找不到内容。

**排查步骤**:

1. 确认画布上有节点（向量索引依赖已有对话数据）
2. 搜索支持语义匹配（向量相似度）和关键词回退，两者均无结果说明数据本身没有相关内容
3. 检查 embedding 状态：
   ```bash
   sqlite3 data/{userId}/anima.db "SELECT count(*) FROM embeddings"
   ```
   若为 0，对话完成后的向量化任务可能失败了，参见「问题3」排查后台任务。

---

### 问题6: onboarding 引导重复出现 / 跳过

**症状**: 已完成引导的账号再次登录仍显示引导；或切换账号后新账号跳过了引导。

**原因**: onboarding 状态通过双重验证——`localStorage` 标记 **AND** 服务端节点数据同时存在才判定已完成。

**排查步骤**:

1. 检查 localStorage：浏览器 DevTools → Application → Local Storage → `evo_onboarding_v3`
2. 检查服务端节点是否存在 onboarding 节点：
   ```bash
   sqlite3 data/{userId}/anima.db \
     "SELECT json_extract(content, '$.length') FROM storage WHERE filename='nodes.json'"
   ```

**解决方案**:
- 若 localStorage 有标记但服务端无节点：清除 `evo_onboarding_v3` 后刷新（系统会自动做这件事）
- 若切换账号后跳过引导：清除浏览器 localStorage 中的 `evo_onboarding_v3`

---

## 诊断工具

### 环境检查

```bash
#!/bin/bash
echo "=== Anima 环境检查 ==="
echo "Node.js 版本: $(node --version)"
echo "npm 版本: $(npm --version)"
echo ""
echo "=== 服务状态 ==="
curl -s http://localhost:3000/api/health && echo "" || echo "后端未启动"
echo ""
echo "=== 数据目录 ==="
ls data/ 2>/dev/null || echo "data/ 目录不存在"
echo ""
echo "=== 端口占用 ==="
lsof -i :3000 2>/dev/null | head -3 || echo "3000 端口未占用"
lsof -i :5173 2>/dev/null | head -3 || echo "5173 端口未占用"
echo "=== 检查完成 ==="
```

### API 连通性测试

```bash
#!/bin/bash
TOKEN="your-token"
BASE_URL="http://localhost:3000"

echo "测试服务健康..."
curl -s "$BASE_URL/api/health"

echo -e "\n\n测试鉴权..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/config/settings")
echo "Config API 状态码: $HTTP_CODE"
```

---

## 反馈问题

如果以上方法无法解决，请提供：

1. 操作系统版本
2. Node.js 版本（`node --version`）
3. 完整的服务端日志（`pm2 logs evocanvas --lines 100`）
4. 复现步骤
5. 截图（如有）

反馈渠道：
- GitHub Issues: https://github.com/fisher-byte/anima-ai/issues
