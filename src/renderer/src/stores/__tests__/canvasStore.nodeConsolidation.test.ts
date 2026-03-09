/**
 * canvasStore — 节点聚合（Node Consolidation）单元测试
 *
 * 覆盖 v0.2.73 新增逻辑：
 * 1. loadNodes 补全逻辑（conversationIds / topicLabel / firstDate 回填）
 * 2. mergeIntoNode 核心行为（追加、幂等、no-op 不写文件）
 * 3. findMergeTarget 自排除守卫（防止合并到含自身 convId 的节点）
 * 4. addNode 新字段（conversationIds / topicLabel / firstDate）
 */

import { describe, it, expect } from 'vitest'
import type { Node } from '../../../../shared/types'

// ── 1. loadNodes 补全逻辑 ────────────────────────────────────────────────────

/**
 * 从 canvasStore.ts loadNodes 中提取的纯补全函数，用于独立测试。
 */
function backfillNode(n: Node): Node {
  return {
    ...n,
    conversationIds: n.conversationIds ?? [n.conversationId],
    topicLabel: n.topicLabel ?? n.category ?? '其他',
    firstDate: n.firstDate ?? n.date,
  }
}

describe('loadNodes backfill', () => {
  it('已有 conversationIds 的节点保持不变', () => {
    const node: Node = {
      id: 'n1',
      conversationId: 'c1',
      conversationIds: ['c0', 'c1'],
      title: '测试',
      category: '学习成长',
      keywords: [],
      x: 0, y: 0,
      color: '',
      date: '2026-01-01',
      topicLabel: 'Python学习',
      firstDate: '2026-01-01',
    }
    const result = backfillNode(node)
    expect(result.conversationIds).toEqual(['c0', 'c1'])
    expect(result.topicLabel).toBe('Python学习')
    expect(result.firstDate).toBe('2026-01-01')
  })

  it('缺少 conversationIds 时，用 conversationId 初始化', () => {
    const node: Node = {
      id: 'n1',
      conversationId: 'c1',
      title: '旧节点',
      category: '工作事业',
      keywords: [],
      x: 0, y: 0,
      color: '',
      date: '2026-01-02',
    }
    const result = backfillNode(node)
    expect(result.conversationIds).toEqual(['c1'])
  })

  it('缺少 topicLabel 时，回退到 category', () => {
    const node: Node = {
      id: 'n1',
      conversationId: 'c1',
      title: '旧节点',
      category: '学习成长',
      keywords: [],
      x: 0, y: 0,
      color: '',
      date: '2026-01-02',
    }
    const result = backfillNode(node)
    expect(result.topicLabel).toBe('学习成长')
  })

  it('缺少 topicLabel 且 category 为 undefined 时，回退到「其他」', () => {
    const node: Node = {
      id: 'n1',
      conversationId: 'c1',
      title: '无分类节点',
      // category 字段未定义（模拟旧数据或字段缺失）
      category: undefined as unknown as Node['category'],
      keywords: [],
      x: 0, y: 0,
      color: '',
      date: '2026-01-02',
    }
    const result = backfillNode(node)
    expect(result.topicLabel).toBe('其他')
  })

  it('缺少 firstDate 时，回退到 date', () => {
    const node: Node = {
      id: 'n1',
      conversationId: 'c1',
      title: '旧节点',
      category: '学习成长',
      keywords: [],
      x: 0, y: 0,
      color: '',
      date: '2026-03-05',
    }
    const result = backfillNode(node)
    expect(result.firstDate).toBe('2026-03-05')
  })

  it('所有字段都存在时，不覆盖任何字段', () => {
    const node: Node = {
      id: 'n2',
      conversationId: 'c2',
      conversationIds: ['c1', 'c2'],
      title: '全字段节点',
      category: '学习成长',
      keywords: [],
      x: 10, y: 20,
      color: 'rgba(100,100,100,0.9)',
      date: '2026-03-09',
      topicLabel: 'React开发',
      firstDate: '2026-03-01',
    }
    const result = backfillNode(node)
    expect(result.conversationIds).toEqual(['c1', 'c2'])
    expect(result.topicLabel).toBe('React开发')
    expect(result.firstDate).toBe('2026-03-01')
  })
})

// ── 2. mergeIntoNode 核心行为 ────────────────────────────────────────────────

/**
 * mergeIntoNode 的纯函数版本（剔除 Zustand set/get 和 storageService 副作用），
 * 返回 { updatedNodes, changed } 供断言。
 */
