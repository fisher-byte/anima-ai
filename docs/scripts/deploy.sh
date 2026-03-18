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
echo "  → 解压（staging 目录，避免打断服务）..."
# 解压到临时目录，dist 原子替换，避免 nginx 提供残缺文件
STAGE_DIR="/opt/evocanvas-stage"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
tar -xzf /opt/evocanvas-deploy.tar.gz -C "$STAGE_DIR"
rm /opt/evocanvas-deploy.tar.gz
echo "  → 原子替换 dist（减少 nginx 服务窗口）..."
# 只替换 dist（静态资源），其他文件原地覆盖
if [ -d "$STAGE_DIR/dist" ]; then
  rm -rf /opt/evocanvas/dist.old 2>/dev/null || true
  mv /opt/evocanvas/dist /opt/evocanvas/dist.old 2>/dev/null || true
  mv "$STAGE_DIR/dist" /opt/evocanvas/dist
fi
# 覆盖其余代码文件（排除 data/.env/node_modules）
rsync -a --exclude=dist --exclude=data --exclude=.env --exclude=node_modules \
  "$STAGE_DIR/" /opt/evocanvas/
rm -rf "$STAGE_DIR" /opt/evocanvas/dist.old 2>/dev/null || true
echo "  → 安装依赖..."
npm install --omit=dev --silent
echo "  → 重启 PM2..."
pm2 restart evocanvas
sleep 3
echo "  → nginx reload（dist 已就绪）..."
nginx -s reload
pm2 list
REMOTE

echo "=== [5/5] 验证服务 ==="
sleep 2
REMOTE_STATUS=$(ssh -o StrictHostKeyChecking=no "$SERVER" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health" 2>/dev/null || echo "000")
DOMAIN_STATUS=$(curl -4 --http1.1 -s -o /dev/null -w "%{http_code}" https://chatanima.com/api/health 2>/dev/null || echo "000")
echo "服务器内网健康检查: $REMOTE_STATUS"
echo "线上域名健康检查: $DOMAIN_STATUS"

if [ "$REMOTE_STATUS" = "200" ] && [ "$DOMAIN_STATUS" = "200" ]; then
  echo "✓ 部署成功！访问: https://chatanima.com"
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
