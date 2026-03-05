# Evocanvas 服务器部署文档

**部署日期**: 2026-03-05
**服务器**: 101.32.215.209（腾讯云 OpenCloudOS 9.4）
**应用版本**: v0.2.31
**访问地址**: http://101.32.215.209:8080

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
/opt/evocanvas/          ← 应用根目录
├── src/                 ← 服务端源码（tsx 直接运行）
├── dist/                ← Vite 构建的前端静态文件
├── data/                ← SQLite 数据库（自动创建）
├── node_modules/
├── .env                 ← 生产环境变量（见下）
├── ecosystem.config.cjs ← PM2 配置
└── package.json

/etc/nginx/conf.d/
├── winratelabs.conf     ← 已有项目（winratelabs.com → :5055）不要修改
└── evocanvas.conf       ← Evocanvas 反代配置（:8080 → :3001）

/var/log/pm2/
├── evocanvas-out.log    ← 应用 stdout 日志
└── evocanvas-error.log  ← 应用 stderr 日志
```

---

## 生产环境变量 `/opt/evocanvas/.env`

```env
NODE_ENV=production
PORT=3001
AUTH_DISABLED=false
ACCESS_TOKEN=evo_prod_2026_yuzhiyang
ONBOARDING_API_KEY=          # 填入演示用 Kimi key（供新用户引导）
```

> **注意**：用户自己的 API Key 存储在 SQLite DB 里，不在 .env 中。

---

## 服务管理

### 查看状态
```bash
pm2 list
pm2 logs evocanvas --lines 50
```

### 重启
```bash
pm2 restart evocanvas
```

### 停止 / 删除
```bash
pm2 stop evocanvas
pm2 delete evocanvas
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

### `/etc/nginx/conf.d/evocanvas.conf`
```nginx
server {
    listen 8080;
    server_name _;
    client_max_body_size 20M;

    # 静态文件直接从磁盘提供（绕过 Node.js，避免大文件 chunked encoding 截断）
    root /opt/evocanvas/dist;
    index index.html;

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

    # SPA fallback
    location / {
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
| 80 | Nginx | winratelabs.com HTTP→HTTPS 跳转 |
| 443 | Nginx + SSL | winratelabs.com HTTPS |
| 3001 | Evocanvas Node | 内网监听（不对外） |
| 5055 | multiagent Python | winratelabs.com 后端（不对外） |
| 8080 | Nginx | **Evocanvas 对外入口** |

---

## 腾讯云安全组（需手动在控制台操作）

访问 http://101.32.215.209:8080 前，**必须**在腾讯云控制台开放 8080 端口：

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/)
2. 进入「云服务器 CVM」→ 找到 101.32.215.209
3. 点击「安全组」→ 「修改规则」
4. 添加入站规则：
   - 协议：TCP
   - 端口：8080
   - 来源：0.0.0.0/0（或限制为自己 IP）
   - 动作：允许

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
    -czf /tmp/evocanvas-deploy.tar.gz .

# 3. 上传
scp /tmp/evocanvas-deploy.tar.gz root@101.32.215.209:/opt/

# 4. 远程解压并重启（密码 yuzhiyang_22）
ssh root@101.32.215.209 << 'REMOTE'
  set -e
  cd /opt/evocanvas
  tar -xzf /opt/evocanvas-deploy.tar.gz
  rm /opt/evocanvas-deploy.tar.gz
  npm install --omit=dev
  pm2 restart evocanvas
  pm2 logs evocanvas --lines 10 --nostream
REMOTE
```

> 也可以直接运行 `docs/scripts/deploy.sh`（见下节），输入密码即可。

---

## 快速部署脚本

见 `docs/scripts/deploy.sh`（首次需要 `chmod +x docs/scripts/deploy.sh`）。

---

## 数据持久化

SQLite 数据库自动创建在 `/opt/evocanvas/data/` 目录，包含：
- 用户配置（API Key、模型设置）
- 对话历史
- 记忆事实
- 用户画像

**备份建议**：
```bash
# 在服务器上每天备份 DB
cp /opt/evocanvas/data/anima.db /opt/evocanvas/data/anima.db.bak.$(date +%Y%m%d)
```

---

## 已有项目共存

`/opt/multiagent/` 的两个服务（`multiagent-viewer` :5055 + `multiagent-scheduler`）通过 `systemd` 独立运行，与 Evocanvas 的 PM2 进程完全隔离。两者共用同一个 Nginx，各自通过不同端口（443/8080）对外服务，互不影响。

---

## 故障排查

```bash
# 查看应用日志
pm2 logs evocanvas --lines 100

# 查看 Nginx 错误
tail -50 /var/log/nginx/error.log

# 检查端口监听
ss -tlnp | grep -E '3001|8080'

# 检查 PM2 进程
pm2 show evocanvas
```
