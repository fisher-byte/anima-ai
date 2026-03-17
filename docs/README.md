# Anima 项目文档目录

> 本文档目录控制在40行以内，具体内容拆分到子文档。

## 快速导航

| 文档 | 用途 | 状态 |
|------|------|------|
| [架构设计](./architecture.md) | 技术架构、数据流 | ✅ |
| [API文档](./api.md) | 服务API说明 | ✅ |
| [开发指南](./dev-guide.md) | 开发环境、命令 | 📝 |
| [测试手册](./testing.md) | 测试策略、用例 | 📝 |
| [LingSi Schema](./lingsi-data-schema.md) | 灵思决策版数据层基线 | ✅ |
| [LingSi Eval M4](./lingsi-eval-m4.md) | 灵思决策版 15 题对照评测 | ✅ |
| [LingSi Eval Zhang](./lingsi-eval-zhang.md) | 张小龙 persona case-based eval 基线 | ✅ |
| [部署运维](./deployment.md) | 发布、配置 | 📝 |
| [变更日志](./changelog.md) | 版本迭代记录 | ✅ |
| [问题排查](./troubleshooting.md) | 常见问题解决 | 📝 |
| [代码审查](./code-review-report-v0.5.18-onboarding-and-release-sync.md) | 最新审查报告 | ✅ |
| [路线图](./ROADMAP.md) | 近期/远期规划 | ✅ |

## 项目状态

- **当前版本**: v0.5.18
- **开发状态**: Active
- **最后更新**: 2026-03-17（含 latest source sync、Lenny 入口样式修复、onboarding 退出修复与全量 release 收口）
- **GitHub**: https://github.com/fisher-byte/anima-ai

## 核心功能

1. 无限画布 + AI 对话（拖拽、缩放、LOD 宏观聚类）
2. 对话岛形态 + 记忆引用 + 语义高亮
3. 负反馈学习（记忆用户偏好）
4. 节点详情面板 + 首次引导
5. 本地数据持久化 + 对话历史 + 搜索

## 快捷命令

```bash
npm run dev      # 开发模式
npm test         # 运行测试
npm run build    # 生产构建
npm run lingsi:evaluate        # 跑 Lenny 15 题对照评测
npm run lingsi:evaluate:zhang  # 跑张小龙 case-based eval 基线
```

---

*更多详细内容请点击上方导航链接查看对应文档。*
