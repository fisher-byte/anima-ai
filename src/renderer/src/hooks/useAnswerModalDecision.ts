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
import type { DecisionRecord, DecisionTrace, DecisionUnit, AssistantInvocation, DecisionMode } from '@shared/types'
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

function areStringArraysEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true
  if (!a || !b) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function areDecisionUnitsEqual(a: DecisionUnit[], b: DecisionUnit[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false
  }
  return true
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
  const decisionTracePersonaId = useCanvasStore(
    state => state.currentConversation?.decisionTrace?.personaId,
  )
  const updateConversation = useCanvasStore(state => state.updateConversation)

  // activeDecisionPersona：根据当前 space 模式推断；从历史恢复灵思会话时以 decisionTrace.personaId 兜底
  const activeDecisionPersona = useMemo(() => {
    const fromSpace =
      isLennyMode && !isPGMode && !isWangMode
        ? (isZhangMode
          ? { id: 'zhang' as const, name: '张小龙' }
          : { id: 'lenny' as const, name: 'Lenny Rachitsky' })
        : invokedAssistant?.type === 'public_space'
          ? getDecisionPersonaForPublicSpace(invokedAssistant.id)
          : null
    if (fromSpace) return fromSpace
    if (decisionTracePersonaId === 'zhang') return { id: 'zhang' as const, name: '张小龙' }
    if (decisionTracePersonaId === 'lenny') return { id: 'lenny' as const, name: 'Lenny Rachitsky' }
    return null
  }, [invokedAssistant, isLennyMode, isPGMode, isWangMode, isZhangMode, decisionTracePersonaId])
  const activeDecisionPersonaId = activeDecisionPersona?.id
  const activeDecisionPersonaName = activeDecisionPersona?.name

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
        areStringArraysEqual(a.matchedDecisionUnitIds, b.matchedDecisionUnitIds)
      const productDocRefsEqual =
        a.productStateDocRefs === b.productStateDocRefs ||
        areStringArraysEqual(a.productStateDocRefs, b.productStateDocRefs)
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
      return areStringArraysEqual(a, b)
    }
  )
  useEffect(() => {
    let cancelled = false
    if (!matchedDecisionUnitIds?.length) {
      setMatchedDecisionUnits((prev) => (prev.length === 0 ? prev : []))
      return
    }
    ;(async () => {
      const units = await loadDecisionUnits()
      const scopedUnits = activeDecisionPersonaId ? units.filter(unit => unit.personaId === activeDecisionPersonaId) : units
      if (cancelled) return
      const nextUnits = scopedUnits.filter(unit => matchedDecisionUnitIds.includes(unit.id))
      setMatchedDecisionUnits((prev) => (areDecisionUnitsEqual(prev, nextUnits) ? prev : nextUnits))
    })()
    return () => { cancelled = true }
  }, [activeDecisionPersonaId, matchedDecisionUnitIds])

  useEffect(() => {
    if (!activeDecisionPersonaId) return
    void ensureLingSiStorageSeeded()
  }, [activeDecisionPersonaId])

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
    () => activeDecisionPersonaName ?? invokedAssistant?.name ?? 'LingSi',
    [activeDecisionPersonaName, invokedAssistant?.name],
  )

  const decisionTraceForResolve = useCanvasStore(
    state => state.currentConversation?.decisionTrace,
    (a, b) => {
      if (a === b) return true
      if (!a || !b) return a === b
      return a.mode === b.mode && a.personaId === b.personaId
    },
  )

  /** 当前轮实际生效的灵思/普通模式（与历史会话 decisionTrace、画布开关对齐） */
  const resolvedDecisionMode: DecisionMode | null = useMemo(() => {
    if (!activeDecisionPersonaId) return null
    return resolveDecisionModeForPersona({
      personaId: activeDecisionPersonaId,
      isPublicSpaceMode: isLennyMode || isCustomSpaceMode,
      lennyDecisionMode,
      zhangDecisionMode,
      invokedAssistant,
      decisionTrace: decisionTraceForResolve,
    })
  }, [
    activeDecisionPersonaId,
    decisionTraceForResolve,
    invokedAssistant,
    isCustomSpaceMode,
    isLennyMode,
    lennyDecisionMode,
    zhangDecisionMode,
  ])

  const shouldShowLingSiTrace = useMemo(() =>
    !!activeDecisionTrace &&
    activeDecisionTrace.mode === 'decision' &&
    !!activeDecisionPersonaId &&
    (
      (activeDecisionTrace.sourceRefs?.length ?? 0) > 0 ||
      matchedDecisionUnits.length > 0 ||
      !!activeDecisionTrace.productStateUsed
    ),
  [activeDecisionPersonaId, activeDecisionTrace, matchedDecisionUnits.length])

  // ── 轨迹弹窗状态 ─────────────────────────────────────────────────────────
  const [traceData, setTraceData] = useState<LingSiTraceData | null>(null)
  const handleTraceClose = useCallback(() => setTraceData(null), [])

  // ── buildLingSiRequest ────────────────────────────────────────────────────
  const buildLingSiRequest = useCallback(async (userMessage: string) => {
    if (!activeDecisionPersonaId || !activeDecisionPersonaName) {
      return { extraContext: undefined, decisionTrace: { mode: 'normal' as const } }
    }
    await ensureLingSiStorageSeeded()
    const sanitizedUserMessage = stripInjectedSpaceHints(userMessage)
    const currentConv = useCanvasStore.getState().currentConversation
    const currentMode = resolveDecisionModeForPersona({
      personaId: activeDecisionPersonaId,
      isPublicSpaceMode: isLennyMode || isCustomSpaceMode,
      lennyDecisionMode,
      zhangDecisionMode,
      invokedAssistant,
      decisionTrace: currentConv?.decisionTrace,
    })
    const payload = await buildLingSiDecisionPayload(sanitizedUserMessage, currentMode, {
      personaId: activeDecisionPersonaId,
      personaName: activeDecisionPersonaName,
    })
    if (currentConv?.id) {
      await updateConversation(currentConv.id, {
        decisionTrace: mergeDecisionTrace(currentConv.decisionTrace, payload.decisionTrace),
        decisionRecord: payload.decisionRecord,
      })
    }
    return payload
  }, [activeDecisionPersonaId, activeDecisionPersonaName, invokedAssistant, isCustomSpaceMode, isLennyMode, lennyDecisionMode, updateConversation, zhangDecisionMode])

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

    // 让 React 先把 UI 更新（按钮状态等）渲染到屏幕，再跑后台 I/O
    await new Promise<void>(r => setTimeout(r, 0))

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

    // 以下均为后台持久化操作，全部 fire-and-forget，不阻塞 UI
    // appendConversation 写本地 JSONL + 触发向量索引等，不影响决策记录
    useCanvasStore.getState().appendConversation(nextConversation).catch(() => {})

    // 决策台账写入（本地文件，极快，但不必阻塞按钮响应）
    storageService.append(STORAGE_FILES.DECISION_LEDGER, JSON.stringify({
      conversationId: nextConversation.id,
      source: decisionSource,
      title: normalizedRecord.userQuestion || nextConversation.userMessage,
      decisionRecord: normalizedRecord,
      updatedAt: normalizedRecord.updatedAt,
    })).catch(() => {})

    // 远端记忆同步（网络请求，绝不阻塞 UI）
    if ((isLennyMode || isCustomSpaceMode) && assistantMessage.trim()) {
      authFetch('/api/memory/sync-lenny-conv', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: nextConversation.id,
          userMessage: nextConversation.userMessage,
          assistantMessage,
          decisionTrace: nextConversation.decisionTrace,
          decisionRecord: normalizedRecord,
          source: decisionSource,
        }),
      }).catch(() => {})
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
    resolvedDecisionMode,
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
