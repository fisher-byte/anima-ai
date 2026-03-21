# Code Review — v0.5.49

**范围**：anima-base 灵思自动入库、`unit-auto-*` 匹配降权、评测脚本拆分、`lingsiProductState` changelog 解析兼容、发版文档与种子同步。

## 结论

| 级别 | 结论 |
|------|------|
| **P0** | 未发现：无鉴权绕过、无路径穿越、无密钥写入仓库。 |
| **P1** | 无阻塞项；`anima-base` 缺失时 extract 仍依赖精选源文件存在（既有行为）。 |
| **P2** | 自动单元 `evidenceLevel: C` + 降权；若未来要「自动默认不进入匹配」可改为 `status: candidate` 并过滤。 |
| **P3** | `seeds/lingsi/*.json` 体积大，CI 可用 `LINGSI_AUTO_INGEST=0` 控制。 |

## 安全与可靠性

- **extract**：仅读本地 `ANIMA_BASE` 路径下文件；`mustInclude` 对自动条目为空，不强制校验正文 needle。
- **Git**：`readPathShortCommit` 在 git 不可用时回退 `unknown`。

## 测试

- `npm test`：637 passed / 37 files（发版时执行）。
- `npm run build`：通过。

## 设计观察

- Persona `evidenceSources` 刻意不包含自动来源，避免 prompt 膨胀；证据以 **Unit 引用** 为主。
- 双轨正则解析 changelog bullet 块，兼容历史 `**标题：**` 与正文 `**改动**：` 两种习惯。
