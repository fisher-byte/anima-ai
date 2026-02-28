#!/bin/bash
# API连通性测试脚本

set -e

echo "=== EvoCanvas API 连通测试 ==="
echo ""

# 读取.env
if [ -f .env ]; then
  source .env
else
  echo "❌ .env文件不存在"
  exit 1
fi

# 检查配置
if [ -z "$EVOCANVAS_API_KEY" ]; then
  echo "❌ EVOCANVAS_API_KEY 未配置"
  exit 1
fi

if [ -z "$EVOCANVAS_API_URL" ]; then
  echo "❌ EVOCANVAS_API_URL 未配置"
  exit 1
fi

echo "API URL: $EVOCANVAS_API_URL"
echo "API Key: ${EVOCANVAS_API_KEY:0:10}..."
echo ""

# 测试API
echo "测试API连通性..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$EVOCANVAS_API_URL/chat/completions" \
  -H "Authorization: Bearer $EVOCANVAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "moonshot-v1-8k",
    "messages": [{"role": "user", "content": "你好，这是一个测试"}],
    "max_tokens": 50,
    "temperature": 0.7
  }' 2>&1 || true)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP状态码: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ API连接正常"
  echo "响应预览: $(echo "$BODY" | grep -o '"content":"[^"]*"' | head -1 | cut -d'"' -f4)"
  exit 0
else
  echo "❌ API连接失败"
  echo "错误信息: $BODY"
  exit 1
fi
