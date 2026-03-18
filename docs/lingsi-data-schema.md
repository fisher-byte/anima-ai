# LingSi 数据 Schema

*最后更新: 2026-03-18 | 状态: 多 persona 基线已完成，产品状态包已接入自动刷新链路*

---

## 目标

为 `LingSi` 决策版 MVP 定义稳定的数据层基线，确保后续的数据导入、决策模式接入、测试和代码审查都围绕同一组结构推进。

原则：
- 不 mock 正式证据
- 来源必须可追溯
- 首批数据支持“自动提候选 + 人工审核上线”
- `Lenny` 与 `张小龙` 已接入，后续 persona 继续沿同一结构扩展

---

## 存储文件

四份 LingSi 资产最终会存放在 SQLite `storage` 表中。

当前仓库内的基线 seed 文件已生成到：
- `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/seeds/lingsi/decision-personas.json`
- `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/seeds/lingsi/decision-source-manifest.json`
- `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/seeds/lingsi/decision-units.json`
- `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/seeds/lingsi/decision-product-state.json`

当前 seed 统计：
- `2` 个 persona
- `37` 条来源 manifest
- `59` 条 `approved` DecisionUnit

正式接入产品时，再由导入链路写入 SQLite `storage` 表。

| 文件名 | 用途 |
|------|------|
| `decision-personas.json` | 决策 persona 的轻量结构化描述 |
| `decision-units.json` | 可直接命中的决策证据单元 |
| `decision-source-manifest.json` | 从独立 `anima-base` 导入的来源清单 |
| `decision-product-state.json` | 当前版本/评测/风险/待决策的结构化产品状态包 |

当前 `anima-base` 来源基线：
- 仓库路径：`/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/anima-base`
- 仓库 commit：`083974d`

---

## `decision-personas.json`

建议结构：JSON array of `DecisionPersona`

```json
[
  {
    "id": "lenny",
    "name": "Lenny Rachitsky",
    "basePromptKey": "LENNY_SYSTEM_PROMPT",
    "archetypeTags": [],
    "drives": {},
    "heuristics": [],
    "domainBoundaries": {
      "strong": [],
      "weak": []
    },
    "evidenceSources": [],
    "status": "active",
    "createdAt": "2026-03-17T00:00:00.000Z",
    "updatedAt": "2026-03-17T00:00:00.000Z"
  }
]
```

字段说明：
- `heuristics`：该 persona 常用判断启发式，偏自然语言
- `domainBoundaries`：用于提醒“擅长回答什么 / 不擅长回答什么”
- `evidenceSources`：该 persona 的基础来源池，不等于单轮回答的实际脚注

---

## `decision-units.json`

建议结构：JSON array of `DecisionUnit`

```json
[
  {
    "id": "lenny-pmf-threshold",
    "personaId": "lenny",
    "title": "用 PMF 信号而不是主观兴奋感判断是否加速增长",
    "summary": "当用户想加速增长前，先确认 PMF 是否真实成立。",
    "scenario": "产品负责人在考虑是否进入增长加速阶段",
    "goal": "判断是否应继续打磨产品还是开始加速增长",
    "constraints": ["样本量有限", "尚未形成稳定留存"],
    "tags": ["pmf", "growth", "validation"],
    "triggerKeywords": ["PMF", "留存", "增长", "加速"],
    "preferredPath": "先验证 PMF，再扩大增长投入",
    "antiPatterns": ["收入增长掩盖留存不足", "因为团队情绪高涨而误判 PMF"],
    "reasoningSteps": ["先判断信号", "再比较风险", "最后决定行动顺序"],
    "reasons": ["理由 1"],
    "followUpQuestions": ["你的留存曲线是否趋稳？"],
    "nextActions": ["做一次 PMF 调研"],
    "evidenceLevel": "A",
    "sourceRefs": [
      {
        "id": "src-lenny-pmf-assessment",
        "label": "PMF Assessment Framework",
        "type": "framework",
        "path": "people/product/lenny-rachitsky/frameworks/pmf-assessment.md",
        "locator": "L40",
        "excerpt": "- **40%+**: 达到PMF，可以加速增长",
        "evidenceLevel": "B"
      }
    ],
    "status": "approved",
    "confidence": 0.8,
    "createdAt": "2026-03-17T00:00:00.000Z",
    "updatedAt": "2026-03-17T00:00:00.000Z"
  }
]
```

