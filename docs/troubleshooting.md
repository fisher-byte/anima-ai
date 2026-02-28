# EvoCanvas 问题排查指南

## 常见问题速查

### 问题1: AI不回复/一直显示"等待AI回复"

**症状**: 发送问题后，回答层显示"等待AI回复..."但无响应

**排查步骤**:

1. **检查API Key配置**
   ```bash
   cat .env
   # 应该包含 EVOCANVAS_API_KEY 和 EVOCANVAS_API_URL
   ```

2. **验证API连通性**
   ```bash
   curl -X POST https://api.moonshot.cn/v1/chat/completions \
     -H "Authorization: Bearer $EVOCANVAS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model": "moonshot-v1-8k", "messages": [{"role": "user", "content": "测试"}]}'
   ```

3. **检查控制台日志**
   - 打开DevTools (`Cmd+Option+I`)
   - 查看Console是否有错误

4. **常见错误**:
   - `Invalid Authentication` → API Key无效或过期
   - `timeout` → 网络问题或API服务异常
   - `CORS error` → 跨域问题（开发环境正常）

**解决方案**:
- 重新配置有效的API Key
- 检查网络连接
- 重启应用

---

### 问题2: 返回画布没有记录

**症状**: 关闭回答层后，画布没有出现节点卡片

**排查步骤**:

1. **检查数据目录**
   ```bash
   ls ~/Library/Application\ Support/evocanvas/data/
   # 应该有 nodes.json, profile.json, conversations.jsonl
   ```

2. **检查存储权限**
   ```bash
   # 确保目录可写
   touch ~/Library/Application\ Support/evocanvas/data/test.txt
   rm ~/Library/Application\ Support/evocanvas/data/test.txt
   ```

3. **查看主进程日志**
   - 终端是否有报错
   - IPC调用是否成功

**解决方案**:
- 首次运行自动创建目录，若失败手动创建
- 检查磁盘空间
- 重启应用

---

### 问题3: 跳转太突兀

**症状**: 发送消息后突然跳转到回答层，体验不流畅

**当前设计**: MVP版本为简化流程，直接跳转

**改进计划** (v0.1.3):
- [ ] 添加过渡动画
- [ ] 输入框保留发送状态
- [ ] 可选预览模式

**临时方案**:
- 这是已知体验问题
- 将在下个版本优化

---

### 问题4: 应用白屏/无法启动

**症状**: 打开应用显示空白

**排查步骤**:

1. **检查开发服务器**
   ```bash
   # 确保开发服务器在运行
   curl http://localhost:5173/
   ```

2. **重启应用**
   ```bash
   pkill -f "electron-vite"
   pkill -f "EvoCanvas"
   npm run dev
   ```

3. **清除缓存**
   ```bash
   rm -rf ~/Library/Application\ Support/evocanvas/Cache
   ```

---

### 问题5: 搜索无结果

**症状**: 使用搜索功能找不到内容

**排查步骤**:

1. **检查节点是否存在**
   - 查看画布是否有节点
   - 检查 `nodes.json` 是否有内容

2. **检查搜索关键词**
   - 搜索只匹配节点标题和关键词
   - 不支持模糊搜索（待优化）

---

## 诊断工具

### 1. 环境检查脚本

```bash
#!/bin/bash
echo "=== EvoCanvas 环境检查 ==="
echo ""
echo "1. Node.js版本:"
node --version
echo ""
echo "2. npm版本:"
npm --version
echo ""
echo "3. 项目目录:"
pwd
echo ""
echo "4. 数据目录:"
ls -la ~/Library/Application\ Support/evocanvas/data/ 2>/dev/null || echo "不存在"
echo ""
echo "5. .env配置:"
cat .env 2>/dev/null | grep -v KEY | head -5 || echo "不存在"
echo ""
echo "6. 端口占用:"
lsof -i :5173 2>/dev/null | head -3 || echo "5173端口未占用"
echo ""
echo "=== 检查完成 ==="
```

### 2. API测试脚本

```bash
#!/bin/bash
source .env

echo "测试API连通性..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$EVOCANVAS_API_URL/chat/completions" \
  -H "Authorization: Bearer $EVOCANVAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "moonshot-v1-8k", "messages": [{"role": "user", "content": "你好"}], "max_tokens": 50}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ API连接正常"
  echo "响应: $BODY"
else
  echo "❌ API连接失败 (HTTP $HTTP_CODE)"
  echo "响应: $BODY"
fi
```

---

## 反馈问题

如果以上方法无法解决，请提供:

1. 操作系统版本
2. Node.js版本
3. 终端完整错误日志
4. 复现步骤
5. 截图（如有）

反馈渠道:
- GitHub Issues: https://github.com/fisher-byte/Cogniflow/issues

---

*最后更新: 2026-02-28*
