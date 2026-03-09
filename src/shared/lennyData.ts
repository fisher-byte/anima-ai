/**
 * Lenny Space — Seed Data
 *
 * 初始节点来自 Lenny's Newsletter & Podcast 的真实公开内容。
 * 如果用户第一次进入 Lenny Space 且 lenny-nodes.json 为空，使用这些种子数据。
 *
 * 节点均为真实 episode / article，不是人造话题标签。
 * conversationId = 'lenny-seed-<slug>' 作为种子标记，不关联任何对话。
 *
 * 每个用户的 Lenny Space 数据独立存储在各自的 lenny-nodes.json 中。
 */

import type { Node, Edge } from './types'

// 画布中心坐标
const CX = 1920
const CY = 1200

// 围绕中心散布的坐标生成（极坐标转直角）
function pos(angle: number, radius: number): { x: number; y: number } {
  return {
    x: Math.round(CX + Math.cos((angle * Math.PI) / 180) * radius),
    y: Math.round(CY + Math.sin((angle * Math.PI) / 180) * radius),
  }
}

export const LENNY_SEED_NODES: Node[] = [
  // ── 核心中央节点 ─────────────────────────────────────────────────────────────
  {
    id: 'lenny-seed-pmf-sean-ellis',
    title: "The Sean Ellis PMF Test",
    keywords: ['PMF', '40%', 'very disappointed'],
    date: '2023-04-15',
    conversationId: 'lenny-seed-pmf-sean-ellis',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(0, 0),   // 中央
  },

  // ── 第一圈（半径 380）─────────────────────────────────────────────────────────
  {
    id: 'lenny-seed-chesky-playbook',
    title: "Brian Chesky's New Playbook",
    keywords: ['leadership', 'details', 'org design'],
    date: '2023-11-20',
    conversationId: 'lenny-seed-chesky-playbook',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(30, 380),
  },
  {
    id: 'lenny-seed-shreyas-pm-art',
    title: "The Art of Product Management",
    keywords: ['PM', 'prioritization', 'pre-mortem'],
    date: '2022-09-12',
    conversationId: 'lenny-seed-shreyas-pm-art',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(90, 380),
  },
  {
    id: 'lenny-seed-julie-zhuo-ai-mgmt',
    title: "Managing People vs Managing AI",
    keywords: ['AI agents', 'management', 'builder'],
    date: '2024-09-05',
    conversationId: 'lenny-seed-julie-zhuo-ai-mgmt',
    category: '思考世界',
    color: '#8B5CF6',
    nodeType: 'memory',
    ...pos(150, 380),
  },
  {
    id: 'lenny-seed-elena-verna-plg',
    title: "Product-Led Growth Masterclass",
    keywords: ['PLG', 'self-serve', 'acquisition'],
    date: '2022-06-08',
    conversationId: 'lenny-seed-elena-verna-plg',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(210, 380),
  },
  {
    id: 'lenny-seed-april-dunford-positioning',
    title: "Obviously Awesome: Positioning",
    keywords: ['positioning', 'differentiation', 'category'],
    date: '2022-03-21',
    conversationId: 'lenny-seed-april-dunford-positioning',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(270, 380),
  },
  {
    id: 'lenny-seed-casey-winters-growth',
    title: "How to Build a Growth Machine",
    keywords: ['growth loops', 'channels', 'retention'],
    date: '2022-01-17',
    conversationId: 'lenny-seed-casey-winters-growth',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(330, 380),
  },

  // ── 第二圈（半径 700）─────────────────────────────────────────────────────────
  {
    id: 'lenny-seed-shreyas-influence',
    title: "How Great PMs Drive Influence",
    keywords: ['influence', 'stakeholders', 'alignment'],
    date: '2023-02-06',
    conversationId: 'lenny-seed-shreyas-influence',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(60, 700),
  },
  {
    id: 'lenny-seed-marty-cagan-empowered',
    title: "Empowered Product Teams",
    keywords: ['outcomes', 'missionaries', 'empowerment'],
    date: '2022-12-05',
    conversationId: 'lenny-seed-marty-cagan-empowered',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(120, 700),
  },
  {
    id: 'lenny-seed-nikita-bier-virality',
    title: "How Nikita Bier Builds Viral Apps",
    keywords: ['virality', 'consumer apps', 'distribution'],
    date: '2023-07-31',
    conversationId: 'lenny-seed-nikita-bier-virality',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(180, 700),
  },
  {
    id: 'lenny-seed-madhavan-pricing',
    title: "Monetizing Innovation: Pricing Strategy",
    keywords: ['pricing', 'monetization', 'value-based'],
    date: '2023-05-22',
    conversationId: 'lenny-seed-madhavan-pricing',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(240, 700),
  },
  {
    id: 'lenny-seed-kim-scott-radical',
    title: "Radical Candor in Management",
    keywords: ['feedback', 'candor', 'team culture'],
    date: '2022-08-29',
    conversationId: 'lenny-seed-kim-scott-radical',
    category: '关系情感',
    color: '#EC4899',
    nodeType: 'memory',
    ...pos(300, 700),
  },
  {
    id: 'lenny-seed-drew-houston-founder',
    title: "Drew Houston: Dropbox Origin Story",
    keywords: ['founder', 'vision', 'persistence'],
    date: '2023-09-18',
    conversationId: 'lenny-seed-drew-houston-founder',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(0, 700),
  },
  {
    id: 'lenny-seed-sahil-mansuri-b2b-sales',
    title: "The Art of B2B Sales",
    keywords: ['sales', 'B2B', 'discovery calls'],
    date: '2023-03-13',
    conversationId: 'lenny-seed-sahil-mansuri-b2b-sales',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(340, 700),
  },
  {
    id: 'lenny-seed-gokul-metrics',
    title: "Choosing the Right North Star Metric",
    keywords: ['metrics', 'north star', 'measurement'],
    date: '2022-11-07',
    conversationId: 'lenny-seed-gokul-metrics',
    category: '工作事业',
    color: '#3B82F6',
    nodeType: 'memory',
    ...pos(280, 700),
  },
]

