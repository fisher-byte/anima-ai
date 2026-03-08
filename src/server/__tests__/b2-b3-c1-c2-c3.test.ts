/**
 * B2/B3/C1/C2/C3 功能测试
 *
 * B2：主动记忆触发冷却逻辑
 * B3：Layer 2.7 逻辑脉络注入逻辑
 * C1：TimelineView 分组 / 排序 / 行高计算
 * C2：setFocusedCategory 状态机
 * C3：24h 触发条件判断
 *
 * 全为纯逻辑单元测试，无 HTTP / DOM 依赖。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

// ────────────────────────────────────────────────────────
// Shared DB setup helper
// ────────────────────────────────────────────────────────

function buildDb() {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      retries INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT, finished_at TEXT, error TEXT
    );
    CREATE TABLE IF NOT EXISTS user_mental_model (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      model_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logical_edges (
      id          TEXT NOT NULL PRIMARY KEY,
      source_conv TEXT NOT NULL,
      target_conv TEXT NOT NULL,
      relation    TEXT NOT NULL DEFAULT '',
      reason      TEXT NOT NULL DEFAULT '',
      confidence  REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_logical_edges_source ON logical_edges(source_conv);
    CREATE INDEX IF NOT EXISTS idx_logical_edges_target ON logical_edges(target_conv);
  `)
  return db
}

// ────────────────────────────────────────────────────────
// B2 — 主动记忆触发冷却逻辑
// ────────────────────────────────────────────────────────

/**
 * 内联 B2 触发判断（镜像 ai.ts 逻辑）
 * 返回是否应该 enqueue
 */
function shouldEnqueueMM(
  db: ReturnType<typeof buildDb>,
  isOnboarding: boolean,
  fullContentLength: number,
  nowMs = Date.now()
): boolean {
  if (isOnboarding || fullContentLength <= 80) return false
  const pendingMM = db.prepare(
    "SELECT id FROM agent_tasks WHERE type='extract_mental_model' AND status IN ('pending','running') LIMIT 1"
  ).get()
  if (pendingMM) return false
  const mmRow = db.prepare('SELECT updated_at FROM user_mental_model WHERE id=1').get() as { updated_at: string } | undefined
  const lastUpdateMs = mmRow ? new Date(mmRow.updated_at).getTime() : 0
  const lastUpdate = isNaN(lastUpdateMs) ? 0 : lastUpdateMs
  return nowMs - lastUpdate > 10 * 60 * 1000
}

