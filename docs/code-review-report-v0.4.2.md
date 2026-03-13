# Code Review Report — v0.4.2

**审查范围**：`src/renderer/src/components/CustomSpaceCanvas.tsx`、`src/renderer/src/components/CreateCustomSpaceModal.tsx`、`src/renderer/src/stores/canvasStore.ts`（Custom Space 扩展）、`src/renderer/src/components/Canvas.tsx`（My Spaces 区域）、`src/renderer/src/components/AnswerModal.tsx`（isCustomSpaceMode 路由）、`src/shared/constants.ts`（isValidFilename 重构）、`src/shared/types.ts`（CustomSpaceConfig）、`src/renderer/src/stores/__tests__/canvasStore.customSpaceMode.test.ts`

**结论**：发现 2 个 P2、2 个 P3。P2-1 已在本次 review 修复（delete 按钮 nodeType 守卫），P2-2 已修复（Canvas.tsx 冗余 style 属性）。0 个 P0/P1。**core 隔离机制和安全防护正确无误。**

---

## P0 — 崩溃 / 数据错误

**无。**

核心路径验证通过：
- `createCustomSpace` 正确生成 8 位小写 id，写 `custom-spaces.json` 再更新 store
- `deleteCustomSpace` 从列表移除后更新文件，不删除历史对话文件（设计正确，保留数据）
- `endConversation` Custom Space 分支：append `conversations.jsonl` + 写 `nodes.json` + 不调 `sync-lenny-conv`
- `openCustomSpaceMode` 正确清除所有其他 Space 标志（isLennyMode/isPGMode/isZhangMode/isWangMode）
- `appendConversation` 正确路由到 `custom-{id}-conversations.jsonl`，不污染 `conversations.jsonl`

---

## P1 — 逻辑错误 / 功能失效

**无。**

- `AnswerModal.tsx` isCustomSpaceMode 检查优先于 isLennyMode（正确），使用 `activeSpace?.systemPrompt ?? LENNY_SYSTEM_PROMPT` 有安全降级
- `isValidFilename` 双重验证：静态白名单 + `CUSTOM_SPACE_FILE_RE`，两者均覆盖 `..` / `/` / `\` 路径注入防护
- `CustomSpaceCanvas` 6 处 `custom-${config.id}-*` 文件名引用一致，无拼写错误
- `closeCustomSpaceMode` 正确设置 `isModalOpen: false`，不会出现 Modal 残留

---

## P2 — 边界情况 / 功能缺失

**P2-1：`CustomNodeCard` delete 按钮 nodeType 守卫过严（已修复）**

**文件**：`src/renderer/src/components/CustomSpaceCanvas.tsx:184`

**问题**：原代码 `node.nodeType === 'memory'` 在 nodeType 为 `undefined`（旧格式节点）时不显示删除按钮，导致用户无法删除历史遗留节点。Custom Space 中所有节点均是用户可删除的对话节点，无 `capability` 节点。

**修复**：改为 `node.nodeType !== 'capability'`，与 `PGSpaceCanvas` 等其他 Space 保持一致。

**修复状态**：✅ 已修复

---

**P2-2：`Canvas.tsx` My Spaces 区域冗余 style 属性（已修复）**

**文件**：`src/renderer/src/components/Canvas.tsx:1028`

**问题**：`className="fixed left-4 bottom-4 ..."` 与 `style={{ bottom: customSpaces.length > 0 ? '8.5rem' : '8.5rem' }}` 同时存在，且三元表达式两侧值相同（均为 `'8.5rem'`），className 中的 `bottom-4` 永远被 inline style 覆盖。

**修复**：移除冗余 className `bottom-4`，使用单一 `style={{ bottom: '8.5rem' }}`。

**修复状态**：✅ 已修复

---

## P3 — 代码质量 / 文档

**P3-1：`deleteCustomSpace` 不删除遗留文件**

**文件**：`src/renderer/src/stores/canvasStore.ts`

**观察**：删除 Space 时只从 `customSpaces[]` 移除 + 更新 `custom-spaces.json`，不删除 `custom-{id}-nodes.json` / `custom-{id}-conversations.jsonl` / `custom-{id}-edges.json`。

**评估**：属于设计取舍，保留历史数据防止误删，且文件名不再被 `isValidFilename` 新写路径（重用旧 id 概率极低），不视为 bug。**可接受**，建议后续版本添加可选的"同时删除对话文件"确认选项。

---

**P3-2：`buildCustomSpacePrompt` 英文 hardcode**

**文件**：`src/shared/constants.ts`

**观察**：`buildCustomSpacePrompt` 生成的默认 prompt 为英文（"You are ... — an AI persona focused on ..."），对中文用户略显突兀。

**评估**：中低影响，用户可在创建时自定义 prompt，默认 prompt 仅作兜底。**不阻塞发版**，可在后续 i18n 迭代中改进。

---

## 安全审查

| 检查项 | 结果 |
|--------|------|
| 文件路径遍历（`..` / `/` / `\`） | ✅ isValidFilename 第一步防护 |
| 自定义 Space 文件名正则强度 | ✅ `/^custom-[a-z0-9]{8}-(nodes\.json|conversations\.jsonl|edges\.json)$/` 精确匹配 |
| 5 个 Space 数量上限 | ✅ `createCustomSpace` 在写文件前检查 `customSpaces.length >= 5` |
| Custom Space 对话不流入主记忆 | ✅ `endConversation` custom 分支不调 `sync-lenny-conv` |
| 自定义 systemPrompt XSS | N/A — systemPrompt 作为 API 请求 body 参数，不经 innerHTML 渲染 |

---

## 测试覆盖评估

| 覆盖面 | 状态 |
|--------|------|
| `openCustomSpaceMode` 互斥清除 | ✅ canvasStore.customSpaceMode.test.ts |
| `createCustomSpace` 写文件 + 追加数组 | ✅ |
| `createCustomSpace` max-5 抛错 | ✅ |
| `deleteCustomSpace` | ✅ |
| `addNode` 在 customSpaceMode 早返回 | ✅ |
| `appendConversation` 路由到 custom 文件 | ✅ |
| `isValidFilename` 7 种 custom 文件名变体 | ✅ |
| `CreateCustomSpaceModal` UI 测试 | ❌ 未覆盖（低优先级，UI 逻辑简单） |
| `CustomSpaceCanvas` 物理模拟 | ❌ 未覆盖（RAF 动画难以单测） |

---

## 总结

v0.4.2 的自定义 Space 核心功能实现正确：存储隔离彻底、安全防护到位、模式切换与现有 Space 架构对称。2 个 P2 问题已在 review 过程中修复。代码质量与 v0.4.0/v0.4.1 保持一致。

**vitest 493/493 | tsc 0 errors | 无 P0/P1**
