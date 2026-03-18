import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import decisionUnitsSeed from '../seeds/lingsi/decision-units.json'
import { parseJudgeJson } from '../src/shared/evalJudgeParser'
import { buildLingSiDecisionPayloadFromUnits, matchDecisionUnits } from '../src/shared/lingsiDecisionEngine'
import { LENNY_SYSTEM_PROMPT, ZHANG_SYSTEM_PROMPT } from '../src/shared/constants'
import type { DecisionUnit } from '../src/shared/types'

type EvalPrompt = {
  id: string
  category: string
  prompt: string
}

type JudgeResult = {
  winner: 'normal' | 'decision' | 'tie'
  normalScore: {
    directness: number
    actionability: number
    trustworthiness: number
  }
  decisionScore: {
    directness: number
    actionability: number
    trustworthiness: number
  }
  rationale: string
}

type EvalCaseResult = {
  id: string
  category: string
  prompt: string
  matchedUnitIds: string[]
  normalAnswer: string
  decisionAnswer: string
  judge: JudgeResult
}

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const REPORT_DIR = join(ROOT, 'reports')
const DEFAULT_REPORT_JSON = join(REPORT_DIR, 'lingsi-m4-eval.json')
const DEFAULT_REPORT_MD = join(ROOT, 'docs', 'lingsi-eval-m4.md')
const ZHANG_REPORT_JSON = join(REPORT_DIR, 'lingsi-zhang-eval.json')
const ZHANG_REPORT_MD = join(ROOT, 'docs', 'lingsi-eval-zhang.md')
const API_URL = process.env.LINGSI_EVAL_API_URL ?? 'http://localhost:3000'
const CASE_FILTER = process.env.LINGSI_EVAL_CASE?.trim()
const PERSONA_FILTER = (process.env.LINGSI_EVAL_PERSONA?.trim() || 'lenny') as 'lenny' | 'zhang'
const MAX_RETRIES = 3
const REQUEST_TIMEOUT_MS = Number(process.env.LINGSI_EVAL_TIMEOUT_MS ?? 90_000)
const allUnits = decisionUnitsSeed as DecisionUnit[]

