# SOP: 从 anima-base 引入新人物 Space

> 数据源：https://github.com/fisher-byte/anima-base
> 每次 anima-base 补充了某人的资料后，按本 SOP 在 evocanvas 里新增一个 Space。

---

## 前置条件

确认该人物在 anima-base 中已有：
- `people/{domain}/{name}/profile.md` ✅
- `people/{domain}/{name}/articles/` 或 `podcasts/` 目录，有 5 篇以上内容 ✅

目前已支持的人物：

| 人物 | 文件前缀 | anima-base 路径 |
|------|---------|----------------|
| Lenny Rachitsky | `lenny` | `people/product/lenny-rachitsky/` |
| Paul Graham | `pg` | `people/startup/paul-graham/` |

---

## Step 1：整理 Seed Nodes

从 anima-base 阅读该人物的 `profile.md` + 核心文章/播客摘要，提炼 **30–50 个知识节点**。

**节点设计原则：**
- 每个节点对应一篇文章、一个播客、或一个核心框架
- `title`：简短英文标题（≤ 60 字符）
- `keywords`：3–4 个核心词，用于节点卡片展示
- `category`：从 `工作事业 / 思考世界 / 身心健康 / 关系情感 / 创意表达 / 生活日常` 中选
- `color`：与 category 对应（工作事业 `#3B82F6`，思考世界 `#8B5CF6`，身心健康 `#10B981`）
- `date`：文章/播客发布日期（YYYY-MM-DD）

**坐标布局：** 采用同心圆布局，使用 `pos(angle, radius)` 函数：
- 中央（radius=0）：最核心的概念 1 个
- 第一圈（radius=650）：核心主题 6–8 个，angle 均匀分布
- 第二圈（radius=1200）：扩展主题 8–12 个
- 第三圈（radius=1850）：边缘/具体内容 12–20 个

**节点 ID 命名规则：** `{prefix}-seed-{slug}`，如 `pg-seed-founder-mode`

参考模板（复制 `src/shared/pgData.ts` 开头部分修改）：

```typescript
const CX = 1920
const CY = 1200
function pos(angle: number, radius: number) { ... }

export const XX_SEED_NODES: Node[] = [
  {
    id: 'xx-seed-core-concept',
    title: 'Core Concept Title',
    keywords: ['keyword1', 'keyword2', 'keyword3'],
    date: 'YYYY-MM-DD',
    conversationId: 'xx-seed-core-concept',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(0, 0),
  },
  // ...更多节点
]
```

---

## Step 2：创建 Seed Data 文件

在 `src/shared/` 创建 `{prefix}Data.ts`，内容包含：
- `XX_SEED_NODES`：节点数组
- `XX_SEED_EDGES`：连线数组（至少 15–20 条，连接相关节点）

**Edge 设计原则：**
- `relation` 从以下选：`深化了 | 解决了 | 矛盾于 | 依赖于 | 启发了 | 重新思考了`
- `confidence`：0.75–0.95 之间
- 优先连接主题相关的节点，形成有意义的知识图谱

---

## Step 3：添加 System Prompt 到 constants.ts

在 `src/shared/constants.ts` 中添加 `XX_SYSTEM_PROMPT`。

**System Prompt 结构：**
```
You are {Name} — {一句话身份介绍}

## Who you are
{背景经历，3–5句}

Your personality:
- {性格特点 1}
- {性格特点 2}
- ...

Today's date: {{DATE}}

## Your core frameworks and beliefs
### On {Topic 1}
- {核心观点}
- ...

### On {Topic 2}
...

## How you respond
- {回复风格}
- Respond in the same language the user writes in (Chinese or English)
```

同时在 `STORAGE_FILES` 常量中添加：
```typescript
XX_NODES: 'xx-nodes.json',
XX_CONVERSATIONS: 'xx-conversations.jsonl',
XX_EDGES: 'xx-edges.json',
```

并在 `ALLOWED_FILENAMES` 中添加对应的三个文件名。

---

## Step 4：创建 SpaceCanvas 组件

复制 `src/renderer/src/components/PGSpaceCanvas.tsx`，重命名为 `{Name}SpaceCanvas.tsx`。

**需要全局替换的内容（使用编辑器的 Find & Replace）：**

