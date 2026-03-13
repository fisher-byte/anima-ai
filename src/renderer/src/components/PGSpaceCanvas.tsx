/**
 * PGSpaceCanvas — Paul Graham 沉浸式记忆画布
 * 薄包装：将 SpaceConfig 传给 PublicSpaceCanvas 统一渲染。
 */
import { PublicSpaceCanvas, type SpaceConfig } from './PublicSpaceCanvas'
import { PG_SEED_NODES, PG_SEED_EDGES } from '@shared/pgData'
import { STORAGE_FILES } from '@shared/constants'

const PG_CONFIG: SpaceConfig = {
  seedNodes: PG_SEED_NODES,
  seedEdges: PG_SEED_EDGES,
  nodesFile: STORAGE_FILES.PG_NODES,
  edgesFile: STORAGE_FILES.PG_EDGES,
  convsFile: STORAGE_FILES.PG_CONVERSATIONS,
  openModeKey: 'openPGMode',
  closeModeKey: 'closePGMode',
  seedIdPrefix: 'pg-seed-',
  nodeIdPrefix: 'pg-node-',
  gridClass: 'pg-dot-grid',
  avatarText: 'PG',
  avatarBg: 'bg-gray-900',
  displayName: 'Paul Graham',
  hoverHasHistory: 'View history →',
  hoverNoHistory: 'Ask PG →',
  hoverAccent: 'text-indigo-400/70',
  hoverBorder: 'border-indigo-100',
  hoverShadow: '0_8px_32px_rgba(99,102,241,0.14)',
  placeholderKey: 'pgPlaceholder',
  useForceHook: false,
}

interface PGSpaceCanvasProps {
  isOpen: boolean
  onClose: () => void
}

export function PGSpaceCanvas({ isOpen, onClose }: PGSpaceCanvasProps) {
  return <PublicSpaceCanvas config={PG_CONFIG} isOpen={isOpen} onClose={onClose} />
}
