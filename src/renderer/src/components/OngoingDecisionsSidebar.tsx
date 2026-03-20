/**
 * OngoingDecisionsSidebar — 主页左侧「进行中决策」独立模块
 *
 * 与「我的空间 / Public Spaces」视觉区隔：琥珀强调、独立卡片，避免与空间列表混为一体。
 */
import { BrainCircuit } from 'lucide-react'
import { useT } from '../i18n'
import type { OngoingDecisionItem } from '../services/decisionRecords'
import { buildDecisionPreviewLine } from '../utils/decisionDisplay'

export interface OngoingDecisionsSidebarProps {
  items: OngoingDecisionItem[]
  dueCount: number
  onOpenHub: () => void
  onSelectItem: (item: OngoingDecisionItem) => void
  getDecisionStatusLabel: (status: OngoingDecisionItem['decisionRecord']['status']) => string
  formatDecisionDue: (date?: string) => string
}

export function OngoingDecisionsSidebar({
  items,
  dueCount,
  onOpenHub,
  onSelectItem,
  getDecisionStatusLabel,
  formatDecisionDue,
}: OngoingDecisionsSidebarProps) {
  const { t } = useT()

  return (
    <div className="w-[196px] rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/95 via-white/92 to-white/88 shadow-[0_8px_30px_rgba(245,158,11,0.12)] backdrop-blur-md ring-1 ring-amber-100/60">
      <div className="flex items-start gap-2.5 border-b border-amber-100/80 px-3 pt-3 pb-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shadow-sm ring-1 ring-amber-200/60">
          <BrainCircuit className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-900/85">
              {t.canvas.ongoingDecisions}
            </span>
            <span className="rounded-full bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-950">
              {items.length}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-amber-900/70">
            {items.length > 0 ? t.canvas.ongoingDecisionsCount(items.length) : t.canvas.ongoingDecisionsEmpty}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenHub}
          className="shrink-0 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-amber-900/80 shadow-sm ring-1 ring-amber-200/80 transition hover:bg-amber-50"
        >
          {dueCount > 0 ? `${dueCount} 待回访` : items.length}
        </button>
      </div>

      {dueCount > 0 && (
        <button
          type="button"
          onClick={onOpenHub}
          className="mx-2 mt-2 w-[calc(100%-1rem)] rounded-xl border border-amber-200/80 bg-amber-100/50 px-3 py-2.5 text-left transition hover:bg-amber-100/80"
        >
          <div className="text-[11px] font-semibold text-amber-950">{t.canvas.ongoingDecisionsDueBanner(dueCount)}</div>
          <div className="mt-1 text-[11px] leading-5 text-amber-900/80">{t.canvas.ongoingDecisionsDueBody}</div>
        </button>
      )}

      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800/55">
          {t.canvas.ongoingDecisionsTimeline}
        </span>
        <button
          type="button"
          onClick={onOpenHub}
          className="text-[11px] font-semibold text-amber-800/75 transition hover:text-amber-950"
        >
          {t.canvas.ongoingDecisionsViewAll}
        </button>
      </div>

      {items.length > 0 ? (
        <div className="space-y-2 px-2 pb-3">
          {items.map((item) => {
            const previewLine = buildDecisionPreviewLine(item.decisionRecord)
            return (
            <button
              key={item.conversationId}
              type="button"
              onClick={() => onSelectItem(item)}
              className="w-full rounded-xl border border-amber-200/55 bg-amber-50/35 px-3 py-2.5 text-left shadow-sm transition hover:border-amber-300/70 hover:bg-amber-50/55 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[11px] font-semibold text-amber-950/90">{item.personaName}</div>
                <span className="shrink-0 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium text-amber-950/85 ring-1 ring-amber-200/60">
                  {getDecisionStatusLabel(item.decisionRecord.status)}
                </span>
              </div>
              <div className="mt-1 line-clamp-2 text-[12px] font-semibold leading-5 text-stone-900">{item.title}</div>
              {previewLine ? (
                <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-600/90">
                  {previewLine}
                </div>
              ) : null}
              <div className="mt-1.5 text-[10px] text-amber-900/45">{t.canvas.ongoingDecisionDue(formatDecisionDue(item.revisitAt))}</div>
            </button>
            )
          })}
        </div>
      ) : (
        <div className="mx-2 mb-3 rounded-xl border border-dashed border-amber-200/70 bg-amber-50/40 px-3 py-3 text-[11px] leading-5 text-amber-900/55">
          {t.canvas.ongoingDecisionsHint}
        </div>
      )}
    </div>
  )
}
