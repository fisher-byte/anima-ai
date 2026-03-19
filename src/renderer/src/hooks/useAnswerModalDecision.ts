/**
 * useAnswerModalDecision — 灵思决策模式专用 Hook
 *
 * 从 AnswerModal.tsx 拆出，集中管理决策相关的：
 *   - 持久化决策记录（persistDecisionRecord）
 *   - 标记决策已回答（markDecisionAnswered）
 *   - 采纳决策（handleAdoptDecision）
 *   - 记录决策结果（handleDecisionOutcome）
 *   - buildLingSiRequest：构建决策 payload
 *   - activeDecisionTrace / activeDecisionRecord 的稳定 selector
 *   - stableSourceRefs / stableProductStateDocRefs 的 useMemo
 *   - matchedDecisionUnits 的异步加载
 *
 * 职责边界：
 *   - 只负责决策逻辑，不涉及 UI 渲染
 *   - turns / appliedPreferences 通过 ref 读取（不加入 useCallback 依赖）
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { DecisionRecord, DecisionTrace, DecisionUnit, AssistantInvocation } from '@shared/types'
import { useCanvasStore } from '../stores/canvasStore'
import { buildLingSiDecisionPayload, ensureLingSiStorageSeeded, loadDecisionUnits, mergeDecisionTrace } from '../services/lingsi'
import { STORAGE_FILES } from '@shared/constants'
import { storageService, getAuthToken } from '../services/storageService'
import { emitDecisionRecordsUpdated } from '../services/decisionRecords'
import { resolveDecisionModeForPersona, getDecisionPersonaForPublicSpace } from '../utils/personaSpaces'
import { stripLinkedContextHints } from '../utils/conversationUtils'
import type { Turn } from '../utils/conversationUtils'

// 轨迹弹窗数据类型（避免从 AnswerModalSubcomponents 循环导入）
export interface LingSiTraceData {
  personaName: string
  matchedUnits: DecisionUnit[]
  sourceRefs: import('@shared/types').DecisionSourceRef[]
  productStateDocRefs: string[]
}

interface UseAnswerModalDecisionOptions {
  turnsRef: React.MutableRefObject<Turn[]>
  appliedPreferencesRef: React.MutableRefObject<string[]>
  serializeTurnsForStorage: (ts: Turn[]) => string
  autoSavedSigRef: React.MutableRefObject<string | null>
  didMutateRef: React.MutableRefObject<boolean>
}

function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

function addDaysToIso(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

function stripInjectedSpaceHints(content: string): string {
  return stripLinkedContextHints(content)
}

export function useAnswerModalDecision({
  turnsRef,
  appliedPreferencesRef,
  serializeTurnsForStorage,
  autoSavedSigRef,
  didMutateRef,
}: UseAnswerModalDecisionOptions) {
  // ── Store selectors ──────────────────────────────────────────────────────
  const isLennyMode = useCanvasStore(state => state.isLennyMode)
  const isPGMode = useCanvasStore(state => state.isPGMode)
  const isZhangMode = useCanvasStore(state => state.isZhangMode)
  const isWangMode = useCanvasStore(state => state.isWangMode)
  const isCustomSpaceMode = useCanvasStore(state => state.isCustomSpaceMode)
  const activeCustomSpaceId = useCanvasStore(state => state.activeCustomSpaceId)
  const lennyDecisionMode = useCanvasStore(state => state.lennyDecisionMode)
  const zhangDecisionMode = useCanvasStore(state => state.zhangDecisionMode)
  const invokedAssistant: AssistantInvocation | undefined = useCanvasStore(
    state => state.currentConversation?.invokedAssistant
  )
  const updateConversation = useCanvasStore(state => state.updateConversation)

  // activeDecisionPersona：根据当前 space 模式推断
  const activeDecisionPersona = isLennyMode && !isPGMode && !isWangMode
    ? (isZhangMode
      ? { id: 'zhang' as const, name: '张小龙' }
      : { id: 'lenny' as const, name: 'Lenny Rachitsky' })
    : invokedAssistant?.type === 'public_space'
      ? getDecisionPersonaForPublicSpace(invokedAssistant.id)
      : null

  // P7: 决策 trace 深度比较 selector，避免 updateConversation spread 触发 re-render
  const activeDecisionRecord: DecisionRecord | undefined = useCanvasStore(
    state => state.currentConversation?.decisionRecord,
    (a, b) => a?.updatedAt === b?.updatedAt && a?.status === b?.status
  )
  const activeDecisionTrace: DecisionTrace | undefined = useCanvasStore(
    state => state.currentConversation?.decisionTrace,
    (a, b) => {
      if (a === b) return true
      if (!a || !b) return a === b
      const sourceRefsEqual =
        a.sourceRefs === b.sourceRefs ||
        (a.sourceRefs?.length === b.sourceRefs?.length &&
          JSON.stringify(a.sourceRefs) === JSON.stringify(b.sourceRefs))
      const matchedIdsEqual =
        a.matchedDecisionUnitIds === b.matchedDecisionUnitIds ||
        (a.matchedDecisionUnitIds?.length === b.matchedDecisionUnitIds?.length &&
          JSON.stringify(a.matchedDecisionUnitIds) === JSON.stringify(b.matchedDecisionUnitIds))
      const productDocRefsEqual =
        a.productStateDocRefs === b.productStateDocRefs ||
        (a.productStateDocRefs?.length === b.productStateDocRefs?.length &&
          JSON.stringify(a.productStateDocRefs) === JSON.stringify(b.productStateDocRefs))
      return (
        a.mode === b.mode &&
        sourceRefsEqual &&
        matchedIdsEqual &&
        a.productStateUsed === b.productStateUsed &&
        productDocRefsEqual
      )
    }
  )

  // ── 匹配的决策单元（异步加载）────────────────────────────────────────────
  const [matchedDecisionUnits, setMatchedDecisionUnits] = useState<DecisionUnit[]>([])
  // 深度比较 selector：matchedDecisionUnitIds 是数组，updateConversation spread 每次产生新引用。
  // 若不加 equality，effect 会在每次 store 更新时无条件重跑 → loadDecisionUnits 循环调用 → 卡死。
  const matchedDecisionUnitIds = useCanvasStore(
    state => state.currentConversation?.decisionTrace?.matchedDecisionUnitIds,
    (a, b) => {
      if (a === b) return true
      if (!a || !b) return a === b
      if (a.length !== b.length) return false
      return JSON.stringify(a) === JSON.stringify(b)
    }
  )
  useEffect(() => {
    let cancelled = false
    if (!matchedDecisionUnitIds?.length) {
      setMatchedDecisionUnits([])
      return
    }
    ;(async () => {
      const units = await loadDecisionUnits()
      const scopedUnits = activeDecisionPersona ? units.filter(unit => unit.personaId === activeDecisionPersona.id) : units
      if (cancelled) return
      setMatchedDecisionUnits(scopedUnits.filter(unit => matchedDecisionUnitIds.includes(unit.id)))
    })()
    return () => { cancelled = true }
  }, [activeDecisionPersona, matchedDecisionUnitIds])

  // ── Stable refs for child components ─────────────────────────────────────
  const stableSourceRefs = useMemo(
    () => activeDecisionTrace?.sourceRefs ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDecisionTrace],
  )
  const stableProductStateDocRefs = useMemo(
    () => activeDecisionTrace?.productStateDocRefs ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDecisionTrace],
  )
  const stablePersonaName = useMemo(
    () => activeDecisionPersona?.name ?? invokedAssistant?.name ?? 'LingSi',
    [activeDecisionPersona?.name, invokedAssistant?.name],
  )

  const shouldShowLingSiTrace = useMemo(() =>
    !!activeDecisionTrace &&
    activeDecisionTrace.mode === 'decision' &&
    !!activeDecisionPersona &&
    (
      (activeDecisionTrace.sourceRefs?.length ?? 0) > 0 ||
      matchedDecisionUnits.length > 0 ||
      !!activeDecisionTrace.productStateUsed
    ),
  [activeDecisionTrace, activeDecisionPersona, matchedDecisionUnits.length])

  // ── 轨迹弹窗状态 ─────────────────────────────────────────────────────────
  const [traceData, setTraceData] = useState<LingSiTraceData | null>(null)
  const handleTraceClose = useCallback(() => setTraceData(null), [])

  // ── buildLingSiRequest ────────────────────────────────────────────────────
  const buildLingSiRequest = useCallback(async (userMessage: string) => {
    if (!activeDecisionPersona) {
      return { extraContext: undefined, decisionTrace: { mode: 'normal' as const } }
    }
    await ensureLingSiStorageSeeded()
    const sanitizedUserMessage = stripInjectedSpaceHints(userMessage)
    const currentConv = useCanvasStore.getState().currentConversation
    const currentMode = resolveDecisionModeForPersona({
      personaId: activeDecisionPersona.id,
      isPublicSpaceMode: isLennyMode,
      lennyDecisionMode,
      zhangDecisionMode,
      invokedAssistant,
      decisionTrace: currentConv?.decisionTrace,
    })
    const payload = await buildLingSiDecisionPayload(sanitizedUserMessage, currentMode, {
      personaId: activeDecisionPersona.id,
      personaName: activeDecisionPersona.name,
    })
    if (currentConv?.id) {
      await updateConversation(currentConv.id, {
        decisionTrace: mergeDecisionTrace(currentConv.decisionTrace, payload.decisionTrace),
        decisionRecord: payload.decisionRecord,
      })
    }
    return payload
  }, [activeDecisionPersona, invokedAssistant, isLennyMode, lennyDecisionMode, updateConversation, zhangDecisionMode])

  // ── persistDecisionRecord ─────────────────────────────────────────────────
  const persistDecisionRecord = useCallback(async (
    mutate: (record: DecisionRecord) => DecisionRecord,
  ) => {
    const storeConv = useCanvasStore.getState().currentConversation
    if (!storeConv?.id || !storeConv.decisionRecord) return
    const convId = storeConv.id

    await new Promise<void>(r => setTimeout(r, 0))

    const freshConversation = useCanvasStore.getState().currentConversation
    if (!freshConversation || freshConversation.id !== convId || !freshConversation.decisionRecord) return

    const now = new Date().toISOString()
    const nextDecisionRecord = mutate(freshConversation.decisionRecord)
    const normalizedRecord: DecisionRecord = {
      ...nextDecisionRecord,
      updatedAt: now,
      outcome: nextDecisionRecord.outcome
        ? {
            ...freshConversation.decisionRecord.outcome,
            ...nextDecisionRecord.outcome,
          }
        : nextDecisionRecord.outcome,
    }

    const currentTurns = turnsRef.current
    const assistantMessage = serializeTurnsForStorage(currentTurns)
    const nextConversation = {
      ...freshConversation,
      assistantMessage,
      reasoning_content: currentTurns.length > 0 ? (currentTurns[currentTurns.length - 1].reasoning || undefined) : undefined,
      appliedPreferences: [...appliedPreferencesRef.current],
      decisionRecord: normalizedRecord,
    }

    await updateConversation(convId, { decisionRecord: normalizedRecord })
    didMutateRef.current = true
    autoSavedSigRef.current = null

    await new Promise<void>(r => setTimeout(r, 0))

    await useCanvasStore.getState().appendConversation(nextConversation)

    const decisionSource = isCustomSpaceMode && activeCustomSpaceId
      ? (`custom-${activeCustomSpaceId}` as const)
      : isPGMode
        ? ('pg' as const)
        : isZhangMode
          ? ('zhang' as const)
          : isWangMode
            ? ('wang' as const)
            : isLennyMode
              ? ('lenny' as const)
              : ('main' as const)

    try {
      await storageService.append(STORAGE_FILES.DECISION_LEDGER, JSON.stringify({
        conversationId: nextConversation.id,
        source: decisionSource,
        title: normalizedRecord.userQuestion || nextConversation.userMessage,
        decisionRecord: normalizedRecord,
        updatedAt: normalizedRecord.updatedAt,
      }))
    } catch {
      // ignore
    }

    if ((isLennyMode || isCustomSpaceMode) && assistantMessage.trim()) {
      try {
        await authFetch('/api/memory/sync-lenny-conv', {
          method: 'POST',
          body: JSON.stringify({
            conversationId: nextConversation.id,
            userMessage: nextConversation.userMessage,
            assistantMessage,
            decisionTrace: nextConversation.decisionTrace,
            decisionRecord: normalizedRecord,
            source: decisionSource,
          }),
        })
      } catch {
        // keep local record even if sync fails
      }
    }

    emitDecisionRecordsUpdated()
  }, [
    activeCustomSpaceId,
    isCustomSpaceMode,
    isLennyMode,
    isPGMode,
    isWangMode,
    isZhangMode,
    serializeTurnsForStorage,
    updateConversation,
    turnsRef,
    appliedPreferencesRef,
    autoSavedSigRef,
    didMutateRef,
  ])

  const persistDecisionRecordRef = useRef(persistDecisionRecord)
  useEffect(() => { persistDecisionRecordRef.current = persistDecisionRecord }, [persistDecisionRecord])

  // ── markDecisionAnswered ──────────────────────────────────────────────────
  const markDecisionAnswered = useCallback(async () => {
    const freshRecord = useCanvasStore.getState().currentConversation?.decisionRecord
    if (!freshRecord || freshRecord.status !== 'draft') return
    await new Promise<void>(r => setTimeout(r, 200))
    const recheck = useCanvasStore.getState().currentConversation?.decisionRecord
    if (!recheck || recheck.status !== 'draft') return
    await persistDecisionRecordRef.current((record) => ({
      ...record,
      status: 'answered',
    }))
  }, [])

  // ── handleAdoptDecision ───────────────────────────────────────────────────
  const handleAdoptDecision = useCallback(async (days: number) => {
    await persistDecisionRecordRef.current((record) => ({
      ...record,
      status: 'adopted',
      outcome: {
        ...record.outcome,
        adoptedAt: record.outcome?.adoptedAt ?? new Date().toISOString(),
        revisitAt: addDaysToIso(days),
      },
    }))
  }, [])

  // ── handleDecisionOutcome ─────────────────────────────────────────────────
  const handleDecisionOutcome = useCallback(async (
    result: NonNullable<DecisionRecord['outcome']>['result'],
    notes?: string,
  ) => {
    await persistDecisionRecordRef.current((record) => ({
      ...record,
      status: 'revisited',
      outcome: {
        ...record.outcome,
        result,
        notes: notes?.trim() || undefined,
      },
    }))
  }, [])

  return {
    activeDecisionPersona,
    activeDecisionRecord,
    activeDecisionTrace,
    matchedDecisionUnits,
    stableSourceRefs,
    stableProductStateDocRefs,
    stablePersonaName,
    shouldShowLingSiTrace,
    traceData,
    setTraceData,
    handleTraceClose,
    buildLingSiRequest,
    persistDecisionRecord,
    markDecisionAnswered,
    handleAdoptDecision,
    handleDecisionOutcome,
  }
}
