# Anima 发版 SOP

*最后更新: 2026-03-06*

每次发版（无论 patch / minor / major）按此流程执行，确保代码、文档、服务器三端一致。

---

## 一、开发完成后（本地）

### 1. 测试 & 类型检查

```bash
npm test          # 必须全部通过（当前基线：236 / 236）
npx tsc --noEmit  # 必须零错误
npm run build     # 构建验证
```

### 2. 版本号同步

需要同步版本号的位置（**必须全部更新，不能遗漏**）：

| 文件 | 字段 / 位置 |
|------|------------|
| `package.json` | `"version"` |
| `src/shared/constants.ts` | `APP_VERSION` |
| `README.md` | `version` badge |
| `docs/architecture.md` | 顶部 `*最后更新: ... \| 版本: vX.X.X*` |
| `docs/dev-notes.md` | 顶部 `*最后更新: ... \| 版本: vX.X.X*` |
| `docs/deployment.md` | 底部 `*文档版本: vX.X.X*` |
| `docs/deployment-server.md` | 顶部 `**应用版本**: vX.X.X` |

### 3. 文档同步检查清单

在提交前确认：

- [ ] `docs/changelog.md` 顶部添加本版本条目
- [ ] `docs/ROADMAP.md` 更新日志表格追加新版本行，并将已完成条目标记 `[x]`
- [ ] 若有新 API / 路由，更新 `docs/api.md`
- [ ] 若有架构变更，更新 `docs/architecture.md`
- [ ] 若有新坑 / 修复，追加 `docs/dev-notes.md` 踩坑记录
- [ ] 若测试文件有新增或数量变化，更新 `docs/testing.md` 和 `docs/dev-guide.md`

### 4. Code Review 报告

每个 minor / major 版本创建一份：`docs/code-review-report-vX.X.X.md`

报告必须包含：
- 已修复问题（级别 P0/P1/P2）
- 无问题确认（安全、架构关键路径）
- 测试覆盖分布表
- 设计观察（非 bug 但值得关注的设计问题）

### 5. Git 提交 & 推送

```bash
git add <变更文件>
git commit -m "chore: bump to vX.X.X (<本版本一句话描述>)"
git push origin main
```

---

## 二、部署到服务器

### 快速部署（标准流程）

```bash
# 在项目根目录执行
npm run build

tar --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='test-results' \
    --exclude='data' \
    -czf /tmp/anima-deploy.tar.gz .

scp /tmp/anima-deploy.tar.gz root@<server-ip>:/opt/

ssh root@<server-ip> << 'REMOTE'
  set -e
  cd /opt/anima
  tar -xzf /opt/anima-deploy.tar.gz
  rm /opt/anima-deploy.tar.gz
  npm install --omit=dev
  pm2 restart anima
  sleep 3
  pm2 logs anima --lines 15 --nostream
REMOTE
```

### 部署后验证

```bash
# 远程健康检查
curl http://<server-ip>:8080/api/health

# 检查进程状态
ssh root@<server-ip> "pm2 list && pm2 show anima | grep -E 'status|pid|uptime'"
```

### 回滚

```bash
# 服务器上保留了前一版本的 .tar.gz，紧急回滚：
ssh root@<server-ip> << 'REMOTE'
  cd /opt/anima
  tar -xzf /opt/anima-previous.tar.gz
  npm install --omit=dev
  pm2 restart anima
REMOTE
```

---

## 三、文档更新 SOP

每次更新文档后执行：

```bash
# 1. 运行测试，确保文档中的命令/数字与实际一致
npm test 2>&1 | tail -5

# 2. 提交
git add docs/
git commit -m "docs: <描述更新内容>"
git push origin main
```

### 文档质量检查点

| 检查项 | 说明 |
|--------|------|
| 版本号一致 | 所有文档顶部版本号 = package.json 版本 |
| 测试数准确 | testing.md / dev-guide.md 中的用例数与 `npm test` 输出一致 |
| 路径正确 | 文档中的文件路径与实际目录结构一致 |
| 命令可运行 | 代码块中的 bash 命令在当前环境实际可执行 |
| 无敏感信息 | IP / 密码 / token 使用占位符（`<server-ip>`、`<your-token>`） |
| 项目名统一 | 全部使用 "Anima"，不出现 "Evocanvas" |

---

## 四、版本命名规范

| 类型 | 触发条件 | 示例 |
|------|---------|------|
| `patch` | Bug 修复、文档、性能优化 | `v0.2.43 → v0.2.44` |
| `minor` | 新功能（向后兼容） | `v0.2.43 → v0.3.0` |
| `major` | 破坏性架构变更 | `v0.2.43 → v1.0.0` |

提交信息前缀规范：

| 前缀 | 用途 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `docs:` | 纯文档变更 |
| `chore:` | 版本号、构建配置、不影响功能 |
| `refactor:` | 重构（无功能变化） |
| `test:` | 新增或修改测试 |
| `security:` | 安全修复 |

---

## 五、紧急修复流程（Hotfix）

```bash
# 1. 定位问题（服务器日志）
ssh root@<server-ip> "pm2 logs anima --lines 100"

# 2. 本地修复 + 测试
npm test

# 3. 直接推到 main（hotfix 不需要 PR）
git add .
git commit -m "fix: <简述问题>"
git push origin main

# 4. 立即部署（跳过完整 tar 打包，可直接 scp 修改的文件）
npm run build
scp dist/ root@<server-ip>:/opt/anima/dist/
ssh root@<server-ip> "pm2 restart anima"
```
