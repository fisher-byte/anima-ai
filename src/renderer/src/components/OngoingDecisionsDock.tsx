/**
 * OngoingDecisionsDock — 主页左上角独立浮层：进行中决策概览 + 细进度条
 *
 * 与「我的空间」侧栏分离，不占底部堆叠高度，避免挤压「新建空间」。
 * 视觉与画布白/灰主色一致，不使用琥珀大色块。
 */
import { ChevronRight, ListTodo } from 'lucide-react'
import { useT } from '../i18n'
import type { OngoingDecisionItem } from '../services/decisionRecords'

export interface OngoingDecisionsDockProps {
  items: OngoingDecisionItem[]
  dueCount: number
  /** 主画布已有节点数量（用于与「节点数」角标错开垂直位置） */
  canvasNodeCount: number
  onOpenHub: () => void
}

export function OngoingDecisionsDock({
  items,
  dueCount,
  canvasNodeCount,
  onOpenHub,
}: OngoingDecisionsDockProps) {
  const { t } = useT()

  if (items.length === 0) return null

  const first = items[0]
  const n = items.length
  const dueRatio = n > 0 ? Math.min(1, dueCount / n) : 0
  const barWidthPct = dueCount > 0 ? Math.max(12, Math.round(dueRatio * 100)) : 0

  return (
    <div
      className={`fixed left-4 z-30 w-[min(220px,calc(100vw-2rem))] ${canvasNodeCount > 0 ? 'top-14' : 'top-4'}`}
    >
      <button
        type="button"
        onClick={onOpenHub}
        className="w-full rounded-xl border border-stone-200/90 bg-white/92 px-3 py-2 text-left shadow-sm backdrop-blur-md transition hover:border-stone-300/90 hover:bg-white hover:shadow-md"
      >
        <div className="flex items-start gap-2">
          <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium tracking-wide text-stone-600">
                {t.canvas.ongoingDecisions}
              </span>
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-stone-600">
                {n}
              </span>
              {dueCount > 0 && (
                <span className="rounded-md bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
                  {t.canvas.ongoingDecisionsDueChip(dueCount)}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-stone-500">
              {first.title}
              {n > 1 ? ` · +${n - 1}` : ''}
            </p>
            {/* 细进度条：待回访占比（灰阶，非亮黄） */}
            <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-stone-200/90">
              <div
                className="h-full rounded-full bg-stone-500/75 transition-[width] duration-300"
                style={{ width: dueCount > 0 ? `${barWidthPct}%` : '0%' }}
              />
            </div>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
        </div>
        <p className="mt-1.5 pl-6 text-[10px] text-stone-400">{t.canvas.ongoingDecisionsViewAll}</p>
      </button>
    </div>
  )
}
