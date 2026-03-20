# Code Review Report — v0.5.40

**范围**：多租户鉴权强制、前端登录门禁、租户数据清理脚本、文档同步。  
**结论**：**可合并 / 可发版**。P0 级「无身份落入共享默认库」已在服务端与产品入口双侧收口。

---

## 已处理问题分级

| 级别 | 说明 | 状态 |
|------|------|------|
| **P0** | 生产配置 `ACCESS_TOKEN` 时，无 Bearer 仍读写 `data/anima.db`，多用户串味 | **已修复**：`auth.ts` 在 `authRequired` 时 401 |
| **P1** | 前端未带 token 仍发起业务请求，放大默认库写入 | **已修复**：`App.tsx` 对齐 `/api/auth/status` + `LoginPage` |
| **P2** | `repairStaleAutoToken` 在开放模式下清空 token 导致回退 | **已收敛**：仅在非 `authRequired` 路径调用 |
| **P3** | 设置页仅展示 `anima_user_token`，与登录态不一致 | **已修复**：双 key 展示 |

---

## 安全与可靠性

- **鉴权**：`OPTIONS` 预检放行，避免 CORS 断裂。
- **数据清理脚本**：仅运维使用；需备份 `data/`；`--dry-run` 可先验。
- **残留风险**：服务器上若仍存在历史 `data/anima.db` 大文件，应用层已 401，但仍建议运维执行清理脚本或删除默认库（备份后）。

---

## 测试覆盖

| 类型 | 结果 |
|------|------|
| `npm test` | 623 passed，35 files |
| `npm run typecheck` | 0 errors |

---

## 设计观察（非阻塞）

- **E2E**：本次未跑 `test:e2e`（SOP 全量发版建议补跑）；若 CI 无浏览器环境可仅记为技术债。
- **api.md**：已更新鉴权段落与实现一致；旧文「timingSafeEqual」描述已移除以免误导。

---

## 签署

- **Reviewer**：自动化审查 + 与 `sop-release.md` 清单对照  
- **建议提交前缀**：`security: v0.5.40 tenant isolation + auth gate`