function mergeIntoNodePure(
  nodes: Node[],
  targetNodeId: string,
  newConvId: string,
  newDate: string
): { updatedNodes: Node[]; changed: boolean } {
  let changed = false
  const updatedNodes = nodes.map(n => {
    if (n.id !== targetNodeId) return n
    const existingIds = n.conversationIds ?? [n.conversationId]
    if (existingIds.includes(newConvId)) return n   // 幂等：已含有则不改
    changed = true
    return {
      ...n,
      conversationId: newConvId,
      conversationIds: [...existingIds, newConvId],
      date: newDate,
    }
  })
  return { updatedNodes, changed }
}

describe('mergeIntoNode', () => {
  const baseNode: Node = {
    id: 'node-a',
    conversationId: 'conv-1',
    conversationIds: ['conv-1'],
    title: 'Python 学习',
    category: '学习成长',
    keywords: [],
    x: 100, y: 200,
    color: 'rgba(100,100,100,0.9)',
    date: '2026-03-01',
    topicLabel: 'Python学习',
    firstDate: '2026-03-01',
  }

  it('成功将新 convId 追加到节点', () => {
    const { updatedNodes, changed } = mergeIntoNodePure(
      [baseNode],
      'node-a',
      'conv-2',
      '2026-03-09'
    )
    expect(changed).toBe(true)
    expect(updatedNodes[0].conversationIds).toEqual(['conv-1', 'conv-2'])
  })

  it('合并后 conversationId 更新为最新 convId', () => {
    const { updatedNodes } = mergeIntoNodePure(
      [baseNode],
      'node-a',
      'conv-2',
      '2026-03-09'
    )
    expect(updatedNodes[0].conversationId).toBe('conv-2')
  })

  it('合并后 date 更新为新日期', () => {
    const { updatedNodes } = mergeIntoNodePure(
      [baseNode],
      'node-a',
      'conv-2',
      '2026-03-09'
    )
    expect(updatedNodes[0].date).toBe('2026-03-09')
  })

  it('幂等：重复合并同一 convId，changed = false，节点不变', () => {
    const { updatedNodes, changed } = mergeIntoNodePure(
      [baseNode],
      'node-a',
      'conv-1',  // 已存在
      '2026-03-09'
    )
    expect(changed).toBe(false)
    expect(updatedNodes[0].conversationIds).toEqual(['conv-1'])
  })

  it('目标节点不存在时，changed = false，节点列表不变', () => {
    const { updatedNodes, changed } = mergeIntoNodePure(
      [baseNode],
      'non-existent',
      'conv-2',
      '2026-03-09'
    )
    expect(changed).toBe(false)
    expect(updatedNodes).toEqual([baseNode])
  })

  it('只更新目标节点，其他节点不受影响', () => {
    const otherNode: Node = { ...baseNode, id: 'node-b', title: '其他节点' }
    const { updatedNodes } = mergeIntoNodePure(
      [baseNode, otherNode],
      'node-a',
      'conv-2',
      '2026-03-09'
    )
    // 非目标节点引用保持一致（没有被 spread 重新创建）
    expect(updatedNodes[1]).toBe(otherNode)
  })

  it('节点缺少 conversationIds 时，用 conversationId 初始化再追加', () => {
    const legacyNode: Node = {
      id: 'node-legacy',
      conversationId: 'conv-old',
      title: '旧节点（无 conversationIds）',
      category: '学习成长',
      keywords: [],
      x: 0, y: 0,
      color: '',
      date: '2026-01-01',
    }
    const { updatedNodes, changed } = mergeIntoNodePure(
      [legacyNode],
      'node-legacy',
      'conv-new',
      '2026-03-09'
    )
    expect(changed).toBe(true)
    expect(updatedNodes[0].conversationIds).toEqual(['conv-old', 'conv-new'])
  })

  it('多次合并后 conversationIds 有序增长', () => {
    let nodes = [baseNode]
    for (let i = 2; i <= 5; i++) {
      const result = mergeIntoNodePure(nodes, 'node-a', `conv-${i}`, `2026-03-0${i}`)
      nodes = result.updatedNodes
    }
    expect(nodes[0].conversationIds).toEqual(['conv-1', 'conv-2', 'conv-3', 'conv-4', 'conv-5'])
    expect(nodes[0].conversationId).toBe('conv-5')  // 最新 convId
  })
})

// ── 3. findMergeTarget 自排除守卫 ────────────────────────────────────────────

/**
 * 模拟 findMergeTarget 中核心的候选过滤逻辑（不含 fetch）。
 * 输入：search results + excludeConvId + nodes + threshold
 * 输出：targetNodeId | null
 */