describe('B2: 主动记忆触发冷却逻辑', () => {
  let db: ReturnType<typeof buildDb>
  beforeEach(() => { db = buildDb() })

  it('首次（无心智模型记录）且内容足够长 → 应触发', () => {
    expect(shouldEnqueueMM(db, false, 100)).toBe(true)
  })

  it('引导模式 → 不触发', () => {
    expect(shouldEnqueueMM(db, true, 200)).toBe(false)
  })

  it('内容 ≤80 字 → 不触发', () => {
    expect(shouldEnqueueMM(db, false, 80)).toBe(false)
  })

  it('内容 81 字（边界）→ 应触发', () => {
    expect(shouldEnqueueMM(db, false, 81)).toBe(true)
  })

  it('已有 pending 任务 → 不重复触发', () => {
    db.prepare("INSERT INTO agent_tasks (type, status, created_at) VALUES ('extract_mental_model','pending',?)").run(new Date().toISOString())
    expect(shouldEnqueueMM(db, false, 200)).toBe(false)
  })

  it('已有 running 任务 → 不重复触发', () => {
    db.prepare("INSERT INTO agent_tasks (type, status, created_at) VALUES ('extract_mental_model','running',?)").run(new Date().toISOString())
    expect(shouldEnqueueMM(db, false, 200)).toBe(false)
  })

  it('心智模型 6 分钟前更新 → 在冷却窗口内不触发', () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    db.prepare("INSERT INTO user_mental_model (id, model_json, updated_at) VALUES (1, '{}', ?)").run(sixMinutesAgo)
    expect(shouldEnqueueMM(db, false, 200)).toBe(false)
  })

  it('心智模型 11 分钟前更新 → 冷却结束，应触发', () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    db.prepare("INSERT INTO user_mental_model (id, model_json, updated_at) VALUES (1, '{}', ?)").run(elevenMinutesAgo)
    expect(shouldEnqueueMM(db, false, 200)).toBe(true)
  })

  it('心智模型 updated_at 为无效日期字符串 → 视为 0，应触发', () => {
    db.prepare("INSERT INTO user_mental_model (id, model_json, updated_at) VALUES (1, '{}', ?)").run('invalid-date')
    expect(shouldEnqueueMM(db, false, 200)).toBe(true)
  })

  it('completed 任务不阻塞新触发', () => {
    db.prepare("INSERT INTO agent_tasks (type, status, created_at) VALUES ('extract_mental_model','completed',?)").run(new Date().toISOString())
    expect(shouldEnqueueMM(db, false, 200)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────
// B3 — Layer 2.7 逻辑脉络注入逻辑
// ────────────────────────────────────────────────────────

/** 内联 Layer 2.7 注入逻辑（镜像 ai.ts） */
function buildLayer27Block(
  db: ReturnType<typeof buildDb>,
  conversationId: string | undefined,
  contextTokensUsed: number,
  contextBudget: number
): string {
  if (!conversationId) return ''
  const relatedEdges = db.prepare(`
    SELECT relation, reason
    FROM logical_edges
    WHERE (source_conv = ? OR target_conv = ?) AND confidence >= 0.6
    ORDER BY confidence DESC LIMIT 5
  `).all(conversationId, conversationId) as Array<{ relation: string; reason: string }>

  if (relatedEdges.length === 0) return ''

  const block = '\n\n【与本话题相关的逻辑脉络（请在回答中主动关联）】\n'
    + relatedEdges.map((e, i) => `${i + 1}. ${e.relation}：${e.reason.slice(0, 60)}`).join('\n')

  // 简化 token 计数（每字 1 token 近似）
  const cost = block.length
  if (contextTokensUsed + cost > contextBudget) return ''
  return block
}

describe('B3: Layer 2.7 逻辑脉络注入', () => {
  let db: ReturnType<typeof buildDb>
  beforeEach(() => { db = buildDb() })

  it('无 conversationId → 返回空字符串', () => {
    expect(buildLayer27Block(db, undefined, 0, 1500)).toBe('')
  })

  it('无匹配边 → 返回空字符串', () => {
    expect(buildLayer27Block(db, 'conv-1', 0, 1500)).toBe('')
  })

  it('confidence < 0.6 的边不被注入', () => {
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-2','低置信关系','原因',0.4,?)").run(new Date().toISOString())
    expect(buildLayer27Block(db, 'conv-1', 0, 1500)).toBe('')
  })

  it('confidence = 0.6（边界）→ 被注入', () => {
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-2','因果','因为某原因',0.6,?)").run(new Date().toISOString())
    const block = buildLayer27Block(db, 'conv-1', 0, 1500)
    expect(block).toContain('因果')
    expect(block).toContain('逻辑脉络')
  })

  it('source_conv 匹配 → 被注入', () => {
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-9','递进','下一步',0.8,?)").run(new Date().toISOString())
    expect(buildLayer27Block(db, 'conv-1', 0, 1500)).toContain('递进')
  })

  it('target_conv 匹配 → 也被注入', () => {
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-9','conv-1','对比','区别在于',0.8,?)").run(new Date().toISOString())
    expect(buildLayer27Block(db, 'conv-1', 0, 1500)).toContain('对比')
  })

  it('最多注入 5 条边', () => {
    for (let i = 0; i < 8; i++) {
      db.prepare("INSERT INTO logical_edges VALUES (?,?,?,'关系','原因',0.9,?)").run(
        `e${i}`, 'conv-1', `conv-${i + 10}`, new Date().toISOString()
      )
    }
    const block = buildLayer27Block(db, 'conv-1', 0, 99999)
    // 最多 5 条，编号 1-5
    expect(block).toContain('5.')
    expect(block).not.toContain('6.')
  })

  it('token 预算不足 → 不注入（返回空）', () => {
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-2','关系','一些原因',0.9,?)").run(new Date().toISOString())
    // 极小预算
    expect(buildLayer27Block(db, 'conv-1', 1490, 1500)).toBe('')
  })

  it('reason 超过 60 字时被截断', () => {
    const longReason = 'A'.repeat(100)
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-2','关系',?,0.9,?)").run(longReason, new Date().toISOString())
    const block = buildLayer27Block(db, 'conv-1', 0, 99999)
    // 截断后最多 60 字
    expect(block).toContain('A'.repeat(60))
    expect(block).not.toContain('A'.repeat(61))
  })

  it('按 confidence 降序排列', () => {
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-2','低关系','原因',0.7,?)").run(new Date().toISOString())
    db.prepare("INSERT INTO logical_edges VALUES ('e2','conv-1','conv-3','高关系','原因',0.95,?)").run(new Date().toISOString())
    const block = buildLayer27Block(db, 'conv-1', 0, 99999)
    expect(block.indexOf('高关系')).toBeLessThan(block.indexOf('低关系'))
  })
})

// ────────────────────────────────────────────────────────
// C1 — TimelineView 分组 / 排序 / 行高计算
// ────────────────────────────────────────────────────────

interface MockNode {
  id: string
  title: string
  date: string
  category?: string
  conversationId: string
  nodeType?: 'memory' | 'capability'
}

/** 内联 TimelineView 核心逻辑 */
function computeTimeline(nodes: MockNode[]) {
  const CARD_H = 80
  const ROW_PAD = 16
  const memoryNodes = nodes.filter(n => n.nodeType !== 'capability')
  const categories = Array.from(new Set(memoryNodes.map(n => n.category ?? '其他')))
  const dates = Array.from(new Set(memoryNodes.map(n => n.date).filter(Boolean).sort()))
  const rowHeights = categories.map(cat => {
    const rowNodes = memoryNodes.filter(n => (n.category ?? '其他') === cat)
    const maxInCol = dates.reduce((max, date) => {
      const count = rowNodes.filter(n => n.date === date).length
      return Math.max(max, count)
    }, 1)
    return Math.max(CARD_H + ROW_PAD * 2, maxInCol * CARD_H + ROW_PAD * 2)
  })
  return { categories, dates, rowHeights, memoryNodes }
}

describe('C1: TimelineView 核心逻辑', () => {
  it('空节点 → categories 和 dates 均为空', () => {
    const { categories, dates } = computeTimeline([])
    expect(categories).toHaveLength(0)
    expect(dates).toHaveLength(0)
  })

  it('capability 节点被过滤', () => {
    const { memoryNodes } = computeTimeline([
      { id: '1', title: 'cap', date: '2026-01-01', conversationId: 'c1', nodeType: 'capability' },
      { id: '2', title: 'mem', date: '2026-01-02', conversationId: 'c2' },
    ])
    expect(memoryNodes).toHaveLength(1)
    expect(memoryNodes[0].id).toBe('2')
  })

  it('日期按升序排列', () => {
    const { dates } = computeTimeline([
      { id: '1', title: 'a', date: '2026-03-05', conversationId: 'c1' },
      { id: '2', title: 'b', date: '2026-03-01', conversationId: 'c2' },
      { id: '3', title: 'c', date: '2026-03-10', conversationId: 'c3' },
    ])
    expect(dates).toEqual(['2026-03-01', '2026-03-05', '2026-03-10'])
  })

  it('日期去重', () => {
    const { dates } = computeTimeline([
      { id: '1', title: 'a', date: '2026-03-01', conversationId: 'c1' },
      { id: '2', title: 'b', date: '2026-03-01', conversationId: 'c2' },
    ])
    expect(dates).toHaveLength(1)
  })

  it('分类去重', () => {
    const { categories } = computeTimeline([
      { id: '1', title: 'a', date: '2026-03-01', category: '学习成长', conversationId: 'c1' },
      { id: '2', title: 'b', date: '2026-03-02', category: '学习成长', conversationId: 'c2' },
    ])
    expect(categories).toHaveLength(1)
    expect(categories[0]).toBe('学习成长')
  })

  it('无分类的节点归入"其他"', () => {
    const { categories } = computeTimeline([
      { id: '1', title: 'a', date: '2026-03-01', conversationId: 'c1' },
    ])
    expect(categories[0]).toBe('其他')
  })

  it('同日期同分类 2 个节点 → 行高扩展为 2 * CARD_H + 2*ROW_PAD', () => {
    const { rowHeights } = computeTimeline([
      { id: '1', title: 'a', date: '2026-03-01', category: '学习成长', conversationId: 'c1' },
      { id: '2', title: 'b', date: '2026-03-01', category: '学习成长', conversationId: 'c2' },
    ])
    expect(rowHeights[0]).toBe(2 * 80 + 2 * 16)
  })

  it('同日期同分类 1 个节点 → 行高为默认（CARD_H + 2*ROW_PAD）', () => {
    const { rowHeights } = computeTimeline([
      { id: '1', title: 'a', date: '2026-03-01', category: '学习成长', conversationId: 'c1' },
    ])
    expect(rowHeights[0]).toBe(80 + 2 * 16)
  })

  it('多分类多日期 → 矩阵结构正确', () => {
    const { categories, dates } = computeTimeline([
      { id: '1', title: 'a', date: '2026-03-01', category: '学习成长', conversationId: 'c1' },
      { id: '2', title: 'b', date: '2026-03-02', category: '工作事业', conversationId: 'c2' },
      { id: '3', title: 'c', date: '2026-03-01', category: '工作事业', conversationId: 'c3' },
    ])
    expect(categories).toContain('学习成长')
    expect(categories).toContain('工作事业')
    expect(dates).toEqual(['2026-03-01', '2026-03-02'])
  })
})

// ────────────────────────────────────────────────────────
// C2 — setFocusedCategory 状态机
// ────────────────────────────────────────────────────────

interface MockCanvasState {
  focusedCategory: string | null
  highlightedCategory: string | null
  highlightedNodeIds: string[]
}

interface MockStoreNode {
  id: string
  category?: string
}

/** 内联 setFocusedCategory 逻辑（镜像 canvasStore） */
function applySetFocusedCategory(
  _state: MockCanvasState,
  nodes: MockStoreNode[],
  cat: string | null
): MockCanvasState {
  if (cat !== null) {
    const matchIds = nodes.filter(n => (n.category ?? '其他') === cat).map(n => n.id)
    return { focusedCategory: cat, highlightedCategory: cat, highlightedNodeIds: matchIds }
  }
  return { focusedCategory: null, highlightedCategory: null, highlightedNodeIds: [] }
}

describe('C2: setFocusedCategory 状态机', () => {
  const nodes: MockStoreNode[] = [
    { id: 'n1', category: '学习成长' },
    { id: 'n2', category: '学习成长' },
    { id: 'n3', category: '工作事业' },
    { id: 'n4' },  // 无分类 → '其他'
  ]

  it('聚焦分类 → highlightedNodeIds 仅含该分类节点', () => {
    const state = applySetFocusedCategory(
      { focusedCategory: null, highlightedCategory: null, highlightedNodeIds: [] },
      nodes,
      '学习成长'
    )
    expect(state.focusedCategory).toBe('学习成长')
    expect(state.highlightedNodeIds).toEqual(['n1', 'n2'])
    expect(state.highlightedCategory).toBe('学习成长')
  })

  it('退出聚焦（cat=null）→ 全部清空', () => {
    const state = applySetFocusedCategory(
      { focusedCategory: '学习成长', highlightedCategory: '学习成长', highlightedNodeIds: ['n1', 'n2'] },
      nodes,
      null
    )
    expect(state.focusedCategory).toBeNull()
    expect(state.highlightedNodeIds).toHaveLength(0)
    expect(state.highlightedCategory).toBeNull()
  })

  it('切换到另一分类 → highlightedNodeIds 更新', () => {
    const state = applySetFocusedCategory(
      { focusedCategory: '学习成长', highlightedCategory: '学习成长', highlightedNodeIds: ['n1', 'n2'] },
      nodes,
      '工作事业'
    )
    expect(state.highlightedNodeIds).toEqual(['n3'])
  })

  it('无节点属于该分类 → highlightedNodeIds 为空数组', () => {
    const state = applySetFocusedCategory(
      { focusedCategory: null, highlightedCategory: null, highlightedNodeIds: [] },
      nodes,
      '情感关系'
    )
    expect(state.highlightedNodeIds).toHaveLength(0)
    expect(state.focusedCategory).toBe('情感关系')
  })

  it('无分类节点（undefined）被归入"其他"分类', () => {
    const state = applySetFocusedCategory(
      { focusedCategory: null, highlightedCategory: null, highlightedNodeIds: [] },
      nodes,
      '其他'
    )
    expect(state.highlightedNodeIds).toContain('n4')
  })

  it('再次点击同一分类（ClusterLabel toggle）→ 退出聚焦', () => {
    const currentFocused = '学习成长'
    // 模拟 ClusterLabel onClick：focusedCategory === category ? null : category
    const nextCat = currentFocused === '学习成长' ? null : '学习成长'
    const state = applySetFocusedCategory(
      { focusedCategory: '学习成长', highlightedCategory: '学习成长', highlightedNodeIds: ['n1', 'n2'] },
      nodes,
      nextCat
    )
    expect(state.focusedCategory).toBeNull()
    expect(state.highlightedNodeIds).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────
// C3 — 主动对话 24h 触发条件
// ────────────────────────────────────────────────────────

/** 内联 C3 触发判断逻辑（镜像 Canvas.tsx useEffect） */
function shouldShowProactiveToast(
  lastConvCreatedAt: string | undefined,
  nowMs = Date.now()
): boolean {
  if (!lastConvCreatedAt) return false
  const ts = new Date(lastConvCreatedAt).getTime()
  if (isNaN(ts)) return false
  const elapsed = nowMs - ts
  return elapsed >= 24 * 60 * 60 * 1000
}

describe('C3: 主动对话 24h 触发条件', () => {
  it('createdAt 为 undefined → 不触发', () => {
    expect(shouldShowProactiveToast(undefined)).toBe(false)
  })

  it('createdAt 为无效字符串 → 不触发', () => {
    expect(shouldShowProactiveToast('not-a-date')).toBe(false)
  })

  it('23h 前的对话 → 不触发', () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()
    expect(shouldShowProactiveToast(twentyThreeHoursAgo)).toBe(false)
  })

  it('精确 24h 前（边界）→ 触发', () => {
    const exactlyTwentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(shouldShowProactiveToast(exactlyTwentyFourHoursAgo)).toBe(true)
  })

  it('25h 前的对话 → 触发', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    expect(shouldShowProactiveToast(twentyFiveHoursAgo)).toBe(true)
  })

  it('3天前的对话 → 触发', () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
    expect(shouldShowProactiveToast(threeDaysAgo)).toBe(true)
  })

  it('刚刚（1分钟前）→ 不触发', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    expect(shouldShowProactiveToast(oneMinuteAgo)).toBe(false)
  })

  it('未来时间戳 → 不触发', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(shouldShowProactiveToast(future)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────
// B3 — Layer 2.7 集成测试（含 DB 边缘情况）
// ────────────────────────────────────────────────────────

describe('B3: Layer 2.7 DB 集成', () => {
  let db: ReturnType<typeof buildDb>
  beforeEach(() => { db = buildDb() })

  it('同一边作为 source 和 target 时不被计入两次', () => {
    // source_conv = conv-1，target_conv = conv-1（自引用，不合法但防卫）
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-1','自引用','test',0.9,?)").run(new Date().toISOString())
    const edges = db.prepare(`
      SELECT relation FROM logical_edges
      WHERE (source_conv = ? OR target_conv = ?) AND confidence >= 0.6
      ORDER BY confidence DESC LIMIT 5
    `).all('conv-1', 'conv-1') as { relation: string }[]
    // SQL OR 会匹配但结果仍只有 1 条（同一 id）
    expect(edges).toHaveLength(1)
  })

  it('高置信度边优先排在低置信度边前', () => {
    const now = new Date().toISOString()
    db.prepare("INSERT INTO logical_edges VALUES ('e1','conv-1','conv-2','低',  '原因',0.65,?)").run(now)
    db.prepare("INSERT INTO logical_edges VALUES ('e2','conv-1','conv-3','高',  '原因',0.95,?)").run(now)
    db.prepare("INSERT INTO logical_edges VALUES ('e3','conv-1','conv-4','中',  '原因',0.80,?)").run(now)
    const edges = db.prepare(`
      SELECT relation FROM logical_edges
      WHERE (source_conv = ? OR target_conv = ?) AND confidence >= 0.6
      ORDER BY confidence DESC LIMIT 5
    `).all('conv-1', 'conv-1') as { relation: string }[]
    expect(edges[0].relation).toBe('高')
    expect(edges[1].relation).toBe('中')
    expect(edges[2].relation).toBe('低')
  })

  it('超过 5 条边时只返回前 5 条', () => {
    const now = new Date().toISOString()
    for (let i = 0; i < 8; i++) {
      db.prepare(`INSERT INTO logical_edges VALUES (?,?,?,'r${i}','reason',0.9,?)`).run(
        `e${i}`, 'conv-1', `t${i}`, now
      )
    }
    const edges = db.prepare(`
      SELECT relation FROM logical_edges
      WHERE (source_conv = ? OR target_conv = ?) AND confidence >= 0.6
      ORDER BY confidence DESC LIMIT 5
    `).all('conv-1', 'conv-1') as { relation: string }[]
    expect(edges).toHaveLength(5)
  })
})