字段规则：
- `status`：
  - `candidate`：脚本提取或待审核
  - `approved`：可以进入产品命中
  - `archived`：不再参与命中，但保留审计记录
- `triggerKeywords`：前端/服务端做轻匹配时的第一层召回条件
- `reasoningSteps`：不是面向用户直接展示的模板，而是帮助模型稳定推演的最小骨架
- `sourceRefs`：至少 1 条真实来源线索才能进入 `approved`
- `sourceRefs.locator`：文件内片段定位，格式建议 `L40` / `L40-L42`
- `sourceRefs.excerpt`：用于人工审核和脚注展示的最小证据摘录

---

## `decision-source-manifest.json`

建议结构：JSON array of `DecisionSourceManifestEntry`

```json
[
  {
    "id": "src-lenny-annie-duke-2024-05-02",
    "repo": "anima-base",
    "repoCommit": "4d27b3b",
    "person": "Lenny Rachitsky",
    "type": "podcast_transcript",
    "sourcePath": "people/product/lenny-rachitsky/podcasts/2024-05-02-annie-duke.md",
    "importedAt": "2026-03-17T00:00:00.000Z",
    "importedBy": "codex",
    "notes": "Decision-making / pre-mortem / feedback loops"
  }
]
```

用途：
- 审计 LingSi 的证据来自哪里
- 回答“这个 unit 是从哪个 commit 的哪份材料来的”
- 后续更新 `anima-base` 后，可以比对哪些 unit 需要重新审核

---

## 对话侧元数据

在 `Conversation` 结构中补充可选字段 `decisionTrace`：

```json
{
  "mode": "decision",
  "personaId": "lenny",
  "matchedDecisionUnitIds": ["lenny-pmf-threshold"],
  "sourceRefs": []
}
```

用途：
- 区分 `normal` / `decision`
- 统计哪些 unit 命中频率高
- 回看“这条回答是被哪些证据支持的”

注意：
- 这里记录的是“本轮命中的证据元数据”，不是把全部引用块原文直接写进会话

---

## 证据门槛

`approved` 级别的 `DecisionUnit` 需要满足：

1. 至少 1 条真实 `sourceRef`
2. `sourceRef.path` 必须能回到 `anima-base` 中的真实文件
3. `sourceRef.locator` 与 `sourceRef.excerpt` 至少有一组可回溯片段
4. 证据等级明确为 `A/B/C`
5. 内容经过人工审核，不允许把脚本抽取结果原样上线

回答侧约束：
- 每个核心判断至少绑定 1 条真实来源线索
- 整条回答最多 3–5 个脚注
- 证据不足时只输出“初步倾向 + 不确定点 + 追问/验证动作”

---

## 首批来源池

当前已接入的高价值来源包括：

