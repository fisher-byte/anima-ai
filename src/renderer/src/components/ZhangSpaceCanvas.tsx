/**
 * ZhangSpaceCanvas — 张小龙沉浸式记忆画布
 * 薄包装：将 SpaceConfig 传给 PublicSpaceCanvas 统一渲染。
 */
import { PublicSpaceCanvas, type SpaceConfig } from './PublicSpaceCanvas'
import { ZHANG_SEED_NODES, ZHANG_SEED_EDGES } from '@shared/zhangData'
import { STORAGE_FILES } from '@shared/constants'

const ZHANG_CONFIG: SpaceConfig = {
  seedNodes: ZHANG_SEED_NODES,
  seedEdges: ZHANG_SEED_EDGES,
  nodesFile: STORAGE_FILES.ZHANG_NODES,
  edgesFile: STORAGE_FILES.ZHANG_EDGES,
  convsFile: STORAGE_FILES.ZHANG_CONVERSATIONS,
  openModeKey: 'openZhangMode',
  closeModeKey: 'closeZhangMode',
  seedIdPrefix: 'zhang-seed-',
  nodeIdPrefix: 'zhang-node-',
  gridClass: 'zhang-dot-grid',
  avatarText: '张',
  avatarBg: 'bg-blue-600',
  displayName: '张小龙',
  hoverHasHistory: 'View history →',
  hoverNoHistory: 'Ask →',
  hoverAccent: 'text-blue-400/70',
  hoverBorder: 'border-blue-100',
  hoverShadow: '0_8px_32px_rgba(37,99,235,0.12)',
  placeholderKey: 'zhangPlaceholder',
  useForceHook: false,
}

interface ZhangSpaceCanvasProps {
  isOpen: boolean
  onClose: () => void
}

export function ZhangSpaceCanvas({ isOpen, onClose }: ZhangSpaceCanvasProps) {
  return <PublicSpaceCanvas config={ZHANG_CONFIG} isOpen={isOpen} onClose={onClose} />
}
