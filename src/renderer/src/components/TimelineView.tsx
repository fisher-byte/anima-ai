/**
 * TimelineView — 时间轴视图
 *
 * 按日期（X 轴，左→右）和分类（Y 轴，各分类独立行）展示节点。
 * 点击节点卡片打开对话详情。
 *
 * 碰撞处理：同日期同分类有多个节点时，按卡片高度垂直堆叠，行高动态扩展。
 */
import type { Node as CanvasNode } from '@shared/types'

interface TimelineViewProps {
  nodes: CanvasNode[]
  openModalById: (convId: string) => void
}

/** 分类色条颜色（与 NodeCard 保持一致） */
const CATEGORY_COLORS: Record<string, string> = {
  '日常生活': 'bg-green-400',
  '日常事务': 'bg-yellow-400',
  '学习成长': 'bg-blue-400',
  '工作事业': 'bg-sky-400',
  '情感关系': 'bg-rose-400',
  '思考世界': 'bg-purple-400',
  '其他': 'bg-gray-400',
}

function getCategoryColor(category: string | undefined): string {
  return CATEGORY_COLORS[category ?? '其他'] ?? 'bg-gray-400'
}

const CARD_H = 80    // 每张卡片高度（含间距）
const CARD_W = 136   // 每张卡片宽度
const COL_W = 180    // 每个日期列宽
const LABEL_W = 120  // 左侧分类标签宽
const HEADER_H = 48  // 顶部日期行高
const ROW_PAD = 16   // 行上下 padding

export function TimelineView({ nodes, openModalById }: TimelineViewProps) {
  // 过滤掉 capability 节点
  const memoryNodes = nodes.filter(n => n.nodeType !== 'capability')

  // 收集所有不重复的分类（保留插入顺序）
  const categories = Array.from(
    new Set(memoryNodes.map(n => n.category ?? '其他'))
  )

  // 收集所有不重复的日期，按升序排列（最早→最晚）
  const dates = Array.from(
    new Set(memoryNodes.map(n => n.date).filter(Boolean).sort())
  )

  if (memoryNodes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none select-none">
        暂无节点数据
      </div>
    )
  }

  // 预计算每行需要的高度（同日期多节点时行高扩展）
  const rowHeights: number[] = categories.map(cat => {
    const rowNodes = memoryNodes.filter(n => (n.category ?? '其他') === cat)
    // 按日期分组，找最多节点的列
    const maxInCol = dates.reduce((max, date) => {
      const count = rowNodes.filter(n => n.date === date).length
      return Math.max(max, count)
    }, 1)
    return Math.max(CARD_H + ROW_PAD * 2, maxInCol * CARD_H + ROW_PAD * 2)
  })

  const totalHeight = rowHeights.reduce((a, b) => a + b, 0)
  const rowOffsets: number[] = rowHeights.reduce<number[]>((acc, _h, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + rowHeights[i - 1])
    return acc
  }, [])

  return (
    <div
      className="absolute inset-0 overflow-auto bg-transparent"
      style={{ zIndex: 10 }}
    >
      <div
        style={{
          position: 'relative',
          minWidth: LABEL_W + dates.length * COL_W + 40,
          minHeight: HEADER_H + totalHeight + 40,
          paddingBottom: 40,
        }}
      >
        {/* 顶部日期标签行（sticky） */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #e5e7eb',
            height: HEADER_H,
            display: 'flex',
            paddingLeft: LABEL_W,
          }}
        >
          {dates.map(d => (
            <div
              key={d}
              style={{ width: COL_W, flexShrink: 0 }}
              className="flex items-center justify-center text-xs text-gray-400 font-medium"
            >
              {d}
            </div>
          ))}
        </div>

        {/* 分类行 */}
        {categories.map((cat, rowIdx) => {
          const rowNodes = memoryNodes.filter(n => (n.category ?? '其他') === cat)
          const colorBar = getCategoryColor(cat)
          const rowH = rowHeights[rowIdx]
          const rowTop = HEADER_H + rowOffsets[rowIdx]

          return (
            <div
              key={cat}
              style={{
                position: 'absolute',
                top: rowTop,
                left: 0,
                right: 0,
                height: rowH,
                borderBottom: '1px solid rgba(229,231,235,0.6)',
                display: 'flex',
                alignItems: 'flex-start',
              }}
            >
              {/* 分类标签（垂直居中于行） */}
              <div
                style={{ width: LABEL_W, flexShrink: 0, paddingLeft: 16, paddingTop: rowH / 2 - 20 }}
                className="flex items-center gap-2"
              >
                <div className={`w-2 h-10 rounded-full ${colorBar}`} />
                <span className="text-sm font-semibold text-gray-600 truncate" style={{ maxWidth: 80 }}>
                  {cat}
                </span>
              </div>

              {/* 节点卡片（按日期列定位，同日期多节点垂直排列） */}
              <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                {/* 按日期分组渲染，同日期多节点垂直堆叠 */}
                {dates.map((date, colIdx) => {
                  const colNodes = rowNodes.filter(n => n.date === date)
                  if (colNodes.length === 0) return null
                  return colNodes.map((node, nodeIdx) => (
                    <button
                      key={node.id}
                      onClick={() => openModalById(node.conversationId)}
                      style={{
                        position: 'absolute',
                        left: colIdx * COL_W + (COL_W / 2) - CARD_W / 2,
                        top: ROW_PAD + nodeIdx * CARD_H,
                        width: CARD_W,
                      }}
                      className="group bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all p-3 text-left"
                    >
                      <div className={`w-full h-1 rounded-full ${colorBar} mb-2 opacity-60`} />
                      <p className="text-xs font-medium text-gray-700 line-clamp-2 leading-snug">
                        {node.title || '无标题'}
                      </p>
                    </button>
                  ))
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
