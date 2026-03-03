# Anima 开发笔记

## 设计决策

### 为什么选择 Electron + React?

1. **本地优先**: 用户数据完全本地存储，保护隐私
2. **可扩展**: 未来可添加本地模型支持（如 Ollama）
3. **统一体验**: 跨平台一致的UI体验
4. **开发效率**: React + TypeScript 生态成熟

### 为什么用 .jsonl 存储对话?

- **追加写入**: 不需要读取整个文件再重写
- **容错性**: 单条记录损坏不影响其他记录
- **可查询**: 可以用 grep 命令行查询
- **可恢复**: 即使文件末尾损坏，前面的记录仍可读取

### 为什么置信度系统?

不是简单的布尔值，而是用置信度表示：
- 用户多次强调的偏好 → 高置信度
- 很久之前的偏好 → 低置信度（需要衰减）
- 只应用高置信度偏好（>0.5）

这让AI"记忆"更加智能，不是机械的记住，而是有重点的记住。

## 踩坑记录

### 1. 流式响应的字符处理

**问题**: fetch 返回的 chunks 可能包含不完整的 UTF-8 字符

**解决**: 使用 TextDecoder 的 stream 模式
```typescript
const decoder = new TextDecoder()
for await (const chunk of reader.read()) {
  const text = decoder.decode(chunk.value, { stream: true })
  // ...
}
```

### 2. Electron 主进程和渲染进程的通信

**问题**: 直接使用 ipcRenderer 在渲染进程会报错

**解决**: 必须通过 Preload 脚本暴露安全的 API
```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  storage: { /* ... */ }
})

// renderer.ts
const content = await window.electronAPI.storage.read('file.json')
```

### 3. 拖拽时的坐标计算

**问题**: 节点位置在画布拖拽后错位

**解决**: 使用相对坐标，拖拽时应用 offset 变换
```typescript
div.style.transform = `translate(${-offset.x}px, ${-offset.y}px)`
```

### 4. Zustand 的异步 action

**问题**: async action 完成后 state 没有更新

**解决**: 在 async 函数内使用 set() 更新 state
```typescript
addNode: async (conversation) => {
  // ... 计算新节点
  const updatedNodes = [...get().nodes, newNode]
  set({ nodes: updatedNodes })  // 正确
  await storage.write(...)       // 然后持久化
}
```

### 5. 负反馈检测的时机

**问题**: 应该在哪一步检测反馈？

**方案演进**:
1. v1: 发送消息后立即检测 → 不对，用户还没看到回答
2. v2: 回答完成后检测 → 可以，但用户需要主动输入反馈
3. v3 (当前): 在 AnswerModal 提供反馈输入框，实时检测 → 最好

### 6. 节点标题生成策略

**尝试**: 用 AI 生成标题

**问题**: 
- 增加一次 API 调用
- 延迟节点显示
- 增加成本

**最终方案**: 从用户消息提取前8个字符
- 简单、快速、准确
- 用户一眼就知道是哪个问题

### 7. 关键词提取

**尝试**: 用 AI 提取关键词

**问题**: 
- 和标题生成一样的问题
- 简单的词频统计效果也不错

**最终方案**: 从 AI 回答中提取 2-6 字长度的词，取前3个

## 性能优化

### 1. 存储写入优化

**原方案**: 每次操作都立即写入文件

**问题**: 频繁写入影响性能

**优化**: 
- 节点位置变化：暂时不写入（后续批量写入）
- 重要数据（对话、偏好）：立即写入

### 2. 状态更新优化

**原方案**: 每次数组操作都创建新数组

**优化**: 使用 Immer（通过 Zustand 中间件）
```typescript
import { immer } from 'zustand/middleware/immer'

export const useCanvasStore = create(immer<CanvasState>((set, get) => ({
  // ...
})))
```

### 3. 节点渲染优化

**计划**: 使用虚拟列表（后续版本）
```typescript
// 当节点数量 > 100 时使用虚拟列表
import { VirtualList } from 'react-virtual'
```

## 安全考虑

### 1. 数据目录

```typescript
const DATA_DIR = join(app.getPath('userData'), 'data')
```
- 不使用项目目录，防止 git 误提交
- 使用 Electron 的标准数据目录

### 2. 存储操作限制

只暴露三个操作：
- `read(filename)` - 读指定文件
- `write(filename, content)` - 写指定文件
- `append(filename, content)` - 追加到指定文件

不暴露：
- 删除文件
- 列出目录
- 执行任意文件操作

### 3. API Key 存储

**当前**: 从环境变量读取
**计划**: 
- 首次启动时提示用户输入
- 存储在系统 keychain（后续版本）

## 测试策略

### 单元测试（计划中）

```typescript
// services/feedback.test.ts
describe('detectNegativeFeedback', () => {
  it('should detect "简洁点"', () => {
    const result = detectNegativeFeedback('太复杂了，简洁点')
    expect(result?.trigger).toBe('简洁点')
  })
})
```

### 集成测试（计划中）

```typescript
// 测试完整对话流程
describe('conversation flow', () => {
  it('should create node after conversation', async () => {
    // ...
  })
})
```

### 手动测试清单

- [ ] 首次打开显示空白画布
- [ ] 输入问题，点击发送
- [ ] 看到流式AI回复
- [ ] 关闭后画布出现节点
- [ ] 输入"简洁点"，重新回答
- [ ] profile.json 记录偏好
- [ ] 再问类似问题，看到灰字提示
- [ ] 重启应用，节点和偏好都在

## 调试技巧

### 查看存储数据

```bash
# macOS
open ~/Library/Application\ Support/anima/data/

# Windows
explorer %APPDATA%\anima\data\

# Linux
xdg-open ~/.config/anima/data/
```

### 调试主进程

```bash
npm run dev -- --remote-debugging-port=9223
# 然后在 Chrome 访问 chrome://inspect
```

### 查看 Zustand 状态

```typescript
// 在控制台查看
const state = useCanvasStore.getState()
console.log(state.nodes)
console.log(state.profile)
```

## 未来想法

### 可能的改进

1. **更智能的偏好检测**
   - 使用简单的 NLP 而非关键词匹配
   - 理解用户的隐含意图

2. **偏好可视化**
   - 显示当前已学习的偏好列表
   - 让用户手动编辑置信度

3. **对话分组**
   - 相似的对话自动聚类
   - 不显示连线，只显示空间位置相近

4. **本地模型支持**
   - 集成 Ollama
   - 完全离线运行

5. **导入/导出**
   - 导出所有数据为 Anima 画布文件（如 .anima）
   - 支持分享给其他用户

### 不做的功能（克制）

- 自动连线图谱（MVP 不验证这个）
- DNA HUD 可视化（太复杂）
- 多模型切换 UI（MVP 锁定单一模型）
- 设置页面（MVP 无设置）
- 教程/引导（MVP 无引导）

## 参考资源

- [Electron Vite 官方文档](https://electron-vite.org/)
- [Zustand 文档](https://docs.pmnd.rs/zustand)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [OpenAI API 文档](https://platform.openai.com/docs)

## 开发者心得

> "最好的功能是不存在的功能。"

MVP 的核心教训：
1. 砍掉一切不直接服务于"默契感"的功能
2. 简单规则系统比复杂 AI 更可控
3. 本地存储比云端同步更能建立信任感
4. 一行灰字比任何解释UI都更有效
