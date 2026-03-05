#!/bin/bash
# deploy.sh — Evocanvas 一键部署到生产服务器
# 用法：bash docs/scripts/deploy.sh
# 需要 sshpass（brew install sshpass）或手动输入密码

set -e

SERVER="root@101.32.215.209"
REMOTE_DIR="/opt/evocanvas"
TMP_TAR="/tmp/evocanvas-deploy.tar.gz"

echo "=== [1/5] 本地构建前端 ==="
npm run build

echo "=== [2/5] 打包项目 ==="
tar --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='test-results' \
    --exclude='*.tar.gz' \
    -czf "$TMP_TAR" .
echo "包大小: $(du -sh $TMP_TAR | cut -f1)"

echo "=== [3/5] 上传到服务器 ==="
scp -o StrictHostKeyChecking=no "$TMP_TAR" "${SERVER}:/opt/"

echo "=== [4/5] 远程解压 + 安装依赖 + 重启 ==="
ssh -o StrictHostKeyChecking=no "$SERVER" << 'REMOTE'
set -e
cd /opt/evocanvas
echo "  → 解压..."
tar -xzf /opt/evocanvas-deploy.tar.gz
rm /opt/evocanvas-deploy.tar.gz
echo "  → 安装依赖..."
npm install --omit=dev --silent
echo "  → 重启 PM2..."
pm2 restart evocanvas
sleep 3
pm2 list
REMOTE

echo "=== [5/5] 验证服务 ==="
sleep 2
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://101.32.215.209:8080/ 2>/dev/null || echo "无法访问")
echo "HTTP 状态: $STATUS"

if [ "$STATUS" = "200" ]; then
  echo "✓ 部署成功！访问: http://101.32.215.209:8080"
else
  echo "⚠ 服务可能需要几秒启动，请手动检查: pm2 logs evocanvas"
fi

rm -f "$TMP_TAR"
