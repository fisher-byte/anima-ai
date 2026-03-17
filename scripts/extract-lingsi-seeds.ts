import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  DecisionEvidenceLevel,
  DecisionPersona,
  DecisionSourceManifestEntry,
  DecisionSourceRef,
  DecisionSourceType,
  DecisionUnit,
} from '../src/shared/types'

interface SourceSpec {
  id: string
  type: DecisionSourceType
  person: string
  sourcePath: string
  label: string
  title: string
  url: string
  publishedAt: string
  notes: string
  evidenceLevel: DecisionEvidenceLevel
  mustInclude: string[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const evocanvasRoot = resolve(__dirname, '..')
const workspaceRoot = resolve(evocanvasRoot, '..')
const animaBaseRoot = join(workspaceRoot, 'anima-base')
const outputDir = join(evocanvasRoot, 'seeds', 'lingsi')

const SOURCE_SPECS: SourceSpec[] = [
  {
    id: 'src-lenny-decision-frameworks',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/frameworks/decision-making-frameworks.md',
    label: 'Decision-Making Frameworks Collection',
    title: 'Decision-Making Frameworks Collection',
    url: 'https://www.lennysnewsletter.com/p/my-favorite-decision-making-frameworks',
    publishedAt: '2024-02-06',
    notes: 'DACI, Two-Way Door, Confidence Levels, Pre-Mortem',
    evidenceLevel: 'B',
    mustInclude: ['DACI Framework', 'Two-Way vs One-Way Door Decisions', 'Pre-Mortem'],
  },
  {
    id: 'src-lenny-pmf-assessment',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/frameworks/pmf-assessment.md',
    label: 'PMF Assessment Framework',
    title: 'Product-Market Fit Assessment Framework',
    url: 'https://www.lennysnewsletter.com/p/how-superhuman-built-an-engine-to',
    publishedAt: '2022-07-20',
    notes: 'Sean Ellis test, PMF thresholds, segment focus',
    evidenceLevel: 'B',
    mustInclude: ['40%+', '非常失望', 'Superhuman'],
  },
  {
    id: 'src-lenny-rice',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/frameworks/rice-prioritization-framework.md',
    label: 'RICE Prioritization Framework',
    title: 'RICE Prioritization Framework',
    url: 'https://www.lennysnewsletter.com/p/prioritizing',
    publishedAt: '2021-07-27',
    notes: 'Reach, impact, confidence, effort tradeoff',
    evidenceLevel: 'B',
    mustInclude: ['RICE Score', 'Reach', 'Confidence'],
  },
  {
    id: 'src-lenny-cross-functional-alignment',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/frameworks/cross-functional-alignment.md',
    label: 'Cross-Functional Alignment Framework',
    title: 'Cross-Functional Alignment Framework',
    url: 'https://www.lennysnewsletter.com/p/cross-functional-alignment',
    publishedAt: '2024-06-18',
    notes: 'Stakeholder pressure, CEO requests, alignment without roadmap churn',
    evidenceLevel: 'B',
    mustInclude: ['CEO 突然提出新想法', '我们能否先做用户研究验证需求?', '给我2天时间做快速评估'],
  },
  {
    id: 'src-lenny-saas-pricing',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/frameworks/saas-pricing-strategy-framework.md',
    label: 'SaaS Pricing Strategy Framework',
    title: 'SaaS Pricing Strategy Framework',
    url: 'https://www.lennysnewsletter.com/p/saas-pricing-strategy',
    publishedAt: '2020-10-27',
    notes: 'Value metric, pricing model, packaging',
    evidenceLevel: 'B',
    mustInclude: ['Value Metric', 'Packaging', '年付折扣'],
  },
  {
    id: 'src-lenny-growth-loops',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/frameworks/growth-loops.md',
    label: 'Growth Loops Framework',
    title: 'Growth Loops Framework',
    url: 'https://www.lennysnewsletter.com/p/growth-loops',
    publishedAt: '2022-03-15',
    notes: 'Loops vs funnel, compounding growth mechanisms',
    evidenceLevel: 'B',
    mustInclude: ['Funnel vs Loop', 'Viral Loop', 'Loop Velocity'],
  },
  {
    id: 'src-lenny-annie-duke',
    type: 'podcast_transcript',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/podcasts/2024-05-02-annie-duke.md',
    label: 'Annie Duke on Better Decisions',
    title: 'This will make you a better decision maker | Annie Duke',
    url: 'https://www.youtube.com/watch?v=svQMODvIGAE',
    publishedAt: '2024-05-02',
    notes: 'Make implicit explicit, meetings discuss not decide, kill criteria',
    evidenceLevel: 'A',
    mustInclude: ['take what\'s implicit and make it explicit', 'The only thing that\'s ever supposed to happen in a meeting is the discussion part', 'set up kill criteria'],
  },
]

interface UnitSeed {
  id: string
  title: string
  summary: string
  scenario: string
  goal?: string
  constraints?: string[]
  tags: string[]
  triggerKeywords: string[]
  preferredPath?: string
  antiPatterns?: string[]
  reasoningSteps: string[]
  reasons: string[]
  followUpQuestions: string[]
  nextActions: string[]
  evidenceLevel: DecisionEvidenceLevel
  evidenceRefs: Array<{
    sourceId: string
    excerpt: string
  }>
  confidence: number
}

const UNIT_SEEDS: UnitSeed[] = [
  {
    id: 'lenny-pmf-validate-before-growth',
    title: '先验证 PMF，再加速增长',
    summary: '当团队想加大增长投入时，优先看 PMF 信号是否已经成立，而不是只看情绪或短期收入。',
    scenario: '产品负责人在判断是否进入增长加速阶段。',
    goal: '判断当前阶段更该继续打磨产品还是扩大增长投入。',
    constraints: ['样本量有限', '留存信号未完全稳定'],
    tags: ['pmf', 'growth', 'validation'],
    triggerKeywords: ['PMF', '留存', '增长', '加速', '验证'],
    preferredPath: '先跑 PMF 验证，再决定是否扩大渠道和预算。',
    antiPatterns: ['收入增长掩盖留存不足', '因为团队兴奋就提前扩张'],
    reasoningSteps: ['先看核心 PMF 信号', '再看用户细分差异', '最后决定增长节奏'],
    reasons: [
      'PMF 需要通过稳定需求信号而不是主观兴奋感来判断。',
      '当 PMF 没有站稳时，过早加速通常只会放大流失和获客浪费。',
      '先明确哪些用户最离不开产品，能让后续增长更聚焦。',
    ],
    followUpQuestions: [
      '你的留存曲线是否已经趋稳？',
      '最近 2-4 周的活跃用户里，有多少人会因为失去产品而非常失望？',
    ],
    nextActions: [
      '对最近 2-4 周活跃用户跑一轮 PMF 调研。',
      '把结果按用户细分拆开，确认最强需求人群是谁。',
      '在 PMF 未站稳前，把资源优先投在核心体验而不是大规模获客。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-pmf-assessment',
      excerpt: '- **40%+**: 达到PMF，可以加速增长',
    }],
    confidence: 0.85,
  },
  {
    id: 'lenny-pmf-find-best-segment',
    title: '先找到最痛用户群，再谈全面扩张',
    summary: 'PMF 不是对所有人同时成立，先识别最离不开产品的那群用户，再围绕他们集中优化。',
    scenario: '团队发现用户反馈分化，难判断到底有没有 PMF。',
    goal: '找到最值得聚焦的目标用户群体。',
    constraints: ['用户画像分散', '不同场景反馈差异大'],
    tags: ['pmf', 'segment', 'icp'],
    triggerKeywords: ['用户细分', 'ICP', '目标用户', 'PMF', '先服务谁', '哪类用户', '用户群', '优先服务'],
    preferredPath: '先围绕高痛感细分用户做深，再决定是否外扩。',
    antiPatterns: ['试图同时满足所有用户', '被低匹配用户需求牵着走'],
    reasoningSteps: ['识别高痛感用户', '放大他们看重的价值', '减少噪音需求'],
    reasons: [
      '最有价值的 PMF 线索通常来自“非常失望”的核心用户。',
      '先服务好高匹配用户，比平均满足所有人更容易做出强产品。',
      '清晰的 ICP 会直接改善产品优先级和获客效率。',
    ],
    followUpQuestions: [
      '哪类用户最常表达“没有你们我会很难受”？',
      '他们最看重的功能是不是当前路线图的中心？',
    ],
    nextActions: [
      '从 PMF 调研结果里单独提取高痛感用户群特征。',
      '把未来两周的优化集中到这类用户最看重的 1-2 个价值点。',
      '暂停处理明显来自低匹配用户的噪音需求。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-pmf-assessment',
      excerpt: '**正确做法**: 聚焦"非常失望"用户，忽略不匹配用户',
    }],
    confidence: 0.82,
  },
  {
    id: 'lenny-rice-prioritize-with-confidence',
    title: '资源有限时，用 RICE 排序而不是拍脑袋',
    summary: '面对多个候选功能或项目时，用 Reach、Impact、Confidence、Effort 一起比较，尤其要正视信心不足。',
    scenario: '产品团队在多个功能之间做路线图取舍。',
    goal: '在有限资源下做更客观的优先级决策。',
    constraints: ['候选项目很多', '各方意见强烈'],
    tags: ['prioritization', 'roadmap', 'rice'],
    triggerKeywords: ['优先级', 'RICE', '路线图', '排序'],
    preferredPath: '先把评分维度摊开，再讨论排序和战略例外。',
    antiPatterns: ['只谈影响不谈成本', '对低信心猜测给出高确定度结论'],
    reasoningSteps: ['量化 Reach/Impact', '显式写出 Confidence', '结合 Effort 比较机会成本'],
    reasons: [
      'RICE 能把模糊争论转成可比较的结构化判断。',
      'Confidence 维度能提醒团队哪里其实还缺验证，避免伪确定性。',
      'Effort 的加入能防止高想象力项目长期挤占有限资源。',
    ],
    followUpQuestions: [
      '这几个候选项各自影响多少真实用户？',
      '你们现在的 Confidence 是基于数据、访谈还是纯直觉？',
    ],
    nextActions: [
      '把候选事项放进统一的 RICE 表格里重新打分。',
      '对 Confidence 低于 50% 的项先补验证，再决定是否开做。',
      '把排序结果和战略例外分开记录，避免两者混在一起。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-rice',
      excerpt: '- **50% = Low Confidence（低信心）**: 主要基于直觉或假设',
    }],
    confidence: 0.84,
  },
  {
    id: 'lenny-roadmap-cutline-before-stakeholder-pull',
    title: '路线图先收敛到关键项目，再处理外部拉扯',
    summary: '当季度路线图同时被 CEO、销售、客户成功拉扯时，先收敛关键项目，再用统一评估规则处理加项请求。',
    scenario: '小团队在季度规划时面对多方 stakeholder 压力，原计划容易不断加项。',
    goal: '保护执行节奏，同时不给 stakeholder 一句“拍脑袋拒绝”。',
    constraints: ['产能有限', '需求很多', 'stakeholder 压力持续存在'],
    tags: ['roadmap', 'prioritization', 'stakeholder', 'alignment'],
    triggerKeywords: ['路线图', '季度', '需求', '销售', '客户成功', 'CEO', '施压'],
    preferredPath: '先把路线图收敛到少数关键项目，再把新增需求放进统一评估窗口，而不是直接插队。',
    antiPatterns: ['谁声音大就先做谁', 'CEO 一提新想法就立刻加进 roadmap', '路线图无限加项不做替换'],
    reasoningSteps: ['先明确当前产能边界', '再用 RICE 和战略契合度比较候选项', '最后要求任何加项都明确替换项或先进入评估'],
    reasons: [
      'RICE 的价值在于把争论从观点拉回到数据、证据和共同语言。',
      '面对 CEO 或其他 stakeholder 的临时想法，先快速评估而不是立刻插队，能保护团队执行节奏。',
      '把新增需求放进统一评估窗口，比在会里临时加项更不容易把 roadmap 搅乱。',
    ],
    followUpQuestions: [
      '如果今天要再加一项，具体替换掉当前路线图里的哪一项？',
      '这个需求的用户价值、战略契合度和证据强度，跟当前前几项相比到底排第几？',
    ],
    nextActions: [
      '先把本季度路线图收敛到少数关键项目，并把其他需求明确放进“待评估池”。',
      '把所有新增需求放进同一张 RICE 表，单独记录战略例外，不允许直接插队。',
      '对 CEO 或其他高压需求给一个 2 天快速评估窗口：先问用户价值、战略目标、相对优先级，再决定是否进入路线图。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [
      {
        sourceId: 'src-lenny-rice',
        excerpt: 'RICE 最大的价值不是产生完美的分数，而是强迫团队对每个想法进行结构化思考，并基于数据和证据（而非观点）进行讨论。',
      },
      {
        sourceId: 'src-lenny-cross-functional-alignment',
        excerpt: '给我2天时间做快速评估,然后我们讨论。',
      },
    ],
    confidence: 0.83,
  },
  {
    id: 'lenny-pricing-start-with-value-metric',
    title: '定价前先确定价值指标，不要先拍价格点',
    summary: '对 SaaS 产品而言，先想清楚客户为什么付费、按什么单位付费，再决定具体价格。',
    scenario: '团队准备给新产品或新套餐定价。',
    goal: '建立更贴近客户价值的收费逻辑。',
    constraints: ['定价经验不足', '担心价格影响转化'],
    tags: ['pricing', 'saas', 'value-metric'],
    triggerKeywords: ['定价', '收费', '价值指标', '套餐'],
    preferredPath: '先定义 value metric，再选 pricing model 和具体价位。',
    antiPatterns: ['按成本倒推价格', '选了会抑制使用的收费单位'],
    reasoningSteps: ['先定义价值指标', '再选择定价模型', '最后才是价位测试'],
    reasons: [
      '价值指标决定了收费逻辑是否和客户感知价值一致。',
      '好的 value metric 既容易理解，又不会抑制客户使用。',
      '先把收费单位想清楚，比先争论 $29 还是 $39 更重要。',
    ],
    followUpQuestions: [
      '客户觉得自己是在为什么结果付费？',
      '这个收费单位会不会让客户因为怕多付钱而少用产品？',
    ],
    nextActions: [
      '列出 2-3 个候选 value metric，并逐一检视是否和客户价值成正比。',
      '用 5-10 个客户访谈验证他们如何理解这套收费方式。',
      '确认 value metric 后，再进入价格点和套餐测试。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-saas-pricing',
      excerpt: '- 正确：按活跃用户数收费（Slack模式）',
    }],
    confidence: 0.83,
  },
  {
    id: 'lenny-pricing-design-clear-upgrade-path',
    title: '套餐设计的重点是升级路径，而不是层数堆砌',
    summary: '套餐不宜过多，重点是让基础层易采用、中间层成为主打、高层捕获高价值客户。',
    scenario: '团队在设计 SaaS 套餐结构。',
    goal: '让定价既能转化，又能自然升级。',
    constraints: ['功能很多', '担心客户不知道怎么选'],
    tags: ['pricing', 'packaging', 'saas'],
    triggerKeywords: ['套餐', '分层', '升级', '年付'],
    preferredPath: '用 3-4 层做清晰分层，并明确为什么用户会升级。',
    antiPatterns: ['套餐过多导致选择困难', '层级之间没有清晰升级理由'],
    reasoningSteps: ['先设基础层门槛', '再定义主打层', '最后补高端层价值'],
    reasons: [
      '套餐的关键不是复杂，而是让客户明白每一层解决了什么问题。',
      '中间层通常应成为主打，因为它兼顾了价值表达和商业效率。',
      '清晰升级路径能提升 ARPU，也减少销售解释成本。',
    ],
    followUpQuestions: [
      '哪一层是你最希望 80% 客户选择的主打层？',
      '客户为什么会从基础层升级，而不是一直停留在最低档？',
    ],
    nextActions: [
      '把当前套餐压缩到最多 3-4 层，并明确每层的升级触发点。',
      '补上年付折扣和企业层的特殊价值说明。',
      '针对新客户测试当前套餐是否容易理解和比较。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-saas-pricing',
      excerpt: '- 3-4层是最佳实践\n- 避免选择困难症（超过5层）\n- 每层价格差距2-3倍',
    }],
    confidence: 0.8,
  },
  {
    id: 'lenny-growth-loop-before-channel-scaling',
    title: '先识别增长闭环，再决定砸哪条渠道',
    summary: '如果产品还没有找到能自我强化的增长闭环，单纯放大漏斗投入往往不可持续。',
    scenario: '团队在考虑增长渠道选择和预算分配。',
    goal: '识别更可持续的增长结构。',
    constraints: ['获客预算有限', '自然增长不稳定'],
    tags: ['growth', 'loops', 'channel'],
    triggerKeywords: ['增长渠道', '获客', '增长闭环', '漏斗', 'SEO', '广告', 'KOL', '推荐'],
    preferredPath: '先判断有没有 loop，再决定要不要放大漏斗投入。',
    antiPatterns: ['把所有增长都当作线性买量', '没有 loop 就盲目扩预算'],
    reasoningSteps: ['识别核心用户行为', '检查输出是否会变成新输入', '评估循环速度和强度'],
    reasons: [
      '漏斗依赖持续投喂，闭环更接近复利型增长。',
      '如果核心行为不能产生新输入，单纯加预算只会放大边际成本。',
      '先找到 loop，后面再做渠道放大，增长质量会更稳。',
    ],
    followUpQuestions: [
      '用户当前的核心行为，会不会自然带来新用户或更深留存？',
      '你们现在更像漏斗还是闭环？',
    ],
    nextActions: [
      '画出当前增长流程，区分线性漏斗和可能的闭环节点。',
      '优先优化一个最有潜力的 loop，而不是同时投很多渠道。',
      '跟踪循环时间和输出质量，而不只看短期新增。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-growth-loops',
      excerpt: 'Growth Loops 是可自我强化的增长系统，与传统漏斗不同，loops 的输出会成为新的输入，形成复利增长。Lenny Rachitsky 系统总结了最成功产品的 growth loops 模式。',
    }],
    confidence: 0.81,
  },
  {
    id: 'lenny-daci-for-cross-functional-decisions',
    title: '跨团队决策先把角色定清楚，尤其是唯一 approver',
    summary: '当决策涉及多个团队时，先用 DACI 明确 driver、approver、contributors、informed，减少无效争论。',
    scenario: '一个功能或路线图决策牵涉产品、设计、工程、数据等多个角色。',
    goal: '明确责任，减少委员会式决策。',
    constraints: ['参与方多', '责任边界模糊'],
    tags: ['decision-making', 'daci', 'alignment'],
    triggerKeywords: ['DACI', '角色', '跨团队', '拍板', '跨部门', '谁拍板', '吵不出结论', '定制功能'],
    preferredPath: '先明确唯一 approver，再组织输入和讨论。',
    antiPatterns: ['多个 approver 共同拍板', 'driver 和 approver 角色混淆'],
    reasoningSteps: ['先定义角色', '再组织输入', '最后按角色落决策'],
    reasons: [
      '多团队决策如果没有唯一 approver，极易退化成拉锯和妥协。',
      '把“提供输入”和“最终拍板”分开，能显著降低沟通摩擦。',
      'DACI 能帮助团队把责任说清，而不是把所有人都变成决策者。',
    ],
    followUpQuestions: [
      '这件事的最终 approver 到底是谁？',
      '现在大家是在贡献信息，还是都在争夺拍板权？',
    ],
    nextActions: [
      '把这次决策的 DACI 表先列出来，再开会讨论。',
      '确认只有一个 approver，并让所有参与方知道自己的角色。',
      '把 contributors 的关键输入提前收集，不在会上临时发现问题。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-decision-frameworks',
      excerpt: '- **A**pprover (批准者): 最终决策者（通常只有 1 人）',
    }],
    confidence: 0.82,
  },
  {
    id: 'lenny-two-way-door-for-speed',
    title: '能回滚的事就快做快试，不要用单向门流程处理双向门',
    summary: '很多团队决策之所以慢，不是因为事情真的不可逆，而是把可回滚的决策也当成了高风险审批项。',
    scenario: '团队在速度和谨慎之间摇摆，导致推进缓慢。',
    goal: '加快可逆决策的执行速度。',
    constraints: ['审批层级多', '害怕试错'],
    tags: ['decision-making', 'speed', 'experimentation'],
    triggerKeywords: ['双向门', '可逆', '试错', '决策速度', '完整评审', '先上线', '回滚', '要不要先上'],
    preferredPath: '先判断是否可逆，可逆就缩短流程、尽快验证。',
    antiPatterns: ['小事走大流程', '把试验也按战略决策处理'],
    reasoningSteps: ['先判断可逆性', '再决定流程强度', '尽快设实验和回滚条件'],
    reasons: [
      '大多数产品和流程决策其实是可逆的。',
      '把所有事情都按单向门处理，会严重拖慢团队速度。',
      '可逆决策的关键不是把所有风险消灭，而是把验证和回滚设计好。',
    ],
    followUpQuestions: [
      '如果这个决定错了，回滚成本到底有多高？',
      '你们现在的审批复杂度，和真实风险匹配吗？',
    ],
    nextActions: [
      '把当前讨论事项按 one-way / two-way door 重新分类。',
      '对 two-way door 决策设置最小试验范围和回滚条件。',
      '把审批重点留给真正不可逆的决策。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-decision-frameworks',
      excerpt: '- 大多数决策是 Two-Way Door\n- 不要用 One-Way Door 的流程处理 Two-Way Door',
    }],
    confidence: 0.84,
  },
  {
    id: 'lenny-meetings-are-for-discussion-not-discovery-or-decision',
    title: '会议只做讨论，不做发现和拍板',
    summary: '把发现信息和做决定都挪到会前/会后，会议本身只保留高质量讨论。',
    scenario: '团队开会常常被最响亮或最自信的人带偏。',
    goal: '提升团队讨论质量，减少会议里的权力噪音。',
    constraints: ['参会者多', '会议时间有限'],
    tags: ['meeting', 'decision-making', 'annie-duke'],
    triggerKeywords: ['会议', '讨论', '拍板', '对齐'],
    preferredPath: '会前独立收集观点，会中只讨论分歧，会后再做决策。',
    antiPatterns: ['在会上才第一次暴露观点', '把会议变成说服和站队现场'],
    reasoningSteps: ['会前独立收集判断', '会中聚焦分歧讨论', '会后私下或小范围落决策'],
    reasons: [
      '会议里最响亮、最自信的人往往会获得不成比例的影响力。',
      '先独立收集输入，能减少从众和权威偏差。',
      '让会议专注讨论分歧，比重复共识更高效。',
    ],
    followUpQuestions: [
      '这次会前，大家的判断有没有先被独立收集？',
      '会议里讨论的是分歧，还是在重复彼此已经同意的内容？',
    ],
    nextActions: [
      '下次决策会前，先让每个人独立提交排序和理由。',
      '会上只挑分歧最大的点展开讨论。',
      '把最终拍板环节移出大会议，避免现场被话语权劫持。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-annie-duke',
      excerpt: 'The only thing that\'s ever supposed to happen in a meeting is the discussion part.',
    }],
    confidence: 0.88,
  },
  {
    id: 'lenny-pre-mortem-needs-kill-criteria',
    title: '做 pre-mortem 时一定要配 kill criteria',
    summary: '提前假设项目会失败还不够，关键是先承诺：出现哪些信号就停、改或重算。',
    scenario: '团队在上线新项目或重大功能前做风险评估。',
    goal: '让风险识别真正转化成行动约束。',
    constraints: ['团队容易忽视负面信号', '上线后不愿承认方向错了'],
    tags: ['pre-mortem', 'risk', 'annie-duke'],
    triggerKeywords: ['pre-mortem', '风险', '停止条件', 'kill criteria'],
    preferredPath: '在项目启动前写清楚 kill criteria 和触发后的动作。',
    antiPatterns: ['只列风险不列停止条件', '风险出现后继续自我说服'],
    reasoningSteps: ['先假设失败', '再定义关键信号', '最后承诺触发后的动作'],
    reasons: [
      'pre-mortem 的价值不在于更悲观，而在于更早看见盲点。',
      '没有 kill criteria，团队通常会在坏信号出现后继续找借口。',
      '预先承诺停损规则，能显著降低沉没成本偏差。',
    ],
    followUpQuestions: [
      '哪些信号一旦出现，你们应该暂停或重算这件事？',
      '这些信号现在有没有被明确写下来？',
    ],
    nextActions: [
      '对当前重大项目做一次 pre-mortem。',
      '列出 2-3 条 kill criteria，并写明出现后谁来触发什么动作。',
      '把 kill criteria 纳入每周复盘，而不是只在启动会上提一次。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-annie-duke',
      excerpt: 'Use the pre-mortem to set up kill criteria.',
    }],
    confidence: 0.9,
  },
  {
    id: 'lenny-make-implicit-explicit',
    title: '把隐含判断显性化，才能知道自己什么时候错了',
    summary: '直觉可以有价值，但如果不把判断写出来，就无法复盘自己到底错在假设、估计还是执行。',
    scenario: '创始人或负责人在高不确定问题上主要依赖经验判断。',
    goal: '提高决策复盘质量，而不是只盯结果成败。',
    constraints: ['时间紧', '很多判断停留在脑子里'],
    tags: ['decision-quality', 'intuition', 'annie-duke'],
    triggerKeywords: ['直觉', '假设', '复盘', '显性化'],
    preferredPath: '先写出假设、估计和信心等级，再做决定。',
    antiPatterns: ['只凭感觉不记录前提', '结果出来后才重写故事'],
    reasoningSteps: ['写出判断', '标记不确定性', '结果后按原判断复盘'],
    reasons: [
      '不把隐含判断写出来，就无法真正知道自己哪里判断失真。',
      '决策质量和结果并不完全等价，显性化能帮助拆开两者。',
      '显性化的过程本身就能暴露逻辑中的缺口和跳跃。',
    ],
    followUpQuestions: [
      '你这次决策背后的关键假设，有没有被写下来？',
      '如果最后结果不好，你要怎么知道是判断错了还是运气不好？',
    ],
    nextActions: [
      '对当前关键决策写一页判断卡：假设、估计、信心、触发条件。',
      '在结论后面加一个明确的信心等级，而不是只给单一结论。',
      '结果回来后按原判断卡复盘，不要事后改口径。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-annie-duke',
      excerpt: 'It\'s so incredibly necessary in improving decision quality to take what\'s implicit and make it explicit.',
    }],
    confidence: 0.87,
  },
  {
    id: 'lenny-shorten-feedback-loops-with-leading-signals',
    title: '所谓长反馈回路，通常是你还没定义领先信号',
    summary: '当最终结果要很久才显现时，先找到与目标强相关的中间信号，主动缩短反馈周期。',
    scenario: '团队面对长期结果导向问题，担心试错成本太高。',
    goal: '在长周期目标下仍能快速验证方向。',
    constraints: ['最终结果显现慢', '需要更快学习'],
    tags: ['feedback-loop', 'metrics', 'annie-duke'],
    triggerKeywords: ['反馈回路', '长期结果', '领先指标', '验证'],
    preferredPath: '先定义与最终结果相关的领先信号，再围绕它建立短周期验证。',
    antiPatterns: ['只盯最终结果', '因为反馈慢就不设验证点'],
    reasoningSteps: ['定义最终结果', '找到相关领先信号', '围绕领先信号缩短验证周期'],
    reasons: [
      '很多所谓的长反馈回路，本质上是没有把中间信号定义清楚。',
      '领先信号能帮助团队更快发现方向偏差，而不是等结果完全落地后再后悔。',
      '把验证拆成更短的周期，能让决策从豪赌变成连续下注。',
    ],
    followUpQuestions: [
      '最终目标出现前，有哪些信号和它高度相关？',
      '你们现在有没有固定频率去看这些领先指标？',
    ],
    nextActions: [
      '为当前长期目标补一层领先指标定义。',
      '把复盘频率缩短到每周或每两周一次。',
      '明确哪些领先指标恶化时，需要暂停或调整当前策略。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-annie-duke',
      excerpt: 'There is no such thing as a long feedback loop. You can make a decision about how long the feedback loop is. That is your choice to live in a long feedback loop, and you can choose to shorten the feedback loop.',
    }],
    confidence: 0.86,
  },
]

