# Anima 代码审查报告（MVP v0.1.0，曾用名 EvoCanvas）

**审查日期**: 2026-02-28
**审查范围**: 完整MVP代码库
**文件统计**: 24个文件, 约1800行代码
**审查人**: Code Review Expert

---

## 审查摘要

**总体评估**: ✅ **APPROVE**

Anima（原 EvoCanvas）MVP 实现了核心功能目标，代码结构清晰，遵循了基本的工程实践。虽然存在一些P2/P3级别的问题，但对于MVP阶段是可接受的，建议在后续版本中逐步改进。

**关键亮点**:
- 模块化设计，职责分离良好
- 使用TypeScript提供类型安全
- 本地优先架构保护用户隐私
- 流式AI响应提升用户体验

---

## 详细发现

### P0 - Critical (无)

未发现严重安全漏洞或数据丢失风险。

### P1 - High (1项)

#### 1. API Key 硬编码风险

**文件**: `src/shared/constants.ts:87`

**问题**: API Key从环境变量读取，但在构建时可能被静态分析提取

```typescript
export const API_CONFIG = {
  BASE_URL: process.env.EVOCANVAS_API_URL || 'https://api.openai.com/v1',
  API_KEY: process.env.EVOCANVAS_API_KEY || ''  // 构建时可能被提取
}
```

**建议**: 
- 在运行时从主进程读取API Key
- 使用Electron的`safeStorage`模块加密存储
- 首次启动时提示用户输入而非依赖环境变量

**修复方案**:
```typescript
// constants.ts
export const API_CONFIG = {
  BASE_URL: process.env.EVOCANVAS_API_URL || 'https://api.openai.com/v1',
  API_KEY: '' // 运行时动态设置
}

// main.ts - 启动时读取
ipcMain.handle('config:getApiKey', async () => {
  return await safeStorage.decryptString(encryptedApiKey)
})
```

---

### P2 - Medium (3项)

#### 2. 文件路径遍历风险

**文件**: `src/main/index.ts:52-71`

**问题**: IPC处理程序直接使用用户提供的filename，未验证文件名合法性

```typescript
ipcMain.handle('storage:read', async (_, filename: string) => {
  const filepath = join(DATA_DIR, filename)  // 可能包含 ../ 等
```

**影响**: 理论上用户可能通过渲染进程读取任意文件

**建议**:
```typescript
// 添加文件名验证
const VALID_FILES = ['profile.json', 'nodes.json', 'conversations.jsonl']

ipcMain.handle('storage:read', async (_, filename: string) => {
  if (!VALID_FILES.includes(filename)) {
    throw new Error('Invalid filename')
  }
  // ...
})
```

---

#### 3. Zustand Store 过于庞大

**文件**: `src/renderer/src/stores/canvasStore.ts` (231行)

**问题**: Store承担了过多职责（UI状态、数据操作、业务逻辑、存储）

**违反**: SRP (Single Responsibility Principle)

**建议拆分**:
```
stores/
  ├── uiStore.ts        # UI状态 (modal, loading)
  ├── nodeStore.ts      # 节点数据操作
  ├── conversationStore.ts # 对话管理
  └── profileStore.ts   # 偏好配置
```

**MVP阶段接受**: 对于MVP，单一store简化了开发，建议v0.2.0拆分

---

#### 4. 缺少API超时和重试机制

**文件**: `src/services/ai.ts:37-50`

**问题**: `fetch`调用没有设置超时，可能导致请求挂起

**建议**:
```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 30000)

const response = await fetch(url, {
  signal: controller.signal,
  // ...
})
clearTimeout(timeoutId)
```

---

### P3 - Low (5项)

#### 5. 魔法字符串分散

**文件**: 多个文件

**问题**: 一些字符串未使用常量定义

```typescript
// AnswerModal.tsx
setResponse(prev => prev + '\n\n[错误: ' + error + ']')
// 应该使用常量
```

**建议**: 将所有用户可见字符串集中到`constants.ts`

---

#### 6. 类型定义可以更加严格

