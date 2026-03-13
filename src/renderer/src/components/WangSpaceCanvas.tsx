/**
 * WangSpaceCanvas — 王慧文沉浸式记忆画布
 * 薄包装：将 SpaceConfig 传给 PublicSpaceCanvas 统一渲染。
 */
import { PublicSpaceCanvas, type SpaceConfig } from './PublicSpaceCanvas'
import { WANG_SEED_NODES, WANG_SEED_EDGES } from '@shared/wangData'
import { STORAGE_FILES } from '@shared/constants'

const WANG_CONFIG: SpaceConfig = {
  seedNodes: WANG_SEED_NODES,
  seedEdges: WANG_SEED_EDGES,
  nodesFile: STORAGE_FILES.WANG_NODES,
  edgesFile: STORAGE_FILES.WANG_EDGES,
  convsFile: STORAGE_FILES.WANG_CONVERSATIONS,
  openModeKey: 'openWangMode',
  closeModeKey: 'closeWangMode',
  seedIdPrefix: 'wang-seed-',
  nodeIdPrefix: 'wang-node-',
  gridClass: 'wang-dot-grid',
  avatarText: '王',
  avatarBg: 'bg-gray-900',
  displayName: '王慧文',
  hoverHasHistory: 'View history →',
  hoverNoHistory: 'Ask →',
  hoverAccent: 'text-emerald-400/70',
  hoverBorder: 'border-emerald-100',
  hoverShadow: '0_8px_32px_rgba(16,185,129,0.12)',
  placeholderKey: 'wangPlaceholder',
  useForceHook: false,
}

interface WangSpaceCanvasProps {
  isOpen: boolean
  onClose: () => void
}

export function WangSpaceCanvas({ isOpen, onClose }: WangSpaceCanvasProps) {
  return <PublicSpaceCanvas config={WANG_CONFIG} isOpen={isOpen} onClose={onClose} />
}
