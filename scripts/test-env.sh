#!/bin/bash
# 环境检查脚本

echo "=== EvoCanvas 环境检查 ==="
echo ""

echo "1. 系统信息:"
echo "   操作系统: $(uname -s)"
echo "   架构: $(uname -m)"
echo ""

echo "2. Node.js 环境:"
if command -v node &> /dev/null; then
  echo "   Node.js版本: $(node --version)"
  echo "   npm版本: $(npm --version)"
else
  echo "   ❌ Node.js未安装"
fi
echo ""

echo "3. 项目目录:"
if [ -d "node_modules" ]; then
  echo "   ✅ node_modules存在"
else
  echo "   ❌ node_modules不存在，请先运行 npm install"
fi
echo ""

echo "4. .env配置:"
if [ -f .env ]; then
  echo "   ✅ .env文件存在"
  if grep -q "EVOCANVAS_API_KEY=" .env; then
    KEY=$(grep "EVOCANVAS_API_KEY=" .env | cut -d'=' -f2)
    if [ -n "$KEY" ]; then
      echo "   ✅ API Key已配置: ${KEY:0:10}..."
    else
      echo "   ❌ API Key为空"
    fi
  else
    echo "   ❌ API Key未配置"
  fi
  
  if grep -q "EVOCANVAS_API_URL=" .env; then
    URL=$(grep "EVOCANVAS_API_URL=" .env | cut -d'=' -f2)
    echo "   ✅ API URL: $URL"
  else
    echo "   ❌ API URL未配置"
  fi
else
  echo "   ❌ .env文件不存在"
fi
echo ""

echo "5. 数据目录:"
DATA_DIR="$HOME/Library/Application Support/evocanvas/data"
if [ -d "$DATA_DIR" ]; then
  echo "   ✅ 数据目录存在: $DATA_DIR"
  echo "   文件列表:"
  ls -la "$DATA_DIR" | tail -n +2 | while read line; do
    echo "     $line"
  done
else
  echo "   ⚠️ 数据目录不存在(首次运行会自动创建)"
fi
echo ""

echo "6. 端口检查:"
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "   ⚠️ 端口5173已被占用"
else
  echo "   ✅ 端口5173可用"
fi
echo ""

echo "=== 检查完成 ==="
