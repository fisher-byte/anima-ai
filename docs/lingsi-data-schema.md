# LingSi 数据 Schema

*最后更新: 2026-03-17 | 状态: M4 内部评测已完成*

---

## 目标

为 `LingSi` 决策版 MVP 定义稳定的数据层基线，确保后续的数据导入、决策模式接入、测试和代码审查都围绕同一组结构推进。

原则：
- 不 mock 正式证据
- 来源必须可追溯
- 首批数据支持“自动提候选 + 人工审核上线”
- 先服务 `Lenny`，但结构预留多 persona 扩展

---

## 存储文件

三份 LingSi 资产最终会存放在 SQLite `storage` 表中。

当前仓库内的基线 seed 文件已生成到：
- `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/seeds/lingsi/decision-personas.json`
- `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/seeds/lingsi/decision-source-manifest.json`
- `/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/evocanvas/seeds/lingsi/decision-units.json`

当前 seed 统计：
- `1` 个 persona
- `7` 条来源 manifest
- `13` 条 `approved` DecisionUnit

正式接入产品时，再由导入链路写入 SQLite `storage` 表。

| 文件名 | 用途 |
|------|------|
| `decision-personas.json` | 决策 persona 的轻量结构化描述 |
| `decision-units.json` | 可直接命中的决策证据单元 |
| `decision-source-manifest.json` | 从独立 `anima-base` 导入的来源清单 |

当前 `anima-base` 来源基线：
- 仓库路径：`/Users/zhiyangyu/Desktop/试验项目集合/自进化产品/anima-base`
- 仓库 commit：`17287af`

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
    "repoCommit": "17287af",
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

建议首批先从这些文件提候选：

- `people/product/lenny-rachitsky/frameworks/decision-making-frameworks.md`
- `people/product/lenny-rachitsky/frameworks/pmf-assessment.md`
- `people/product/lenny-rachitsky/frameworks/rice-prioritization-framework.md`
- `people/product/lenny-rachitsky/frameworks/saas-pricing-strategy-framework.md`
- `people/product/lenny-rachitsky/frameworks/growth-loops.md`
- `people/product/lenny-rachitsky/frameworks/cross-functional-alignment.md`
- `people/product/lenny-rachitsky/podcasts/2024-05-02-annie-duke.md`

建议优先覆盖的问题类型：
- PMF 判断
- 功能优先级
- 增长渠道选择
- 定价
- 职业路径与组织决策

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
