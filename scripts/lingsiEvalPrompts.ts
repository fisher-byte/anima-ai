export type LingSiEvalPrompt = {
  id: string
  category: string
  prompt: string
}

/** 与 evaluate-lingsi.ts 共用，避免 prompt 列表分叉 */
export const LENNY_EVAL_PROMPTS: LingSiEvalPrompt[] = [
  {
    id: 'pmf-before-growth',
    category: 'product',
    prompt: '我们刚上线一个协作 SaaS，注册转化还行，但第 4 周留存只有 6%。团队现在想开始投放买量。你会怎么决策？',
  },
  {
    id: 'find-best-segment',
    category: 'product',
    prompt: '一个 AI 记账工具同时被自由职业者、小微商家、个人记账用户使用。资源有限时，我该先服务谁？',
  },
  {
    id: 'prioritize-roadmap',
    category: 'product',
    prompt: '我是 4 人产品团队，下季度有 12 个需求，销售、客户成功、CEO 都在施压。路线图怎么排？',
  },
  {
    id: 'pricing-value-metric',
    category: 'pricing',
    prompt: '我们准备给 B2B AI 工具定价，按 seat 收费还是按使用量收费？',
  },
  {
    id: 'pricing-upgrade-path',
    category: 'pricing',
    prompt: 'SaaS 现在有 3 个套餐，但用户几乎都停在最低档。怎么改套餐设计？',
  },
  {
    id: 'growth-loop',
    category: 'growth',
    prompt: '一个内容协作产品现在靠朋友推荐增长，但团队想投 SEO、KOL、广告。先做哪条？',
  },
  {
    id: 'daci-decision',
    category: 'org',
    prompt: '产品、销售、客服都在争是否开放一个高风险定制功能，会上吵不出结论。怎么推进？',
  },
  {
    id: 'two-way-door',
    category: 'org',
    prompt: '我们在纠结要不要先上线一个可能不成熟的 onboarding 流程。这个决策要走完整评审吗？',
  },
  {
    id: 'meeting-redesign',
    category: 'org',
    prompt: '每周产品例会 90 分钟，经常一边发现问题一边拍板，最后谁都没跟。怎么改？',
  },
  {
    id: 'pre-mortem',
    category: 'risk',
    prompt: '准备花 3 个月做一个 AI 自动化功能，上线风险很高。你会怎么做 pre-mortem？',
  },
  {
    id: 'make-implicit-explicit',
    category: 'decision',
    prompt: '我总觉得这个方向对，但说不清为什么。怎么把直觉变成可检验的决策？',
  },
  {
    id: 'leading-signals',
    category: 'decision',
    prompt: '我们做企业软件，真正续费反馈要半年后才知道。现在怎么缩短反馈回路？',
  },
  {
    id: 'career-switch',
    category: 'career',
    prompt: '我现在是大厂产品经理，手上有一个 SaaS 创业机会，但收入会降很多。怎么判断该不该辞职？',
  },
  {
    id: 'cofounder-choice',
    category: 'career',
    prompt: '我和朋友想一起创业，但他执行力强、价值观一般；另一个人价值观对但全职不确定。怎么选合伙人？',
  },
  {
    id: 'general-overload',
    category: 'general',
    prompt: '最近事情太多，我每天都在做决定但都很乱。你会建议我先从哪里整理？',
  },
]

export const ZHANG_EVAL_PROMPTS: LingSiEvalPrompt[] = [
  {
    id: 'service-shape-use-and-go',
    category: 'service',
    prompt: '我们在做一个高频入口下的线下服务工具，团队想加签到、连续使用奖励和内容流拉时长。你会怎么决策？',
  },
  {
    id: 'scene-entry-vs-home-entry',
    category: 'entry',
    prompt: '一个本地生活服务想要微信首页一级入口来拉访问，但真实需求都发生在线下扫码场景。入口该怎么设计？',
  },
  {
    id: 'platform-forest-vs-palace',
    category: 'platform',
    prompt: '我们做开放平台，内部想把生态里最赚钱的几类能力都自己做了。你会怎么判断？',
  },
  {
    id: 'dynamic-rules',
    category: 'governance',
    prompt: '平台规则要不要一次性写得特别死，避免后面总改规则被人骂？',
  },
  {
    id: 'social-pressure-signals',
    category: 'social',
    prompt: '社交产品要不要上已读回执和公开点赞数？这样互动数据会更好看。',
  },
  {
    id: 'commercialize-social-feed',
    category: 'commercialization',
    prompt: '高频社交内容流准备上广告，业务希望快速放量。广告策略该怎么起步？',
  },
  {
    id: 'cold-start-centralization',
    category: 'governance',
    prompt: '平台早期供给太少，完全去中心化导致内容很空。现在要不要先中心化推荐？',
  },
]
