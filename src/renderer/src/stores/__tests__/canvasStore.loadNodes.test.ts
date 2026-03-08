/**
 * canvasStore — loadNodes 相关单元测试
 *
 * 覆盖本次改动的三个核心逻辑：
 * 1. 重叠检测与静态修复（不依赖 kick）
 * 2. 越界节点钳制与重排
 * 3. 视口恢复（localStorage evo_view）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── 辅助：构造 Node ────────────────────────────────────────────────────────────
function makeNode(id: string, x: number, y: number, nodeType = 'memory') {
  return { id, conversationId: id, x, y, nodeType, category: '其他', color: '', title: '' }
}

// ── 重叠检测逻辑（从 canvasStore.ts 提取为纯函数，便于测试） ────────────────────
const NODE_W = 208
const NODE_H = 160

function hasOverlapInNodes(nodes: { x: number; y: number }[]): boolean {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (Math.abs(nodes[i].x - nodes[j].x) < NODE_W && Math.abs(nodes[i].y - nodes[j].y) < NODE_H)
        return true
  return false
}

function spiralRelayout(
  nodes: { id: string; x: number; y: number }[],
  centerX: number,
  centerY: number,
  bound: number
): { id: string; x: number; y: number }[] {
  const minX = centerX - bound
  const maxX = centerX + bound
  const minY = centerY - bound
  const maxY = centerY + bound
  const placed: { x: number; y: number }[] = []
  // 用矩形碰撞判断（与 hasOverlap 标准一致）
  const isFarEnough = (x1: number, y1: number) =>
    placed.every(p => Math.abs(p.x - x1) >= NODE_W || Math.abs(p.y - y1) >= NODE_H)

  return nodes.map((n, idx) => {
    if (
      Number.isFinite(n.x) && Number.isFinite(n.y) &&
      n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY &&
      isFarEnough(n.x, n.y)
    ) {
      placed.push({ x: n.x, y: n.y })
      return n
    }
    let angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2
    for (let i = 0; i < 100; i++) {
      const r = 40 + i * 18
      const x = centerX + Math.cos(angle) * r
      const y = centerY + Math.sin(angle) * r
      angle += 0.7
      if (isFarEnough(x, y)) {
        placed.push({ x, y })
        return { ...n, x, y }
      }
    }
    placed.push({ x: centerX, y: centerY })
    return { ...n, x: centerX, y: centerY }
  })
}

// ── 视口恢复逻辑（从 canvasStore.ts 提取为纯函数） ────────────────────────────
function resolveViewFromStorage(
  savedJson: string | null
): { offset: { x: number; y: number }; scale: number } | null {
  if (!savedJson) return null
  try {
    const { offset, scale } = JSON.parse(savedJson)
    if (offset && typeof offset.x === 'number' && typeof scale === 'number') {
      return { offset, scale: Math.max(0.2, Math.min(3, scale)) }
    }
    return null
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('hasOverlapInNodes', () => {
  it('无节点时无重叠', () => {
    expect(hasOverlapInNodes([])).toBe(false)
  })

  it('单节点时无重叠', () => {
    expect(hasOverlapInNodes([{ x: 100, y: 100 }])).toBe(false)
  })

  it('两节点间距足够时无重叠', () => {
    expect(hasOverlapInNodes([
      { x: 0, y: 0 },
      { x: 300, y: 300 },
    ])).toBe(false)
  })

  it('两节点 x 差 < NODE_W 且 y 差 < NODE_H 时判为重叠', () => {
    expect(hasOverlapInNodes([
      { x: 1380, y: 1231 },
      { x: 1380, y: 1369 }, // y 差 = 138 < 160
    ])).toBe(true)
  })

  it('x 方向超出 NODE_W 时不重叠', () => {
    expect(hasOverlapInNodes([
      { x: 0, y: 0 },
      { x: 210, y: 0 }, // x 差 = 210 >= 208
    ])).toBe(false)
  })

  it('y 方向超出 NODE_H 时不重叠', () => {
    expect(hasOverlapInNodes([
      { x: 0, y: 0 },
      { x: 0, y: 161 }, // y 差 = 161 >= 160
    ])).toBe(false)
  })

  it('多节点中有一对重叠就返回 true', () => {
    expect(hasOverlapInNodes([
      { x: 0, y: 0 },
      { x: 500, y: 500 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 1100 }, // 与第三个重叠
    ])).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════

describe('spiralRelayout', () => {
  const CENTER = 1920
  const BOUND = 1500

  it('无重叠节点全部保留原坐标', () => {
    const nodes = [
      { id: 'a', x: 1700, y: 1700 },
      { id: 'b', x: 2200, y: 1700 },
      { id: 'c', x: 1700, y: 2300 },
    ]
    const result = spiralRelayout(nodes, CENTER, CENTER, BOUND)
    expect(result[0]).toMatchObject({ id: 'a', x: 1700, y: 1700 })
    expect(result[1]).toMatchObject({ id: 'b', x: 2200, y: 1700 })
    expect(result[2]).toMatchObject({ id: 'c', x: 1700, y: 2300 })
  })

  it('重叠节点被重新放置，且结果无重叠', () => {
    // 三个节点堆在同一位置
    const nodes = [
      { id: 'a', x: CENTER, y: CENTER },
      { id: 'b', x: CENTER, y: CENTER },
      { id: 'c', x: CENTER, y: CENTER },
    ]
    const result = spiralRelayout(nodes, CENTER, CENTER, BOUND)
    expect(hasOverlapInNodes(result)).toBe(false)
  })

  it('越界节点被重新放置到有效范围内', () => {
    const FAR = CENTER + BOUND + 100  // 超出 bound
    const nodes = [{ id: 'a', x: FAR, y: CENTER }]
    const result = spiralRelayout(nodes, CENTER, CENTER, BOUND)
    expect(result[0].x).toBeLessThanOrEqual(CENTER + BOUND)
  })

  it('修复后有节点重叠时结果全部无重叠', () => {
    // 复现真实 bug：同 x，y 差 < 160 的情况
    const nodes = [
      { id: '1', x: 1380, y: 1231 },
      { id: '2', x: 1380, y: 1369 },
      { id: '3', x: 1380, y: 1441 },
      { id: '4', x: 1380, y: 1737 },
      { id: '5', x: 1380, y: 1632 },
    ]
    const result = spiralRelayout(nodes, CENTER, CENTER, BOUND)
    expect(hasOverlapInNodes(result)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveViewFromStorage', () => {
  it('null 时返回 null（走 focusNode 默认逻辑）', () => {
    expect(resolveViewFromStorage(null)).toBeNull()
  })

  it('正常 JSON 返回 offset 和 scale', () => {
    const saved = JSON.stringify({ offset: { x: 123, y: 456 }, scale: 0.8 })
    const result = resolveViewFromStorage(saved)
    expect(result).toEqual({ offset: { x: 123, y: 456 }, scale: 0.8 })
  })

  it('scale 超出 [0.2, 3] 范围时被钳制', () => {
    const tooSmall = JSON.stringify({ offset: { x: 0, y: 0 }, scale: 0.05 })
    expect(resolveViewFromStorage(tooSmall)?.scale).toBe(0.2)

    const tooLarge = JSON.stringify({ offset: { x: 0, y: 0 }, scale: 10 })
    expect(resolveViewFromStorage(tooLarge)?.scale).toBe(3)
  })

  it('无效 JSON 返回 null', () => {
    expect(resolveViewFromStorage('not-json')).toBeNull()
  })

  it('缺少 offset.x 时返回 null', () => {
    const bad = JSON.stringify({ offset: { y: 100 }, scale: 1 })
    expect(resolveViewFromStorage(bad)).toBeNull()
  })

  it('缺少 scale 时返回 null', () => {
    const bad = JSON.stringify({ offset: { x: 100, y: 100 } })
    expect(resolveViewFromStorage(bad)).toBeNull()
  })
})
