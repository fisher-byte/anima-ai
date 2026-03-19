/**
 * AnswerModal 子组件
 * 纯 UI 组件，无副作用，无 canvasStore 依赖。
 * 由 AnswerModal.tsx 导入使用。
 *
 * 导出：
 *   UserMessageContent  — 解析用户消息，引用块折叠展示
 *   ReferenceBlockBubble — 单个引用块胶囊（折叠/展开）
 *   ClosingAnimation    — 关闭时左上角"已记下来了"动画
 *   InputArea           — 底部输入区（文件/引用块/发送按钮）
 *   LingSiTraceModal    — 轨迹详情弹窗（由 AnswerModal 顶层渲染，脱离 turns 高频更新树）
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Square, Paperclip, X, ArrowUp,
  File as FileIcon, Quote, ChevronDown, ChevronUp, BookOpen, Route, ExternalLink, CheckCircle2, Clock3, CircleDot
} from 'lucide-react'
import type { DecisionMode, DecisionRecord, DecisionSourceRef, DecisionUnit, FileAttachment } from '@shared/types'
import { stripFileBlocksOnly, stripLinkedContextHints } from '../utils/conversationUtils'
import { formatLingSiSourceLabel } from '../utils/lingsiTrace'
import { useT } from '../i18n'
import type { LingSiTraceData } from '../hooks/useAnswerModalDecision'
// LingSiTraceData re-export 供 AnswerModal.tsx 等使用，避免循环导入
export type { LingSiTraceData } from '../hooks/useAnswerModalDecision'

// ── UserMessageContent ────────────────────────────────────────────────────────

/** 解析并渲染用户消息，将 [REFERENCE_START]...[REFERENCE_END] 块展示为折叠胶囊，剥离文件内容标记 */
export function UserMessageContent({ content }: { content: string }) {
  // 先剥离文件内容块（用共享工具函数，逻辑集中便于测试）
  const stripped = stripLinkedContextHints(stripFileBlocksOnly(content))

  const parts: Array<{ type: 'text' | 'reference'; value: string }> = []
  const regex = /\[REFERENCE_START\]([\s\S]*?)\[REFERENCE_END\]/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(stripped)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: stripped.slice(last, match.index) })
    parts.push({ type: 'reference', value: match[1].trim() })
    last = match.index + match[0].length
  }
  if (last < stripped.length) parts.push({ type: 'text', value: stripped.slice(last) })
  if (parts.length === 0) return <div>{stripped}</div>
  return (
    <div className="flex flex-col gap-2">
      {parts.map((p, i) =>
        p.type === 'text' ? (
          p.value.trim() ? <div key={i}>{p.value}</div> : null
        ) : (
          <ReferenceBlockBubble key={i} content={p.value} />
        )
      )}
    </div>
  )
}

// ── ReferenceBlockBubble ──────────────────────────────────────────────────────

export function ReferenceBlockBubble({ content }: { content: string }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const firstLine = content.split('\n')[0].trim()
  const preview = firstLine.slice(0, 40) + (firstLine.length > 40 ? '…' : '')
  const wordCount = content.length
  return (
    <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3 py-2 text-amber-700 text-[13px]">
      <div className="flex items-center gap-2">
        <Quote className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <span className="flex-1 truncate">{preview}</span>
        <span className="text-[11px] text-amber-400 flex-shrink-0">{t.modal.chars(wordCount)}</span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-0.5 text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 max-h-48 overflow-y-auto text-[12px] leading-relaxed text-amber-700/90 whitespace-pre-wrap border-t border-amber-200/60 pt-1.5">
          {content}
        </div>
      )}
    </div>
  )
}

// ── ClosingAnimation ──────────────────────────────────────────────────────────

export function ClosingAnimation({ isOnboarding, appliedPreferences }: { isOnboarding: boolean; appliedPreferences: string[] }) {
  const { t } = useT()
  const label = isOnboarding ? t.modal.closingMemoryGenerated : t.modal.closingNoted
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.94 }}
      transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[55] pointer-events-none flex flex-col items-center gap-1.5"
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-[13px] font-medium rounded-2xl shadow-xl">
        <svg className="w-4 h-4 flex-shrink-0 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {label}
      </div>
      {appliedPreferences.length > 0 && (
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white text-[11px] font-medium rounded-2xl shadow-md">
          <Sparkles className="w-3 h-3 text-yellow-300 flex-shrink-0" />
          {t.modal.closingApplied(appliedPreferences.length)}
        </div>
      )}
    </motion.div>
  )
}

