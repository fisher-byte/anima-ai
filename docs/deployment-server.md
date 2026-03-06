# Anima 服务器部署文档

**最后更新**: 2026-03-06
**应用版本**: v0.2.49

---

## 服务器环境

| 项目 | 版本/信息 |
|------|-----------|
| OS | OpenCloudOS 9.4 (Tencent Cloud RHEL 9 兼容) |
| CPU/RAM | 共享核 / 2GB RAM |
| 磁盘 | 40GB，已用 ~5GB，剩余 35GB |
| Node.js | v20.20.0 (NodeSource LTS) |
| npm | 10.8.2 |
| PM2 | 6.0.14 |
| Nginx | 1.26.3 |

---

## 目录结构

```
/opt/anima/              ← 应用根目录
├── src/                 ← 服务端源码（tsx 直接运行）
├── dist/                ← Vite 构建的前端静态文件
├── data/                ← SQLite 数据库（自动创建）
│   └── {userId}/        ← 每用户独立数据库目录
│       └── anima.db
├── node_modules/
├── .env                 ← 生产环境变量（见下）
├── ecosystem.config.cjs ← PM2 配置
└── package.json

/etc/nginx/conf.d/
└── anima.conf           ← Anima 反代配置

/var/log/pm2/
├── anima-out.log        ← 应用 stdout 日志
└── anima-error.log      ← 应用 stderr 日志
```

---

## 生产环境变量 `/opt/anima/.env`

```env
NODE_ENV=production
PORT=3001
AUTH_DISABLED=false
ACCESS_TOKEN=<your-secret-token>
# ACCESS_TOKENS=token_a,token_b   # 多租户时用这个
ONBOARDING_API_KEY=               # 填入演示用 Kimi key（供新用户引导）
```

> **注意**：用户自己的 API Key 存储在 SQLite DB 里，不在 .env 中。Token 请使用强随机值（`openssl rand -hex 32`）。

---

## 服务管理

### 查看状态
```bash
pm2 list
pm2 logs anima --lines 50
```

### 重启
```bash
pm2 restart anima
```

### 停止 / 删除
```bash
pm2 stop anima
pm2 delete anima
```

### 开机自启（已配置）
```bash
# 已执行，无需再运行
pm2 startup
pm2 save
# systemd 服务：pm2-root.service（已 enabled）
```

---

## Nginx 配置

### `/etc/nginx/conf.d/anima.conf`
```nginx
server {
    listen 8080;
    server_name _;
    client_max_body_size 20M;

    # 静态文件直接从磁盘提供（绕过 Node.js，避免大文件 chunked encoding 截断）
    root /opt/anima/dist;
    index index.html;

    # gzip on-the-fly（注意：gzip_static 必须为 off，否则新 chunk 文件名变化后
    # 找不到旧 .gz 文件会返回 ERR_EMPTY_RESPONSE）
    gzip on;
    gzip_types text/plain text/css application/javascript application/json text/xml;
    gzip_min_length 1000;
    gzip_comp_level 6;
    gzip_static off;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;      # SSE 流式响应必须关闭缓冲
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # SPA fallback — 禁止缓存 index.html，确保每次部署后获取最新版本
    location / {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri $uri/ /index.html;
    }
}
```

### Nginx 操作
```bash
nginx -t           # 测试配置
systemctl reload nginx   # 零停机重载
systemctl status nginx
```

---

## 端口分配

| 端口 | 服务 | 说明 |
|------|------|------|
| 22 | sshd | SSH |
| 3001 | Anima Node | 内网监听（不对外） |
| 8080 | Nginx | **Anima 对外入口** |

---

## 腾讯云安全组

公网访问前，需在腾讯云控制台确认入站规则已开放对应端口（如 8080）：

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 进入「云服务器 CVM」→ 目标实例 → 「安全组」→ 「修改规则」
3. 添加入站规则：TCP / 端口 8080 / 来源 0.0.0.0/0（或限制为自己 IP）

---

## 持续部署（CD）流程

每次有新版本需要上线，在本地执行：

```bash
# 1. 本地构建
npm run build

# 2. 打包（排除 node_modules 和 .env）
tar --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='test-results' \
    -czf /tmp/anima-deploy.tar.gz .

# 3. 上传
scp /tmp/anima-deploy.tar.gz root@<server-ip>:/opt/

# 4. 远程解压并重启
ssh root@<server-ip> << 'REMOTE'
  set -e
  cd /opt/anima
  tar -xzf /opt/anima-deploy.tar.gz
  rm /opt/anima-deploy.tar.gz
  npm install --omit=dev
  pm2 restart anima
  pm2 logs anima --lines 10 --nostream
REMOTE
```

> 也可以直接运行 `docs/scripts/deploy.sh`（见下节），输入密码即可。

---

## SSH 免密登录配置

本机公钥（`~/.ssh/id_ed25519`）已推送至服务器，无需再输密码。`~/.ssh/config` 中已配置快捷别名：

```ssh
Host evocanvas-prod
    HostName 101.32.215.209
    User root
    Port 22
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

**一键部署（推荐）**：
```bash
# 在 evocanvas 项目目录下，全自动无需密码
bash docs/scripts/deploy.sh
```

**直接 SSH 进服务器**：
```bash
ssh evocanvas-prod
```

---

## 快速部署脚本

见 `docs/scripts/deploy.sh`（首次需要 `chmod +x docs/scripts/deploy.sh`）。

---

## 数据持久化

SQLite 数据库自动创建在 `/opt/anima/data/` 目录，多租户模式下每个用户一个独立子目录：

```
/opt/anima/data/
└── {userId}/           ← token SHA-256 前12位
    └── anima.db        ← 包含用户配置、对话历史、记忆事实、用户画像等
```

**备份建议**：
```bash
# 全量备份
tar -czf /opt/anima-backup-$(date +%Y%m%d).tar.gz /opt/anima/data/

# 定时备份（crontab）
0 3 * * * tar -czf /opt/backups/anima-$(date +\%Y\%m\%d).tar.gz /opt/anima/data/ && find /opt/backups -name "anima-*.tar.gz" -mtime +30 -delete
```

---

## 已有项目共存

如服务器上有其他服务，确保端口不冲突。Anima 使用：
- Node.js 内网端口（如 `:3001`）
- Nginx 对外端口（如 `:8080`）

两者互不影响，通过 Nginx 各自独立代理。

---

## 故障排查

```bash
# 查看应用日志
pm2 logs anima --lines 100

# 查看 Nginx 错误
tail -50 /var/log/nginx/error.log

# 检查端口监听
ss -tlnp | grep -E '3001|8080'

# 检查 PM2 进程
pm2 show anima

# 查看后台任务状态
sqlite3 /opt/anima/data/{userId}/anima.db \
  "SELECT type, status, retries, error FROM agent_tasks ORDER BY id DESC LIMIT 20"
```