function readGitValue(repoDir: string, args: string[]): string {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
  }).trim()
}

function readRepoShortCommit(repoDir: string): string {
  return readGitValue(repoDir, ['rev-parse', '--short', 'HEAD'])
}

interface SourceFileRecord {
  spec: SourceSpec
  content: string
}

async function loadSourceFiles(): Promise<Map<string, SourceFileRecord>> {
  const records = await Promise.all(
    SOURCE_SPECS.map(async (spec) => {
      const content = await readFile(join(animaBaseRoot, spec.sourcePath), 'utf8')
      return [spec.id, { spec, content }] as const
    }),
  )
  return new Map(records)
}

function ensureSourceIntegrity(spec: SourceSpec, content: string): void {
  for (const needle of spec.mustInclude) {
    if (!content.includes(needle)) {
      throw new Error(`Source validation failed for ${spec.sourcePath}: missing "${needle}"`)
    }
  }
}

function formatLocator(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
}

function buildLocatorFromExcerpt(content: string, excerpt: string, sourcePath: string): string {
  const offset = content.indexOf(excerpt)
  if (offset === -1) {
    throw new Error(`Excerpt validation failed for ${sourcePath}: missing excerpt "${excerpt}"`)
  }

  const startLine = content.slice(0, offset).split('\n').length
  const endLine = startLine + excerpt.split('\n').length - 1
  return formatLocator(startLine, endLine)
}