const LENNY_PROMPTS: EvalPrompt[] = [
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

const ZHANG_PROMPTS: EvalPrompt[] = [
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

type PersonaEvalConfig = {
  personaId: 'lenny' | 'zhang'
  personaName: string
  systemPrompt: string
  reportJson: string
  reportMd: string
  reportPrefix: string
  title: string
  prompts: EvalPrompt[]
}

const PERSONA_CONFIGS: Record<'lenny' | 'zhang', PersonaEvalConfig> = {
  lenny: {
    personaId: 'lenny',
    personaName: 'Lenny Rachitsky',
    systemPrompt: LENNY_SYSTEM_PROMPT,
    reportJson: DEFAULT_REPORT_JSON,
    reportMd: DEFAULT_REPORT_MD,
    reportPrefix: 'lingsi-m4-eval',
    title: 'LingSi Lenny Evaluation',
    prompts: LENNY_PROMPTS,
  },
  zhang: {
    personaId: 'zhang',
    personaName: '张小龙',
    systemPrompt: ZHANG_SYSTEM_PROMPT,
    reportJson: ZHANG_REPORT_JSON,
    reportMd: ZHANG_REPORT_MD,
    reportPrefix: 'lingsi-zhang-eval',
    title: 'LingSi Zhang Evaluation',
    prompts: ZHANG_PROMPTS,
  },
}

async function streamChatCompletion(
  userPrompt: string,
  systemPromptOverride: string,
  extraContext?: string,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error(`eval timeout after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${API_URL}/api/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [{ role: 'user', content: userPrompt }],
          preferences: [],
          compressedMemory: '',
          systemPromptOverride,
          extraContext,
        }),
      })

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '')
        throw new Error(`stream failed: ${response.status} ${text}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''

        for (const rawEvent of events) {
          const dataLine = rawEvent
            .split(/\r?\n/)
            .find(line => line.startsWith('data:'))
          if (!dataLine) continue

          const payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>
          if (payload.type === 'content' && typeof payload.content === 'string') {
            fullText += payload.content
          } else if (payload.type === 'done' && typeof payload.fullText === 'string') {
            fullText = payload.fullText
          } else if (payload.type === 'error') {
            throw new Error(typeof payload.error === 'string' ? payload.error : 'unknown stream error')
          }
        }
      }

      return fullText.trim()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isRetryable = /429|overloaded|rate limit|fetch failed|network|stream error|timeout|aborted/i.test(message)
      if (!isRetryable || attempt === MAX_RETRIES) throw error
      const delayMs = 1500 * attempt
      await new Promise(resolve => setTimeout(resolve, delayMs))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('unreachable')
}

async function judgeCase(prompt: string, normalAnswer: string, decisionAnswer: string): Promise<JudgeResult> {
  const evaluatorPrompt = [
    '你是一个严格的内部评测员，只比较两份回答的决策质量，不评价文风。',
    '请按以下标准分别给 Normal 和 Decision 打分（1-5，5 为最好）：',
    '1. directness：是否先给判断，而不是泛泛而谈。',
    '2. actionability：是否给出可执行的下一步。',
    '3. trustworthiness：是否承认不确定性，且不过度装懂。',
    '然后给出 winner：normal、decision 或 tie。',
    '输出必须是 JSON，不要输出任何额外文字。',
    'JSON 格式：{"winner":"decision","normalScore":{"directness":1,"actionability":1,"trustworthiness":1},"decisionScore":{"directness":1,"actionability":1,"trustworthiness":1},"rationale":"不超过 60 字"}',
    '',
    `用户问题：${prompt}`,
    '',
    'Normal 回答：',
    normalAnswer,
    '',
    'Decision 回答：',
    decisionAnswer,
  ].join('\n')

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await streamChatCompletion(
      evaluatorPrompt,
      attempt === 1
        ? '你是一个只输出 JSON 的评测器。输出必须是合法 JSON。'
        : '你是一个只输出 JSON 的评测器。禁止任何解释、前言、后记或 Markdown 代码块，只能输出单个合法 JSON 对象。',
    )

    try {
      return parseJudgeJson<JudgeResult>(raw)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error('Failed to parse evaluator JSON output')
}

function buildMarkdownReport(results: EvalCaseResult[], config: PersonaEvalConfig, units: DecisionUnit[]): string {
  const decisionWins = results.filter(item => item.judge.winner === 'decision').length
  const normalWins = results.filter(item => item.judge.winner === 'normal').length
  const ties = results.filter(item => item.judge.winner === 'tie').length

  const average = (selector: (item: EvalCaseResult) => number) =>
    (results.reduce((sum, item) => sum + selector(item), 0) / results.length).toFixed(2)

  const avgNormalDirectness = average(item => item.judge.normalScore.directness)
  const avgNormalActionability = average(item => item.judge.normalScore.actionability)
  const avgNormalTrustworthiness = average(item => item.judge.normalScore.trustworthiness)
  const avgDecisionDirectness = average(item => item.judge.decisionScore.directness)
  const avgDecisionActionability = average(item => item.judge.decisionScore.actionability)
  const avgDecisionTrustworthiness = average(item => item.judge.decisionScore.trustworthiness)

  const tableRows = results.map(item => {
    return `| ${item.id} | ${item.category} | ${item.matchedUnitIds.length} | ${item.judge.winner} | ${item.judge.normalScore.directness}/${item.judge.normalScore.actionability}/${item.judge.normalScore.trustworthiness} | ${item.judge.decisionScore.directness}/${item.judge.decisionScore.actionability}/${item.judge.decisionScore.trustworthiness} | ${item.judge.rationale} |`
  }).join('\n')

  const details = results.map(item => [
    `## ${item.id}`,
    `- Category: ${item.category}`,
    `- Matched Units: ${item.matchedUnitIds.length ? item.matchedUnitIds.join(', ') : 'none'}`,
    `- Winner: ${item.judge.winner}`,
    `- Judge Note: ${item.judge.rationale}`,
    '',
    '### Prompt',
    item.prompt,
    '',
    '### Normal',
    item.normalAnswer,
    '',
    '### Decision',
    item.decisionAnswer,
  ].join('\n')).join('\n\n')

  return [
    `# ${config.title}`,
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Persona: ${config.personaName}`,
    `Source units: ${units.length}`,
    `Cases: ${results.length}`,
    '',
    '## Summary',
    '',
    `- Decision wins: ${decisionWins}`,
    `- Normal wins: ${normalWins}`,
    `- Ties: ${ties}`,
    `- Normal avg (directness/actionability/trustworthiness): ${avgNormalDirectness} / ${avgNormalActionability} / ${avgNormalTrustworthiness}`,
    `- Decision avg (directness/actionability/trustworthiness): ${avgDecisionDirectness} / ${avgDecisionActionability} / ${avgDecisionTrustworthiness}`,
    '',
    '## Score Table',
    '',
    '| Case | Category | Matched Units | Winner | Normal D/A/T | Decision D/A/T | Note |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
    tableRows,
    '',
    '## Details',
    '',
    details,
    '',
  ].join('\n')
}

async function main() {
  const config = PERSONA_CONFIGS[PERSONA_FILTER]
  if (!config) {
    throw new Error(`Unknown persona filter: ${PERSONA_FILTER}`)
  }

  const units = allUnits.filter(unit => unit.personaId === config.personaId)
  const cases = CASE_FILTER
    ? config.prompts.filter(item => item.id === CASE_FILTER)
    : config.prompts
  if (cases.length === 0) {
    throw new Error(`Unknown case filter: ${CASE_FILTER}`)
  }

  const reportJson = CASE_FILTER
    ? join(REPORT_DIR, `${config.reportPrefix}-${CASE_FILTER}.json`)
    : config.reportJson
  const reportMd = CASE_FILTER
    ? join(ROOT, 'docs', `${config.reportPrefix === 'lingsi-m4-eval' ? 'lingsi-eval-m4' : 'lingsi-eval-zhang'}-${CASE_FILTER}.md`)
    : config.reportMd

  const results: EvalCaseResult[] = []

  for (const item of cases) {
    const matchedUnits = matchDecisionUnits(item.prompt, units)
    const decisionPayload = buildLingSiDecisionPayloadFromUnits(item.prompt, 'decision', units, {
      personaId: config.personaId,
      personaName: config.personaName,
    })

    console.log(`Evaluating ${config.personaId}:${item.id} (${matchedUnits.length} matched units)`)

    const normalAnswer = await streamChatCompletion(item.prompt, config.systemPrompt)
    const decisionAnswer = await streamChatCompletion(item.prompt, config.systemPrompt, decisionPayload.extraContext)
    const judge = await judgeCase(item.prompt, normalAnswer, decisionAnswer)

    results.push({
      id: item.id,
      category: item.category,
      prompt: item.prompt,
      matchedUnitIds: matchedUnits.map(unit => unit.id),
      normalAnswer,
      decisionAnswer,
      judge,
    })
  }

  const markdown = buildMarkdownReport(results, config, units)
  await mkdir(REPORT_DIR, { recursive: true })
  await writeFile(reportJson, JSON.stringify(results, null, 2))
  await writeFile(reportMd, markdown)

  const decisionWins = results.filter(item => item.judge.winner === 'decision').length
  const normalWins = results.filter(item => item.judge.winner === 'normal').length
  const ties = results.filter(item => item.judge.winner === 'tie').length
  console.log(`done (${config.personaId}): decision=${decisionWins}, normal=${normalWins}, tie=${ties}`)
  console.log(`json: ${reportJson}`)
  console.log(`markdown: ${reportMd}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
