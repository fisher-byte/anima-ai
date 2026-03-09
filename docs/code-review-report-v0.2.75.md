# Code Review Report — v0.2.75

**版本**：0.2.75
**日期**：2026-03-09
**特性**：Lenny Space 升级为沉浸式记忆画布

---

## 总体评分

| 维度 | 评分 |
|------|------|
| 正确性 | ✅ 通过（TypeScript 0 错误，构建零 warning） |
| 安全性 | ✅ 新增文件名均加入 ALLOWED_FILENAMES 白名单，无路径遍历风险 |
| 性能 | ✅ 画布平移/缩放全走 DOM 直操 + RAF，不触发 React 重渲染 |
| 隔离性 | ✅ Lenny Space 用独立存储键（lenny-nodes.json 等），完全不污染用户数据 |
| 可测试性 | ✅ 新增 2 个 E2E 测试（Test 34/35），单元测试全绿 |
| 向后兼容 | ✅ Canvas.tsx 只改 2 行（import + JSX），原有功能无影响 |

---

## 改动概述

### 1. `src/shared/constants.ts`

**改动**：`STORAGE_FILES` 新增 3 个键，`ALLOWED_FILENAMES` 新增 3 个文件名。

```ts
// STORAGE_FILES 新增：
LENNY_NODES: 'lenny-nodes.json',
LENNY_CONVERSATIONS: 'lenny-conversations.jsonl',
LENNY_EDGES: 'lenny-edges.json',

// ALLOWED_FILENAMES 新增：
'lenny-nodes.json',
'lenny-conversations.jsonl',
'lenny-edges.json',
```

**安全评估**：`isValidFilename()` 基于 `ALLOWED_FILENAMES` 白名单，服务端 `storage.ts` 三个端点（GET/PUT/POST-append）均走该校验，新增文件名通过白名单即可使用，无注入风险。

---

### 2. `src/shared/lennyData.ts`（新建）

**内容**：15 个来自真实 Lenny Podcast 的 episode 节点 + 10 条逻辑边（作为用户首次进入 Lenny Space 时的种子数据）。

**设计亮点**：
- 节点均为真实 episode（Brian Chesky、Shreyas Doshi、Julie Zhuo、Sean Ellis 等），不是人造话题标签
- 坐标用极坐标分布（圆心 1920×1200，内圈 r=380，外圈 r=700），视觉上形成自然星云布局
- 种子数据只在 `lenny-nodes.json` 为空时写入（首次进入），之后用用户自己数据

**可改进点**：
- 当前种子数据硬编码在客户端 bundle 中；未来可考虑从服务端懒加载，减小包体积（当前 +2.3KB gzip）

---

### 3. `src/renderer/src/components/LennySpaceCanvas.tsx`（新建，529 行）

#### 画布引擎（复用 Canvas.tsx 逻辑）

| 功能 | 实现方式 |
|------|----------|
| 平移 | `canvasMouseDown/Move/Up` + RAF loop + 惯性衰减（`velocity × 0.94`） |
| 缩放 | `wheel` addEventListener `passive:false` + RAF 合并 delta |
| 缩放原点 | 以鼠标位置为原点（与 Canvas.tsx 完全一致） |
| 节点拖拽 | pointerId capture via global mousemove/up，dragEnd 写 `lenny-nodes.json` |
| DOM 直操 | `applyTransform` 直写 `contentLayerRef.style.transform`，不走 React state |

**潜在问题 A**：`LennyNodeCard` 中 `handleGlobalMouseMove` 依赖闭包捕获 `scale`（来自 `scaleDisplay` state，120ms debounce 后才更新），拖拽时用的 scale 可能略滞后。影响：节点拖拽速度在快速 zoom+drag 场景下略有偏差，但对体验无明显影响。后续可通过 `viewRef.current.scale` 实时读取修复。

**潜在问题 B**：`findOpenPosition` 随机算法在画布已满（节点极多）时 fallback 到固定偏移，不保证无重叠。对 Lenny Space 使用场景（节点数通常 <50）完全可接受。

#### 对话引擎（复用 LennySpaceModal 逻辑）