- `people/product/lenny-rachitsky/frameworks/decision-making-frameworks.md`
- `people/product/lenny-rachitsky/frameworks/pmf-assessment.md`
- `people/product/lenny-rachitsky/frameworks/rice-prioritization-framework.md`
- `people/product/lenny-rachitsky/frameworks/saas-pricing-strategy-framework.md`
- `people/product/lenny-rachitsky/frameworks/growth-loops.md`
- `people/product/lenny-rachitsky/frameworks/cross-functional-alignment.md`
- `people/product/lenny-rachitsky/podcasts/2024-05-02-annie-duke.md`
- `people/product/lenny-rachitsky/decision-cases/case-01-superhuman-pmf-survey-decision.md`
- `people/product/lenny-rachitsky/frameworks/product-roadmap-planning-framework.md`
- `people/product/lenny-rachitsky/articles/uncertainty-decision-framework.md`
- `people/product/lenny-rachitsky/articles/pm-career-path-decision-framework.md`
- `people/product/zhang-xiaolong/frameworks/core-principles.md`
- `people/product/zhang-xiaolong/frameworks/discovering-needs.md`
- `people/product/zhang-xiaolong/decision-cases/case-10-wechat-launch-decision.md`
- `people/product/zhang-xiaolong/decision-cases/case-15-red-packet.md`
- `people/product/zhang-xiaolong/decision-cases/case-17-moments-ads.md`
- `people/product/zhang-xiaolong/decision-cases/case-06-subscription-feed-redesign.md`
- `people/product/lenny-rachitsky/decision-cases/case-12-reforge-product-strategy.md`
- `people/product/lenny-rachitsky/decision-cases/case-13-elena-verna-retention-first.md`
- `people/product/lenny-rachitsky/decision-cases/case-13-netflix-password-sharing.md`
- `people/product/lenny-rachitsky/decision-cases/case-15-julie-zhuo-design-critique.md`
- `people/product/zhang-xiaolong/decision-cases/case-18-operation-restraint.md`
- `people/product/zhang-xiaolong/decision-cases/case-19-feature-evolution-philosophy.md`
- `people/product/zhang-xiaolong/decision-cases/case-20-social-design-principles.md`
- `people/product/zhang-xiaolong/decision-cases/case-21-platform-governance-philosophy.md`
- `people/product/lenny-rachitsky/decision-cases/case-16-patrick-campbell-pricing-strategy.md`
- `people/product/lenny-rachitsky/decision-cases/case-17-gibson-biddle-gem-dhm.md`
- `people/product/lenny-rachitsky/decision-cases/case-18-wes-bush-plg-strategy.md`
- `people/product/lenny-rachitsky/decision-cases/case-19-teresa-torres-continuous-discovery.md`
- `people/product/lenny-rachitsky/decision-cases/case-20-ramli-john-activation-optimization.md`
- `people/product/lenny-rachitsky/decision-cases/case-21-hiten-shah-feedback-system.md`
- `people/product/zhang-xiaolong/decision-cases/case-03-mini-program-strategy.md`
- `people/product/zhang-xiaolong/articles/2014-wechat-open-platform-philosophy.md`

当前优先覆盖的问题类型：
- PMF 判断
- 功能优先级
- 增长渠道选择
- 定价
- 职业路径与组织决策
- 社交产品增长与激活
- 克制商业化
- 争议功能的渐进式改版

---

## M2 准入标准

进入 `M2` 之前，至少满足：

- 类型定义已进入代码
- 白名单已允许三份 LingSi 资产文件
- 本文档已作为数据层基线
- 首批来源池已确认
- 至少明确 1 条候选导入链路：`anima-base -> candidate -> human review -> approved`

当前状态：
- 已满足以上准入标准
- 已生成首批 seed 基线
- 已接入 `normal / decision` 模式切换、`extraContext` 注入与 `decisionTrace` 持久化
- 已完成 `15` 个真实问题对照评测，结果见 `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/docs/lingsi-eval-m4.md`
- 评测后已修正一轮匹配策略：补充关键触发词，并阻断仅凭泛标签的误命中


## Product State Pack

新增 `seeds/lingsi/decision-product-state.json`，用于沉淀当前版本的产品状态包，并作为决策 persona 的当前产品事实基线。

当前约束：
- `currentFocus / validatedDirections / knownRisks / nextDecisions / personaFocus` 仍由人工策展
- `version / updatedAt / completedChanges / evalSummary / dataSnapshot / docRefs` 由 `npm run lingsi:state-pack` 从 `docs/changelog.md`、评测报告与当前 seeds 基线自动刷新
- 发版时如果 LingSi 链路有改动，先同步 `docs/PROJECT.md`、`docs/ROADMAP.md`、`docs/changelog.md`，再运行 `npm run lingsi:state-pack`
- `npm run lingsi:refresh` 用于“状态包刷新 + seeds 刷新”的完整收口
