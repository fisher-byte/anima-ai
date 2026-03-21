/**
 * 离线轻量评测：不调用 LLM，仅统计固定题集下 DecisionUnit 匹配情况
 * （命中数量、Top3、精选 vs 自动占比），用于语料扩容前后的对照基线。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import decisionUnitsSeed from '../seeds/lingsi/decision-units.json'
import { LENNY_EVAL_PROMPTS, ZHANG_EVAL_PROMPTS } from './lingsiEvalPrompts'
import { matchDecisionUnits } from '../src/shared/lingsiDecisionEngine'
import type { DecisionUnit } from '../src/shared/types'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const REPORT_JSON = join(ROOT, 'reports', 'lingsi-eval-lite.json')
const REPORT_MD = join(ROOT, 'docs', 'lingsi-eval-lite.md')

function isAutoUnit(id: string): boolean {
  return id.startsWith('unit-auto-')
}

function summarizeMatches(units: DecisionUnit[]) {
  const ids = units.map(u => u.id)
  const autoInTop = ids.filter(isAutoUnit).length
  return {
    count: units.length,
    top3Ids: ids.slice(0, 3),
    autoInTop3: autoInTop,
    curatedInTop3: ids.slice(0, 3).length - autoInTop,
    firstIsAuto: ids[0] ? isAutoUnit(ids[0]) : false,
  }
}

async function main() {
  const all = decisionUnitsSeed as DecisionUnit[]
  const lennyUnits = all.filter(u => u.personaId === 'lenny')
  const zhangUnits = all.filter(u => u.personaId === 'zhang')

  const lennyRows = LENNY_EVAL_PROMPTS.map(p => ({
    id: p.id,
    category: p.category,
    ...summarizeMatches(matchDecisionUnits(p.prompt, lennyUnits)),
  }))

  const zhangRows = ZHANG_EVAL_PROMPTS.map(p => ({
    id: p.id,
    category: p.category,
    ...summarizeMatches(matchDecisionUnits(p.prompt, zhangUnits)),
  }))

  const avg = (rows: typeof lennyRows, key: 'count') =>
    rows.reduce((s, r) => s + r[key], 0) / rows.length

  const pct = (num: number, den: number) => (den === 0 ? 0 : Math.round((100 * num) / den))

  const lennyCasesWithHits = lennyRows.filter(r => r.count > 0).length
  const zhangCasesWithHits = zhangRows.filter(r => r.count > 0).length
  const lennyFirstCurated = lennyRows.filter(r => r.count > 0 && !r.firstIsAuto).length
  const zhangFirstCurated = zhangRows.filter(r => r.count > 0 && !r.firstIsAuto).length

  const snapshot = {
    generatedAt: new Date().toISOString(),
    seeds: {
      totalUnits: all.length,
      lennyUnits: lennyUnits.length,
      zhangUnits: zhangUnits.length,
      autoUnits: all.filter(u => isAutoUnit(u.id)).length,
      curatedUnits: all.filter(u => !isAutoUnit(u.id)).length,
    },
    lenny: {
      cases: lennyRows.length,
      avgMatchedPerCase: Number(avg(lennyRows, 'count').toFixed(2)),
      casesWithAtLeastOneMatch: lennyCasesWithHits,
      casesWhereFirstHitIsCurated: lennyFirstCurated,
      pctFirstHitCuratedAmongHits: pct(lennyFirstCurated, lennyCasesWithHits),
    },
    zhang: {
      cases: zhangRows.length,
      avgMatchedPerCase: Number(avg(zhangRows, 'count').toFixed(2)),
      casesWithAtLeastOneMatch: zhangCasesWithHits,
      casesWhereFirstHitIsCurated: zhangFirstCurated,
      pctFirstHitCuratedAmongHits: pct(zhangFirstCurated, zhangCasesWithHits),
    },
    details: { lenny: lennyRows, zhang: zhangRows },
  }

  const md = [
    '# LingSi 轻量评测（离线 · 仅匹配统计）',
    '',
    `生成时间：${snapshot.generatedAt}`,
    '',
    '## 种子概览',
    '',
    `- 总单元：${snapshot.seeds.totalUnits}（Lenny ${snapshot.seeds.lennyUnits} · 张小龙 ${snapshot.seeds.zhangUnits}）`,
    `- 精选单元：${snapshot.seeds.curatedUnits} · 自动入库：${snapshot.seeds.autoUnits}`,
    '',
    '## Lenny（15 题）',
    '',
    `- 平均每题命中条数（最多取前 3）：${snapshot.lenny.avgMatchedPerCase}`,
    `- 至少命中 1 条的题数：${snapshot.lenny.casesWithAtLeastOneMatch} / ${snapshot.lenny.cases}`,
    `- 在「有命中」的题里，**第一条为精选**的占比：${snapshot.lenny.pctFirstHitCuratedAmongHits}%`,
    '',
    '## 张小龙（7 题）',
    '',
    `- 平均每题命中条数：${snapshot.zhang.avgMatchedPerCase}`,
    `- 至少命中 1 条的题数：${snapshot.zhang.casesWithAtLeastOneMatch} / ${snapshot.zhang.cases}`,
    `- 在「有命中」的题里，**第一条为精选**的占比：${snapshot.zhang.pctFirstHitCuratedAmongHits}%`,
    '',
    '## 说明',
    '',
    '- 本报告**不评价回答文本质量**；完整 LLM 对照评测请在本机启动服务后运行 `npm run lingsi:evaluate` / `npm run lingsi:evaluate:zhang`。',
    '- `unit-auto-*` 在引擎内已降权；「第一条为精选」比例高表示精选仍主导 Top 匹配。',
    '',
  ].join('\n')

  await mkdir(join(ROOT, 'reports'), { recursive: true })
  await writeFile(REPORT_JSON, JSON.stringify(snapshot, null, 2))
  await writeFile(REPORT_MD, md)

  console.log(JSON.stringify(snapshot.seeds, null, 2))
  console.log('lenny:', snapshot.lenny)
  console.log('zhang:', snapshot.zhang)
  console.log('wrote', REPORT_JSON)
  console.log('wrote', REPORT_MD)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