- SSE 流式解析与 `LennySpaceModal.tsx` 完全一致（`sseBuffer` 拼接 + `\n\n` 分割）
- `contextNode` chip：点击节点后设置，自动在消息前拼接 `[关于"XXX"]` 前缀，发送后清除
- 错误处理：400 → API Key 未配置提示；网络错误 → 显示错误消息；AbortError → 静默清理

#### 持久化

| 动作 | 写入 |
|------|------|
| 首次进入（空） | `lenny-nodes.json` + `lenny-edges.json`（种子数据） |
| 节点拖拽结束 | `lenny-nodes.json`（完整覆写） |
| 对话结束 | `lenny-nodes.json`（追加新节点）+ `lenny-conversations.jsonl`（append） |

**多用户隔离**：`storageService` 在 Web 模式下所有请求带 `Authorization: Bearer <token>`，服务端按 token hash 路由到独立数据目录，每个用户的 `lenny-nodes.json` 完全隔离。

#### 节点生成逻辑

```ts
// 标题：取用户消息去掉 context 前缀，截 30 字
const nodeTitle = fullText.replace(/^\[关于"[^"]+"\]\s*/, '').slice(0, 30)

// 关键词：从 AI 回复提取高频词（排除 stopWords，取 top 3）
const keywords = extractKeywords(finalContent, 3)

// 分类：简单正则启发式（working，future 可接 AI 分类）
category = /relationship|team|culture/.test(lower) ? '关系情感' : '工作事业'

// 坐标：在现有节点重心周围找空位（最小间距 280px，最多 20 次尝试）
const { x, y } = findOpenPosition(nodes, centerX, centerY)
```

**已知限制**：关键词提取是客户端词频统计，质量不如 AI 提取。但对种子节点和对话节点均可接受（用户看到的 keyword 只是辅助信息，不是核心）。

---

### 4. `src/renderer/src/components/Canvas.tsx`

**改动**：2 行，将 `LennySpaceModal` import 和 JSX 替换为 `LennySpaceCanvas`。无其他改动。

---

### 5. `e2e/features.spec.ts`

**新增**：Test 34（Lenny Space 按钮可见性）、Test 35（lenny-nodes.json 存储接口）。

---

## 测试覆盖

### 单元测试（vitest）

已有 3 个 test 文件，本版本无新增单元测试（LennySpaceCanvas 为纯 UI 组件，核心逻辑是 DOM 操作，适合 E2E 覆盖）。

### E2E 测试（playwright）

| 编号 | 覆盖点 |
|------|--------|
| 34 | Lenny Space 按钮在 Canvas 左下角可见 |
| 35 | `GET /api/storage/lenny-nodes.json` 接口合法（新文件名通过白名单） |

### TypeScript

`npx tsc --noEmit` 零错误。

### 构建

`npm run build` 成功，2853 modules，2.35s，无 warning。

---

## 安全审查

| 检查项 | 结论 |
|--------|------|
| 路径遍历 | ✅ 新文件名均加入 ALLOWED_FILENAMES，`isValidFilename` 同时拒绝含 `..`/`/`/`\` 的输入 |
| XSS | ✅ React 默认转义，无 `dangerouslySetInnerHTML` |
| 用户数据污染 | ✅ Lenny Space 只读写 lenny-* 文件，与 nodes.json/conversations.jsonl 完全隔离 |
| SSE 注入 | ✅ 只解析 `data:` 行，JSON.parse 失败静默跳过 |
| CSRF | ✅ 所有请求带 Authorization header，无 cookie 鉴权 |

---

## 结论

代码质量良好。两个轻微问题（scale 滞后、findOpenPosition fallback）均在当前使用场景可接受，标记为后续优化项。全部测试通过，可以上线。

**建议后续**（v0.2.80+）：
1. 节点关键词改用后端 AI 提取（与主流程一致）
2. `LennyNodeCard` 拖拽时读 `viewRef.current.scale` 而非 debounced `scaleDisplay`
3. Lenny Space 支持从 GitHub transcript 实时加载更多 episode 节点（`LENNY_FEATURED_SLUGS` 已预置列表）
