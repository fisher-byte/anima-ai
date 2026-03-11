#!/bin/bash
# deploy.sh — Anima/Evocanvas 一键部署到生产服务器
# 用法：bash docs/scripts/deploy.sh
# 多 token 时同步 .env：SYNC_ENV=1 bash docs/scripts/deploy.sh
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
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://101.32.215.209:3001/api/health 2>/dev/null || echo "无法访问")
echo "HTTP 状态: $STATUS"

if [ "$STATUS" = "200" ]; then
  echo "✓ 部署成功！访问: http://101.32.215.209:3001"
else
  echo "⚠ 服务可能需要几秒启动，请手动检查: pm2 logs evocanvas"
fi

# 可选：同步本地 .env 到服务器（多 token 登录 403 时必须同步 ACCESS_TOKENS）
if [ -n "${SYNC_ENV}" ] && [ "${SYNC_ENV}" != "0" ]; then
  echo "=== [可选] 同步 .env 到服务器 ==="
  if [ ! -f .env ]; then
    echo "⚠ 本地无 .env，跳过"
  else
    # Merge：只把本地有而服务器没有的 key 追加过去，不覆盖服务器独有的 key（如 SHARED_API_KEY）
    while IFS= read -r line; do
      [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
      key="${line%%=*}"
      ssh -o StrictHostKeyChecking=no "$SERVER" "grep -q '^${key}=' ${REMOTE_DIR}/.env 2>/dev/null || echo '${line}' >> ${REMOTE_DIR}/.env"
    done < .env
    ssh -o StrictHostKeyChecking=no "$SERVER" "cd ${REMOTE_DIR} && pm2 restart evocanvas --update-env"
    echo "✓ .env 已合并（不覆盖服务器独有 key）并已重启 evocanvas"
  fi
else
  echo ""
  echo "提示：若多 token 登录仍 403，请同步 .env 后重启："
  echo "  SYNC_ENV=1 bash docs/scripts/deploy.sh   # 或手动: scp .env ${SERVER}:${REMOTE_DIR}/.env && ssh ${SERVER} 'pm2 restart evocanvas'"
fi

rm -f "$TMP_TAR"
