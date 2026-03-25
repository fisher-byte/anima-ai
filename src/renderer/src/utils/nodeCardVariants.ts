import type { Node } from '@shared/types'

/** 主画布记忆节点视觉变体（仍属同一节点交互模型） */
export type MemoryCardVariant = 'person' | 'task' | 'neutral'

/**
 * 用分类 + 话题标签粗分「人物向 / 任务向」，其余为中性。
 */
export function getMemoryCardVariant(node: Node): MemoryCardVariant {
  if (node.nodeType === 'capability') return 'neutral'
  const cat = node.category ?? ''
  const topic = (node.topicLabel ?? '').toLowerCase()

  if (cat === '情感关系' || /人|朋友|家人|恋爱|婚姻|关系|情感|同事/.test(topic)) {
    return 'person'
  }
  if (
    cat === '工作事业' ||
    cat === '日常事务' ||
    cat === '学习成长' ||
    /任务|项目|截止|交付|会议|待办|ddl|排期/.test(topic)
  ) {
    return 'task'
  }
  return 'neutral'
}

export const MEMORY_VARIANT_STYLES: Record<
  MemoryCardVariant,
  { shell: string; accentBar: string; chip?: string }
> = {
  person: {
    // 极轻微暖色：只用低饱和边框与淡淡强调条，避免“花里胡哨”
    shell: 'bg-white/92 border-rose-200/30',
    accentBar: 'bg-gradient-to-b from-rose-300/45 to-rose-200/15',
    chip: 'text-[9px] font-semibold uppercase tracking-wider text-stone-500/90',
  },
  task: {
    // 极轻微冷色：降低饱和，保留一点“任务感”
    shell: 'bg-white/92 border-sky-200/30',
    accentBar: 'bg-gradient-to-b from-sky-300/40 to-sky-200/12',
    chip: 'text-[9px] font-semibold uppercase tracking-wider text-stone-500/90',
  },
  neutral: {
    shell: '',
    accentBar: 'bg-gray-300/50',
  },
}