export const LENNY_SEED_EDGES: Edge[] = [
  // PMF Test ← → 中心连接相关节点
  {
    id: 'lenny-edge-1',
    source: 'lenny-seed-pmf-sean-ellis',
    target: 'lenny-seed-chesky-playbook',
    edgeType: 'logical',
    relation: '启发了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.8,
  },
  {
    id: 'lenny-edge-2',
    source: 'lenny-seed-pmf-sean-ellis',
    target: 'lenny-seed-casey-winters-growth',
    edgeType: 'logical',
    relation: '深化了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.85,
  },
  {
    id: 'lenny-edge-3',
    source: 'lenny-seed-pmf-sean-ellis',
    target: 'lenny-seed-elena-verna-plg',
    edgeType: 'logical',
    relation: '依赖于',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.82,
  },
  {
    id: 'lenny-edge-4',
    source: 'lenny-seed-shreyas-pm-art',
    target: 'lenny-seed-shreyas-influence',
    edgeType: 'logical',
    relation: '深化了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.9,
  },
  {
    id: 'lenny-edge-5',
    source: 'lenny-seed-chesky-playbook',
    target: 'lenny-seed-marty-cagan-empowered',
    edgeType: 'logical',
    relation: '启发了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.78,
  },
  {
    id: 'lenny-edge-6',
    source: 'lenny-seed-april-dunford-positioning',
    target: 'lenny-seed-madhavan-pricing',
    edgeType: 'logical',
    relation: '深化了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.83,
  },
  {
    id: 'lenny-edge-7',
    source: 'lenny-seed-casey-winters-growth',
    target: 'lenny-seed-nikita-bier-virality',
    edgeType: 'logical',
    relation: '启发了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.77,
  },
  {
    id: 'lenny-edge-8',
    source: 'lenny-seed-chesky-playbook',
    target: 'lenny-seed-kim-scott-radical',
    edgeType: 'logical',
    relation: '启发了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.75,
  },
  {
    id: 'lenny-edge-9',
    source: 'lenny-seed-casey-winters-growth',
    target: 'lenny-seed-gokul-metrics',
    edgeType: 'logical',
    relation: '依赖于',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.8,
  },
  {
    id: 'lenny-edge-10',
    source: 'lenny-seed-drew-houston-founder',
    target: 'lenny-seed-pmf-sean-ellis',
    edgeType: 'logical',
    relation: '启发了',
    createdAt: '2024-01-01T00:00:00.000Z',
    confidence: 0.76,
  },
]

/**
 * 从 GitHub 拉取 Lenny 播客 transcript 列表
 * 返回已知的 episode slug 列表（用于生成或扩展节点）
 */
export const LENNY_TRANSCRIPT_BASE_URL =
  'https://raw.githubusercontent.com/ChatPRD/lennys-podcast-transcripts/main/episodes'

/**
 * 已知的高质量 episode slugs（优先加载）
 */
export const LENNY_FEATURED_SLUGS = [
  'brian-chesky',
  'shreyas-doshi',
  'julie-zhuo',
  'sean-ellis',
  'elena-verna',
  'april-dunford',
  'casey-winters',
  'marty-cagan',
  'nikita-bier',
  'drew-houston',
  'kim-scott',
  'gokul-rajaram',
  'madhavan-ramanujam',
  'sahil-mansuri',
  'lulu-cheng-meservey',
  'stewart-butterfield',
  'tobi-lutke',
  'dylan-field',
  'kunal-shah',
  'ryan-hoover',
]