function pickMergeTarget(
  results: { conversationId: string; score: number }[],
  excludeConvId: string,
  nodes: Node[],
  threshold: number
): string | null {
  const best = results.find(r => r.conversationId !== excludeConvId && r.score >= threshold)
  if (!best) return null
  const targetNode = nodes.find(n => {
    const ids = n.conversationIds ?? [n.conversationId]
    return ids.includes(best.conversationId)
  })
  return targetNode?.id ?? null
}

describe('findMergeTarget 自排除守卫', () => {
  const THRESHOLD = 0.75
  const nodeWithConv1: Node = {
    id: 'node-a',
    conversationId: 'conv-1',
    conversationIds: ['conv-1'],
    title: '节点A',
    category: '学习成长',
    keywords: [],
    x: 0, y: 0,
    color: '',
    date: '2026-01-01',
  }

  it('排除 excludeConvId 后，选择次优且超过阈值的结果', () => {
    const results = [
      { conversationId: 'conv-new', score: 0.92 },  // 自身，应被排除
      { conversationId: 'conv-1',   score: 0.85 },  // 已有节点，应选中
    ]
    const target = pickMergeTarget(results, 'conv-new', [nodeWithConv1], THRESHOLD)
    expect(target).toBe('node-a')
  })

  it('所有结果都是自身时返回 null', () => {
    const results = [
      { conversationId: 'conv-new', score: 0.99 },
    ]
    const target = pickMergeTarget(results, 'conv-new', [nodeWithConv1], THRESHOLD)
    expect(target).toBeNull()
  })

  it('分数低于阈值时返回 null', () => {
    const results = [
      { conversationId: 'conv-1', score: 0.70 },  // 低于 0.75
    ]
    const target = pickMergeTarget(results, 'conv-new', [nodeWithConv1], THRESHOLD)
    expect(target).toBeNull()
  })

  it('分数刚好等于阈值时选中', () => {
    const results = [
      { conversationId: 'conv-1', score: 0.75 },
    ]
    const target = pickMergeTarget(results, 'conv-new', [nodeWithConv1], THRESHOLD)
    expect(target).toBe('node-a')
  })

  it('结果集为空时返回 null', () => {
    const target = pickMergeTarget([], 'conv-new', [nodeWithConv1], THRESHOLD)
    expect(target).toBeNull()
  })

  it('找到 conversationId 但对应节点不存在时返回 null', () => {
    const results = [
      { conversationId: 'conv-orphan', score: 0.90 },  // 无对应节点
    ]
    const target = pickMergeTarget(results, 'conv-new', [nodeWithConv1], THRESHOLD)
    expect(target).toBeNull()
  })

  it('conversationId 在 conversationIds 列表（非 conversationId 字段）中也能匹配', () => {
    const multiNode: Node = {
      id: 'node-multi',
      conversationId: 'conv-3',
      conversationIds: ['conv-1', 'conv-2', 'conv-3'],
      title: '多对话节点',
      category: '学习成长',
      keywords: [],
      x: 0, y: 0,
      color: '',
      date: '2026-03-01',
    }
    const results = [
      { conversationId: 'conv-2', score: 0.88 },  // 在 conversationIds 列表中
    ]
    const target = pickMergeTarget(results, 'conv-new', [multiNode], THRESHOLD)
    expect(target).toBe('node-multi')
  })
})

// ── 4. addNode 新字段验证 ────────────────────────────────────────────────────

/**
 * 模拟 addNode 构建 newNode 对象的纯函数版本（不含 Zustand / storage 副作用）。
 */
function buildNewNode(
  conversationId: string,
  date: string,
  category: string,
  topicLabel?: string
): Partial<Node> {
  return {
    conversationId,
    conversationIds: [conversationId],
    topicLabel: topicLabel ?? category,
    firstDate: date,
  }
}

describe('addNode 新字段', () => {
  it('新节点 conversationIds 只含 conversationId', () => {
    const node = buildNewNode('conv-x', '2026-03-09', '学习成长')
    expect(node.conversationIds).toEqual(['conv-x'])
  })

  it('传入 topicLabel 时优先使用 topicLabel', () => {
    const node = buildNewNode('conv-x', '2026-03-09', '学习成长', 'Python基础')
    expect(node.topicLabel).toBe('Python基础')
  })

  it('未传 topicLabel 时 fallback 到 category', () => {
    const node = buildNewNode('conv-x', '2026-03-09', '工作事业')
    expect(node.topicLabel).toBe('工作事业')
  })

  it('firstDate 等于创建日期', () => {
    const node = buildNewNode('conv-x', '2026-03-09', '学习成长')
    expect(node.firstDate).toBe('2026-03-09')
  })
})
