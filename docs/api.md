# EvoCanvas API 文档

## 存储 API

通过 `window.electronAPI.storage` 访问

### read(filename: string): Promise<string | null>

读取文件内容。

```typescript
const content = await window.electronAPI.storage.read('profile.json')
if (content) {
  const profile = JSON.parse(content)
}
```

### write(filename: string, content: string): Promise<boolean>

写入文件内容（覆盖）。

```typescript
const success = await window.electronAPI.storage.write(
  'profile.json',
  JSON.stringify(profile, null, 2)
)
```

### append(filename: string, content: string): Promise<boolean>

追加内容到文件（用于 .jsonl）。

```typescript
await window.electronAPI.storage.append(
  'conversations.jsonl',
  JSON.stringify(conversation)
)
```

## AI 服务 API

### callAI(messages, preferences?): Promise<AIResponse>

非流式调用AI。

```typescript
import { callAI } from './services/ai'

const response = await callAI(
  [{ role: 'user', content: '你好' }],
  ['保持表达简洁']
)

console.log(response.content)  // AI回复
console.log(response.error)    // 错误信息
```

### streamAI(messages, preferences?): AsyncGenerator<string>

流式调用AI。

```typescript
import { streamAI } from './services/ai'

for await (const chunk of streamAI(
  [{ role: 'user', content: '你好' }],
  ['保持表达简洁']
)) {
  if (typeof chunk === 'string') {
    console.log(chunk)  // 逐字输出
  }
}
```

## 反馈服务 API

### detectNegativeFeedback(message): PreferenceRule | null

检测消息中的负反馈。

```typescript
import { detectNegativeFeedback } from './services/feedback'

const rule = detectNegativeFeedback('太复杂了，简洁点')
if (rule) {
  console.log(rule.trigger)      // "简洁点"
  console.log(rule.preference)   // "保持表达简洁：先结论，后要点，避免冗长铺垫"
  console.log(rule.confidence)   // 0.6
}
```

### detectMultipleFeedback(messages): PreferenceRule[]

批量检测多条消息。

```typescript
const rules = detectMultipleFeedback([
  '太复杂了，简洁点',
  '别用这个方案'
])
```

### updateConfidence(rule): PreferenceRule

更新规则置信度。

```typescript
const updated = updateConfidence(existingRule)
// confidence += 0.1 (上限 1.0)
```

### containsTriggerWord(message): boolean

检查是否包含触发词。

```typescript
const hasTrigger = containsTriggerWord('太复杂了')  // true
```

### analyzeFeedbackIntensity(message): number

分析反馈强度。

```typescript
const intensity = analyzeFeedbackIntensity('完全不对！！')  // 0.5
```

## 偏好服务 API

### loadProfile(storage): Promise<Profile>

读取用户配置。

```typescript
import { loadProfile } from './services/profile'

const profile = await loadProfile(window.electronAPI.storage)
```

### saveProfile(storage, profile): Promise<void>

保存用户配置。

```typescript
await saveProfile(window.electronAPI.storage, profile)
```

### addOrUpdateRule(profile, rule): Profile

添加或更新规则。

```typescript
const updated = addOrUpdateRule(profile, newRule)
```

### removeRule(profile, preferenceText): Profile

删除规则。

```typescript
const updated = removeRule(profile, '保持表达简洁...')
```

### getHighConfidencePreferences(profile, threshold?): string[]

获取高置信度偏好。

```typescript
const prefs = getHighConfidencePreferences(profile, 0.7)
// ['保持表达简洁...', '换一种组织方式...']
```

### decayOldPreferences(profile, daysThreshold?): Profile

旧偏好置信度衰减。

```typescript
const updated = decayOldPreferences(profile, 30)
// 30天未更新的偏好 confidence -= 0.1
```

### mergeProfiles(base, incoming): Profile

合并两个配置。

```typescript
const merged = mergeProfiles(currentProfile, importedProfile)
```

### exportProfile(profile): string

导出为JSON字符串。

```typescript
const json = exportProfile(profile)
```

### importProfile(jsonString): Profile

从JSON字符串导入。

```typescript
const profile = importProfile(jsonString)
```

### getProfileStats(profile): ProfileStats

获取配置统计。

