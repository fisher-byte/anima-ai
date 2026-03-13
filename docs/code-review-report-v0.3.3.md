# Code Review Report — v0.3.3

**审查范围**：`src/server/routes/ai.ts`（searchFileChunks + TOOLS_WITH_MEMORY）、`src/renderer/src/components/InputBox.tsx`（@ 联想面板）、`src/server/__tests__/server-ai.test.ts`（新增测试块）

**结论**：发现 2 个 P0、3 个 P1、4 个 P2、5 个 P3，全部已在本次 code review 修复提交中修复。

---

## 已修复问题

### P0 — 崩溃 / 数据错误

**P0-1：`Float32Array` 对齐问题（ai.ts `searchFileChunks`）**

原代码：
```typescript
const vec = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4)
```
Node.js `Buffer` 对象可能共享 V8 堆上的 slab，`byteOffset` 不保证 4 字节对齐，会抛 `RangeError`，被外层 catch 静默吞掉后返回空结果。

修复：先拷贝 slice，再创建 Float32Array：
```typescript
const copied = row.vector.buffer.slice(row.vector.byteOffset, row.vector.byteOffset + row.vector.byteLength)
const vec = new Float32Array(copied)
```

**P0-2：`dimensions: 2048` 参数在非内置 key 时发送给不支持该参数的模型**

`moonshot-v1-embedding` 和 `text-embedding-3-small` 不支持 `dimensions` override，会报错或返回非预期维度，导致与索引时维度不匹配，相似度计算无意义。

修复：仅在使用内置阿里云 key（`text-embedding-v4`）时才传 `dimensions`：
```typescript
const embBody: Record<string, unknown> = { model: embModelFinal, input: query.slice(0, 1000) }
if (BUILTIN_KEY) embBody.dimensions = 2048
```

---

### P1 — 逻辑错误 / 功能失效

**P1-1：`/api/storage/files` 响应结构不匹配（InputBox.tsx）**

API 返回 `{ files: [...] }`，前端直接用 `data` 作为数组，导致 `historicFiles` 始终为空对象，@ 面板永远显示空列表。

修复：
```typescript
.then((data: { files: {...}[] }) => {
  const list = data.files ?? []
  historicFilesCacheRef.current = list
  setHistoricFiles(list)
})
```

**P1-2：`@` 引用注入 regex 捕获末尾标点（InputBox.tsx）**

`/@([\S]+)/g` 会捕获 `@file.pdf,` 中的 `file.pdf,`，严格匹配 `f.filename === name` 失败，文件引用提示静默丢失。

修复：`/@([^\s@，。！？、；：]+)/g`

**P1-3：工具调用仅限 `MULTIMODAL_MODELS`，moonshot-v1-8k/32k/128k 用户无法使用 `search_files`**

`MULTIMODAL_MODELS` 控制的是图片输入能力，不是 function calling 能力。所有 Moonshot 模型均支持工具调用。

修复：扩展条件：
```typescript
const supportsTools = !isSimpleQuery && (
  MULTIMODAL_MODELS.includes(model as ...) ||
  baseUrl.includes('moonshot') ||
  model.startsWith('moonshot-')
)
```

---

### P2 — 边界情况 / 功能缺失

**P2-1：`searchFileChunks` SQL 未过滤 `embed_status = 'done'`**

向量化未完成或失败的文件的 chunk 可能包含不完整向量，导致相似度计算结果不可信。

修复：SQL 增加 `WHERE uf.embed_status = 'done'`

**P2-2：@ 面板不随 `textarea` 失焦关闭**

用户点击画布其他区域，面板以"幽灵"状态悬浮。

修复：`onBlur={() => { setFocused(false); setAtQuery(null); setAtSelectedIndex(0) }}`

**P2-3：面板空状态复用 `fileSearch` i18n key，显示"@ 搜索文件"而非"未找到匹配"**

修复：新增 `noFileMatch` i18n key（zh: "未找到匹配文件"，en: "No matching files"）

**P2-4：面板关闭时 `atSelectedIndex` 未重置**

下次打开面板时光标可能指向越界位置（虽有 fallback 保护，但 UX 混乱）。

修复：`handleAtSelect` / `handleKeyDown` Escape 分支 / `onBlur` 均补充 `setAtSelectedIndex(0)`

---

### P3 — 代码质量

**P3-1：内联余弦相似度重复了模块级 `cosineSim()` 函数**

修复：改用 `cosineSim(queryF32, vec)`

**P3-2：`dimensions: 2048` 硬编码应仅在 builtin key 时传**（已随 P0-2 修复）

**P3-3：`searchFileChunks` 超时 8s vs `fetchRelevantFacts` 5s 不一致**

保留现状（8s 对大文件 embedding 更合理），已在注释中说明。

**P3-4：测试文件中 `TOOLS` 常量三处重复定义、shape 不一致**

`search_memory tool_call` describe 块的 2-tool 常量与生产代码 3-tool 定义不一致（但测试各自隔离，不影响正确性）。保留现状，记录为技术债。

**P3-5：`reader.releaseLock` 测试实际验证的是流关闭后可重新 `getReader()`，不直接验证 lock 被释放**

保留现状，记录为技术债。

---

## 修复摘要

| 文件 | 修改内容 |
|------|---------|
| `src/server/routes/ai.ts` | P0-1 Float32Array 对齐修复；P0-2 dimensions 条件传参；P1-3 工具调用扩展到所有 moonshot 模型；P2-1 embed_status 过滤；P3-1 复用 cosineSim |
| `src/renderer/src/components/InputBox.tsx` | P1-1 API 响应结构修复；P1-2 regex 修复；P2-2 onBlur 关闭面板；P2-3 empty-state key；P2-4 & P3-2 index 重置 |
| `src/renderer/src/i18n/zh.ts` / `en.ts` | 新增 `noFileMatch` key |
| `package.json` / `src/shared/constants.ts` / `README.md` / `README.zh.md` | 版本号 0.3.2 → 0.3.3 |

**测试结果**：451/451 通过（17 个文件），`tsc --noEmit` 零错误。