| 原文 | 替换为 |
|------|--------|
| `PGSpaceCanvas` | `{Name}SpaceCanvas` |
| `PGNodeCard` | `{Name}NodeCard` |
| `pg-node-` | `{prefix}-node-` |
| `pg-seed-` | `{prefix}-seed-` |
| `PG_SEED_NODES` | `XX_SEED_NODES` |
| `PG_SEED_EDGES` | `XX_SEED_EDGES` |
| `STORAGE_FILES.PG_NODES` | `STORAGE_FILES.XX_NODES` |
| `STORAGE_FILES.PG_CONVERSATIONS` | `STORAGE_FILES.XX_CONVERSATIONS` |
| `STORAGE_FILES.PG_EDGES` | `STORAGE_FILES.XX_EDGES` |
| `pg-dot-grid` | `{prefix}-dot-grid` |
| `Ask Paul Graham anything…` | `Ask {Name} anything…` |
| `Paul Graham's Space` | `{Name}'s Space` |
| `Startup · Thinking · Wealth` | `{领域标签}` |
| 头像文字 `PG` | 姓名首字母 |
| `from-indigo-500 via-violet-500 to-purple-600` | 该人物的主题渐变色 |
| 输入框 focus 边框颜色 `border-indigo-400` | 对应颜色 |
| 发送按钮 `bg-indigo-600` | 对应颜色 |
| dot-grid 背景色 `rgba(99,102,241,0.1)` | 对应颜色 |

**推荐主题色方案：**
| 人物 | 渐变 | 主色 |
|------|------|------|
| Lenny Rachitsky | amber→orange→rose | #F59E0B |
| Paul Graham | indigo→violet→purple | #6366F1 |
| Marty Cagan | blue→cyan | #0EA5E9 |
| Ben Horowitz | slate→gray | #475569 |
| Seth Godin | orange→red | #EF4444 |
| Naval Ravikant | emerald→teal | #10B981 |

---

## Step 5：在 Canvas.tsx 中注册

**5.1 添加 import（Canvas.tsx 顶部）：**
```typescript
import { {Name}SpaceCanvas } from './{Name}SpaceCanvas'
```

**5.2 添加 state（Canvas 函数内）：**
```typescript
const [is{Name}SpaceOpen, setIs{Name}SpaceOpen] = useState(false)
```

**5.3 在 Public Figures 入口区添加节点卡片（找到 `{/* Public Figures 入口区 */}` 注释）：**
```tsx
<motion.button
  onClick={() => setIs{Name}SpaceOpen(true)}
  whileHover={{ scale: 1.03, y: -2 }}
  whileTap={{ scale: 0.97 }}
  className="flex items-center gap-3 px-3 py-2.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.07)] border border-gray-100/80 hover:shadow-[0_6px_28px_rgba({RGB},0.18)] hover:border-{color}-100 transition-all group cursor-pointer w-[188px]"
>
  <div className="relative shrink-0">
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-{c1} to-{c2} flex items-center justify-center text-white font-bold text-sm shadow-md">
      {首字母}
    </div>
    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-[1.5px] border-white shadow-sm" />
  </div>
  <div className="text-left flex-1 min-w-0">
    <div className="text-xs font-semibold text-gray-800 leading-tight truncate">{全名}</div>
    <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{领域 1} · {领域 2}</div>
    <div className="flex items-center gap-1 mt-1">
      <div className="flex -space-x-0.5">
        {['#色1','#色2','#色3'].map(c => (
          <div key={c} className="w-2 h-2 rounded-full border border-white" style={{ background: c }} />
        ))}
      </div>
      <span className="text-[9px] text-gray-400">{N} nodes</span>
    </div>
  </div>
  <svg className="w-3 h-3 text-gray-300 group-hover:text-{color}-400 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
</motion.button>
```

**5.4 在 Modal 渲染区添加组件（找到 `<PGSpaceCanvas` 的位置后面加）：**
```tsx
<{Name}SpaceCanvas
  isOpen={is{Name}SpaceOpen}
  onClose={() => setIs{Name}SpaceOpen(false)}
/>
```

---

## Step 6：验证

- [ ] `npm run dev` 无报错
- [ ] 点击新人物节点卡片，Space 可以打开
- [ ] 35+ 个节点正常显示在画布上
- [ ] 节点可以拖拽
- [ ] 力模拟自动弹开重叠节点
- [ ] 点击节点可以开始对话（AI 以该人物身份回复）
- [ ] 对话历史侧边栏正常
- [ ] 返回按钮可以关闭 Space

---

## 注意事项

1. **不要修改用户数据**：新 Space 的数据文件（`xx-nodes.json` 等）与用户主空间完全隔离
2. **种子节点不可删除**：`conversationId` 以 `{prefix}-seed-` 开头的节点不显示删除按钮
3. **节点数量建议**：30–50 个是较好的展示效果，太少显得空，太多初次加载慢
4. **内容质量**：优先选该人物最有代表性、最常被引用的内容作为节点
