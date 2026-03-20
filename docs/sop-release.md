# Anima 发版 SOP

*最后更新: 2026-03-21 | 版本: v0.5.42*

每次发版（无论 patch / minor / major）按此流程执行，确保代码、文档、服务器三端一致。

对于像 `LingSi` 这样持续数天的功能流，先按里程碑做“小闭环”，再在最终发版时走完整发布 SOP。里程碑闭环的目标是：不把半定义、半验证状态直接推进到下一阶段。

---

## 一、开发完成后（本地）

### 0. 里程碑模式（适用于大型功能流）

当需求不是单次 patch，而是分阶段推进时，每个里程碑先执行下面的最小闭环：

```bash
# 1. 文档同步
# PROJECT.md / ROADMAP.md / 需求文档（必要时补 api.md / architecture.md）

# 2. 针对性验证
npm test -- <related tests>   # 或直接 npm test（视改动范围）
npx tsc --noEmit

# 3. 代码审查
# 至少形成一轮 review 结论，记录已知风险 / 未决问题

# 4. GitHub 备份
git add <本里程碑相关文件>
git commit -m "<type>: <milestone summary>"
git push origin main
```

适用场景：
- 新能力从“文档 → 数据层 → 交互层 → 验证”分阶段落地
- 需要反复同步产品决策与工程实现
- 需要保留每个阶段的审计轨迹

### 1. 测试 & 类型检查

```bash
npm test          # 必须全部通过（当前基线：623 / 623，35 个文件）
npx tsc --noEmit  # 必须零错误
npm run build     # 构建验证（前端产物生成到 dist/）
```

E2E 测试（需开发服务器已运行）：

```bash
npm run dev &         # 先启动 :5173 前端 + :3000/:3001 后端
npm run test:e2e      # 当前基线：45 passed / 3 skipped
```

### 2. 版本号同步

需要同步版本号的位置（**必须全部更新，不能遗漏**）：

| 文件 | 字段 / 位置 |
|------|------------|
| `package.json` | `"version"` |
| `src/shared/constants.ts` | `APP_VERSION` |
| `README.md` | `version` badge（第 8 行） |
| `docs/architecture.md` | 顶部 `*最后更新: ... \| 版本: vX.X.X*` |
| `docs/dev-guide.md` | 顶部 `*最后更新: ... \| 版本: vX.X.X*` |
| `docs/testing.md` | 顶部 `*最后更新: ... \| 版本: vX.X.X*` |
| `docs/sop-release.md` | 顶部 `*最后更新: ... \| 版本: vX.X.X*` |

### 3. 文档同步检查清单

在提交前逐项确认：

- [ ] `docs/changelog.md` 顶部添加本版本条目（含改动摘要 + 测试数）
- [ ] `docs/ROADMAP.md` 日志表格追加新版本行，已完成条目标记 `[x]`
- [ ] `docs/testing.md` 总测试数与 `npm test` 实际输出一致
- [ ] `docs/dev-guide.md` `npm test` 说明里的用例数与实际一致
- [ ] 若 LingSi 决策链路有改动，运行 `npm run lingsi:state-pack`（必要时再跑 `npm run lingsi:refresh`）
- [ ] 若有新 API / 路由变更，更新 `docs/api.md`
- [ ] 若有架构变更（新模块、数据库表、数据流），更新 `docs/architecture.md`
- [ ] 若踩了新坑或有重要修复决策，追加 `docs/dev-notes.md`
- [ ] 若是阶段性功能推进，更新 `docs/PROJECT.md` 当前冲刺与 `docs/ROADMAP.md` 计划中版本

### 4. Code Review 报告（minor / major 版本必须，patch 可选）

每个 minor / major 版本创建：`docs/code-review-report-vX.X.X.md`

报告必须包含：
- 已修复问题（P0/P1/P2 分级）
- 无问题确认（安全路径、关键架构路径）
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

### 一键部署（推荐）

```bash
# 在项目根目录执行，自动完成：构建 → 打包 → 上传 → 解压 → npm install → pm2 restart → 健康验证
bash docs/scripts/deploy.sh
```

### 部署后验证

```bash
# 服务器内网健康检查
ssh root@101.32.215.209 "curl -sS -i http://127.0.0.1:3001/api/health"

# 线上域名健康检查
curl -4 --http1.1 -sS -i https://chatanima.com/api/health

# 查看进程状态和最新日志
ssh root@101.32.215.209 "pm2 list && pm2 logs evocanvas --lines 20 --nostream"
```

### 回滚

```bash
# 服务器上 git pull 上一个 commit 后重新部署
ssh evocanvas-prod "cd /opt/evocanvas && git log --oneline -5"
# 找到目标 commit hash，然后：
ssh evocanvas-prod "cd /opt/evocanvas && git checkout <hash> && npm install --omit=dev && pm2 restart evocanvas"
```

---

## 三、完整发版检查清单（按顺序执行）

```
[ ] 1. npm test              → 631/631 通过
[ ] 2. npx tsc --noEmit      → 零错误
[ ] 3. npm run build         → 构建成功
[ ] 4. npm run test:e2e      → 45 passed / 3 skipped（48 用例）
[ ] 5. 版本号同步             → package.json / constants.ts / README.md / 4个文档头
[ ] 6. 文档同步               → changelog / ROADMAP / testing / dev-guide / api / architecture（按需）
[ ] 7. git commit + push     → 推送到 origin/main
[ ] 8. bash docs/scripts/deploy.sh  → 部署 + PM2 重启
[ ] 9. 验证 /api/health      → {"status":"ok"}
```

---

## 四、版本命名规范

| 类型 | 触发条件 | 示例 |
|------|---------|------|
| `patch` | Bug 修复、文档、性能优化 | `v0.2.51 → v0.2.52` |
| `minor` | 新功能（向后兼容） | `v0.2.52 → v0.3.0` |
| `major` | 破坏性架构变更 | `v0.2.52 → v1.0.0` |

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
ssh evocanvas-prod "pm2 logs evocanvas --lines 100 --nostream"

# 2. 本地修复 + 测试
npm test && npx tsc --noEmit

# 3. 推送到 main
git add .
git commit -m "fix: <简述问题>"
git push origin main

# 4. 快速部署（直接用 deploy.sh，已内置构建步骤）
bash docs/scripts/deploy.sh
```

---

## 六、文档质量标准

| 检查项 | 标准 |
|--------|------|
| 版本号一致 | 所有文档顶部版本 = `package.json` version = `APP_VERSION` |
| 测试数准确 | `testing.md` / `dev-guide.md` 中的用例数与 `npm test` 输出完全一致 |
| 日期准确 | 文档顶部 `最后更新` = 本次提交日期 |
| 路径正确 | 文档中的文件路径与实际目录结构一致 |
| 命令可运行 | 代码块中的 bash 命令在当前环境实际可执行 |
| 无敏感信息 | 密码 / token 使用占位符，IP 可公开时保留，否则用 `<server-ip>` |
| 项目名统一 | 对外称 "Anima"，内部仓库名 "evocanvas" 仅在路径中出现 |
