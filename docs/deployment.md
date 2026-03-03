# Anima 部署运维指南

## 开发环境

### 1. 系统要求

- Node.js 20+
- npm 10+

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制模板并填写：

```bash
cp .env.example .env
```

`.env` 内容说明：

```bash
# 服务端口（默认 3000）
PORT=3000

# SQLite 数据目录（默认 ./data）
DATA_DIR=./data

# 鉴权（公网部署时开启）
AUTH_ENABLED=false
# ACCESS_TOKEN=your-secret-token

# 可选：通过环境变量指定 API 地址（也可在 UI 设置中配置）
# VITE_API_URL=https://api.moonshot.cn/v1
```

### 4. 启动开发服务

```bash
npm run dev
```

这会并发启动：
- **Vite 开发服务器**（`:5173`）— 前端，`/api` 请求代理到 `:3000`
- **Hono 后端**（`:3000`）— API 服务

打开 `http://localhost:5173` 即可使用。

在 UI 设置中填写 API Key（保存到服务端 SQLite，不经过浏览器）。

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

# 启动容器（数据持久化到主机目录）
docker run -d \
  -p 3000:3000 \
  -v ~/anima-data:/app/data \
  -e AUTH_ENABLED=true \
  -e ACCESS_TOKEN=your-secret-token \
  --name anima \
  anima:latest
```

**环境变量说明**：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 监听端口 |
| `DATA_DIR` | `/app/data` | SQLite 文件目录，挂卷持久化 |
| `AUTH_ENABLED` | `false` | 是否开启 Bearer Token 鉴权 |
| `ACCESS_TOKEN` | — | 鉴权 token（`AUTH_ENABLED=true` 时必填） |
| `NODE_ENV` | `development` | 生产模式需设为 `production` |

### 方式三：Nginx 反向代理（HTTPS）

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持（AI 流式输出）
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

---

## 数据管理

### 数据文件

所有数据保存在 SQLite 单文件（`DATA_DIR/anima.db`）的两张表：

| 表 | 内容 |
|----|------|
| `storage` | profile.json / nodes.json / conversations.jsonl / settings.json |
| `config` | apiKey / model / baseUrl |

### 备份

```bash
# 直接复制 SQLite 文件即可完整备份
cp ~/anima-data/anima.db anima-backup-$(date +%Y%m%d).db

# Docker 环境
docker exec anima cp /app/data/anima.db /app/data/backup-$(date +%Y%m%d).db
```

### 恢复

```bash
# 停止服务，替换数据库文件，重启
cp anima-backup-20260301.db ~/anima-data/anima.db
```

---

## 安全注意事项

| 场景 | 建议 |
|------|------|
| 公网部署 | 设置 `AUTH_ENABLED=true` + 强 `ACCESS_TOKEN` |
| API Key | 通过 UI 设置保存到 DB，绝不在前端代码或环境变量中硬编码 |
| HTTPS | 生产环境必须启用，建议通过 Nginx 或 Cloudflare 终止 SSL |
| 数据隔离 | 数据文件单独挂卷，容器无状态，可随时迁移 |

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
curl http://localhost:3000/api/health
```

---

## 版本发布流程

```bash
# 1. 更新版本号
npm version patch   # 或 minor / major

# 2. 推送含 tag
git push origin main --tags

# 3. 构建 Docker 镜像
docker build -t anima:$(node -p "require('./package.json').version") .
```

---

*文档版本: v0.3.0*