```typescript
const stats = getProfileStats(profile)
// {
//   totalRules: 5,
//   highConfidenceRules: 3,
//   averageConfidence: 0.75,
//   oldestRule: '2026-02-01',
//   newestRule: '2026-02-28'
// }
```

## Prompt 服务 API

### buildSystemPrompt(preferences): string

组装System Prompt。

```typescript
import { buildSystemPrompt } from './services/prompt'

const prompt = buildSystemPrompt(['保持表达简洁', '避免emoji'])
// "你是用户的长期AI助手。\n\n以下是用户的历史偏好..."
```

### buildMessages(userMessage, preferences): AIMessage[]

组装消息列表。

```typescript
const messages = buildMessages('你好', ['保持表达简洁'])
// [
//   { role: 'system', content: '...' },
//   { role: 'user', content: '你好' }
// ]
```

### detectPreferenceApplication(response, rule): boolean

检测偏好是否被应用。

```typescript
const isApplied = detectPreferenceApplication(
  '结论：...\n要点1：...\n要点2：...',
  preferenceRule
)
// true (简洁偏好被应用)
```

### detectAppliedPreferences(response, rules): PreferenceRule[]

检测被应用的所有偏好。

```typescript
const applied = detectAppliedPreferences(response, allRules)
```

### generateGrayHint(appliedPreferences): string

生成灰字提示。

```typescript
const hint = generateGrayHint(['保持表达简洁', '换一种组织方式'])
// "我记得你上次更喜欢简洁表达和结构化输出。"
```

### filterValidPreferences(rules, threshold?): string[]

筛选有效偏好。

```typescript
const valid = filterValidPreferences(rules, 0.6)
// ['保持表达简洁...', ...]
```

## Zustand Store API

通过 `useCanvasStore()` Hook 访问。

### State

```typescript
const {
  nodes,              // Node[]
  currentConversation,// Conversation | null
  profile,            // Profile
  isModalOpen,        // boolean
  isLoading           // boolean
} = useCanvasStore()
```

### Actions

#### loadNodes(): Promise<void>

加载节点数据。

```typescript
const { loadNodes } = useCanvasStore()
await loadNodes()
```

#### loadProfile(): Promise<void>

加载用户配置。

```typescript
const { loadProfile } = useCanvasStore()
await loadProfile()
```

#### addNode(conversation, position?): Promise<void>

添加节点。

```typescript
await addNode(conversation, { x: 100, y: 200 })
```

#### removeNode(id): Promise<void>

删除节点。

```typescript
await removeNode('uuid')
```

#### startConversation(userMessage): void

开始对话。

```typescript
startConversation('什么是React？')
// 自动打开AnswerModal并发送给AI
```

#### endConversation(assistantMessage, appliedPreferences?): Promise<void>

结束对话。

```typescript
await endConversation('React是...', ['保持表达简洁'])
// 创建节点并保存数据
```

#### closeModal(): void

关闭回答层。

```typescript
closeModal()
```

#### openModal(conversation): void

打开回答层（回放）。

```typescript
openModal(existingConversation)
```

#### detectFeedback(message): PreferenceRule | null

检测负反馈。

```typescript
const rule = detectFeedback('太复杂了')
if (rule) {
  // 检测到负反馈
}
```

#### addPreference(rule): Promise<void>

添加偏好规则。

```typescript
await addPreference(detectedRule)
```

#### getPreferencesForPrompt(): string[]

获取用于Prompt的偏好。

```typescript
const prefs = getPreferencesForPrompt()
// 只返回 confidence > 0.5 的偏好
```

#### appendConversation(conversation): Promise<void>

追加对话记录。

```typescript
await appendConversation(conversation)
```

## 类型定义

### Node

```typescript
interface Node {
  id: string
  title: string
  keywords: string[]
  date: string
  conversationId: string
  x: number
  y: number
}
```

### Conversation

```typescript
interface Conversation {
  id: string
  createdAt: string
  userMessage: string
  assistantMessage: string
  negativeFeedback?: string
  appliedPreferences?: string[]
}
```

### PreferenceRule

```typescript
interface PreferenceRule {
  trigger: string
  preference: string
  confidence: number
  updatedAt: string
}
```

### Profile

```typescript
interface Profile {
  rules: PreferenceRule[]
}
```

### AIMessage

```typescript
interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
```

### AIResponse

```typescript
interface AIResponse {
  content: string
  error?: string
}
```