function manifestFromSpec(
  spec: SourceSpec,
  repoCommit: string,
  importedAt: string,
): DecisionSourceManifestEntry {
  return {
    id: spec.id,
    repo: 'anima-base',
    repoCommit,
    person: spec.person,
    type: spec.type,
    sourcePath: spec.sourcePath,
    importedAt,
    importedBy: 'codex',
    notes: spec.notes,
  }
}

function sourceRefFromSpec(spec: SourceSpec): DecisionSourceRef {
  return {
    id: spec.id,
    label: spec.label,
    type: spec.type,
    path: spec.sourcePath,
    person: spec.person,
    title: spec.title,
    url: spec.url,
    publishedAt: spec.publishedAt,
    evidenceLevel: spec.evidenceLevel,
    notes: spec.notes,
  }
}

function buildEvidenceRef(record: SourceFileRecord, excerpt: string): DecisionSourceRef {
  return {
    ...sourceRefFromSpec(record.spec),
    locator: buildLocatorFromExcerpt(record.content, excerpt, record.spec.sourcePath),
    excerpt,
  }
}

function buildPersona(sourceRefs: DecisionSourceRef[], timestamp: string): DecisionPersona {
  return {
    id: 'lenny',
    name: 'Lenny Rachitsky',
    basePromptKey: 'LENNY_SYSTEM_PROMPT',
    heuristics: [
      '先给直接判断，再展开理由',
      '在不确定问题上先写清关键假设和验证路径',
      '优先区分阶段差异，而不是给放之四海皆准的答案',
      '尽量把抽象问题落到具体指标、动作和信号上',
    ],
    domainBoundaries: {
      strong: ['product', 'growth', 'pricing', 'pmf', 'career'],
      weak: ['medical', 'legal', 'licensed_finance'],
    },
    evidenceSources: sourceRefs,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function buildUnit(seed: UnitSeed, sourceRefs: DecisionSourceRef[], timestamp: string): DecisionUnit {
  return {
    id: seed.id,
    personaId: 'lenny',
    title: seed.title,
    summary: seed.summary,
    scenario: seed.scenario,
    goal: seed.goal,
    constraints: seed.constraints,
    tags: seed.tags,
    triggerKeywords: seed.triggerKeywords,
    preferredPath: seed.preferredPath,
    antiPatterns: seed.antiPatterns,
    reasoningSteps: seed.reasoningSteps,
    reasons: seed.reasons,
    followUpQuestions: seed.followUpQuestions,
    nextActions: seed.nextActions,
    evidenceLevel: seed.evidenceLevel,
    sourceRefs,
    status: 'approved',
    confidence: seed.confidence,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T[]
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function stableStringify<T extends Record<string, unknown>>(value: T, ignoredKeys: string[]): string {
  const clone = { ...value }
  for (const key of ignoredKeys) delete clone[key]
  return JSON.stringify(clone)
}

function mergeEntityTimestamps<T extends { id: string; createdAt: string; updatedAt: string }>(
  next: T,
  existingMap: Map<string, T>,
): T {
  const existing = existingMap.get(next.id)
  if (!existing) return next

  const isSame = stableStringify(next, ['createdAt', 'updatedAt']) === stableStringify(existing, ['createdAt', 'updatedAt'])
  return {
    ...next,
    createdAt: existing.createdAt || next.createdAt,
    updatedAt: isSame ? (existing.updatedAt || existing.createdAt || next.updatedAt) : next.updatedAt,
  }
}

function mergeManifestImportedAt(
  next: DecisionSourceManifestEntry,
  existingMap: Map<string, DecisionSourceManifestEntry>,
): DecisionSourceManifestEntry {
  const existing = existingMap.get(next.id)
  if (!existing) return next

  const isSame = stableStringify(next, ['importedAt']) === stableStringify(existing, ['importedAt'])
  return {
    ...next,
    importedAt: isSame ? (existing.importedAt || next.importedAt) : next.importedAt,
  }
}

async function writeJsonIfChanged(filePath: string, data: unknown): Promise<boolean> {
  const serialized = JSON.stringify(data, null, 2) + '\n'
  try {
    const existing = await readFile(filePath, 'utf8')
    if (existing === serialized) return false
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error
    }
  }
  await writeFile(filePath, serialized, 'utf8')
  return true
}

async function main() {
  const generationTimestamp = new Date().toISOString()
  const repoCommit = readRepoShortCommit(animaBaseRoot)
  const sourceFiles = await loadSourceFiles()

  for (const record of sourceFiles.values()) {
    ensureSourceIntegrity(record.spec, record.content)
  }

  await mkdir(outputDir, { recursive: true })

  const existingPersonas = new Map(
    (await readJsonArray<DecisionPersona>(join(outputDir, 'decision-personas.json'))).map(item => [item.id, item]),
  )
  const existingManifest = new Map(
    (await readJsonArray<DecisionSourceManifestEntry>(join(outputDir, 'decision-source-manifest.json'))).map(item => [item.id, item]),
  )
  const existingUnits = new Map(
    (await readJsonArray<DecisionUnit>(join(outputDir, 'decision-units.json'))).map(item => [item.id, item]),
  )

  const manifest = SOURCE_SPECS
    .map(spec => manifestFromSpec(spec, repoCommit, generationTimestamp))
    .map(entry => mergeManifestImportedAt(entry, existingManifest))

  const personaSourceRefs = SOURCE_SPECS.map(spec => sourceRefFromSpec(spec))
  const persona = mergeEntityTimestamps(buildPersona(personaSourceRefs, generationTimestamp), existingPersonas)

  const units = UNIT_SEEDS.map((seed) => {
    const refs = seed.evidenceRefs.map(({ sourceId, excerpt }) => {
      const record = sourceFiles.get(sourceId)
      if (!record) throw new Error(`Unknown sourceId: ${sourceId}`)
      return buildEvidenceRef(record, excerpt)
    })
    return mergeEntityTimestamps(buildUnit(seed, refs, generationTimestamp), existingUnits)
  })

  const wroteFiles = await Promise.all([
    writeJsonIfChanged(join(outputDir, 'decision-personas.json'), [persona]),
    writeJsonIfChanged(join(outputDir, 'decision-source-manifest.json'), manifest),
    writeJsonIfChanged(join(outputDir, 'decision-units.json'), units),
  ])

  console.log(`Wrote LingSi seed files to ${outputDir}`)
  console.log(`Persona count: 1`)
  console.log(`Source count: ${manifest.length}`)
  console.log(`Approved unit count: ${units.length}`)
  console.log(`Files changed: ${wroteFiles.filter(Boolean).length}`)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
