#!/bin/bash
# 运行前检查脚本

set -e

echo "=== EvoCanvas 启动前检查 ==="
echo ""

# 1. 检查node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  npm install
fi

# 2. 检查.env
if [ ! -f .env ]; then
  echo "❌ .env文件不存在"
  echo "请创建.env文件并配置API Key:"
  echo ""
  echo "EVOCANVAS_API_KEY=your-api-key"
  echo "EVOCANVAS_API_URL=https://api.moonshot.cn/v1"
  echo ""
  exit 1
fi

# 3. 创建数据目录
DATA_DIR="$HOME/Library/Application Support/evocanvas/data"
mkdir -p "$DATA_DIR"
echo "✅ 数据目录: $DATA_DIR"

# 4. 测试API
echo ""
echo "🔍 测试API连通性..."
if ./scripts/test-api.sh; then
  echo ""
  echo "✅ 所有检查通过，可以启动应用"
  echo ""
  echo "启动命令: npm run dev"
else
  echo ""
  echo "⚠️ API测试失败，请检查:"
  echo "   1. API Key是否正确"
  echo "   2. 网络连接是否正常"
  echo "   3. API服务是否可用"
  echo ""
  echo "仍要启动吗? (y/n)"
  read -r response
  if [ "$response" = "y" ]; then
    echo "启动应用..."
    npm run dev
  else
    echo "已取消"
    exit 1
  fi
fi
