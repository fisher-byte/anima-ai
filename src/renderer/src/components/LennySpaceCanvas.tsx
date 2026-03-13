/**
 * LennySpaceCanvas — Lenny Rachitsky 沉浸式记忆画布
 * 薄包装：将 SpaceConfig 传给 PublicSpaceCanvas 统一渲染。
 */
import { PublicSpaceCanvas, type SpaceConfig } from './PublicSpaceCanvas'
import { LENNY_SEED_NODES, LENNY_SEED_EDGES } from '@shared/lennyData'
import { STORAGE_FILES } from '@shared/constants'

const LENNY_CONFIG: SpaceConfig = {
  seedNodes: LENNY_SEED_NODES,
  seedEdges: LENNY_SEED_EDGES,
  nodesFile: STORAGE_FILES.LENNY_NODES,
  edgesFile: STORAGE_FILES.LENNY_EDGES,
  convsFile: STORAGE_FILES.LENNY_CONVERSATIONS,
  openModeKey: 'openLennyMode',
  closeModeKey: 'closeLennyMode',
  seedIdPrefix: 'lenny-seed-',
  nodeIdPrefix: 'node-',
  gridClass: 'lenny-dot-grid',
  avatarText: 'L',
  avatarBg: 'bg-gray-900',
  displayName: 'Lenny Rachitsky',
  hoverHasHistory: '查看历史 →',
  hoverNoHistory: '点击提问 →',
  hoverAccent: 'text-amber-500/70',
  hoverBorder: 'border-gray-200/50',
  hoverShadow: '0_8px_32px_rgba(0,0,0,0.12)',
  placeholderKey: 'lennyPlaceholder',
  useForceHook: true,
}

interface LennySpaceCanvasProps {
  isOpen: boolean
  onClose: () => void
}

export function LennySpaceCanvas({ isOpen, onClose }: LennySpaceCanvasProps) {
  return <PublicSpaceCanvas config={LENNY_CONFIG} isOpen={isOpen} onClose={onClose} />
}
