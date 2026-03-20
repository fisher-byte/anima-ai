# Anima 部署运维指南

*最后更新: 2026-03-21 | 版本: v0.5.47*

---

## 开发环境

### 1. 系统要求

- Node.js 20+
- npm 10+

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量（可选）

```bash
cp .env.example .env
```

`.env` 内容说明：

```bash
# 服务端口（默认 3000）
PORT=3000

# SQLite 数据目录（默认 ./data）
DATA_DIR=./data

# 鉴权（公网部署时设置）
AUTH_DISABLED=false
# ACCESS_TOKEN=your-secret-token        # 单用户
# ACCESS_TOKENS=token_a,token_b,token_c  # 多租户，逗号分隔

# 新用户引导时的演示 API Key（可选）
# ONBOARDING_API_KEY=sk-xxx
```

**API Key 不在 `.env` 中配置**，启动后在 UI 右上角设置页面填写，保存到服务端 SQLite。

### 4. 启动开发服务

```bash
npm run dev
```

这会并发启动：
- **Vite 开发服务器**（`:5173`）— 前端，`/api` 请求代理到 `:3000`
- **Hono 后端**（`:3000`）— API + SQLite

打开 `http://localhost:5173` 即可使用。

---

## 生产部署

### 方式一：npm（直接运行）

```bash
# 1. 构建前端
npm run build

# 2. 启动服务（同时服务 API + 静态文件）
NODE_ENV=production PORT=3000 npm start
```

访问 `http://your-server:3000`。

### 方式二：Docker（推荐）

```bash
# 构建镜像
docker build -t anima .

# 单用户启动
docker run -d \
  -p 3000:3000 \
  -v ~/anima-data:/app/data \
  -e ACCESS_TOKEN=your-secret-token \
  --name anima \
  anima:latest

# 多租户启动
docker run -d \
  -p 3000:3000 \
  -v ~/anima-data:/app/data \
  -e ACCESS_TOKENS=token_a,token_b,token_c \
  --name anima \
  anima:latest
```

**环境变量说明**：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 监听端口 |
| `DATA_DIR` | `/app/data` | SQLite 文件目录，挂卷持久化 |
| `AUTH_DISABLED` | `false` | `true` 时禁用鉴权（仅本地开发） |
| `ACCESS_TOKEN` | — | 单用户 Bearer token |
| `ACCESS_TOKENS` | — | 多租户 token，逗号分隔 |
| `NODE_ENV` | `development` | 生产模式需设为 `production` |

### 方式三：Nginx 反向代理（HTTPS）

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    client_max_body_size 20M;

    # 静态文件直接从磁盘提供（绕过 Node.js）
    root /path/to/evocanvas/dist;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE 流式响应必须关闭缓冲
        proxy_buffering off;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # SPA fallback — index.html 不缓存
    location / {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 多租户数据管理

### 数据文件

每个用户拥有独立的 SQLite 数据库，完全隔离：

```
data/
├── a1b2c3d4e5f6/       # token_a 的用户数据
│   └── anima.db
├── b2c3d4e5f6a1/       # token_b 的用户数据
│   └── anima.db
└── ...
```

目录名为 `ACCESS_TOKEN` 的 SHA-256 前 12 位 hex。

每个 `anima.db` 包含以下表：

| 表 | 内容 |
|----|------|
| `storage` | profile.json / nodes.json / conversations.jsonl |
| `config` | apiKey / model / baseUrl / preference_rules |
| `embeddings` | 对话向量索引 |
| `user_profile` | AI 提炼的结构化用户画像 |
| `agent_tasks` | 后台任务队列 |
| `memory_facts` | 记忆事实（软删除） |
| `uploaded_files` | 上传文件（含二进制） |
| `file_embeddings` | 文件分块向量 |
| `conversation_history` | 服务端对话历史（多轮上下文） |

### 备份

```bash
# 备份单个用户数据
cp data/{userId}/anima.db anima-{userId}-$(date +%Y%m%d).db

# 备份所有用户数据
tar -czf anima-backup-$(date +%Y%m%d).tar.gz data/

# Docker 环境备份
docker exec anima tar -czf /tmp/backup.tar.gz /app/data/
docker cp anima:/tmp/backup.tar.gz ./anima-backup-$(date +%Y%m%d).tar.gz
```

### 恢复

```bash
# 停止服务，恢复数据目录，重启
pm2 stop evocanvas
tar -xzf anima-backup-20260301.tar.gz
pm2 start evocanvas
```

---

## 安全注意事项

| 场景 | 建议 |
|------|------|
| 公网部署 | 设置 `ACCESS_TOKEN` 或 `ACCESS_TOKENS`，禁用 `AUTH_DISABLED` |
| API Key | 通过 UI 设置保存到 SQLite，绝不在 `.env` 或代码中硬编码 |
| HTTPS | 生产环境必须启用，通过 Nginx 或 Cloudflare 终止 SSL |
| 数据隔离 | `data/` 目录单独挂卷，不进 git |
| Token 强度 | 使用随机生成的长 token（如 `openssl rand -hex 32`） |

---

## 监控

### PM2 基本监控

```bash
pm2 list                          # 查看进程状态
pm2 monit                         # 实时监控（CPU/Memory）
pm2 logs evocanvas --lines 100    # 查看最近日志
pm2 logs evocanvas --follow       # 实时日志流
```

### 关键指标查询

```bash
# 查看各用户后台任务积压量
for dir in data/*/; do
  userId=$(basename $dir)
  count=$(sqlite3 $dir/anima.db "SELECT count(*) FROM agent_tasks WHERE status='pending'" 2>/dev/null)
  echo "$userId: $count pending tasks"
done

# 查看最近错误任务
sqlite3 data/{userId}/anima.db \
  "SELECT type, error, created_at FROM agent_tasks WHERE status='failed' ORDER BY id DESC LIMIT 10"
```

---

## 预检清单（上线前）

```bash
# 1. 运行所有测试
npm test

# 2. 类型检查
npm run typecheck

# 3. 构建验证
npm run build

# 4. 安全审计
npm audit

# 5. 验证生产启动
NODE_ENV=production npm start &
sleep 3
curl http://localhost:3000/api/health
```

---

## 版本发布流程

```bash
# 1. 更新 package.json 版本号
npm version patch   # 或 minor / major

# 2. 同步文档版本号（README.md, docs/*.md 顶部）

# 3. 提交并推送
git add .
git commit -m "chore: bump to vX.X.X"
git push origin main

# 4. 构建 Docker 镜像（如需）
docker build -t anima:$(node -p "require('./package.json').version") .
```

---

*文档版本: v0.2.43*
