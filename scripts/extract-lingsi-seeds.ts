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
  personaId: string
  type: DecisionSourceType
  person: string
  sourcePath: string
  label: string
  title: string
  url?: string
  publishedAt: string
  notes: string
  evidenceLevel: DecisionEvidenceLevel
  mustInclude: string[]
}

interface PersonaSpec {
  id: string
  name: string
  basePromptKey: string
  heuristics: string[]
  domainBoundaries: {
    strong: string[]
    weak: string[]
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const evocanvasRoot = resolve(__dirname, '..')
const workspaceRoot = resolve(evocanvasRoot, '..')
const animaBaseRoot = join(workspaceRoot, 'anima-base')
const outputDir = join(evocanvasRoot, 'seeds', 'lingsi')

const PERSONA_SPECS: PersonaSpec[] = [
  {
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
  },
  {
    id: 'zhang',
    name: '张小龙',
    basePromptKey: 'ZHANG_SYSTEM_PROMPT',
    heuristics: [
      '先判断是否违背人性、场景和关系链，再谈功能方案',
      '优先寻找更简单、更自然的规则，而不是堆更多控制项',
      '在社交和内容场景里，先考虑群体效应和传播机制',
      '商业化或增长动作要克制，不能破坏长期体验',
    ],
    domainBoundaries: {
      strong: ['product', 'social', 'consumer', 'content', 'growth'],
      weak: ['medical', 'legal', 'licensed_finance'],
    },
  },
]

const SOURCE_SPECS: SourceSpec[] = [
  {
    id: 'src-lenny-decision-frameworks',
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
  {
    id: 'src-lenny-superhuman-pmf-case',
    personaId: 'lenny',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-01-superhuman-pmf-survey-decision.md',
    label: 'Superhuman PMF Survey Decision Case',
    title: 'Superhuman PMF Survey Decision Case',
    url: 'https://www.youtube.com/watch?v=0igjSRZyX-w',
    publishedAt: '2025-03-23',
    notes: 'PMF segmentation, 50/50 roadmap, solution deepening before market widening',
    evidenceLevel: 'A',
    mustInclude: ['Somewhat disappointed', '50%时间强化用户最爱的功能', 'solution deepening'],
  },
  {
    id: 'src-lenny-roadmap-pyramid',
    personaId: 'lenny',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/frameworks/product-roadmap-planning-framework.md',
    label: 'Product Roadmap Planning Framework',
    title: 'Product Roadmap Planning Framework',
    url: 'https://www.lennysnewsletter.com/p/mission-vision-strategy-goals-roadmap',
    publishedAt: '2022-10-18',
    notes: 'Mission to task planning hierarchy, goals-first roadmap prioritization',
    evidenceLevel: 'B',
    mustInclude: ['Mission（使命）', 'ROI = Impact / Effort', '没有目标就无法优先级排序路线图：'],
  },
  {
    id: 'src-lenny-uncertainty',
    personaId: 'lenny',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/articles/uncertainty-decision-framework.md',
    label: 'Navigating Uncertainty Decision Framework',
    title: 'Navigating Uncertainty Decision Framework',
    publishedAt: '2026-03-17',
    notes: 'Reversible vs irreversible decisions, time-boxing, 70 percent certainty',
    evidenceLevel: 'B',
    mustInclude: ['Most decisions are reversible.', 'Set decision deadline before discussion starts.', 'Make decisions with 70% certainty, not 100%.'],
  },
  {
    id: 'src-lenny-pm-career',
    personaId: 'lenny',
    type: 'framework',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/articles/pm-career-path-decision-framework.md',
    label: 'PM Career Path Decision Framework',
    title: 'PM Career Path Decision Framework',
    url: 'https://www.lennysnewsletter.com/p/which-companies-accelerate-your-pm',
    publishedAt: '2026-03-17',
    notes: 'Career growth over prestige, IC-manager switch, company selection criteria',
    evidenceLevel: 'B',
    mustInclude: ['best at teaching them the craft of product management', 'track record of creating an inflection in the careers of PMs', 'switch at L6 (i.e., Sr. Product Manager)'],
  },
  {
    id: 'src-lenny-pricing-strategy',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Patrick Campbell',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-16-patrick-campbell-pricing-strategy.md',
    label: 'Patrick Campbell Pricing Strategy Case',
    title: 'Patrick Campbell定价策略',
    publishedAt: '2026-03-18',
    notes: 'Value-based pricing, localization, tier design, pricing as a growth lever',
    evidenceLevel: 'A',
    mustInclude: ['**核心原则**: "价格 = 用户感知价值，而非成本"', '### 决策2: 价格本地化（Localized Pricing）', '### 3. 3档位定价最优'],
  },
  {
    id: 'src-lenny-gem-dhm',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Gibson Biddle',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-17-gibson-biddle-gem-dhm.md',
    label: 'Gibson Biddle GEM/DHM Case',
    title: 'GEM模型与DHM模型',
    publishedAt: '2026-03-18',
    notes: 'GEM strategy balance, DHM feature prioritization, data plus insight',
    evidenceLevel: 'A',
    mustInclude: ['### GEM模型（产品战略）', '关键：3个要素要平衡，不能只优化一个', '### 2. DHM评估功能'],
  },
  {
    id: 'src-lenny-plg-strategy',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Wes Bush',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-18-wes-bush-plg-strategy.md',
    label: 'Wes Bush PLG Strategy Case',
    title: 'Wes Bush PLG策略',
    publishedAt: '2026-03-18',
    notes: 'TTV, freemium conditions, product-led growth loops',
    evidenceLevel: 'A',
    mustInclude: ['### 1. 降低Time to Value（TTV）', 'THEN TTV<5分钟是及格线：', '满足2+个 → 适合Freemium'],
  },
  {
    id: 'src-lenny-continuous-discovery',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Teresa Torres',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-19-teresa-torres-continuous-discovery.md',
    label: 'Teresa Torres Continuous Discovery Case',
    title: 'Teresa Torres 持续发现',
    publishedAt: '2026-03-18',
    notes: 'Weekly customer conversations, opportunity solution tree, opportunity-first discovery',
    evidenceLevel: 'A',
    mustInclude: ['### Opportunity Solution Tree（机会方案树）', 'THEN 每周至少3次用户对话：', '正确流程（机会驱动）:'],
  },
  {
    id: 'src-lenny-activation-optimization',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Ramli John',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-20-ramli-john-activation-optimization.md',
    label: 'Ramli John Activation Optimization Case',
    title: 'Ramli John 激活优化',
    publishedAt: '2026-03-18',
    notes: 'Aha moment, bowling alley onboarding, TTV and guided activation',
    evidenceLevel: 'A',
    mustInclude: ['## Bowling Alley Framework（保龄球框架）', 'THEN 先识别Aha Moment：', 'THEN 减少步骤至<5步：'],
  },
  {
    id: 'src-lenny-feedback-system',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Hiten Shah',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-21-hiten-shah-feedback-system.md',
    label: 'Hiten Shah Feedback System Case',
    title: 'Hiten Shah 客户反馈系统',
    publishedAt: '2026-03-18',
    notes: 'Feedback loops, quantification by segment, pain versus requested solution',
    evidenceLevel: 'A',
    mustInclude: ['### 3层反馈系统', 'THEN 追踪统计：', 'IF 用户提反馈'],
  },
  {
    id: 'src-zhang-core-principles',
    personaId: 'zhang',
    type: 'framework',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/frameworks/core-principles.md',
    label: 'Zhang Core Product Principles',
    title: '产品基本原则',
    publishedAt: '2012-01-01',
    notes: 'Simple rules, user psychology, group effects, product restraint',
    evidenceLevel: 'A',
    mustInclude: ['简单是最美的', '产品研究的是群体', '最简无法被打败'],
  },
  {
    id: 'src-zhang-discovering-needs',
    personaId: 'zhang',
    type: 'framework',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/frameworks/discovering-needs.md',
    label: 'Zhang Need Discovery Framework',
    title: '需求发现方法论',
    publishedAt: '2012-01-01',
    notes: 'Psychological delight over utility, trend sensing, human motives',
    evidenceLevel: 'A',
    mustInclude: ['心理满足 > 工具价值', '他要的是很爽的感觉', '需求是满足人们的贪嗔痴'],
  },
  {
    id: 'src-zhang-wechat-launch',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-10-wechat-launch-decision.md',
    label: 'WeChat Launch Decision Case',
    title: '微信立项决策',
    publishedAt: '2010-11-20',
    notes: 'New relation chain, small team launch, fast MVP under strategic threat',
    evidenceLevel: 'A',
    mustInclude: ['2. ✅ **基于手机通讯录**：而非QQ好友关系链', '4. ✅ **快速迭代**：2个月上线，先做最小可用产品（MVP）', '1. ✅ **全新产品**：不是手机QQ升级，是全新品牌"微信"'],
  },
  {
    id: 'src-zhang-red-packet',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-15-red-packet.md',
    label: 'Red Packet Activation Decision Case',
    title: '春节红包决策',
    publishedAt: '2014-01-20',
    notes: 'Gamified activation, social diffusion, cultural timing window',
    evidenceLevel: 'A',
    mustInclude: ['用红包包装绑卡', '社交裂变 + 随机性 = 病毒传播', '抓住文化节点 + 快速执行'],
  },
  {
    id: 'src-zhang-moments-ads',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-17-moments-ads.md',
    label: 'Moments Ads Decision Case',
    title: '朋友圈广告决策',
    publishedAt: '2015-01-25',
    notes: 'Restrained commercialization, native ad format, user control',
    evidenceLevel: 'A',
    mustInclude: ['> "如果广告本身有价值，用户就不会讨厌它。广告的本质是信息，不是打扰。"', '1. **克制投放**: 每天最多1条朋友圈广告（不像微博/Facebook密集投放）', '2. **原生形态**: 广告外观接近朋友圈内容（不做突兀Banner）'],
  },
  {
    id: 'src-zhang-subscription-feed',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-06-subscription-feed-redesign.md',
    label: 'Subscription Feed Redesign Case',
    title: '订阅号信息流改版决策',
    publishedAt: '2017-05-01',
    notes: 'Independent entry, progressive reform, social recommendation over forced feed rewrite',
    evidenceLevel: 'B',
    mustInclude: ['2. **增加信息流**: 在"发现-看一看"单独入口（而非直接改订阅号）', '3. **社交推荐**: 基于好友点赞推荐（而非纯算法）', '### 启发式3: 独立入口 vs 强制改版'],
  },
  {
    id: 'src-lenny-reforge-community',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-12-reforge-product-strategy.md',
    label: 'Reforge Community Strategy Case',
    title: 'Reforge 产品策略决策',
    publishedAt: '2026-03-17',
    notes: 'High-intent community, premium pricing, cohort learning, application gate',
    evidenceLevel: 'A',
    mustInclude: ['**核心决策**: Reforge不做"卖课程"，而做"会员制社区"', 'Cohort-Based完课率: 82% ✅', '"The course is the product, but the community is the moat."'],
  },
  {
    id: 'src-lenny-retention-first',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-13-elena-verna-retention-first.md',
    label: 'Retention First Decision Case',
    title: 'Elena Verna 留存优先策略',
    publishedAt: '2026-03-17',
    notes: 'Retention before acquisition, magic moment, churn resurrection',
    evidenceLevel: 'A',
    mustInclude: ['Retention is the new Acquisition', 'Magic Moment定义：创建3个Board', '结论：复活近期流失用户ROI最高'],
  },
  {
    id: 'src-lenny-netflix-password-sharing',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-13-netflix-password-sharing.md',
    label: 'Netflix Password Sharing Decision Case',
    title: 'Netflix 密码共享限制决策',
    publishedAt: '2026-03-17',
    notes: 'Short-term pain for long-term growth, phased rollout, profile transfer',
    evidenceLevel: 'A',
    mustInclude: ['3. 分阶段推广：', '"Profile Transfer"功能：让共享用户轻松迁移自己的观看记录', '### 启发式 #1: "Pay Today, Grow Tomorrow"（付出短期代价换取长期增长）'],
  },
  {
    id: 'src-lenny-design-critique',
    personaId: 'lenny',
    type: 'decision_case',
    person: 'Lenny Rachitsky',
    sourcePath: 'people/product/lenny-rachitsky/decision-cases/case-15-julie-zhuo-design-critique.md',
    label: 'Design Critique Decision Case',
    title: 'Julie Zhuo 设计评审方法',
    publishedAt: '2026-03-17',
    notes: '3W critique framing, level-3 feedback, stage-aware critique',
    evidenceLevel: 'A',
    mustInclude: ['1. **目标是什么？**（解决什么问题？）', '**Julie的"梯子法则"**:', '### 3. 区分阶段反馈'],
  },
  {
    id: 'src-zhang-operation-restraint',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-18-operation-restraint.md',
    label: 'Operation Restraint Decision Case',
    title: '运营克制决策',
    publishedAt: '2026-03-17',
    notes: 'Operational restraint, no fake urgency, protect users from KPI noise',
    evidenceLevel: 'A',
    mustInclude: ['**核心原则**: "不打扰是最好的运营"', '❌ 运营红点: 一律禁止', '2. 去运营化：不做热点推送'],
  },
  {
    id: 'src-zhang-feature-lifecycle',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-19-feature-evolution-philosophy.md',
    label: 'Feature Lifecycle Philosophy Case',
    title: '功能演进哲学',
    publishedAt: '2026-03-17',
    notes: 'Feature lifecycle, degrade before delete, quiet death, kill with intent',
    evidenceLevel: 'A',
    mustInclude: ['**核心原则**: "敢于让功能死亡"', '1. **弱化入口**（从一级入口降至二级）', '→ 给予"安静死亡"的空间'],
  },
  {
    id: 'src-zhang-social-design',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-20-social-design-principles.md',
    label: 'Social Design Principles Case',
    title: '社交设计原则',
    publishedAt: '2026-03-17',
    notes: 'Real relationships, private sharing, reduce social pressure',
    evidenceLevel: 'A',
    mustInclude: ['**微信选择**: "双向验证"（加好友需对方同意）', '> "朋友圈不是让你表演给陌生人看，而是分享给真正关心你的人。"', '**微信选择**: 不做已读回执'],
  },
  {
    id: 'src-zhang-platform-governance',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-21-platform-governance-philosophy.md',
    label: 'Platform Governance Philosophy Case',
    title: '平台治理哲学',
    publishedAt: '2026-03-17',
    notes: 'Decentralized distribution, rule-based governance, temporary centralization only for cold start',
    evidenceLevel: 'A',
    mustInclude: ['**微信选择**: 不做推荐，用户主动订阅', '4. **制定规则，而非干预个体**: 定规则，让生态自我演化', '完全去中心化在早期内容供给不足时不可行。需要适度中心化冷启动，但长期依然走向去中心化。'],
  },
  {
    id: 'src-zhang-mini-program',
    personaId: 'zhang',
    type: 'decision_case',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/decision-cases/case-03-mini-program-strategy.md',
    label: 'Mini Program Strategy Case',
    title: '微信小程序战略决策',
    publishedAt: '2026-03-18',
    notes: 'Use-and-go service form, scene-based entry, no centralized entrance',
    evidenceLevel: 'A',
    mustInclude: ['**"用完即走"的服务哲学**', '**"没有入口"的去中心化设计**', '小程序没有统一入口,通过二维码在场景中启动'],
  },
  {
    id: 'src-zhang-open-platform-philosophy',
    personaId: 'zhang',
    type: 'article',
    person: 'Zhang Xiaolong',
    sourcePath: 'people/product/zhang-xiaolong/articles/2014-wechat-open-platform-philosophy.md',
    label: 'WeChat Open Platform Philosophy',
    title: '微信开放平台的理念与方向',
    url: 'https://www.cnblogs.com/lanzhi/p/6467424.html',
    publishedAt: '2014-12-28',
    notes: 'Forest not palace, dynamic system, decentralized traffic, user value first',
    evidenceLevel: 'A',
    mustInclude: ['### 第四点：真正的去中心化', '### 第五点：搭建生态系统，而非自建宫殿', '### 第六点：动态的系统，而非僵死的规则'],
  },
]

interface UnitSeed {
  id: string
  personaId: string
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
    personaId: 'lenny',
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
  {
    id: 'lenny-pmf-listen-to-the-almost-convinced',
    personaId: 'lenny',
    title: 'PMF 卡住时，优先研究“差一点就爱上你”的用户',
    summary: '当用户反馈很多但增长没有起势时，不要平均听所有人，而要集中研究那些接近爱上产品、只是被少数阻碍卡住的用户。',
    scenario: '团队已经有一批喜欢产品的早期用户，但路线图仍然容易被杂音带偏。',
    goal: '把 PMF 优化资源集中到最可能抬升核心需求强度的人群。',
    constraints: ['用户反馈混杂', '团队容易被大客户或重度用户带偏'],
    tags: ['pmf', 'segment', 'roadmap'],
    triggerKeywords: ['somewhat disappointed', '非常失望', '用户反馈太多', 'PMF 调研', '差一点', '接近爱上'],
    preferredPath: '少听已经爱上产品的人和根本不在乎的人，优先拆解“差一点”的用户到底被什么挡住。',
    antiPatterns: ['把所有用户反馈视为同等重要', '只听最满意用户的功能建议'],
    reasoningSteps: ['先按 PMF 调研结果分层', '识别接近爱上产品的用户', '围绕他们的阻碍重排路线图'],
    reasons: [
      '最有价值的 PMF 提升空间，通常藏在“接近爱上你但还差一点”的用户里。',
      '已经非常满意的用户会放大边缘功能，不会告诉你卡住普适增长的真正阻碍。',
      '明确“谁的反馈最该听”，能直接减少路线图噪音。',
    ],
    followUpQuestions: [
      '哪些用户明确认可核心价值，但还因为少数问题没有彻底买账？',
      '这些用户反复提到的阻碍，是体验问题、缺失能力，还是定位问题？',
    ],
    nextActions: [
      '把最近一轮 PMF 调研按 very/somewhat/not disappointed 分层。',
      '单独拉出 somewhat disappointed 且认可核心价值主张的人群做访谈。',
      '用他们的前三大阻碍重排接下来 1-2 个迭代的修复和优化。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-superhuman-pmf-case',
      excerpt: '「诀窍是不要太听"very disappointed"用户的反馈，因为他们已经爱你了。也不要听"not disappointed"用户的反馈，因为他们离爱你太远，本质上是lost cause。要聚焦"somewhat disappointed"用户——他们有点爱你，但有些东西阻碍了他们。」',
    }],
    confidence: 0.87,
  },
  {
    id: 'lenny-pmf-balance-love-and-objections',
    personaId: 'lenny',
    title: 'PMF 提升不是只补短板，要用 50/50 同时强化优势和拆阻碍',
    summary: '路线图不能只盯着用户抱怨，也不能只继续堆大家已经喜欢的功能。更稳的做法是同时强化核心吸引力和移除关键阻碍。',
    scenario: '团队在决定 PMF 阶段的下个迭代应该做增强项还是补缺口。',
    goal: '避免路线图过度偏向修 bug 或过度偏向锦上添花。',
    constraints: ['团队产能有限', '核心用户很满意但增长还没被点燃'],
    tags: ['pmf', 'roadmap', 'prioritization'],
    triggerKeywords: ['50/50', '强化优势', '克服异议', '路线图怎么排', 'PMF 提升'],
    preferredPath: '用一半资源加深用户最爱的价值，另一半资源拆掉接近转化用户的关键阻碍。',
    antiPatterns: ['路线图只剩修补抱怨', '路线图只服务最满意用户'],
    reasoningSteps: ['找出用户最爱的价值', '找出差一点转化用户的最大阻碍', '按 50/50 分配迭代资源'],
    reasons: [
      '只补阻碍会让产品失去锋利度，只强化优势又可能放任关键阻塞存在。',
      '50/50 分配能同时加深核心价值和扩大真实可转化人群。',
      '这比按声音大小排需求更接近 PMF 机制本身。',
    ],
    followUpQuestions: [
      '当前用户最爱的 1-2 个价值点是什么？',
      '接近转化但没彻底买单的用户，最大的阻碍是哪几个？',
    ],
    nextActions: [
      '从访谈里提炼一份“最爱功能”清单和一份“关键阻碍”清单。',
      '下一轮迭代按 50/50 分配资源，而不是让同一类事项吃掉所有带宽。',
      '两周后复盘：是爱的价值更强了，还是关键阻碍减少了？',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-superhuman-pmf-case',
      excerpt: '「在计划周期开始时，我建议花一半时间加倍投入用户真正喜欢的功能，另一半时间系统化地克服"somewhat disappointed"用户的异议——特别是那些"主要价值主张吸引我"的用户。」',
    }],
    confidence: 0.86,
  },
  {
    id: 'lenny-solution-deepening-before-market-widening',
    personaId: 'lenny',
    title: '产品还没站稳时，先做深再做宽',
    summary: '当团队纠结先扩平台、扩市场还是继续打磨核心体验时，默认应先把当前核心用户的体验做深，除非已有很强证据证明扩张窗口更重要。',
    scenario: '产品团队在“继续打磨核心体验”和“拓展更多市场/平台”之间摇摆。',
    goal: '避免在 PMF 未稳时过早分散资源。',
    constraints: ['资源有限', '扩平台诉求强', '核心体验仍有明显短板'],
    tags: ['pmf', 'focus', 'expansion'],
    triggerKeywords: ['扩市场', '扩平台', '支持移动端', '支持 Outlook', '做深还是做宽', 'solution deepening'],
    preferredPath: '先把当前用户最核心的使用体验做到明显更强，再决定是否扩市场或平台。',
    antiPatterns: ['为了看起来市场更大而过早扩平台', '核心体验还不稳就同时开很多战线'],
    reasoningSteps: ['先判断核心价值是否已经足够强', '再衡量扩张是否真的比做深更重要', '把大部分资源保留给现有核心用户价值'],
    reasons: [
      'PMF 阶段最容易被“市场更大”叙事带偏，结果是每条战线都浅。',
      '先做深能更快建立强口碑和留存，再扩张时基础更稳。',
      '资源有限时，集中投入通常比多线平推更有效。',
    ],
    followUpQuestions: [
      '现有核心用户最关键的体验短板，是否已经被补到足够强？',
      '如果现在扩平台，是否会直接稀释团队打磨核心价值的带宽？',
    ],
    nextActions: [
      '先列出当前核心用户体验里最影响留存的 2-3 个问题。',
      '把大部分研发带宽优先给这些问题，而不是新平台适配。',
      '只有当核心体验指标明显稳定后，再重开市场拓展评估。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-superhuman-pmf-case',
      excerpt: '「有些空间、市场、平台的市场拓展很快很容易，但有些空间（比如邮件）市场拓展非常难、非常慢。所以早期我们极度聚焦：只支持Gmail，只支持Web。前几年我们把每一盎司R&D精力、每一美元工程投入都投到solution deepening上——让产品对现有用户更好。用户当然喜欢，这就是我们如何达成PMF的。」',
    }],
    confidence: 0.88,
  },
  {
    id: 'lenny-roadmap-start-from-goals-not-noise',
    personaId: 'lenny',
    title: '路线图先锚定目标，再讨论需求',
    summary: '如果目标都没写清楚，路线图讨论几乎必然退化成谁更会争取资源。先把目标和战略锚定，才能谈优先级。',
    scenario: '团队在季度规划时发现所有项目都“看起来重要”，无法真正排序。',
    goal: '让路线图优先级回到目标贡献，而不是回到话语权。',
    constraints: ['stakeholder 多', '路线图候选项多', '目标定义不够清晰'],
    tags: ['roadmap', 'strategy', 'goals'],
    triggerKeywords: ['目标不清楚', '路线图很乱', '为什么做这个', '战略对齐', '季度规划'],
    preferredPath: '先明确 mission/vision/strategy/goals，再用 Impact/Effort 排路线图。',
    antiPatterns: ['先列功能再找理由', '没有目标就直接开路线图会'],
    reasoningSteps: ['先明确目标', '检查项目是否支持目标', '再用 ROI 比较候选项'],
    reasons: [
      '没有目标时，任何项目都能讲出自己的重要性，排序会失真。',
      '让路线图项目明确服务目标，可以把讨论从意见拉回结果。',
      'Impact/Effort 只有在目标清楚时才有意义。',
    ],
    followUpQuestions: [
      '这轮路线图最核心要推动的目标到底是什么？',
      '每个候选项目如果上线，具体会推高哪个目标指标？',
    ],
    nextActions: [
      '先把这轮季度规划的 1-2 个核心目标写成可度量指标。',
      '逐项检查现有路线图项目是否直接支持这些目标。',
      '删除或下沉那些说不清支持哪个目标的项目，再做 Impact/Effort 排序。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [
      {
        sourceId: 'src-lenny-roadmap-pyramid',
        excerpt: '没有目标就无法优先级排序路线图：',
      },
      {
        sourceId: 'src-lenny-roadmap-pyramid',
        excerpt: '- 路线图项目必须支持目标',
      },
    ],
    confidence: 0.85,
  },
  {
    id: 'lenny-timebox-most-decisions-under-uncertainty',
    personaId: 'lenny',
    title: '多数不确定决策要限时，并按可逆性处理',
    summary: '在高不确定环境里，默认不要等到“完全想清楚”再动。先判断是否可逆，可逆就限时决策，用 70% 把握推进。',
    scenario: '团队面对不确定决策容易反复讨论，迟迟不落地。',
    goal: '在不牺牲关键质量的前提下，提高决策速度。',
    constraints: ['信息不完整', '团队害怕决策错误', '竞争或窗口期存在'],
    tags: ['decision-making', 'uncertainty', 'speed'],
    triggerKeywords: ['不确定', '信息不全', '要不要等', '70% 把握', '限时决策', '可逆不可逆'],
    preferredPath: '先判断决策可逆性和重要性；大多数可逆决策直接设截止时间，用 70% 确定度推进。',
    antiPatterns: ['把所有决策都当成不可逆', '无限期等待更多信息'],
    reasoningSteps: ['先分类可逆性', '给决策设时限', '达到足够信息后先推进并跟踪结果'],
    reasons: [
      '多数决策其实可逆，不值得按高风险审批节奏处理。',
      '最后那点确定性通常极其昂贵，而延迟本身也在持续产生成本。',
      '先推进并跟踪结果，通常比继续空转更有效。',
    ],
    followUpQuestions: [
      '这件事如果判断错了，回滚成本到底有多高？',
      '你们愿意给这次决策设一个明确截止时间吗？',
    ],
    nextActions: [
      '把当前待决事项先标成 reversible 或 irreversible。',
      '为这次讨论先设一个明确 deadline，而不是无限期开会。',
      '当信息达到大约 70% 时先做决定，并同步定义后续观测指标。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [
      {
        sourceId: 'src-lenny-uncertainty',
        excerpt: '**Key insight**: Most decisions are reversible. Don\'t treat all decisions like they\'re irreversible.',
      },
      {
        sourceId: 'src-lenny-uncertainty',
        excerpt: '**Rule**: Set decision deadline before discussion starts.',
      },
      {
        sourceId: 'src-lenny-uncertainty',
        excerpt: '**Rule**: Make decisions with 70% certainty, not 100%.',
      },
    ],
    confidence: 0.86,
  },
  {
    id: 'lenny-career-choose-growth-over-prestige',
    personaId: 'lenny',
    title: '职业选择先看成长密度，不先看名头',
    summary: '选 PM 机会时，优先看公司是否真正教你产品能力、是否持续把 PM 推向更大职业拐点，而不是只看牌子或估值。',
    scenario: '产品经理在权衡去大厂、明星公司或成长型团队时难以决策。',
    goal: '提高职业选择对长期能力和轨迹的复利效果。',
    constraints: ['外部品牌诱惑大', '很难判断公司是否真的会培养 PM'],
    tags: ['career', 'pm', 'growth'],
    triggerKeywords: ['职业选择', 'offer 选择', '去哪个公司', 'PM 成长', '大厂还是创业公司'],
    preferredPath: '优先选择能教你产品能力、并对 PM 职业发展有真实加速记录的环境。',
    antiPatterns: ['只按公司名气选工作', '忽略团队是否会真实培养 PM'],
    reasoningSteps: ['先看是否能学到核心产品能力', '再看是否有 PM 成长样本', '最后再比较名气和短期收益'],
    reasons: [
      '职业最有价值的复利来自能力增长和轨迹拐点，而不是短期头衔。',
      '同样知名的公司，对 PM 的培养强度可能完全不同。',
      '选择能持续拉高你能力密度的环境，后续可选项会更多。',
    ],
    followUpQuestions: [
      '这家公司具体靠什么教 PM，而不只是把你放进去自己摸索？',
      '有没有真实案例证明这里出来的 PM 会获得更快的职业拐点？',
    ],
    nextActions: [
      '在比较 offer 时，把“craft 教学能力”和“职业拐点样本”列成独立评分项。',
      '面试里直接追问职业路径、培养机制和晋升样本，而不是只听品牌故事。',
      '把名气、现金和成长密度拆开打分，避免它们混成一个直觉判断。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-pm-career',
      excerpt: '> When people ask me where they should try to go work, I encourage them to find a company that (1) is best at teaching them the craft of product management and (2) has a track record of creating an inflection in the careers of PMs who\'ve worked there.',
    }],
    confidence: 0.84,
  },
  {
    id: 'lenny-career-test-manager-track-as-reversible',
    personaId: 'lenny',
    title: 'IC 还是管理，不要浪漫化，先把它当可逆试验',
    summary: '到了资深 PM 阶段，如果在 IC 和管理之间犹豫，默认不要把它想成终身绑定选择。先确认公司是否支持切换，再把第一次转管理当成可逆试验。',
    scenario: '资深 PM 在考虑是否转管理岗，担心选错后回不来。',
    goal: '降低职业轨道切换的心理成本和决策拖延。',
    constraints: ['担心身份切换失败', '不同公司职业梯子不一致'],
    tags: ['career', 'management', 'ic'],
    triggerKeywords: ['IC 还是管理', '要不要带团队', '转管理', '职业轨道', 'L6'],
    preferredPath: '先确认公司是否支持 IC/Manager 双轨，再把第一次管理尝试视为可逆实验而不是不可回头的身份切换。',
    antiPatterns: ['把转管理想成一次性终局决定', '在没有双轨支持的环境里盲目切换'],
    reasoningSteps: ['先确认公司双轨是否存在', '再评估自己对带人的兴趣', '把首次切换当作可回退试验'],
    reasons: [
      '很多 PM 会因为把转管理想得过于不可逆，而长期卡在犹豫里。',
      '如果公司本来就支持双轨切换，第一次尝试的真实风险比想象低。',
      '把职业切换当试验，更容易基于体验做判断，而不是基于想象做判断。',
    ],
    followUpQuestions: [
      '你所在公司是否有清晰的 IC/Manager 双轨和切换机制？',
      '你想转管理，是因为喜欢培养人，还是因为把它当成唯一上升通道？',
    ],
    nextActions: [
      '先向经理或 HR 确认公司是否支持 IC/Manager 双轨切换。',
      '如果支持，优先争取一个低风险的带人或项目管理试验窗口。',
      '试验后按真实体验复盘，而不是在抽象层面继续空想。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-lenny-pm-career',
      excerpt: '> "Two-thirds of companies have both an IC track and a manager track. When there\'s a manager track, you can switch at L6 (i.e., Sr. Product Manager)."',
    }],
    confidence: 0.82,
  },
  {
    id: 'lenny-retention-before-acquisition',
    personaId: 'lenny',
    title: '留存还漏得厉害时，先停获客冲动',
    summary: '当团队获客增长不错但留存持续偏弱时，默认不要先加大渠道和预算，而要先把留存漏洞补上。',
    scenario: 'SaaS 或产品团队在增长停滞时讨论先砸获客还是先修留存。',
    goal: '避免用更多流量掩盖产品留存问题。',
    constraints: ['获客压力大', '团队容易把新增当成增长主引擎'],
    tags: ['retention', 'growth', 'acquisition'],
    triggerKeywords: ['留存优先', '留存', '获客', '买量', 'churn', '获客预算', '漏桶'],
    preferredPath: '先把资源向留存倾斜，再决定是否继续扩大获客。',
    antiPatterns: ['留存差时继续线性加大获客', '把增长问题全归因于流量不够'],
    reasoningSteps: ['先看留存是否健康', '再判断新增是否被流失抵消', '最后决定预算顺序'],
    reasons: [
      '当桶底还在漏时，继续加水只会放大浪费。',
      '留存提升带来的增长通常有复利效应，比单纯买量更可持续。',
      '先修留存会让后续每一份获客预算都更值钱。',
    ],
    followUpQuestions: [
      '你们最近几个 cohort 的留存是在改善还是恶化？',
      '如果今天新增翻倍，真实留下来的用户会多多少？',
    ],
    nextActions: [
      '先把近 2-3 个 cohort 的留存曲线拉出来，而不是只看总新增。',
      '把本月新增预算的一部分转去留存和 activation 修复。',
      '在留存没有止跌前，暂停扩大最贵的获客渠道。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-retention-first',
      excerpt: 'Retention is the new Acquisition',
    }],
    confidence: 0.89,
  },
  {
    id: 'lenny-find-magic-moment-before-scaling-onboarding',
    personaId: 'lenny',
    title: '先找 Magic Moment，再优化激活和 onboarding',
    summary: '不要平均优化整个 onboarding；先识别真正把用户带进长期留存的关键行为，再围绕它重排激活路径。',
    scenario: '团队知道激活有问题，但不确定该优化哪个动作或步骤。',
    goal: '把 onboarding 优化锚定到真实留存信号。',
    constraints: ['新手流程很长', '可优化点很多'],
    tags: ['retention', 'activation', 'onboarding'],
    triggerKeywords: ['Magic Moment', '激活', 'onboarding', '关键行为', '留存信号'],
    preferredPath: '先识别高留存用户共同完成的关键行为，再把新手引导压缩到这个动作上。',
    antiPatterns: ['把 onboarding 做得很完整但不对准关键行为', '只按直觉改新手流程'],
    reasoningSteps: ['先找高留存用户共同动作', '定义 magic moment', '重排 onboarding 到该动作'],
    reasons: [
      '真正决定留存的往往不是“完成注册”，而是体验到核心价值的瞬间。',
      '围绕 magic moment 优化，比平均修补整条激活路径更有效。',
      '一旦关键动作定义清楚，团队就知道该砍掉哪些无关步骤。',
    ],
    followUpQuestions: [
      '长期留存用户在前 7 天做了哪些共同动作？',
      '你们当前 onboarding 是否把用户尽快带到这个动作？',
    ],
    nextActions: [
      '筛出留存超过 3-6 个月的用户，反推他们前期关键行为。',
      '把这个行为定义成内部 magic moment，并写成明确阈值。',
      '重做 onboarding，让用户更快到达这个阈值。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-retention-first',
      excerpt: 'Magic Moment定义：创建3个Board',
    }],
    confidence: 0.88,
  },
  {
    id: 'lenny-resurrect-recently-churned-before-cold-acquisition',
    personaId: 'lenny',
    title: '预算吃紧时，优先复活近期流失用户',
    summary: '如果要在复购召回和新获客之间取舍，先看近期流失用户的唤回 ROI，通常比冷启动获客更划算。',
    scenario: '团队需要在有限预算下选择增长动作。',
    goal: '用更高 ROI 的动作恢复有效增长。',
    constraints: ['预算有限', '已有一定规模的流失用户池'],
    tags: ['retention', 'resurrection', 'budget'],
    triggerKeywords: ['召回', '复活用户', '流失用户', '获客太贵', 'ROI'],
    preferredPath: '优先用低成本方式召回近期流失用户，再决定是否扩大新获客。',
    antiPatterns: ['忽略已有流失用户池，只盯新流量', '对所有流失用户一视同仁'],
    reasoningSteps: ['先按流失时间分层', '优先测试近期流失召回', '再对比与新获客的 ROI'],
    reasons: [
      '近期流失用户对产品仍有记忆和上下文，唤回成本通常更低。',
      '把复活策略按时间分层，会比无差别召回有效得多。',
      '先吃掉低垂果实，再去买更贵的新用户更理性。',
    ],
    followUpQuestions: [
      '你们最近 1-3 个月流失的用户里，哪些人曾经是高价值用户？',
      '相比新客 CAC，近期流失召回的真实成本是多少？',
    ],
    nextActions: [
      '把流失用户按 1-3 个月、3-6 个月、6 个月以上分层。',
      '先为近期流失用户做一轮最低成本召回实验。',
      '把召回 ROI 和新获客 CAC 放到同一张表里比较后再分预算。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-retention-first',
      excerpt: '结论：复活近期流失用户ROI最高',
    }],
    confidence: 0.84,
  },
  {
    id: 'lenny-stage-risky-monetization-before-scale',
    personaId: 'lenny',
    title: '高风险商业化改动，先分阶段验证再全面放量',
    summary: '当商业模式调整会伤到既有用户习惯时，不要一次性全量切换，先设计分阶段 rollout、迁移工具和低价替代方案。',
    scenario: '团队准备做高争议的定价、账号、权限或商业化策略变更。',
    goal: '在控制用户反弹的同时验证长期收入逻辑。',
    constraints: ['改动争议大', '短期舆论压力高', '执行风险高'],
    tags: ['pricing', 'rollout', 'monetization'],
    triggerKeywords: ['高风险改动', '商业化调整', '密码共享', '分阶段推广', '定价改革'],
    preferredPath: '先小范围试点和补齐迁移工具，再逐步推广，而不是一次全量切换。',
    antiPatterns: ['高争议改动直接全量推开', '没有迁移方案就要求用户立即切换'],
    reasoningSteps: ['先判断长期价值是否足够大', '再设计阶段 rollout', '补上迁移和低价缓冲方案'],
    reasons: [
      '长期价值清晰，不代表可以忽略执行阶段的风险。',
      '分阶段 rollout 能让团队更早发现技术、客服和舆论问题。',
      '迁移工具和低价替代方案能显著降低用户反弹强度。',
    ],
    followUpQuestions: [
      '这次调整的长期价值是否足够大，值得承担短期负反馈？',
      '如果先小范围试点，你们最该观察哪几个风险指标？',
    ],
    nextActions: [
      '先定义试点市场或试点用户群，而不是默认全量上线。',
      '上线前补齐迁移工具、FAQ 和低价替代方案。',
      '把扩量节奏绑定到试点数据和负反馈阈值，而不是绑定到既定日期。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [
      {
        sourceId: 'src-lenny-netflix-password-sharing',
        excerpt: '3. 分阶段推广：',
      },
      {
        sourceId: 'src-lenny-netflix-password-sharing',
        excerpt: '"Profile Transfer"功能：让共享用户轻松迁移自己的观看记录',
      },
    ],
    confidence: 0.85,
  },
  {
    id: 'lenny-design-critique-starts-with-3w',
    personaId: 'lenny',
    title: '设计评审前，先把 3W 说清楚',
    summary: '评审效率低往往不是大家不会提意见，而是设计师没有先说清目标、阶段和需要什么反馈。',
    scenario: '团队要开设计评审，但讨论经常发散或变成主观审美争论。',
    goal: '把反馈拉回到具体问题和当前阶段。',
    constraints: ['参会者多', '反馈容易发散', '设计成熟度不同'],
    tags: ['design', 'critique', 'collaboration'],
    triggerKeywords: ['设计评审', 'critique', '设计反馈', '评审会', '3W'],
    preferredPath: '评审前先说明 What、Where、Want，再让参与者围绕当前问题给反馈。',
    antiPatterns: ['直接让大家“随便看看”', '早期稿就被拿去做像素级争论'],
    reasoningSteps: ['先定义问题', '说明所处阶段', '明确想要的反馈类型'],
    reasons: [
      '没有上下文的评审，几乎一定会滑向主观偏好对撞。',
      '把反馈范围收紧，能让团队更快给出有用意见。',
      '评审先说清阶段，才能避免在错误粒度上浪费时间。',
    ],
    followUpQuestions: [
      '这次评审到底是要解决哪个问题，而不是单纯展示方案？',
      '当前属于概念、原型还是定稿阶段？',
    ],
    nextActions: [
      '每次评审前固定写一段 3W 简报：What / Where / Want。',
      '把不相关的反馈推迟到下一轮，而不是这次一起讨论。',
      '会前把 3W 贴到议程顶部，防止讨论发散。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-design-critique',
      excerpt: '1. **目标是什么？**（解决什么问题？）',
    }],
    confidence: 0.83,
  },
  {
    id: 'lenny-feedback-must-reach-level-three',
    personaId: 'lenny',
    title: '反馈至少给到 Level 3，不要只说喜欢或不喜欢',
    summary: '如果反馈停留在“我不喜欢”，团队只会争审美。更有效的标准是指出问题、解释原因，最好再给建议。',
    scenario: '团队在设计评审或方案评审里，经常给出低质量主观反馈。',
    goal: '提升反馈的可讨论性和可执行性。',
    constraints: ['参与者表达随意', '容易把会议变成喜好投票'],
    tags: ['feedback', 'design', 'review'],
    triggerKeywords: ['我不喜欢', '反馈不 actionable', 'Level 3', '设计讨论'],
    preferredPath: '要求反馈至少包含“哪里有问题 + 为什么”，更理想的是再补建议方案。',
    antiPatterns: ['只给审美判断', '只指出问题不解释原因'],
    reasoningSteps: ['先指出具体问题', '解释问题为什么成立', '尽量补建议方案'],
    reasons: [
      'Level 1 反馈只会制造对立，几乎不能转成行动。',
      '把原因说清楚，团队才能判断问题是否真实存在。',
      '建议方案不一定要被采纳，但能显著提高讨论质量。',
    ],
    followUpQuestions: [
      '你指出的是具体问题，还是只在表达个人偏好？',
      '如果这是个问题，为什么它会伤到用户或目标？',
    ],
    nextActions: [
      '在评审会里明确禁止只有“喜欢/不喜欢”的反馈。',
      '把反馈模板改成“问题 + 原因 + 建议”。',
      '复盘一次最近的低效评审，标出多少反馈低于 Level 3。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-design-critique',
      excerpt: '### 2. 梯子法则（Level 3+）',
    }],
    confidence: 0.82,
  },
  {
    id: 'lenny-localize-pricing-by-willingness-to-pay',
    personaId: 'lenny',
    title: '国际定价先看购买力，不要全球一口价',
    summary: '当产品已经跨区域售卖时，统一价格往往同时损失转化和收入。更稳的路径是按购买力和愿付价格做本地化。',
    scenario: 'SaaS 产品开始面向多个地区售卖，团队在争论要不要所有国家同价。',
    goal: '在不破坏品牌和运营复杂度的前提下提升总体收入和转化。',
    constraints: ['国际用户购买力差异大', '团队担心价格体系复杂化'],
    tags: ['pricing', 'global', 'saas'],
    triggerKeywords: ['国际定价', '全球统一价格', '本地化定价', '购买力', '不同国家价格'],
    preferredPath: '先识别主要地区的购买力差异，再按区域做价格本地化，而不是坚持全球同价。',
    antiPatterns: ['把美国价格直接复制到所有市场', '只因担心复杂度就放弃更合理的价格结构'],
    reasoningSteps: ['先判断不同区域购买力差异', '再决定是否分层定价', '最后控制执行复杂度和沟通成本'],
    reasons: [
      '不同地区的购买力和愿付价格差异，会让统一价格天然失真。',
      '本地化定价常常不是“降价”，而是把原本根本不会付费的人群转成有效收入。',
      '价格策略本身就是增长杠杆，不应只按运营便利性设计。',
    ],
    followUpQuestions: [
      '你们主要收入区域之间，购买力和竞品价格差异有多大？',
      '如果坚持统一价格，哪些市场其实已经被你们主动放弃了？',
    ],
    nextActions: [
      '先按国家或区域拉一版购买力、转化率和竞品价格对比表。',
      '挑一个低购买力市场试本地化价格，而不是一次性全球改价。',
      '把试点结果绑定到收入、转化和投诉率，而不是只看客单价。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-pricing-strategy',
      excerpt: 'THEN 实施价格本地化：\n  - 发达国家：100%\n  - 中等收入国家：70-80%\n  - 低收入国家：30-50%\n\n结果：收入提升20-30%',
    }],
    confidence: 0.82,
  },
  {
    id: 'lenny-balance-get-engagement-monetization',
    personaId: 'lenny',
    title: '产品策略不要只追一个指标，要平衡 GEM',
    summary: '只追获客、只追留存或只追变现，都会把产品拉歪。更稳的策略是同时审视 Get、Engagement、Monetization 三个面。',
    scenario: '团队在做产品年度策略或增长策略，但内部只盯单一指标。',
    goal: '避免为了局部优化牺牲整体产品健康度。',
    constraints: ['团队 KPI 分裂', '短期压力容易放大单一指标'],
    tags: ['strategy', 'growth', 'monetization'],
    triggerKeywords: ['GEM', '只看增长', '只看留存', '只看变现', '产品战略'],
    preferredPath: '每轮策略讨论同时回答获客、参与和变现三件事，而不是先天只偏向一个维度。',
    antiPatterns: ['获客强但留存差还继续加买量', '留存强但变现路径一直空白'],
    reasoningSteps: ['先看三个维度是否失衡', '识别当前最弱板块', '再做协同修正'],
    reasons: [
      '单一指标最容易给出“看起来正确”的局部最优。',
      '产品真正的复利来自获客、参与和变现的相互拉动，而不是单点爆发。',
      'GEM 适合把战略讨论从口号拉回到完整经营模型。',
    ],
    followUpQuestions: [
      '你们这轮策略是在补最弱一环，还是在继续放大已经最强的一环？',
      '如果把当前策略放到 GEM 三栏里，哪一栏几乎没有动作？',
    ],
    nextActions: [
      '把季度策略拆成 Get / Engagement / Monetization 三栏重新过一遍。',
      '要求每个大项目说明它主要作用在哪一栏，以及会不会伤另一栏。',
      '先修最失衡的一栏，而不是继续给最显眼的一栏堆资源。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-gem-dhm',
      excerpt: '关键：3个要素要平衡，不能只优化一个',
    }],
    confidence: 0.79,
  },
  {
    id: 'lenny-score-features-with-dhm-not-opinions',
    personaId: 'lenny',
    title: '功能优先级先过 DHM，再谈热闹程度',
    summary: '一个功能不该因为“大家都想做”就被排高优先级。先问它是否能让用户更愉悦、是否难以复制、是否增强利润。',
    scenario: '团队在拉功能优先级清单，但容易被热点需求或大客户声音带偏。',
    goal: '把功能决策从主观偏好拉回结构化判断。',
    constraints: ['需求很多', '组织里意见杂', '资源有限'],
    tags: ['prioritization', 'feature', 'strategy'],
    triggerKeywords: ['DHM', '功能优先级', '护城河', '利润', '用户喜欢吗'],
    preferredPath: '用 Delight / Hard-to-Copy / Margin-Enhancing 三个问题给功能做结构化评估。',
    antiPatterns: ['只因为竞品有就做', '只因为某个利益相关方声音大就排高'],
    reasoningSteps: ['先看是否真的 delight', '再看是否形成护城河', '最后看是否增强经营质量'],
    reasons: [
      '没有结构化框架时，功能优先级很容易退化成意见投票。',
      'DHM 逼团队同时看用户价值、竞争壁垒和商业结果。',
      '并不是每个需求都值得做，有些需求只会增加复杂度。',
    ],
    followUpQuestions: [
      '这个功能如果做出来，用户是真会更喜欢，还是只是团队感觉更完整？',
      '它会形成新的壁垒，还是一上线就能被快速抄走？',
    ],
    nextActions: [
      '给当前 Top 10 需求都补一张 DHM 打分卡。',
      '优先讨论得分最低但资源消耗最高的需求，主动砍掉一批。',
      '评审会上禁止只说“我觉得很重要”，必须映射到 DHM 维度。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-gem-dhm',
      excerpt: 'IF 评估新功能\nTHEN 问3个问题：\n1. Delight（愉悦）- 用户喜欢吗？\n2. Hard-to-Copy（护城河）- 竞品容易抄吗？\n3. Margin-Enhancing（利润）- 提升利润吗？',
    }],
    confidence: 0.8,
  },
  {
    id: 'lenny-ttv-before-plg-distribution',
    personaId: 'lenny',
    title: 'PLG 先缩短 TTV，再加分发',
    summary: '如果用户注册后还要很久才能感到价值，PLG 不会成立。先把首次价值到达时间压到几分钟级，再谈放大流量。',
    scenario: '团队想把产品改成 PLG，但上来就先讨论投放、SEO 或推荐裂变。',
    goal: '让产品先具备自解释和自售卖能力。',
    constraints: ['onboarding 重', '首次价值出现慢', '团队急着放大增长'],
    tags: ['plg', 'activation', 'growth'],
    triggerKeywords: ['PLG', 'TTV', '自助增长', '注册后流失', 'Time to Value'],
    preferredPath: '先把 Time to Value 压到 5 分钟内，再决定是否扩大 PLG 渠道投入。',
    antiPatterns: ['产品本身还难以上手就先砸分发', '把 onboarding 复杂度转嫁给销售或客服兜底'],
    reasoningSteps: ['先找首次价值时刻', '再压缩到达路径', '最后再讨论分发和裂变'],
    reasons: [
      'PLG 的本质是产品自己完成销售，而不是少配几个销售。',
      'TTV 太长时，任何分发都只是在放大首轮流失。',
      '先把价值抵达时间压缩，后续分发和病毒循环才有意义。',
    ],
    followUpQuestions: [
      '用户从注册到第一次感到“这个有价值”现在要多久？',
      '如果只允许保留 3 步，你们会砍掉哪些 onboarding 环节？',
    ],
    nextActions: [
      '先定义你们的第一性 Aha Moment 和当前 TTV。',
      '把首屏流程砍到只服务 Aha Moment，不服务完整教育。',
      '等 TTV 接近 5 分钟内，再决定是否扩大免费试用和分发渠道。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-plg-strategy',
      excerpt: 'THEN TTV<5分钟是及格线：\n  - 简化注册（Email即可，无需表单）\n  - 跳过Onboarding（直接进产品）\n  - 快速达到Aha Moment',
    }],
    confidence: 0.84,
  },
  {
    id: 'lenny-weekly-customer-conversations-beat-quarterly-research',
    personaId: 'lenny',
    title: '持续发现靠固定节律，不靠季度大调研',
    summary: '用户理解最容易过时。比起偶尔做一次深度研究，更稳的机制是把每周用户对话做成团队节律。',
    scenario: '团队觉得自己不够了解用户，但用户研究只在重要项目或季度节点才会发生。',
    goal: '让用户洞察持续进入决策，而不是阶段性补课。',
    constraints: ['研究资源有限', '团队容易把用户访谈当一次性任务'],
    tags: ['discovery', 'research', 'cadence'],
    triggerKeywords: ['用户访谈', '持续发现', '每周 3 次', '季度调研', 'research cadence'],
    preferredPath: '把每周固定用户对话做成产品团队的 operating rhythm，而不是项目附属动作。',
    antiPatterns: ['只在项目卡住时临时找用户', '把研究外包给单个角色不让团队参与'],
    reasoningSteps: ['先建立固定节律', '让团队共同参与', '再让洞察反哺决策'],
    reasons: [
      '用户需求变化比团队想象得更快，低频研究很容易失真。',
      '持续节律会让团队更快识别重复问题，而不是每次都从零理解用户。',
      '用户对话被产品团队共同看见，决策落地会比单份报告更强。',
    ],
    followUpQuestions: [
      '你们最近一次直接听到用户原话是什么时候？',
      '如果每周只做三次用户对话，谁会参与、怎么固定下来？',
    ],
    nextActions: [
      '给产品团队固定出每周 3 个用户对话时段，先做 4 周试运行。',
      '要求 PM、设计、工程至少两种角色一起参与，不只让研究员记录。',
      '每周沉淀一个重复出现的 Opportunity，而不是只存访谈纪要。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-continuous-discovery',
      excerpt: 'THEN 每周至少3次用户对话：\n  - 周一：1次\n  - 周三：1次\n  - 周五：1次',
    }],
    confidence: 0.81,
  },
  {
    id: 'lenny-opportunity-before-solution-tree',
    personaId: 'lenny',
    title: '先定义 Opportunity，再长 Solution Tree',
    summary: '很多错误不是方案太差，而是团队从一开始就在验证自己喜欢的方案。更稳的路径是先把机会树建在用户痛点上。',
    scenario: '团队已经有一堆想做的方案，但总感觉决策容易偏主观。',
    goal: '让探索从真实问题出发，而不是从先入为主的方案出发。',
    constraints: ['方案驱动惯性强', '团队容易把访谈变成验证会'],
    tags: ['discovery', 'opportunity-solution-tree', 'prioritization'],
    triggerKeywords: ['Opportunity Solution Tree', '方案驱动', '机会驱动', '先有方案', '用户痛点'],
    preferredPath: '先定义 outcome 和 opportunity，再在树上展开 solution 与 experiment。',
    antiPatterns: ['先想方案，再找用户背书', '把用户访谈当做既有方案的 validate 工具'],
    reasoningSteps: ['先写目标', '再识别机会点', '最后才生成方案和实验'],
    reasons: [
      '方案驱动最常见的风险，是把用户研究退化成“证明我是对的”。',
      '机会树能把业务目标、用户痛点和实验路径放到同一张图里。',
      '先抓 opportunity，团队更容易发现原本没想到的更优解。',
    ],
    followUpQuestions: [
      '你们现在要解决的是哪个 opportunity，而不是哪个预设方案？',
      '如果当前方案被证明不对，是否还有别的 solution 可以挂在同一个 opportunity 上？',
    ],
    nextActions: [
      '先把当前项目写成 Outcome -> Opportunity -> Solution -> Experiment 四层树。',
      '删掉那些没有明确 opportunity 支撑的方案。',
      '访谈时先验证痛点是否真实存在，而不是只验证方案喜好。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-continuous-discovery',
      excerpt: '正确流程（机会驱动）:\n1. 发现用户痛点（Opportunity）\n2. 针对痛点设计方案（Solution）✅',
    }],
    confidence: 0.8,
  },
  {
    id: 'lenny-guide-users-to-aha-moment-fast',
    personaId: 'lenny',
    title: '激活优化先围绕 Aha Moment 设计护栏',
    summary: '如果 onboarding 只是解释产品，而不是把用户尽快带到 Aha Moment，流失会持续很高。护栏的目标是减少掉沟，不是增加教育内容。',
    scenario: '新用户注册后流失严重，团队想优化 onboarding。',
    goal: '缩短从注册到首次体验核心价值的路径。',
    constraints: ['产品初次使用门槛高', '团队倾向于通过更多教程解释产品'],
    tags: ['activation', 'onboarding', 'aha-moment'],
    triggerKeywords: ['Aha Moment', '激活', 'onboarding', '保龄球', '新用户流失'],
    preferredPath: '先识别 Aha Moment，再设计最少步骤和护栏把用户带过去。',
    antiPatterns: ['靠长教程解释价值', '把 onboarding 做成信息灌输而不是行动引导'],
    reasoningSteps: ['先定义 Aha Moment', '再压缩路径', '最后用护栏降低掉沟风险'],
    reasons: [
      'Aha Moment 才是激活的真实目标，不是把所有功能都讲完。',
      '引导用户做出关键动作，比给更多说明更能提升激活。',
      '路径一旦足够短，后续的产品教育反而更容易发生。',
    ],
    followUpQuestions: [
      '你们的 Aha Moment 到底是什么具体动作或结果？',
      '当前 onboarding 有多少步骤并不会让用户更接近这个时刻？',
    ],
    nextActions: [
      '明确写出你们的 Aha Moment，并绑定一个可量化动作。',
      '把 onboarding 的每一步都问一句：它是否直接推动用户到达 Aha Moment？',
      '优先测试更短的引导链路，而不是更完整的说明内容。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-lenny-activation-optimization',
      excerpt: 'THEN 先识别Aha Moment：\n  - 用户体验到核心价值的瞬间\n  - 示例：Slack发第一条消息\n  - 示例：Dropbox同步第一个文件',
    }],
    confidence: 0.82,
  },
  {
    id: 'lenny-quantify-feedback-by-segment-and-close-loop',
    personaId: 'lenny',
    title: '反馈系统要量化、分层、闭环',
    summary: '功能请求不是谁声音大听谁。要先看有多少用户提、哪类用户提、是否值得做；然后无论做不做，都要回到用户那边完成闭环。',
    scenario: '团队收到大量分散的用户反馈，不知道该怎么优先级排序。',
    goal: '把反馈从噪音变成可决策的输入。',
    constraints: ['反馈来源分散', '团队容易被大客户或社交媒体声音带偏'],
    tags: ['feedback', 'prioritization', 'customer-voice'],
    triggerKeywords: ['用户反馈', '功能请求', '闭环', '多少用户提', '按用户类型分类'],
    preferredPath: '先按数量、用户角色和优先级分层，再把结果回传给用户，形成闭环。',
    antiPatterns: ['凭印象判断“很多用户都在要”', '记录了反馈但从不告诉用户结果'],
    reasoningSteps: ['先统一收集', '再量化分类', '最后做决策并回传'],
    reasons: [
      '不量化的反馈系统，最终只会奖励声音最大的人。',
      '不同用户角色的反馈价值不同，不能混成一团看。',
      '闭环沟通会提高用户继续反馈的意愿，也让团队更有责任感。',
    ],
    followUpQuestions: [
      '这个请求到底有多少用户提过，分别来自哪些用户层？',
      '如果这次决定不做，你们准备怎么回复提出反馈的用户？',
    ],
    nextActions: [
      '先把分散在工单、邮件、访谈和产品内反馈的声音统一进一个系统。',
      '给每条高频反馈补上数量、用户角色和优先级，而不是只写一句需求标题。',
      '无论做不做，都安排一次对外反馈闭环，不让用户石沉大海。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [
      {
        sourceId: 'src-lenny-feedback-system',
        excerpt: 'THEN 追踪统计：\n  - 多少用户提到？\n  - 什么类型用户？（免费/付费/企业）\n  - 紧急程度？',
      },
      {
        sourceId: 'src-lenny-feedback-system',
        excerpt: 'IF 用户提反馈\nTHEN 必须回复：\n  - 即使不做，也要说明原因\n  - 做了，要通知用户',
      },
    ],
    confidence: 0.84,
  },
  {
    id: 'zhang-new-relation-chain-before-old-assets',
    personaId: 'zhang',
    title: '移动转折点上，优先押新关系链，不要被旧资产绑住',
    summary: '当产品场景从 PC 切到移动或从旧媒介切到新媒介时，先判断新的关系链和分发基础是什么，再决定是否做独立产品。',
    scenario: '团队在新平台机会面前，犹豫要不要继续沿用旧用户关系和旧品牌资产。',
    goal: '避免因为复用旧资产而错过新平台的真实入口。',
    constraints: ['内部已有成熟产品', '新旧团队存在资源竞争'],
    tags: ['mobile', 'strategy', 'social'],
    triggerKeywords: ['关系链', '通讯录', '独立产品', '移动转型', '新平台'],
    preferredPath: '先识别新场景的天然关系链；如果它已经变了，就用独立产品承接，而不是硬套旧关系链。',
    antiPatterns: ['拿旧关系链硬套新场景', '为了复用品牌而牺牲产品自然性'],
    reasoningSteps: ['先判断场景底层是否变了', '再看新关系链是什么', '最后决定独立产品还是旧产品延伸'],
    reasons: [
      '平台迁移时，真正稀缺的不是品牌，而是新的默认关系链。',
      '如果新场景的用户连接方式已经变化，沿用旧产品通常只会把旧包袱也带进来。',
      '独立产品能给团队重新定义规则的空间。',
    ],
    followUpQuestions: [
      '这个新场景里，用户天然带来的关系链到底是什么？',
      '如果沿用旧产品，你们是在复用资产，还是也把旧时代的约束一起继承了？',
    ],
    nextActions: [
      '先把新场景的默认关系链、分发入口和使用频次写清楚。',
      '对比“独立产品”与“旧产品延伸”各自会继承哪些约束。',
      '如果新关系链已明显变化，优先按独立产品立项。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-wechat-launch',
      excerpt: '2. ✅ **基于手机通讯录**：而非QQ好友关系链',
    }],
    confidence: 0.88,
  },
  {
    id: 'zhang-small-team-fast-mvp-under-window',
    personaId: 'zhang',
    title: '时间窗口很短时，小团队先做最小可用产品',
    summary: '面对战略窗口或强竞争威胁时，先用小团队快速上线 MVP，占住入口，再持续迭代。',
    scenario: '团队发现明确窗口期，但大组织流程和完美主义会拖慢上线。',
    goal: '在窗口关闭前完成第一版验证。',
    constraints: ['时间极紧', '组织层级多', '需求容易膨胀'],
    tags: ['mvp', 'speed', 'execution'],
    triggerKeywords: ['MVP', '快速上线', '窗口期', '小团队', '竞争威胁'],
    preferredPath: '收缩团队、收缩范围、先上最小可用版本，而不是先追求完整性。',
    antiPatterns: ['窗口期里仍按大项目方式推进', '先列全量需求再排期'],
    reasoningSteps: ['先判断窗口期是否真实存在', '再砍掉非必要范围', '用小团队先做 MVP'],
    reasons: [
      '窗口期竞争不是比谁计划更完整，而是比谁先占到真实用户入口。',
      '小团队的沟通成本低，更适合在高不确定场景里快速试错。',
      'MVP 不是低质量，而是把第一版只对准核心价值。',
    ],
    followUpQuestions: [
      '这件事最迟什么时候上线还算有意义？',
      '如果只能保留一个核心价值，你们第一版到底要验证什么？',
    ],
    nextActions: [
      '把第一版需求压缩到只剩核心通讯或核心价值闭环。',
      '用一个小而全的直接负责团队推进，不走大协作编排。',
      '先定义上线节点，再倒推必须砍掉的范围。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-wechat-launch',
      excerpt: '4. ✅ **快速迭代**：2个月上线，先做最小可用产品（MVP）',
    }],
    confidence: 0.87,
  },
  {
    id: 'zhang-simple-rule-beats-feature-stack',
    personaId: 'zhang',
    title: '优先设计一个简单规则，而不是堆一串功能',
    summary: '如果一个功能需要很多说明、按钮和流程，通常说明规则还不够好。先找更简单的交互规则。',
    scenario: '团队在设计新功能时，不断加按钮、设置项和说明文案。',
    goal: '用更少的规则引发更强的用户反应。',
    constraints: ['功能堆积', '用户学习成本高'],
    tags: ['simplicity', 'ux', 'product'],
    triggerKeywords: ['简单', '复杂', '功能太多', '说明书', '交互规则'],
    preferredPath: '先删掉冗余控制项，逼自己用一句话说清核心规则，再决定要不要开发。',
    antiPatterns: ['功能没想清就先加入口', '靠文案解释弥补规则复杂'],
    reasoningSteps: ['先看规则能否一句话说清', '再砍掉需要学习的部分', '保留最能引发反应的最小动作'],
    reasons: [
      '复杂往往只是设计者没有把问题想透，而不是用户真的需要更多控制。',
      '简单规则更容易传播、学习，也更容易形成群体效应。',
      '最简形态一旦成立，后续很难被更复杂的方案打败。',
    ],
    followUpQuestions: [
      '这个功能是否需要额外解释，用户才能知道怎么用？',
      '如果只保留一个动作或一个入口，核心体验还能成立吗？',
    ],
    nextActions: [
      '把当前方案压缩到一句规则描述，删掉不能支撑这句规则的元素。',
      '找 3 个没上下文的人做冷启动测试，看是否无需说明就会用。',
      '如果仍需要长说明，继续回退并重构规则。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-core-principles',
      excerpt: '- **简单是最美的**: 宇宙规律都很简单, 为什么要复杂化? 规则越简单越能让群体自发互动',
    }],
    confidence: 0.84,
  },
  {
    id: 'zhang-psychological-delight-before-utility-copy',
    personaId: 'zhang',
    title: '很多增长卡点不是工具价值不够，而是爽点不够',
    summary: '如果用户不愿意安装、激活或分享，不要只强化“省钱/高效”的工具理由，要找到更强的心理驱动力。',
    scenario: '团队在做拉新或激活时，功能价值讲得很完整，但用户反应平淡。',
    goal: '把触发安装、激活或传播的核心动机找对。',
    constraints: ['工具价值已经能讲通', '用户行动意愿仍弱'],
    tags: ['growth', 'motivation', 'consumer'],
    triggerKeywords: ['拉新', '激活', '推广', '用户没感觉', '爽点', '心理满足'],
    preferredPath: '先把用户真正想要的心理满足写清楚，再包装激活动作或传播动作。',
    antiPatterns: ['只拿省钱和效率当卖点', '把动机理解成表层功能需求'],
    reasoningSteps: ['先找用户想获得的感觉', '再设计触发动作', '最后才包装功能价值'],
    reasons: [
      '用户行动很多时候不是被功能说服，而是被情绪和身份感驱动。',
      '心理满足找对了，工具动作才会变得自发。',
      '只讲效率常常解释得通，却驱动不了行为。',
    ],
    followUpQuestions: [
      '用户完成这个动作时，真正想获得的感觉是什么？',
      '你们现在的表达是在描述功能，还是在触发欲望？',
    ],
    nextActions: [
      '把当前价值主张拆成“工具收益”和“心理收益”两列比较。',
      '重新设计激活文案和入口，优先呈现心理收益。',
      '用小样本访谈验证哪种表达最能让用户立刻想试。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-discovering-needs',
      excerpt: '> "用户在你这里省一点钱, 会去买别的东西。他要的是很爽的感觉。"',
    }],
    confidence: 0.84,
  },
  {
    id: 'zhang-wrap-hard-task-in-social-game',
    personaId: 'zhang',
    title: '高门槛激活动作，要用用户真想玩的壳来包住',
    summary: '用户不愿意直接完成高门槛动作时，不要硬推流程，而要用社交或游戏化机制把它包装成顺手完成的动作。',
    scenario: '产品需要用户完成绑卡、授权、邀请等高阻力激活动作。',
    goal: '降低激活阻力并保持自发性。',
    constraints: ['动作门槛高', '直接推动作效果差'],
    tags: ['activation', 'growth', 'payment'],
    triggerKeywords: ['绑卡', '激活', '高门槛动作', '红包', '游戏化'],
    preferredPath: '先找用户本来就愿意参与的社交游戏，再把高门槛动作嵌进去。',
    antiPatterns: ['直接弹窗硬推绑定', '靠补贴硬砸没有社交机制的激活'],
    reasoningSteps: ['先识别阻力动作', '再找用户自愿参与的壳', '把激活动作设计成壳里的必经路径'],
    reasons: [
      '用户对“我要完成任务”天然抗拒，但对“我要参与有趣/有利的社交动作”更愿意投入。',
      '把高阻力动作藏进自然场景，比单独优化流程更有效。',
      '一旦激活动作和社交传播绑定，增长和激活可以同步发生。',
    ],
    followUpQuestions: [
      '用户现在最抗拒的那个动作，能否变成参与某个社交玩法的必经步骤？',
      '你们包装的外壳，是用户真想参与，还是团队觉得有趣？',
    ],
    nextActions: [
      '先画出当前激活漏斗里阻力最大的一步。',
      '找一个用户自然愿意参与的社交场景，把这一步嵌进去。',
      '优先验证“包装后是否真的提升完成率”，再扩大发布。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-red-packet',
      excerpt: '- 用红包包装绑卡 ✅ → 用户为了抢红包主动绑卡',
    }],
    confidence: 0.9,
  },
  {
    id: 'zhang-social-random-loop-for-viral-growth',
    personaId: 'zhang',
    title: '要做裂变，不只要社交链，还要让结果有随机惊喜',
    summary: '单纯邀请机制容易疲劳；把社交传播和随机性绑定，能显著提升参与率和反复传播。',
    scenario: '团队想设计自传播机制，但普通邀请裂变效果递减。',
    goal: '提升传播意愿和复玩率。',
    constraints: ['用户注意力短', '普通邀请机制容易审美疲劳'],
    tags: ['viral', 'growth', 'social'],
    triggerKeywords: ['裂变', '病毒传播', '随机', '社交传播', '红包'],
    preferredPath: '先保证链路天然社交，再加入随机回报和可展示结果，而不是只加邀请奖励。',
    antiPatterns: ['只有单次邀请奖励', '传播动作没有惊喜和讨论空间'],
    reasoningSteps: ['先保证传播动作足够轻', '再加入随机回报', '最后让结果可被看见和讨论'],
    reasons: [
      '社交链决定传播宽度，随机性决定重复参与的动力。',
      '当结果有悬念和比较空间时，传播会从任务变成游戏。',
      '病毒传播需要的是循环，不是一次性导流。',
    ],
    followUpQuestions: [
      '用户分享后，接收方是否会立刻产生参与冲动，而不只是知道有活动？',
      '传播后有没有足够强的随机回报，让用户想再来一次？',
    ],
    nextActions: [
      '把当前裂变机制改写成“发起-参与-再发起”的闭环。',
      '在结果里加入随机奖励或排名反馈，测试是否提升复玩率。',
      '用一轮活动数据验证链路里哪一步最影响循环速度。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-red-packet',
      excerpt: '### 启发式2: 社交裂变 + 随机性 = 病毒传播',
    }],
    confidence: 0.88,
  },
  {
    id: 'zhang-commercialize-with-restraint-and-native-form',
    personaId: 'zhang',
    title: '商业化先求不破坏体验，再求放量',
    summary: '在高频产品里做广告或变现时，先保证内容原生、频次克制、用户可控，再逐步验证商业效率。',
    scenario: '团队要给高频内容或社交产品引入广告和商业化模块。',
    goal: '在不伤核心体验的前提下启动变现。',
    constraints: ['用户对打扰敏感', '商业化压力大'],
    tags: ['ads', 'commercialization', 'consumer'],
    triggerKeywords: ['广告', '商业化', '变现', '信息流广告', '频次'],
    preferredPath: '先限制频次和形式侵入性，用原生信息形态和用户控制权换取长期信任。',
    antiPatterns: ['一上来追求高填充率', '用突兀广告位破坏原有消费节奏'],
    reasoningSteps: ['先定义不能破坏的体验边界', '再设计原生形态', '最后逐步放量验证'],
    reasons: [
      '商业化一旦伤到核心体验，后续再修复信任成本很高。',
      '克制投放会降低短期收入，但能换来更高接受度和更长生命周期。',
      '原生形态让广告更像有用信息，而不是强行插入的打扰。',
    ],
    followUpQuestions: [
      '这条商业化动作最可能破坏用户的哪一段原始体验？',
      '用户是否有明确的控制权去降低被打扰感？',
    ],
    nextActions: [
      '先写出商业化上线的频次上限和不可突破的体验边界。',
      '优先测试原生信息形态，而不是新增高侵入广告位。',
      '小规模上线后跟踪负反馈和留存，再决定是否放量。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-moments-ads',
      excerpt: '> "如果广告本身有价值，用户就不会讨厌它。广告的本质是信息，不是打扰。"',
    }],
    confidence: 0.87,
  },
  {
    id: 'zhang-independent-entry-for-controversial-change',
    personaId: 'zhang',
    title: '争议性改版先做独立入口，不要直接强改主路径',
    summary: '当新功能可能改变用户习惯或价值观时，优先用独立入口渐进验证，而不是直接替换老入口。',
    scenario: '团队准备推动争议较大的内容分发或产品形态改版。',
    goal: '在验证新机制价值的同时，控制用户反感和迁移风险。',
    constraints: ['老习惯强', '改版争议大'],
    tags: ['migration', 'content', 'rollout'],
    triggerKeywords: ['独立入口', '改版', '信息流', '强制替换', '看一看'],
    preferredPath: '保留原路径，新增独立入口承接新机制，用数据和用户选择决定后续扩张。',
    antiPatterns: ['一刀切强制替换老入口', '在未验证前就要求全部用户迁移'],
    reasoningSteps: ['先判断改版争议度', '再设计可选的新入口', '用数据决定是否扩大覆盖'],
    reasons: [
      '争议性改版最大的问题不是功能对不对，而是用户是否愿意被强制迁移。',
      '独立入口能把实验成本和主路径风险隔离开。',
      '用户主动进入的新入口，能提供更干净的验证信号。',
    ],
    followUpQuestions: [
      '这个新机制是否会直接挑战用户已经形成的路径依赖？',
      '如果先做独立入口，最关键的验证指标是什么？',
    ],
    nextActions: [
      '先保留旧路径，定义一个可独立进入的新入口和新机制。',
      '明确首轮实验的成功信号，再决定是否扩大引导。',
      '不要在实验期把全部教育成本都压给现有用户。',
    ],
    evidenceLevel: 'B',
    evidenceRefs: [{
      sourceId: 'src-zhang-subscription-feed',
      excerpt: '### 启发式3: 独立入口 vs 强制改版',
    }],
    confidence: 0.83,
  },
  {
    id: 'zhang-operate-with-restraint-not-kpi-anxiety',
    personaId: 'zhang',
    title: '运营要先保护用户，再保护 KPI',
    summary: '当增长、活跃或导流压力很大时，默认不要用制造焦虑的方式拉指标，而要先守住用户不被打扰的边界。',
    scenario: '团队在讨论是否加 push、热点位、活动入口或导流红点。',
    goal: '在长期留存和短期活跃之间做更稳的选择。',
    constraints: ['内部 KPI 压力强', '业务部门希望导流'],
    tags: ['operations', 'restraint', 'retention'],
    triggerKeywords: ['红点', 'push', '导流', '热点推送', '拉活跃', '运营克制'],
    preferredPath: '先问动作是否在制造虚假紧迫感；如果是，宁可不做。',
    antiPatterns: ['为了短期活跃加运营红点', '把用户注意力当作内部流量池'],
    reasoningSteps: ['先判断是否是真实需求', '再检查是否在制造焦虑', '最后决定是否上线运营动作'],
    reasons: [
      '短期活跃可以被操纵，但长期信任一旦受损很难修复。',
      '用户打开高频产品时，默认希望被服务，而不是被内部 KPI 利用。',
      '克制运营会牺牲部分短期指标，但通常换来更稳的留存和信任。',
    ],
    followUpQuestions: [
      '这个运营动作是在响应真实用户需求，还是只是在满足内部 KPI？',
      '如果去掉这次提醒，用户真的会错过重要价值吗？',
    ],
    nextActions: [
      '把当前计划中的 push、红点、推荐位按“真实需求 / 诱导需求”二分。',
      '先砍掉纯诱导型运营动作，再保留真实消息类提醒。',
      '对剩余动作加频次上限和负反馈监控，不把活跃增长当唯一指标。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-operation-restraint',
      excerpt: '**核心原则**: "不打扰是最好的运营"',
    }],
    confidence: 0.9,
  },
  {
    id: 'zhang-no-fake-urgency-red-dots',
    personaId: 'zhang',
    title: '红点只给真实消息，不给运营欲望',
    summary: '如果红点不是为了提醒真实未读或真实待处理事项，就不该出现。用红点刺激回访，本质是在透支用户注意力。',
    scenario: '团队争论是否给功能入口、内容流或活动页加红点。',
    goal: '避免用界面焦虑驱动回访。',
    constraints: ['红点很容易提升点击', '业务对短期回访有强诉求'],
    tags: ['notifications', 'ux', 'attention'],
    triggerKeywords: ['红点', '提醒', '未读', '功能入口', '提高点击'],
    preferredPath: '把红点限定在真实消息和真实待处理事项，不把它当运营工具。',
    antiPatterns: ['用红点制造“我是不是错过了什么”', '把所有重要功能都塞进红点逻辑'],
    reasoningSteps: ['先判断是否有真实待处理', '再看是否必须立即提醒', '不满足就取消红点'],
    reasons: [
      '红点的本质是稀缺提醒，一旦泛化就会迅速贬值。',
      '用户会因为被不断挑动焦虑而逐渐失去信任和注意力。',
      '让红点只对应真实消息，会让产品的提醒机制更有信用。',
    ],
    followUpQuestions: [
      '这个红点在提醒什么真实待处理事项？',
      '如果用户晚一点看到，会造成实际损失还是只是业务担心转化？',
    ],
    nextActions: [
      '把现有红点分类成真实消息类和运营刺激类。',
      '直接删除运营刺激类红点，只保留真实待处理提醒。',
      '为保留的红点写清使用原则，防止后续再次泛化。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-operation-restraint',
      excerpt: '❌ 运营红点: 一律禁止',
    }],
    confidence: 0.89,
  },
  {
    id: 'zhang-degrade-aging-features-before-deleting',
    personaId: 'zhang',
    title: '功能衰退时先降级入口，再决定是否下线',
    summary: '低频功能不一定要马上砍掉，但也不该继续占一级入口。先降级观察，是更稳的减法路径。',
    scenario: '产品里有历史功能使用率显著下滑，但仍有少量用户在用。',
    goal: '在减轻产品负担的同时控制下线风险。',
    constraints: ['仍有小部分用户依赖', '团队担心下线引发反弹'],
    tags: ['lifecycle', 'cleanup', 'product'],
    triggerKeywords: ['下线功能', '弱化入口', '低频功能', '产品臃肿', '摇一摇'],
    preferredPath: '先把低频功能从一级入口降级，再依据真实使用变化决定保留或下线。',
    antiPatterns: ['所有历史功能永久保留在高优先级入口', '一上来就强制下线所有衰退功能'],
    reasoningSteps: ['先识别衰退信号', '再降级入口', '最后基于数据决定保留还是下线'],
    reasons: [
      '入口层级本身就是产品资源，不该长期让低频功能占位。',
      '降级比直接删除更适合验证真实需求是否还存在。',
      '把“死亡”纳入生命周期，产品才能持续保持清爽。',
    ],
    followUpQuestions: [
      '这个功能目前的真实使用率和新用户渗透率是多少？',
      '如果先降级入口，是否还有人会主动去用它？',
    ],
    nextActions: [
      '给历史功能补一张生命周期表，标明增长、成熟、衰退状态。',
      '先把明显衰退功能从一级入口降级到二级或搜索入口。',
      '观察一个周期后，再决定继续保留还是正式下线。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-feature-lifecycle',
      excerpt: '1. **弱化入口**（从一级入口降至二级）',
    }],
    confidence: 0.86,
  },
  {
    id: 'zhang-design-social-for-real-relationships',
    personaId: 'zhang',
    title: '社交产品先服务真实关系，不先服务表演传播',
    summary: '如果一个社交设计能更快扩散，但会把关系从真实互动变成公开表演，默认应优先保护真实关系。',
    scenario: '团队在设计社交关系链、可见性或内容传播机制。',
    goal: '避免社交产品变成表演型内容广场。',
    constraints: ['公开传播更容易带来增长', '真实关系模式增长更慢'],
    tags: ['social', 'relationships', 'distribution'],
    triggerKeywords: ['社交设计', '朋友圈', '好友关系', '公开广场', '关注关系'],
    preferredPath: '优先采用双向确认、私密可见和关系边界清晰的机制。',
    antiPatterns: ['为了增长改成公开表演场', '把不认识的人强行拉进同一社交上下文'],
    reasoningSteps: ['先看产品服务的是关系还是内容分发', '再确定可见性边界', '最后决定传播机制'],
    reasons: [
      '真实关系的增长慢，但更能支撑长期信任和高频使用。',
      '公开表演型机制虽然更容易爆发，但也更容易引发疲劳和人设表演。',
      '社交边界越清晰，用户越敢表达真实内容。',
    ],
    followUpQuestions: [
      '你们现在设计的是帮助熟人互动，还是在鼓励用户对陌生人表演？',
      '传播效率提高的代价，是否是关系边界被打散？',
    ],
    nextActions: [
      '先明确这条社交链路服务的是熟人关系还是公开内容分发。',
      '如果核心是关系，优先使用双向确认和私密可见性。',
      '把容易破坏关系边界的公开传播机制单独隔离测试。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-social-design',
      excerpt: '**微信选择**: "双向验证"（加好友需对方同意）',
    }],
    confidence: 0.87,
  },
  {
    id: 'zhang-reduce-social-pressure-signals',
    personaId: 'zhang',
    title: '能制造社交压力的信号，默认少做或不做',
    summary: '如果一个机制会引发攀比、被迫回复或持续焦虑，就算它能提升互动，也要谨慎甚至不做。',
    scenario: '团队讨论是否显示点赞数、已读状态、公开评论关系或历史暴露度。',
    goal: '降低社交压力，保护真实表达。',
    constraints: ['这些信号能显著抬高互动数据', '用户对压力感知往往滞后'],
    tags: ['social', 'privacy', 'stress'],
    triggerKeywords: ['已读回执', '点赞数', '三天可见', '社交压力', '焦虑'],
    preferredPath: '优先隐藏会触发攀比和负担的信号，保留用户的社交回旋空间。',
    antiPatterns: ['把互动指标最大化当成唯一目标', '用公开信号制造回复压力和比较压力'],
    reasoningSteps: ['先识别信号会带来什么压力', '再判断是否真有必要公开', '能不公开就不公开'],
    reasons: [
      '很多互动信号带来的不是连接，而是压力和表演。',
      '用户需要的是表达空间，而不是被每个信号追着做社交回应。',
      '减少社交压力通常会牺牲部分互动数据，但能换来更真实的使用。',
    ],
    followUpQuestions: [
      '这个信号公开后，用户会更自在，还是会更有负担？',
      '你们是在提升连接质量，还是只是在提升可量化互动？',
    ],
    nextActions: [
      '梳理当前会制造社交压力的公开信号：点赞数、已读、公开评论关系等。',
      '优先隐藏或弱化最容易引发攀比和负担的那一类信号。',
      '上线后不仅看互动率，也看负反馈和长期表达频次。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-social-design',
      excerpt: '**微信选择**: 不做已读回执',
    }],
    confidence: 0.88,
  },
  {
    id: 'zhang-govern-platform-with-rules-not-manual-traffic',
    personaId: 'zhang',
    title: '平台治理先定规则，不先人工分流量',
    summary: '平台型产品应优先制定透明规则和基础设施，让生态自我演化，而不是靠手工推荐、流量扶持和个案干预维持增长。',
    scenario: '平台团队在讨论是否做中心化推荐、扶持头部或手动调控分发。',
    goal: '在治理和生态活力之间保持更稳的长期平衡。',
    constraints: ['新生态冷启动难', '头部扶持短期看起来更有效'],
    tags: ['platform', 'governance', 'distribution'],
    triggerKeywords: ['平台治理', '流量扶持', '推荐机制', '规则透明', '去中心化'],
    preferredPath: '成熟生态优先用透明规则和用户选择做分发，少做手工干预。',
    antiPatterns: ['平台决定谁该成功', '长期依赖头部扶持和编辑推荐'],
    reasoningSteps: ['先判断生态是否已成熟', '成熟则优先规则治理', '只在冷启动期允许有限中心化扶持'],
    reasons: [
      '长期人工分流量会让生态越来越依赖平台意志，而不是依赖用户选择。',
      '透明规则能提升创作者和开发者的可预期性。',
      '平台真正该建设的是土壤，而不是代替生态做选择。',
    ],
    followUpQuestions: [
      '这个生态现在处于冷启动期，还是已经足够成熟可以承受更去中心化的分发？',
      '你们当前的推荐和扶持是在补冷启动，还是已经变成常态依赖？',
    ],
    nextActions: [
      '先把当前平台干预动作区分成“冷启动必要”与“长期习惯性干预”。',
      '对成熟生态逐步把编辑推荐和人工扶持退回到规则治理。',
      '把平台规则写清并公开，减少个案式例外处理。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-platform-governance',
      excerpt: '4. **制定规则，而非干预个体**: 定规则，让生态自我演化',
    }],
    confidence: 0.86,
  },
  {
    id: 'zhang-use-temporary-centralization-only-for-cold-start',
    personaId: 'zhang',
    title: '去中心化不是宗教，冷启动期可以暂时中心化',
    summary: '平台早期内容和供给不足时，可以短期引入适度中心化机制，但要明确它只是冷启动工具，不是长期模式。',
    scenario: '平台或内容生态早期供给不足，完全去中心化导致增长过慢。',
    goal: '在增长与原则之间找到过渡路径。',
    constraints: ['生态早期供给不足', '完全去中心化会导致冷启动困难'],
    tags: ['platform', 'cold-start', 'governance'],
    triggerKeywords: ['冷启动', '适度中心化', '推荐', '供给不足', '平台早期'],
    preferredPath: '冷启动期允许有限中心化推荐，但要明确退出条件，长期仍回到去中心化规则。',
    antiPatterns: ['把冷启动手段永久化', '在早期完全拒绝任何中心化导致生态起不来'],
    reasoningSteps: ['先判断是否供给不足', '短期引入有限中心化', '预设回归去中心化的退出条件'],
    reasons: [
      '完全去中心化在供给极少时可能根本没有足够内容让用户形成使用习惯。',
      '适度中心化能帮助生态跨过最初的供给鸿沟。',
      '如果不设退出条件，临时手段很容易演变成平台常态依赖。',
    ],
    followUpQuestions: [
      '你们遇到的是原则问题，还是供给不足导致的冷启动问题？',
      '如果引入中心化推荐，何时应当撤回并回到规则分发？',
    ],
    nextActions: [
      '先定义当前生态是否真的处于供给不足的冷启动阶段。',
      '如需中心化扶持，明确范围、时限和退出指标。',
      '一旦供给达到阈值，就逐步把分发重心交回用户选择和平台规则。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-platform-governance',
      excerpt: '完全去中心化在早期内容供给不足时不可行。需要适度中心化冷启动，但长期依然走向去中心化。',
    }],
    confidence: 0.84,
  },
  {
    id: 'zhang-use-and-go-service-over-forced-retention',
    personaId: 'zhang',
    title: '服务型产品先做到用完即走，不先追时长',
    summary: '当产品本质是服务工具而不是内容消费时，强行追求黏性往往会破坏体验。先把它做成真正顺手的工具，再谈回访。',
    scenario: '团队在服务型产品里讨论是否要加入更多留存和停留时长设计。',
    goal: '避免把服务产品做成反用户的黏性机器。',
    constraints: ['内部仍用时长和活跃评估一切', '团队担心“用完即走”会影响增长'],
    tags: ['tool', 'service', 'retention'],
    triggerKeywords: ['用完即走', '工具属性', '服务产品', '停留时长', '黏性设计'],
    preferredPath: '先让用户在需要时最快获得服务，不为了留存故意增加停留和回访动作。',
    antiPatterns: ['为了时长故意增加停留步骤', '服务产品也套内容产品的留存指标'],
    reasoningSteps: ['先判断产品本质是服务还是内容', '再定义用户完成任务的最短路径', '最后才看是否需要额外回访机制'],
    reasons: [
      '服务产品的价值常常体现在“更快完成”，而不是“停得更久”。',
      '把工具做得轻和顺手，本身会提升复用，而不需要强行制造黏性。',
      '错误的留存目标会让团队持续添加不必要的打扰和入口。',
    ],
    followUpQuestions: [
      '用户来你们这里，是为了完成任务还是为了打发时间？',
      '当前哪些设计是在帮助用户完成任务，哪些设计只是为了拉长停留时长？',
    ],
    nextActions: [
      '先定义服务产品最核心的一次任务闭环，并测量完成时间。',
      '砍掉那些只增加停留时长、不增加任务完成率的环节。',
      '把核心指标从时长切换到任务完成率、复用率和满意度。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-mini-program',
      excerpt: '小程序"用完即走",不做用户留存设计',
    }],
    confidence: 0.87,
  },
  {
    id: 'zhang-scene-entry-beats-homepage-entry-for-services',
    personaId: 'zhang',
    title: '服务入口优先贴场景，不优先抢首页入口',
    summary: '对有明确触发场景的服务，最有效的入口往往不是首页，而是用户当下所处场景里的自然触点。',
    scenario: '团队在做服务产品分发，争论要不要给它一个中心化主入口。',
    goal: '找到更自然、更高意图的服务触发点。',
    constraints: ['团队迷信主入口', '线下或具体场景入口还没被系统梳理'],
    tags: ['distribution', 'service', 'entry-point'],
    triggerKeywords: ['入口', '二维码', '场景化服务', '主入口', '线下场景'],
    preferredPath: '先找到用户真实发生需求的场景，再把入口嵌进去，而不是默认去抢中心化入口位。',
    antiPatterns: ['没有场景洞察就先争首页入口', '把所有服务统一塞进一个中心广场'],
    reasoningSteps: ['先识别需求发生场景', '再设计最短触发路径', '最后验证是否真的需要中心入口'],
    reasons: [
      '场景入口带来的不是流量，而是更高的意图密度。',
      '服务和内容不同，很多时候用户不是想“逛”，而是想立刻完成事情。',
      '场景驱动的分发通常比中心入口更自然，也更不打扰。',
    ],
    followUpQuestions: [
      '用户真正需要这个服务的瞬间发生在哪个线下或线上场景里？',
      '如果不给首页入口，只给场景入口，完成率会不会反而更高？',
    ],
    nextActions: [
      '先画出用户需求发生的前 3 个具体场景，而不是先画首页信息架构。',
      '优先在这些场景里设计二维码、扫码、近场触发或轻入口方案。',
      '用完成率和重复使用率验证场景入口，而不是只看入口曝光量。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-mini-program',
      excerpt: '小程序没有统一入口,通过二维码在场景中启动',
    }],
    confidence: 0.86,
  },
  {
    id: 'zhang-build-forest-not-palace',
    personaId: 'zhang',
    title: '做平台先建森林，不先建宫殿',
    summary: '平台的职责不是把每块价值都自己做完，而是营造规则和环境，让生态自己长出来。',
    scenario: '平台团队在讨论是否亲自下场覆盖生态里的每类功能和内容。',
    goal: '避免平台既当裁判又当运动员，压死生态活力。',
    constraints: ['平台能力强，自己下场看起来更快', '生态伙伴不成熟'],
    tags: ['platform', 'ecosystem', 'strategy'],
    triggerKeywords: ['森林', '宫殿', '生态系统', '平台自己做', '开放平台'],
    preferredPath: '平台优先建设土壤、规则和能力边界，让合作方生长，而不是自己把每个品类都做掉。',
    antiPatterns: ['平台什么都自己做', '把生态当流量附属，不给真实生长空间'],
    reasoningSteps: ['先定义平台核心边界', '再判断哪些能力该开放', '最后把精力放在生态环境而非亲自覆盖一切'],
    reasons: [
      '平台一旦亲自做太多，外部伙伴就没有足够空间形成正反馈。',
      '生态系统比单体产品更依赖土壤质量，而不是中心化控制力度。',
      '“先做完再开放”通常会让平台越来越重，也越来越封闭。',
    ],
    followUpQuestions: [
      '这项能力如果平台自己做，会不会直接挤压生态伙伴的生存空间？',
      '你们现在在建设土壤，还是在不断扩建自己的宫殿？',
    ],
    nextActions: [
      '先列出平台必须自己做和应该开放出去的能力边界。',
      '把资源从“自己做更多功能”转向“让生态更容易接入和生长”。',
      '评估每个新项目是否会强化森林，还是只会加高宫殿围墙。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-open-platform-philosophy',
      excerpt: '我们是希望建造一个森林，而不是说我们要建造一个自己的宫殿出来。',
    }],
    confidence: 0.85,
  },
  {
    id: 'zhang-dynamic-rules-beat-static-control',
    personaId: 'zhang',
    title: '平台规则要能动态演化，不要指望一次写死',
    summary: '复杂生态里，静态规则看起来清楚，实际上更脆。更稳的做法是承认系统会变化，并让规则随生态共同演化。',
    scenario: '平台团队在制定治理规则，试图一次性写出绝对完备的静态规范。',
    goal: '保持治理系统对新问题和生态变化的适应力。',
    constraints: ['外部要求规则明确', '团队害怕变化带来争议'],
    tags: ['governance', 'rules', 'platform'],
    triggerKeywords: ['动态系统', '平台规则', '治理规则', '一次性写死', '生态演化'],
    preferredPath: '把平台治理当动态系统来运营，允许规则根据生态反馈持续调整，但保持原则稳定。',
    antiPatterns: ['追求一次写死的完备规则', '问题一出现就靠个案人工特批解决'],
    reasoningSteps: ['先定义不变原则', '再承认规则需要演化', '用反馈持续修正规则而非堆例外'],
    reasons: [
      '生态变化速度往往快于规则文档更新速度，静态规则会越来越脱离现实。',
      '动态系统不等于没有原则，而是原则稳定、实现方式可迭代。',
      '长期靠个案例外处理，会让平台规则失去公信力。',
    ],
    followUpQuestions: [
      '你们现在要解决的是原则不清，还是规则实现已经跟不上现实变化？',
      '哪些地方应该写成稳定原则，哪些地方应该预留动态调整空间？',
    ],
    nextActions: [
      '把治理文档拆成“不可变原则”和“可调整执行规则”两层。',
      '每次规则变动都说明触发原因和预期影响，不靠口头例外。',
      '定期回看新增案例，判断是应修正规则，还是只是孤立噪音。',
    ],
    evidenceLevel: 'A',
    evidenceRefs: [{
      sourceId: 'src-zhang-open-platform-philosophy',
      excerpt: '相反，我们认为**一个动态的系统是一个更加能够获得动态稳定的系统**。',
    }],
    confidence: 0.84,
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

function buildPersona(spec: PersonaSpec, sourceRefs: DecisionSourceRef[], timestamp: string): DecisionPersona {
  return {
    id: spec.id,
    name: spec.name,
    basePromptKey: spec.basePromptKey,
    heuristics: spec.heuristics,
    domainBoundaries: spec.domainBoundaries,
    evidenceSources: sourceRefs,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function buildUnit(seed: UnitSeed, sourceRefs: DecisionSourceRef[], timestamp: string): DecisionUnit {
  return {
    id: seed.id,
    personaId: seed.personaId,
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

  const personas = PERSONA_SPECS
    .map((spec) => {
      const sourceRefs = SOURCE_SPECS
        .filter(source => source.personaId === spec.id)
        .map(source => sourceRefFromSpec(source))
      return mergeEntityTimestamps(buildPersona(spec, sourceRefs, generationTimestamp), existingPersonas)
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  const units = UNIT_SEEDS.map((seed) => {
    const refs = seed.evidenceRefs.map(({ sourceId, excerpt }) => {
      const record = sourceFiles.get(sourceId)
      if (!record) throw new Error(`Unknown sourceId: ${sourceId}`)
      return buildEvidenceRef(record, excerpt)
    })
    return mergeEntityTimestamps(buildUnit(seed, refs, generationTimestamp), existingUnits)
  })

  const wroteFiles = await Promise.all([
    writeJsonIfChanged(join(outputDir, 'decision-personas.json'), personas),
    writeJsonIfChanged(join(outputDir, 'decision-source-manifest.json'), manifest),
    writeJsonIfChanged(join(outputDir, 'decision-units.json'), units),
  ])

  console.log(`Wrote LingSi seed files to ${outputDir}`)
  console.log(`Persona count: ${personas.length}`)
  console.log(`Source count: ${manifest.length}`)
  console.log(`Approved unit count: ${units.length}`)
  console.log(`Files changed: ${wroteFiles.filter(Boolean).length}`)
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
