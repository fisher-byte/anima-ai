# Code Review Report — v0.5.10 Stability Patch

*最后更新: 2026-03-17 | 范围: 本地提问链路修复 / Space 状态收口*

## Code Review Summary

**Files reviewed**: 5 files, 213 insertions / 29 deletions  
**Overall assessment**: APPROVE

---

## Findings

### P0 - Critical
无

### P1 - High
无

### P2 - Medium
无

### P3 - Low
无

---

## Checked Areas

- `src/renderer/src/App.tsx`
  - 启动期 token 处理、`/api/config/has-usable-key` 探测、默认库回退边界
- `src/renderer/src/stores/canvasStore.ts`
  - Lenny / PG / 张 / 王 / Custom Space 切换时的状态清理
- `src/renderer/src/__tests__/appToken.test.ts`
  - token 保留 / 清理 / 空值边界
- `src/renderer/src/stores/__tests__/canvasStore.lennyMode.test.ts`
- `src/renderer/src/stores/__tests__/canvasStore.customSpaceMode.test.ts`

## Review Notes

- 已单独评估过“服务端读取默认库配置并回填到 token 用户库”的方案。
- 该方案会把默认库的 API key / 模型配置暴露给任意失效 token，请求路径仍然是多租户路由，属于 secret 泄漏风险。
- 该方案已在 review 中否决，最终版本未采用；当前合入版本只在客户端清理失效本地 token，不跨租户复制配置。

## Validation

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

- `npm test`: `566` tests passed / `24` test files
- `npm run typecheck`: passed
- `npm run build`: passed
- `npm run test:e2e`: `45 passed / 3 skipped`

## Residual Risk

- `npm run build` 仍有既有 CSS minify warning 与 chunk size warning；这不是本轮补丁引入，也不阻塞当前稳定性修复。
- 本轮没有改动服务端多租户鉴权逻辑；如果后续要恢复“浏览器自动生成独立 token”能力，需要配套一个显式的 per-user config bootstrap 方案，而不是从默认库隐式继承 secret。
