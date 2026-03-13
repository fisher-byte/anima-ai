# Code Review Report — v0.3.2

*日期: 2026-03-13 | 审查文件: `src/server/routes/ai.ts`*

---

## 总体评价

v0.3.2 功能正确落地（URL 预取 + search_memory），发现 4 项 P1/P2 质量问题已在本次完善迭代中全部修复。修复后代码结构清晰，无 P0 安全问题。

---

## 已修复问题

| 级别 | 问题 | 修复方式 |
|------|------|---------|
| P1 | `fetchUrlContent` 定义在 handler 内部，每次请求重新创建函数对象 | 提升到模块级（第 194 行） |
| P1 | `TOOLS_WITH_MEMORY` 定义在 handler 内部，每次请求重建常量数组 | 提升到模块级（第 210 行） |
| P2 | `URL_REGEX` 使用 `/g` 标志定义在 handler 内部，虽未使用 `.exec()` 循环，但位置冗余 | 提升到模块级（第 207 行），注释说明只用 `.match()` 禁止 `.exec()` 循环 |
| P2 | `lastMsgText` 提取逻辑与外层 `trimmedText` 完全重复（3 行重复代码） | 删除，改用已有的 `trimmedText` |

---

## 新增功能确认

### url_fetch SSE 事件

```
data: {"type":"url_fetch","url":"https://...","status":"fetching"}
data: {"type":"url_fetch","url":"https://...","status":"done"}
data: {"type":"url_fetch","url":"https://...","status":"failed"}
```

- 正确在 `streamSSE` 回调内执行，`sendEvent` 已初始化
- URL 上限 2 个，超时 8s，非 200 返回 null 不抛出
- `isSimpleQuery=true` 时跳过，不发 url_fetch 事件

### usage SSE 事件

```
data: {"type":"usage","totalTokens":1234,"model":"kimi-k2.5"}
```

- 仅在 `totalTokensUsed > 0` 时发送（首轮 API 无 usage 时不发空事件）
- 在 `done` 事件之后发送，前端可按序处理

---

## ✅ 无问题确认

| 检查项 | 状态 |
|--------|------|
| SQL 注入防护（所有 DB 操作使用预编译 statement） | ✅ 未变更 |
| API Key 不暴露给客户端 | ✅ 未变更 |
| 共享 Key 限流逻辑 | ✅ 未变更 |
| AbortError 处理（用户关闭流时正常退出） | ✅ 未变更 |
| 多轮 tool_calls 循环上限（MAX_SEARCH_ROUNDS=5） | ✅ 未变更 |
| reader.releaseLock() finally 保证（防资源泄漏） | ✅ 未变更 |
| URL 预取异常静默处理（不影响主流程） | ✅ 已验证 |

---

## 测试覆盖

| 测试组 | 用例数 | 覆盖内容 |
|--------|--------|---------|
| URL_REGEX pattern | 6 | HTTP/HTTPS 检测、中文标点截断、www 不匹配、多 URL 提取、无协议不匹配 |
| fetchUrlContent mock | 3 | 异常返回 null、非 200 返回 null、超长内容截断到 8000 |
| search_memory tool_call | 4 | type 验证（function 非 builtin）、required 参数、isMemoryRound=true/false |
| search_round 记忆轮文案 | 2 | isMemoryRound 时文案固定、web 搜索文案不变 |
| TOOLS_WITH_MEMORY 结构 | 3 | 恰好 2 个工具、$web_search type、search_memory type |
| **新增合计** | **18** | |
| **总计** | **445/445** | 全部通过 |

---

## 设计观察（非 bug，值得关注）

1. **url_fetch / usage 事件前端尚未渲染**：后端已正确发送这两类 SSE 事件，但前端 `services/ai.ts` 的 SSE 解析目前静默忽略未知事件类型。后续迭代可在 AnswerModal 展示 URL 预取进度条和 token 用量。

2. **URL 内容不受 CONTEXT_BUDGET 控制**：URL 预取内容（最多 2 × 8000 字符 ≈ 4000 tokens）作为额外 system 消息注入，在 `CONTEXT_BUDGET=1500` 限制之外。对于 moonshot-v1-128k 无问题，但若切换到 8k 模型需注意 context 溢出风险。

3. **Jina Reader 依赖**：URL 预取依赖外部服务 `r.jina.ai`，若该服务不稳定会影响请求延迟（8s 超时）。目前静默失败不影响主流程，可接受。
