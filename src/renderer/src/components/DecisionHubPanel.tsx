import { motion } from 'framer-motion'
import { CalendarClock, CheckCircle2, Clock3, ListTodo, Sparkles, X } from 'lucide-react'

import type { OngoingDecisionItem } from '../services/decisionRecords'
import { buildDecisionPreviewLine } from '../utils/decisionDisplay'

type StatusGroup = {
  title: string
  subtitle: string
  items: OngoingDecisionItem[]
}

function formatDate(date?: string): string {
  if (!date) return '待设置'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date))
  } catch {
    return date
  }
}

function getResultLabel(result?: OngoingDecisionItem['result']): string | null {
  switch (result) {
    case 'working':
      return '有效'
    case 'mixed':
      return '部分有效'
    case 'not_working':
      return '没效果'
    case 'unknown':
      return '还没执行'
    default:
      return null
  }
}

export function DecisionHubPanel({
  items,
  onClose,
  onOpenDecision,
}: {
  items: OngoingDecisionItem[]
  onClose: () => void
  onOpenDecision: (item: OngoingDecisionItem) => void
}) {
  const dueItems = items.filter((item) => item.decisionRecord.status === 'adopted' && item.isDue)
  const activeItems = items.filter((item) => item.decisionRecord.status === 'adopted' && !item.isDue)
  const reviewedItems = items.filter((item) => item.decisionRecord.status === 'revisited')

  const groups: StatusGroup[] = [
    {
      title: '今天该回访',
      subtitle: '已经采纳，建议现在回来记录结果。',
      items: dueItems,
    },
    {
      title: '进行中',
      subtitle: '已经采纳，但还没到回访时间。',
      items: activeItems,
    },
    {
      title: '验证台账',
      subtitle: '已经记录结果，后续可沉淀为新的案例和评测素材。',
      items: reviewedItems,
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="fixed top-4 bottom-44 right-4 z-40 flex w-[420px] max-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-[32px] border border-stone-200/80 bg-stone-50/95 shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl"
    >
      <div className="border-b border-stone-200/70 px-6 py-5">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">LingSi Loop</div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">决策追踪</h2>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-amber-800">待回访</div>
            <div className="mt-1 text-2xl font-semibold text-amber-950">{dueItems.length}</div>
          </div>
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 px-4 py-3">
            <div className="text-[11px] font-medium text-amber-900/80">进行中</div>
            <div className="mt-1 text-2xl font-semibold text-amber-950">{activeItems.length}</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
            <div className="text-[11px] font-medium text-emerald-800">已复盘</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-950">{reviewedItems.length}</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {groups.map((group) => (
          <section key={group.title}>
            <div className="mb-2 flex items-center gap-2">
              {group.title === '今天该回访' ? (
                <CalendarClock className="h-4 w-4 text-amber-600" />
              ) : group.title === '进行中' ? (
                <ListTodo className="h-4 w-4 text-amber-700" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              <h3 className="text-sm font-semibold text-stone-900">{group.title}</h3>
            </div>
            <p className="mb-3 text-[12px] leading-5 text-stone-500">{group.subtitle}</p>

            {group.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200/90 bg-stone-100/50 px-4 py-4 text-[12px] leading-5 text-stone-400">
                {group.title === '验证台账'
                  ? '等第一批真实回访结果进来后，这里会变成最小验证台账。'
                  : '目前还没有对应状态的决策。'}
              </div>
            ) : (
              <div className="space-y-3">
                {group.items.map((item) => {
                  const resultLabel = getResultLabel(item.result)
                  const preview = buildDecisionPreviewLine(item.decisionRecord)
                  return (
                    <button
                      key={`${group.title}-${item.conversationId}`}
                      type="button"
                      onClick={() => onOpenDecision(item)}
                      className="w-full rounded-[24px] border border-stone-200/80 bg-stone-100/40 px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300/90 hover:bg-stone-100/65 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                            {item.personaName}
                          </div>
                          <div className="mt-1 line-clamp-2 text-[15px] font-semibold leading-6 text-stone-900">
                            {item.title}
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          item.decisionRecord.status === 'revisited'
                            ? 'bg-emerald-100/90 text-emerald-800'
                            : item.isDue
                              ? 'bg-amber-100/90 text-amber-900'
                              : 'bg-amber-50/95 text-amber-900 ring-1 ring-amber-200/70'
                        }`}>
                          {item.decisionRecord.status === 'revisited'
                            ? '已复盘'
                            : item.isDue
                              ? '该回访了'
                              : '进行中'}
                        </span>
                      </div>

                      {preview && (
                        <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-stone-600">
                          {preview}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-200/50 px-2.5 py-1 text-stone-600">
                          <Clock3 className="h-3.5 w-3.5" />
                          {item.decisionRecord.status === 'revisited'
                            ? `最近更新 · ${formatDate(item.updatedAt)}`
                            : `回访时间 · ${formatDate(item.revisitAt)}`}
                        </span>
                        {resultLabel && (
                          <span className="rounded-full bg-stone-50/90 px-2.5 py-1 text-stone-600 ring-1 ring-stone-200/80">
                            结果 · {resultLabel}
                          </span>
                        )}
                      </div>

                      {item.notes && (
                        <div className="mt-3 rounded-2xl bg-stone-200/35 px-3 py-2 text-[12px] leading-5 text-stone-700">
                          {item.notes}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </motion.div>
  )
}
