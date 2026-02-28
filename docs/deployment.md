# EvoCanvas 部署运维指南

## 开发环境配置

### 1. 环境变量

创建 `.env` 文件:

```bash
# Kimi (Moonshot) - 推荐
EVOCANVAS_API_KEY=sk-your-kimi-api-key
EVOCANVAS_API_URL=https://api.moonshot.cn/v1

# 或 OpenAI
# EVOCANVAS_API_KEY=sk-your-openai-key
# EVOCANVAS_API_URL=https://api.openai.com/v1

# 可选: 自定义模型
# MODEL=moonshot-v1-8k
```

### 2. 开发模式

```bash
# 带环境变量启动
EVOCANVAS_API_KEY=xxx EVOCANVAS_API_URL=xxx npm run dev
```

## 生产构建

### 1. 预构建检查

```bash
# 1. 运行测试
npm test

# 2. 类型检查
npm run typecheck

# 3. 代码检查
npm run lint

# 4. 安全审计
npm audit
```

### 2. 构建命令

```bash
# 构建应用
npm run build

# 输出目录
out/
├── main/
├── preload/
└── renderer/
```

### 3. 打包发布

```bash
# macOS (DMG)
npm run build:mac

# Windows (EXE)
npm run build:win

# Linux (AppImage)
npm run build:linux

# 全部平台
npm run build:all
```

## 配置管理

### 1. 数据存储位置

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/evocanvas/` |
| Windows | `%APPDATA%/evocanvas/` |
| Linux | `~/.config/evocanvas/` |

### 2. 数据文件

```
data/
├── profile.json          # 用户偏好
├── nodes.json            # 画布节点
└── conversations.jsonl   # 对话记录
```

### 3. 备份与恢复

**备份**:
```bash
# macOS
zip -r evocanvas-backup-$(date +%Y%m%d).zip ~/Library/Application\ Support/evocanvas/data/
```

**恢复**:
```bash
unzip evocanvas-backup-YYYYMMDD.zip -d ~/Library/Application\ Support/evocanvas/
```

## 版本发布流程

### 1. 版本号规范

遵循 [SemVer](https://semver.org/):
- `MAJOR.MINOR.PATCH`
- 例: `0.1.2`

### 2. 发布检查清单

- [ ] 所有测试通过
- [ ] 版本号更新
- [ ] 变更日志更新
- [ ] 代码审查完成
- [ ] 文档更新
- [ ] Git标签创建

### 3. GitHub发布

```bash
# 1. 更新版本
npm version patch  # 或 minor/major

# 2. 推送标签
git push origin main --tags

# 3. 创建Release
# 在GitHub上创建Release，上传构建产物
```

## 监控与日志

### 1. 日志位置

```bash
# macOS
~/Library/Logs/evocanvas/

# 开发模式日志输出在终端
```

### 2. 错误上报

开发模式: 查看DevTools Console
生产模式: 日志写入文件

## 安全注意事项

### 1. API Key保护

- 开发: 使用 `.env` (已添加到 `.gitignore`)
- 生产: 使用 `safeStorage` 加密存储
- 绝不: 硬编码在代码中

### 2. 数据安全

- 所有数据本地存储
- 不上传云端
- 支持导出加密备份

### 3. 更新安全

- 启用自动更新检查
- 验证更新签名
- 支持回滚

---

*部署版本: v0.1.2*