**文件**: `src/shared/types.ts`

**问题**: 一些类型使用基础类型，可以更加精确

```typescript
// 当前
type NodePosition = { x: number; y: number }

// 建议
interface NodePosition {
  x: number  // 0 - 10000
  y: number  // 0 - 10000
}
```

---

#### 7. 缺少单元测试

**范围**: 所有service文件

**问题**: 核心业务逻辑（feedback检测、prompt组装）没有单元测试

**建议MVP后补充**:
```typescript
// feedback.test.ts
describe('detectNegativeFeedback', () => {
  it('should detect "简洁点"', () => {
    const result = detectNegativeFeedback('太复杂了，简洁点')
    expect(result?.preference).toBe('保持表达简洁...')
  })
})
```

---

#### 8. 错误信息未国际化

**范围**: 所有组件

**问题**: 错误提示和界面文字都是中文硬编码，不利于国际化

**MVP阶段接受**: 当前版本专注中文用户，后续考虑i18n

---

#### 9. 缺少loading状态的防抖

**文件**: `src/renderer/src/components/InputBox.tsx`

**问题**: 用户快速点击发送可能触发多次请求

**建议**:
```typescript
const [isSubmitting, setIsSubmitting] = useState(false)

const handleSubmit = async () => {
  if (isSubmitting) return
  setIsSubmitting(true)
  // ...
  setIsSubmitting(false)
}
```

---

## SOLID 分析

| 原则 | 评分 | 说明 |
|------|------|------|
| **SRP** | ⭐⭐⭐ | Store过于庞大，建议拆分 |
| **OCP** | ⭐⭐⭐⭐ | 新触发词只需添加配置，无需修改核心逻辑 |
| **LSP** | N/A | 当前没有使用继承 |
| **ISP** | ⭐⭐⭐⭐ | 接口定义精简 |
| **DIP** | ⭐⭐⭐ | 部分地方依赖具体实现 |

---

## 安全扫描

| 检查项 | 状态 | 备注 |
|--------|------|------|
| XSS | ✅ | 未使用dangerouslySetInnerHTML |
| 注入攻击 | ✅ | 无SQL/命令执行 |
| 路径遍历 | ⚠️ | 需要添加文件名验证 |
| 秘密泄露 | ⚠️ | API Key存储需要改进 |
| 原型污染 | ✅ | 对象合并安全 |

---

## 性能评估

| 检查项 | 状态 | 建议 |
|--------|------|------|
| 流式响应 | ✅ | 实现良好 |
| 存储优化 | ⚠️ | 节点位置变化应批量写入 |
| 内存管理 | ✅ | 无内存泄漏风险 |
| 渲染性能 | ✅ | 当前节点数量不需要虚拟列表 |

---

## 代码质量亮点

### ✅ 值得保留的实践

1. **类型安全**: 完整的TypeScript类型定义
2. **错误处理**: 关键路径都有try-catch
3. **IPC安全**: 使用contextBridge正确隔离主进程API
4. **模块化**: services层清晰分离业务逻辑
5. **常量集中**: 配置项统一管理

---

## 建议修复优先级

### 必须修复 (v0.1.1)
- [ ] P1-1: 文件路径验证
- [ ] P1-4: API超时机制

### 建议修复 (v0.2.0)
- [ ] P1-2: API Key安全存储
- [ ] P2-3: Store拆分
- [ ] P3-7: 单元测试

### 可选优化 (后续版本)
- [ ] P3-5: 魔法字符串清理
- [ ] P3-6: 类型严格化
- [ ] P3-8: i18n支持

---

## 总结

Anima 代码质量整体良好，架构设计合理，核心功能实现完整。建议优先修复P1级别的安全和稳定性问题，然后按计划迭代功能。

**推荐行动**: 
1. ✅ 批准当前MVP版本
2. 📝 创建v0.1.1任务修复P1问题
3. 📋 规划v0.2.0架构优化

---

**审查完成时间**: 2026-02-28
**下次审查建议**: v0.1.1发布前
