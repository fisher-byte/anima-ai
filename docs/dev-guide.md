# EvoCanvas 开发指南

## 环境准备

### 1. 系统要求

- macOS 12+ / Windows 10+ / Linux
- Node.js 20+
- npm 10+

### 2. 安装依赖

```bash
cd evocanvas
npm install
```

### 3. 配置API Key

创建 `.env` 文件:

```bash
# Kimi API (Moonshot)
EVOCANVAS_API_KEY=sk-your-kimi-api-key
EVOCANVAS_API_URL=https://api.moonshot.cn/v1

# 或使用 OpenAI
# EVOCANVAS_API_KEY=sk-your-openai-key
# EVOCANVAS_API_URL=https://api.openai.com/v1
```

## 开发命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm test` | 运行单元测试 |
| `npm run test:watch` | 监听模式测试 |
| `npm run build` | 生产构建 |
| `npm run lint` | 代码检查 |
| `npm run typecheck` | 类型检查 |

## 项目结构

```
evocanvas/
├── src/
│   ├── main/           # Electron主进程
│   ├── preload/        # 安全桥梁
│   ├── renderer/       # React前端
│   │   ├── components/ # UI组件
│   │   ├── stores/     # 状态管理
│   │   └── hooks/      # 自定义Hooks
│   ├── services/       # 业务服务
│   └── shared/         # 共享类型和常量
├── docs/               # 文档
└── data/               # 本地数据(运行时生成)
```

## 开发规范

### 1. 代码规范

- 使用TypeScript严格模式
- 组件使用函数式组件+Hooks
- 服务层纯函数，便于测试
- 错误处理必须try-catch

### 2. 提交规范

```
<type>: <description>

[optional body]
```

**类型**:
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `test`: 测试相关
- `refactor`: 重构
- `security`: 安全修复

### 3. 命名规范

- 组件: PascalCase (如 `AnswerModal.tsx`)
- 函数: camelCase (如 `detectFeedback`)
- 常量: UPPER_SNAKE_CASE (如 `API_CONFIG`)
- 类型: PascalCase + 后缀 (如 `PreferenceRule`)

## 调试技巧

### 1. 查看数据存储

```bash
# macOS
ls ~/Library/Application\ Support/evocanvas/data/
cat ~/Library/Application\ Support/evocanvas/data/profile.json
```

### 2. 开启开发者工具

开发模式下按 `Cmd+Option+I` (macOS) 或 `Ctrl+Shift+I` (Windows/Linux)

### 3. 查看日志

主进程日志在终端输出，渲染进程日志在DevTools Console。

## 常见问题

### 1. 应用启动白屏

- 检查开发服务器是否启动
- 检查控制台是否有报错
- 尝试刷新: `Cmd+R`

### 2. API请求失败

- 检查 `.env` 配置是否正确
- 检查网络连接
- 验证API Key有效性

### 3. 数据未保存

- 检查 `data` 目录权限
- 查看主进程日志
- 验证存储IPC调用

## 发布流程

### 1. 测试

```bash
npm test              # 单元测试
npm run typecheck     # 类型检查
npm run lint          # 代码检查
```

### 2. 构建

```bash
npm run build
```

### 3. 打包

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

## 贡献指南

1. Fork仓库
2. 创建feature分支
3. 提交代码
4. 运行测试
5. 提交PR

---

**技术支持**: 请查看 [问题排查指南](./troubleshooting.md)