// ── LingSiTraceModal ────────────────────────────────────────────────────────
// 独立的轨迹详情弹窗，由 AnswerModal 顶层渲染（Portal 挂到 document.body）。
// 完全脱离 turns 的高频更新渲染树，避免 streaming 时的 DOM hang。

function formatProductStateDocRef(ref: string): string {
  const labels: Record<string, string> = {
    'docs/PROJECT.md': '当前项目状态',
    'docs/ROADMAP.md': '路线图阶段',
    'docs/changelog.md': '最近迭代记录',
    'docs/lingsi-eval-m4.md': '决策评测基线',
    'docs/lingsi-eval-zhang.md': '决策评测基线',
  }
  return labels[ref] ?? ref.replace(/^docs\//, '').replace(/\.md$/i, '')
}

/** P2-B: shared filter — single source of truth for hidden internal docs */
function filterProductStateDocRefs(refs: string[], personaName: string): string[] {
  const personaKey = personaName.toLowerCase()
  return refs.filter((ref) => {
    if (ref === 'docs/lingsi-flywheel.md') return false
    if (ref === 'docs/lingsi-eval-zhang.md' && personaKey.includes('lenny')) return false
    if (ref === 'docs/lingsi-eval-m4.md' && personaKey.includes('zhang')) return false
    return true
  })
}

export function LingSiTraceModal({
  data,
  onClose,
}: {
  data: LingSiTraceData | null
  onClose: () => void
}) {
  const { t } = useT()

  useEffect(() => {
    if (!data || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [data, onClose])

  if (!data || typeof document === 'undefined') return null

  const { personaName, matchedUnits, sourceRefs, productStateDocRefs } = data
  const followUpQuestions = Array.from(new Set(matchedUnits.flatMap(u => u.followUpQuestions))).slice(0, 6)

  const productStateLabels = Array.from(new Set(filterProductStateDocRefs(productStateDocRefs, personaName).map(formatProductStateDocRef)))
  const hasProductStateTrace = productStateLabels.length > 0

  return createPortal(
    <div className="fixed inset-0 z-[130] px-4 py-8" role="dialog" aria-modal="true" aria-label={t.modal.lingsiTraceView}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative z-[131] mx-auto max-h-[80vh] w-[min(880px,calc(100vw-32px))] overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-600">
              {t.modal.lingsiTraceView}
            </div>
            <div className="mt-1 text-[22px] font-semibold text-gray-900">
              {personaName} · {t.space.decisionModeLingSi}
            </div>
            <div className="mt-2 text-[13px] text-gray-500">
              {matchedUnits.length > 0 || sourceRefs.length > 0
                ? `${t.modal.lingsiUnits(matchedUnits.length)} · ${t.modal.lingsiSources(sourceRefs.length)}`
                : t.modal.lingsiStatePack}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid max-h-[calc(80vh-96px)] gap-0 overflow-y-auto md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 border-b border-gray-100 px-6 py-5 md:border-b-0 md:border-r">
            <section>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                {t.modal.lingsiMatchedUnits}
              </div>
              {matchedUnits.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {matchedUnits.map((unit) => (
                    <div key={unit.id} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                      <div className="text-[14px] font-semibold text-gray-900">{unit.title}</div>
                      <div className="mt-1 text-[13px] leading-6 text-gray-600">{unit.summary}</div>
                      {unit.preferredPath && (
                        <div className="mt-3 rounded-xl bg-white px-3 py-2 text-[12px] leading-5 text-gray-700">
                          <span className="font-medium text-gray-900">{t.modal.lingsiPreferredPath}:</span> {unit.preferredPath}
                        </div>
                      )}
                      {unit.nextActions.length > 0 && (
                        <ul className="mt-3 space-y-1.5 pl-4 text-[12px] leading-5 text-gray-700">
                          {unit.nextActions.slice(0, 3).map((action, idx) => (
                            <li key={`${unit.id}-action-${idx}`}>{action}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-4">
                  <div className="text-[14px] font-semibold text-gray-900">{t.modal.lingsiNoMatchedUnits}</div>
                  <div className="mt-1 text-[13px] leading-6 text-gray-600">{t.modal.lingsiNoMatchedUnitsBody}</div>
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4 px-6 py-5">
            {followUpQuestions.length > 0 && (
              <section>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  {t.modal.lingsiFollowUpQuestions}
                </div>
                <ul className="mt-3 space-y-2 pl-4 text-[12px] leading-5 text-gray-700">
                  {followUpQuestions.map((q, idx) => (
                    <li key={`${q}-${idx}`}>{q}</li>
                  ))}
                </ul>
              </section>
            )}

            {hasProductStateTrace && (
              <section>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  {t.modal.lingsiStatePack}
                </div>
                <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                  <div className="text-[12px] font-medium text-gray-900">{t.modal.lingsiStatePackFallback}</div>
                  <ul className="mt-3 space-y-2 pl-4 text-[12px] leading-5 text-gray-700">
                    {productStateLabels.map((ref, idx) => (
                      <li key={`${ref}-${idx}`}>{ref}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {sourceRefs.length > 0 && (
              <section>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  {t.modal.lingsiSources(sourceRefs.length)}
                </div>
                <div className="mt-3 space-y-3">
                  {sourceRefs.map((ref, idx) => (
                    <div key={`${ref.id}-${idx}`} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                      <div className="flex items-center gap-2 text-[12px] font-medium text-gray-900">
                        <span>[{idx + 1}]</span>
                        <span className="flex-1 min-w-0 truncate">{formatLingSiSourceLabel(ref)}</span>
                        <span className="flex-shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                          {ref.evidenceLevel}
                        </span>
                      </div>
                      {ref.excerpt && (
                        <blockquote className="mt-2 border-l-2 border-amber-300 pl-3 text-[12px] leading-5 text-gray-600">
                          {ref.excerpt}
                        </blockquote>
                      )}
                      {ref.path && (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500">
                          <ExternalLink className="h-3 w-3" />
                          <span>{ref.path}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── LingSiTracePanel ────────────────────────────────────────────────────────
// 轻量级 inline 面板，只做折叠展示 + 触发 onOpenTrace 回调。
// 不再持有 Portal，不再操作 document.body.overflow，完全安全在高频渲染树中使用。

export const LingSiTracePanel = memo(function LingSiTracePanel({
  mode,
  personaName,
  matchedUnits,
  sourceRefs,
  productStateDocRefs = [],
  isStreaming = false,
  onOpenTrace,
}: {
  mode: DecisionMode
  personaName: string
  matchedUnits: DecisionUnit[]
  sourceRefs: DecisionSourceRef[]
  productStateDocRefs?: string[]
  isStreaming?: boolean
  onOpenTrace?: (data: LingSiTraceData) => void
}) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(true)
  const matchedUnitLabels = matchedUnits.map((unit) => unit.title)
  const nextActions = Array.from(new Set(matchedUnits.flatMap((unit) => unit.nextActions))).slice(0, 6)
  const hasProductStateTrace = productStateDocRefs.length > 0

  const productStateLabels = Array.from(new Set(filterProductStateDocRefs(productStateDocRefs, personaName).map(formatProductStateDocRef)))

  if (mode !== 'decision' || (matchedUnitLabels.length === 0 && sourceRefs.length === 0 && !hasProductStateTrace)) return null

  const handleOpenTrace = () => {
    if (isStreaming || !onOpenTrace) return
    onOpenTrace({ personaName, matchedUnits, sourceRefs, productStateDocRefs })
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-orange-50/40 overflow-hidden">
      {/* ── 标题栏 ── */}
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <BookOpen className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold text-amber-900">{t.modal.lingsiEvidence}</span>
          <span className="rounded-md bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700">
            {t.modal.lingsiMode}
          </span>
          {(matchedUnitLabels.length > 0 || sourceRefs.length > 0) && (
            <span className="text-[11px] text-amber-600/70">
              {t.modal.lingsiUnits(matchedUnitLabels.length)} · {t.modal.lingsiSources(sourceRefs.length)}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleOpenTrace}
            disabled={isStreaming}
            title={isStreaming ? t.modal.lingsiTraceWaitForCompletion : t.modal.lingsiOpenTrace}
            className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-white hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Route className="h-3 w-3" />
            {t.modal.lingsiOpenTrace}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            disabled={isStreaming}
            className="rounded-lg p-1 text-amber-500 transition-colors hover:bg-white/70 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-amber-200/50 px-4 py-3 space-y-2.5">
          {matchedUnitLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {matchedUnits.map((unit, idx) => (
                <span
                  key={`${unit.id}-${idx}`}
                  className="rounded-lg border border-amber-200/80 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                >
                  {unit.title}
                </span>
              ))}
            </div>
          )}

          {nextActions.length > 0 && (
            <div className="rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-amber-200/50">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                {t.modal.lingsiNextActions}
              </div>
              <ul className="space-y-1 pl-3.5 text-[12px] leading-[1.6] text-gray-700">
                {nextActions.slice(0, 3).map((action, idx) => (
                  <li key={`${action}-${idx}`} className="list-disc marker:text-amber-400">{action}</li>
                ))}
              </ul>
            </div>
          )}

          {hasProductStateTrace && (
            <div className="rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-amber-200/50">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                {t.modal.lingsiStatePack}
              </div>
              <p className="mb-2 text-[11px] leading-[1.5] text-amber-700/70">{t.modal.lingsiStatePackSummary}</p>
              <div className="flex flex-wrap gap-1.5">
                {productStateLabels.map((ref, idx) => (
                  <span
                    key={`${ref}-${idx}`}
                    className="rounded-md border border-amber-200/70 bg-white/80 px-2 py-0.5 text-[11px] text-amber-800"
                  >
                    {ref}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sourceRefs.length > 0 && (
            <div className="space-y-1.5">
              {sourceRefs.map((ref, idx) => (
                <div
                  key={`${ref.id}-${ref.locator ?? idx}`}
                  id={`lingsi-source-${idx + 1}`}
                  className="rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-amber-200/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-amber-600">[{idx + 1}]</span>
                    <span className="text-[12px] font-medium text-gray-800 flex-1 min-w-0 truncate">
                      {formatLingSiSourceLabel(ref)}
                    </span>
                    <span className="flex-shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                      {ref.evidenceLevel}
                    </span>
                  </div>
                  {ref.excerpt && (
                    <blockquote className="border-l-2 border-amber-300 pl-2.5 text-[11.5px] leading-5 text-gray-500 italic">
                      {ref.excerpt}
                    </blockquote>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

function formatDecisionDate(date: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
  } catch {
    return date
  }
}

function getDecisionStatusTone(status: DecisionRecord['status']): string {
  switch (status) {
    case 'adopted':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'revisited':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'archived':
      return 'bg-gray-100 text-gray-500 border-gray-200'
    default:
      return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

function getDecisionStatusLabel(status: DecisionRecord['status'], t: ReturnType<typeof useT>['t']): string {
  switch (status) {
    case 'answered':
      return t.modal.decisionCardStatusAnswered
    case 'adopted':
      return t.modal.decisionCardStatusAdopted
    case 'revisited':
      return t.modal.decisionCardStatusRevisited
    case 'archived':
      return t.modal.decisionCardStatusArchived
    case 'draft':
    default:
      return t.modal.decisionCardStatusDraft
  }
}

// ── LingSiDecisionCard (P4 isolated) ──────────────────────────────────────
// P4 nuclear fix: The card takes a snapshot of the record on mount and only
// re-syncs when `updatedAt` actually changes. This breaks the cascade where
// store updates → AnswerModal re-render → new record reference → card re-render → freeze.
// Additionally, adopt/outcome actions yield to the event loop before & after
// the heavy persistDecisionRecord call to keep the UI responsive.

export interface LingSiDecisionCardProps {
  record: DecisionRecord
  personaName: string
  onAdopt: (days: number) => void
  onOutcome: (result: NonNullable<DecisionRecord['outcome']>['result'], notes?: string) => void
  anchorRef?: React.RefObject<HTMLDivElement | null>
}

export const LingSiDecisionCard = memo(function LingSiDecisionCard({
  record,
  personaName,
  onAdopt,
  onOutcome,
}: LingSiDecisionCardProps) {
  const { t } = useT()

  // Snapshot the record into local state to decouple from store-driven re-renders.
  // Only update when the record's updatedAt actually changes (= real persistence happened).
  const [localRecord, setLocalRecord] = useState(record)
  const prevUpdatedAtRef = useRef(record.updatedAt)
  useEffect(() => {
    if (record.updatedAt !== prevUpdatedAtRef.current) {
      prevUpdatedAtRef.current = record.updatedAt
      setLocalRecord(record)
    }
  }, [record])

  const [expanded, setExpanded] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [outcomeNotes, setOutcomeNotes] = useState(localRecord.outcome?.notes ?? '')
  // P5 (P2-3 fix): Use ref + state for busy.
  // Ref is the source of truth (avoids stale closure in useCallback);
  // state drives the UI opacity transition.
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const nextActions = localRecord.nextActions.slice(0, 3)
  const followUps = localRecord.followUpQuestions.slice(0, 2)
  const revisitAt = localRecord.outcome?.revisitAt
  const canSchedule = localRecord.status === 'draft' || localRecord.status === 'answered'
  const canMarkOutcome = localRecord.status === 'adopted' || localRecord.status === 'revisited'

  useEffect(() => {
    if (!canSchedule) setShowSchedule(false)
  }, [canSchedule])

  useEffect(() => {
    const saved = localRecord.outcome?.notes ?? ''
    setOutcomeNotes(prev => (prev === '' || prev === saved) ? saved : prev)
  }, [localRecord.outcome?.notes])

  // Wrap callbacks so they:
  // 1) set busy flag to prevent double-clicks (ref = immediate, state = UI)
  // 2) yield to the event loop before & after the heavy persist
  const safeAdopt = useCallback(async (days: number) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    await new Promise<void>(r => setTimeout(r, 0))
    try {
      await onAdopt(days)
    } finally {
      await new Promise<void>(r => setTimeout(r, 0))
      busyRef.current = false
      setBusy(false)
    }
  }, [onAdopt])

  const safeOutcome = useCallback(async (result: NonNullable<DecisionRecord['outcome']>['result'], notes?: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    await new Promise<void>(r => setTimeout(r, 0))
    try {
      await onOutcome(result, notes)
    } finally {
      await new Promise<void>(r => setTimeout(r, 0))
      busyRef.current = false
      setBusy(false)
    }
  }, [onOutcome])

  const statusTone = getDecisionStatusTone(localRecord.status)
  const statusLabel = getDecisionStatusLabel(localRecord.status, t)

  return (
    <div className={`mt-3 rounded-2xl border border-amber-200/50 bg-amber-50/40 overflow-hidden transition-opacity ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Collapsed summary row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-amber-50/60 transition-colors"
      >
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <BookOpen className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">
            {t.modal.decisionCardTitle}
          </span>
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusTone}`}>
            {statusLabel}
          </span>
          <span className="text-[10px] text-amber-600/50">{personaName}</span>
          {!expanded && (
            <span className="text-[12px] text-gray-600 truncate max-w-[280px]">
              {localRecord.recommendationSummary}
            </span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-amber-500 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-amber-200/40">
          {/* Recommendation */}
          <div className="px-4 py-3">
            <div className="text-[15px] font-semibold leading-6 text-gray-900">
              {localRecord.recommendationSummary}
            </div>
            {localRecord.keyTradeoffs.length > 0 && (
              <div className="mt-1.5 text-[12px] leading-5 text-gray-500">
                {localRecord.keyTradeoffs[0]}
              </div>
            )}
          </div>

          {/* Next actions */}
          {nextActions.length > 0 && (
            <div className="mx-4 mb-3 rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-amber-200/40">
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                <CircleDot className="h-3 w-3" />
                {t.modal.decisionCardNextActions}
              </div>
              <ul className="space-y-1 pl-3.5 text-[12px] leading-[1.6] text-gray-700">
                {nextActions.map((action, idx) => (
                  <li key={`${action}-${idx}`} className="list-disc marker:text-amber-400">{action}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Follow-ups */}
          {followUps.length > 0 && (
            <div className="mx-4 mb-3 flex flex-wrap gap-1.5">
              {followUps.map((question, idx) => (
                <span
                  key={`${question}-${idx}`}
                  className="rounded-lg border border-amber-200/60 bg-white/60 px-2.5 py-1 text-[11px] text-amber-800"
                >
                  {question}
                </span>
              ))}
            </div>
          )}

          {/* Adopt block */}
          {canSchedule && (
            <div className="border-t border-amber-200/40 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold text-amber-900">{t.modal.decisionCardAdoptTitle}</div>
                  <div className="mt-0.5 text-[11px] leading-5 text-amber-700/70">{t.modal.decisionCardAdoptBody}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSchedule((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t.modal.decisionCardAdopt}
                </button>
              </div>
              {showSchedule && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {[3, 7, 14].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => safeAdopt(days)}
                      className="rounded-xl border border-amber-300/80 bg-white px-3.5 py-1.5 text-[12px] font-medium text-amber-800 hover:border-amber-400 hover:bg-amber-50 transition-colors"
                    >
                      {t.modal.decisionCardAdoptDays(days)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Revisit time */}
          {revisitAt && (
            <div className="border-t border-amber-200/40 px-4 py-2.5 flex items-center gap-1.5 text-[11px] text-amber-700/70">
              <Clock3 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{t.modal.decisionCardRevisitAt(formatDecisionDate(revisitAt))}</span>
            </div>
          )}

          {/* Outcome block */}
          {canMarkOutcome && (
            <div className="border-t border-amber-200/40 px-4 py-3">
              <div className="text-[12px] font-semibold text-gray-700">{t.modal.decisionCardOutcomeTitle}</div>
              <textarea
                value={outcomeNotes}
                onChange={(event) => setOutcomeNotes(event.target.value)}
                rows={2}
                placeholder={t.modal.decisionCardOutcomeNotesPlaceholder}
                className="mt-2 min-h-[64px] w-full resize-none rounded-xl border border-amber-200/70 bg-white/70 px-3 py-2 text-[12px] leading-6 text-gray-700 outline-none placeholder:text-gray-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => safeOutcome('working', outcomeNotes)} className="rounded-xl border border-emerald-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">{t.modal.decisionCardOutcomeWorking}</button>
                <button type="button" onClick={() => safeOutcome('mixed', outcomeNotes)} className="rounded-xl border border-amber-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-50 transition-colors">{t.modal.decisionCardOutcomeMixed}</button>
                <button type="button" onClick={() => safeOutcome('not_working', outcomeNotes)} className="rounded-xl border border-rose-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-50 transition-colors">{t.modal.decisionCardOutcomeNotWorking}</button>
                <button type="button" onClick={() => safeOutcome('unknown', outcomeNotes)} className="rounded-xl border border-gray-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">{t.modal.decisionCardOutcomeUnknown}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ── InputArea ─────────────────────────────────────────────────────────────────

export interface InputAreaProps {
  feedbackMessage: string
  pendingImages: string[]
  pendingFiles: FileAttachment[]
  referenceBlocks: string[]
  isStreaming: boolean
  isOnboardingMode: boolean
  evolutionToast: { label: string; detail: string } | null
  fileInputRef: React.RefObject<HTMLInputElement>
  textareaRef: React.RefObject<HTMLTextAreaElement>
  onFeedbackChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onFeedbackSubmit: () => void
  onStopGeneration: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent) => void
  onRemoveFile: (id: string) => void
  onAddReferenceBlock: (text: string) => void
  onRemoveReferenceBlock: (index: number) => void
}

export function InputArea({
  feedbackMessage, pendingImages, pendingFiles, referenceBlocks, isStreaming, isOnboardingMode,
  evolutionToast, fileInputRef, textareaRef,
  onFeedbackChange, onFeedbackSubmit, onStopGeneration, onFileSelect, onDrop, onRemoveFile,
  onAddReferenceBlock, onRemoveReferenceBlock
}: InputAreaProps) {
  const { t } = useT()
  const handlePaste = (e: React.ClipboardEvent) => {
    // A-3: 有文件时不处理文本（图片/文件粘贴由父组件 fileInputRef 处理）
    if (e.clipboardData.files.length > 0) return
    const pastedText = e.clipboardData.getData('text')
    if (pastedText.length > 500) {
      e.preventDefault()
      onAddReferenceBlock(pastedText)
    }
  }

  return (
    <div className="p-4 bg-white border-t border-gray-100">
      <div className="max-w-2xl mx-auto relative">
        <AnimatePresence>
          {evolutionToast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="absolute -top-14 left-0 right-0 flex justify-center"
            >
              <div className="flex flex-col items-center gap-0.5 px-4 py-2 bg-gray-900 text-white rounded-2xl shadow-lg max-w-xs text-center">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <Sparkles className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                  {evolutionToast.label}
                </div>
                {evolutionToast.detail && (
                  <div className="text-[10px] text-white/60 leading-snug truncate max-w-[220px]">{evolutionToast.detail}</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 bg-white rounded-[24px] p-2 border border-gray-200 shadow-sm focus-within:border-gray-900 transition-all relative">
          <AnimatePresence>
            {(pendingFiles.length > 0 || pendingImages.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 mb-2 flex flex-wrap gap-2 p-2 bg-white/90 backdrop-blur-md rounded-xl border border-gray-100 shadow-lg"
              >
                {pendingImages.map((img, i) => (
                  <div key={`p-img-${i}`} className="relative group w-12 h-12">
                    <img src={img} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                    <button onClick={() => onRemoveFile(pendingFiles.find(f => f.preview === img)?.id || '')} className="absolute -top-1 -right-1 bg-white rounded-full shadow border p-0.5 opacity-0 group-hover:opacity-100">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {pendingFiles.filter(f => !f.preview).map(f => (
                  <div key={f.id} className="relative group flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                    <FileIcon className="w-3 h-3 text-gray-400" />
                    <span className="max-w-[80px] truncate">{f.name}</span>
                    <button onClick={() => onRemoveFile(f.id)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <Paperclip className="w-5 h-5" />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" onChange={onFileSelect} multiple />

          <div className="flex-1 relative" onDrop={onDrop} onDragOver={e => e.preventDefault()}>
            {/* 引用块胶囊列表 */}
            <AnimatePresence>
              {referenceBlocks.map((ref, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center gap-1.5 mb-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-[12px] text-amber-800"
                >
                  <Quote className="w-3 h-3 flex-shrink-0 text-amber-500" />
                  <span className="flex-1 truncate opacity-80">{ref.slice(0, 40)}{ref.length > 40 ? '…' : ''}</span>
                  <button
                    onClick={() => onRemoveReferenceBlock(i)}
                    className="flex-shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            <textarea
              ref={textareaRef}
              value={feedbackMessage}
              onChange={onFeedbackChange}
              placeholder={isOnboardingMode ? t.modal.onboardingIntroPlaceholder : t.modal.replyPlaceholder}
              className="w-full bg-transparent border-none outline-none resize-none py-3 text-[15px] max-h-[220px]"
              rows={1}
              onPaste={handlePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onFeedbackSubmit() }
              }}
            />
          </div>

          {isStreaming ? (
            <button onClick={onStopGeneration} className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-md" title="停止生成">
              <Square className="w-4 h-4 animate-pulse fill-white" />
            </button>
          ) : (
            <button
              onClick={onFeedbackSubmit}
              disabled={!feedbackMessage.trim() && pendingFiles.length === 0 && referenceBlocks.length === 0}
              className="p-2.5 bg-gray-900 text-white rounded-xl hover:bg-black disabled:opacity-40 disabled:bg-gray-200 transition-all shadow-sm"
            >
              <ArrowUp className="w-5 h-5 stroke-[3px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
