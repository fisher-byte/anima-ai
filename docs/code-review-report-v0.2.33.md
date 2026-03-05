# Anima 代码审查报告 v0.2.33

**审查日期**: 2026-03-06
**审查范围**: v0.2.33 变更（perf + 白屏修复 + gzip_static 修复）
**审查人**: Claude Code Internal

---

## 审查摘要

**总体评估**: ✅ **APPROVE**

本次变更解决了首屏白屏体验和静态资源加载错误两个生产问题，代码改动小而精准，无 P0/P1 问题。

---

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/renderer/src/App.tsx` | 修改 | `authChecked=false` 时显示 loading spinner |
| `src/services/fileParsing.ts` | 修改 | mammoth 改为动态 import，不再打入主 bundle |
| `vite.config.ts` | 修改 | manualChunks 拆分 vendor-react/zustand/markdown |
| `docs/deployment-server.md` | 修改 | gzip_static 改为 off（服务器已同步） |

---

## 详细发现

### P0 - Critical（无）

### P1 - High（无）

### P2 - Medium（1 项，生产已修复）

#### 1. `gzip_static on` + 无预压缩文件 → ERR_EMPTY_RESPONSE

**位置**: Nginx 配置（服务器端）

**问题**: 代码分割后生成了新文件名的 chunk（`vendor-react-*.js`），但服务器上只有旧 bundle 的 `.gz` 预压缩文件。Nginx 的 `gzip_static on` 优先查找 `.gz` 文件，找不到时返回空响应，导致浏览器 `ERR_EMPTY_RESPONSE`。

**修复**: 已将服务器 `/etc/nginx/conf.d/evocanvas.conf` 中 `gzip_static on` 改为 `gzip_static off`，由 Nginx on-the-fly gzip 处理所有文件。已同步 reload nginx，验证 `Content-Encoding: gzip` 正常返回。

**预防**: `deployment-server.md` 中已更新为 `gzip_static off`，确保后续重建时不会重现。

### P3 - Low（1 项）

#### 1. `mammothLib` 类型断言偏宽松

**文件**: `src/services/fileParsing.ts:8`

```ts
let mammothLib: typeof import('mammoth') | null = null
```

**说明**: `typeof import('mammoth')` 引用了整个模块命名空间类型，这是正确用法，但 `null` 初始值需要每次调用 `getMammoth()` 来确保非空。当前实现通过 lazy singleton 模式正确处理，无实际风险。

---

## 性能验证

| 指标 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| 主 bundle gzip | 315 KB | 89 KB | **-72%** |
| 首屏需下载总量 | 315 KB | ~183 KB | **-42%** |
| PDF/Word 解析库 | 首屏加载 | 按需加载 | 不阻塞首屏 |
| 白屏等待 | 无反馈 | loading spinner | UX 改善 |

---

## Nginx 变更记录

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-03-06 | `gzip_static off` | 修复 ERR_EMPTY_RESPONSE，reload nginx 生效 |

---

## 测试覆盖

| 测试类型 | 数量 | 结果 |
|---------|------|------|
| 单元测试（vitest） | 216 | ✅ 全部通过 |
| E2E 测试（playwright） | 10 | ✅ 全部通过 |
| 线上 API 验证 | 核心端点 | ✅ health/auth/storage/config/memory 全部 200 |

**结论**: 可合并，已在生产验证。
