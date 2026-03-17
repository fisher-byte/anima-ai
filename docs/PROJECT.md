# Anima — 项目计划

> 唯一入口：每次发版、每次决策都在这里留记录。
> 最后更新：2026-03-17 | 当前版本：v0.5.18

---

## 当前冲刺

*新增冲刺：LingSi（灵思）决策版 MVP，`M4` 已完成，当前处于里程碑收口状态。*

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | 灵思文档定稿 | 已完成 | MVP 范围、证据门槛、SOP 节奏已对齐 |
| 2 | 真实证据层设计 | 已完成 | schema、共享类型、存储白名单、来源 manifest 已落地 |
| 3 | 首批 DecisionUnit 基线入库 | 已完成 | 已生成 `seeds/lingsi` 基线：2 personas / 33 sources / 53 approved units，并支持写入 storage |
| 4 | Lenny / 张小龙 决策模式接入 | 已完成 | 已接入 `normal / 灵思` 切换、extraContext 注入、decisionTrace 持久化，并按 persona 过滤命中结果 |
| 5 | 验证与对照 | 已完成 | 已跑 `15` 个真实问题对照，`decision` 赢 `15` 题，结果沉淀到 `docs/lingsi-eval-m4.md` |
| 6 | 脚注展示与决策轨迹 | 已完成 | AnswerModal 已展示当前对话的 DecisionUnit 命中、来源 locator/excerpt 与灵思证据面板 |
| 7 | 正文内脚注编号 | 已完成 | 回答正文首段已插入 `[1][2]...` 锚点，脚注面板可直接跳转到对应来源 |
| 8 | anima-base 增量评估与导入 | 已完成 | 已同步 `anima-base@851effb`，新增 Lenny / 张小龙最新决策案例，并把 LingSi 扩充到 33 sources / 53 approved units |
| 9 | SOP 闭环 | 已完成 | 本轮最新 source refresh 已完成文档同步、`npm test`、`npm run typecheck`、`npm run build`、`npm run test:e2e`、targeted `LINGSI_EVAL_CASE=pmf-before-growth` 验证、code review 与 GitHub 备份 |

---

## 当前冲刺（v0.5.16 已完成）

*范围从“单 Space 决策模式”推进到“主页入口可见 + 主页可调用 + 可回放”。*

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | Space 入口灵思标识 | 已完成 | 在主页左侧 Lenny / 张小龙入口直接标出 `灵思` 能力，降低 discoverability 成本 |
| 2 | 主页 `@` 支持灵思模式 | 已完成 | `@` 联想支持 `普通` / `灵思` persona suggestion，并把 mode 注入主页对话链路 |
| 3 | `@mention` 结构化 token 重构 | 已完成 | 主页 `@persona` 改成结构化 token，支持整块删除与稳定回退，不再依赖顶部 pill |
| 4 | 决策轨迹视图扩展 | 已完成 | `AnswerModal` evidence panel 扩成独立 trace 视图，支持 persona、mode、matched units、next actions、follow-up questions 回放 |
| 5 | SOP 闭环 | 已完成 | 已完成文档同步、code review、`npm test`、`npm run typecheck`、`npm run build`、`npm run test:e2e` 与 GitHub 备份 |

## 当前冲刺（v0.5.17 已完成）

*本轮把最新 Lenny / 张小龙来源同步进 LingSi，并补齐张小龙 persona 的 case-based eval 基线。*

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | 持续同步 anima-base 增量 | 已完成 | `anima-base` 已同步到 `851effb`，纳入最新 Lenny 定价 / GEM-DHM / PLG / discovery / activation / feedback 案例与张小龙小程序 / 开放平台材料 |
| 2 | Lenny / 张小龙 DecisionUnit 扩充 | 已完成 | `scripts/extract-lingsi-seeds.ts` 已扩到 `2 personas / 33 sources / 53 approved units`，其中 `lenny=34`、`zhang=19` |
| 3 | 张小龙 case-based eval 基线 | 已完成 | 新增 `npm run lingsi:evaluate:zhang`，输出 `docs/lingsi-eval-zhang.md` / `reports/lingsi-zhang-eval.json`，结果为 `decision 6 : normal 0 : tie 1` |
| 4 | SOP 闭环 | 已完成 | 已完成文档同步、code review、`npm run lingsi:extract`、`npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e` 与 GitHub 备份 |

## 当前冲刺（v0.5.18 已完成）

*本轮完成首页样式修复、onboarding 退出状态修复、Lenny 全量 eval 产物规范化，以及版本/发布文档收口。*

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | Lenny / 张小龙入口样式修复 | 已完成 | `Canvas.tsx` 调整 Space 卡片宽度与 badge 布局，`灵思` 标签不再挤压 Lenny 标题 |
| 2 | onboarding 退出状态修复 | 已完成 | `closeModal` 现在会退出 onboarding mode，清空 phase / resume residue，并避免把 onboarding 历史写入普通对话历史 |
| 3 | 遗留 eval 产物规范化 | 已完成 | 重新生成 `docs/lingsi-eval-m4.md` / `reports/lingsi-m4-eval.json`，当前 Lenny 基线为 `decision 14 : normal 1` |
| 4 | 发布收口 | 已完成 | 已完成版本号同步、文档同步、full test / typecheck / build / e2e、code review、GitHub 备份与服务器部署验证 |

## 下一阶段（v0.5.19 计划）

*继续把 persona 评测体系和主页决策调用做得更稳。*

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1 | 主页 `@` 决策轨迹沉淀 | 待做 | 主页通过 `@persona` 触发的对话继续强化 trace 对照与历史复盘 |
| 2 | persona case-based eval 扩展 | 待做 | 在张小龙基线之外继续扩更多 persona / 更多题型，逐步从单次报告走向稳定评测套件 |
| 3 | 持续同步 anima-base 增量 | 待做 | 保持 `anima-base` 独立仓库持续同步，优先筛选高价值 Lenny / 张小龙决策案例进入人工审核链路 |
| 4 | 决策轨迹视图增强 | 待做 | 把 trace 里的 next actions / follow-up questions / evidence 对照做得更适合复盘 |


### 范围判断

- `Space 入口灵思标识`：低风险 UI 改动，先做。
- `主页 @ 支持灵思模式`：中风险，需要把当前基于纯文本替换的 mention 机制升级成结构化 token；否则无法稳定支持 mode 和整块删除。
- `决策轨迹视图扩展`：中风险，主要是 UI/信息架构，不应和发送链路耦合改动过深。
- `张小龙 DecisionUnit 扩充`：低风险数据层工作，但要继续坚持“自动提候选 + 人工审核上线”。

## 设计原则（不可妥协）

> **克制即美。** 每个元素都要赚到自己存在的理由。

1. **不打扰**：默认状态下画布应该安静，用户想找信息时才呈现信息
2. **极简**：不随便加元素；加之前问"去掉会怎样"
3. **一致**：同一类信息用同一种视觉语言，不混用颜色/字号/样式
4. **层级清晰**：主体（节点内容）> 辅助（连线）> 装饰（动画），优先级从不混淆

**参考标准**：微信 — 极致不打扰，但给你需要的；苹果 — 每个像素都有理由

---

## 视觉规范（当前版本）

### 节点卡片
- 背景：`rgba(255,255,255,0.92)` 纯白，不涂分类色
- 边框：`border-gray-100/80` 极淡，hover 时略深
- 阴影：`shadow-[0_2px_12px_rgba(0,0,0,0.05)]`，极淡
- **分类标识**：左侧 3px 竖条，颜色取 `node.color`（opacity 0.7），紧贴左边框内侧
- 分类文字：`text-[10px] text-gray-400/70`，不加粗，不全大写

### 连线
- **所有连线**：`stroke="rgba(0,0,0,1)"`，仅用 `strokeOpacity` 区分强弱
- branch：`opacity 0.04–0.14`，最淡，表达层级
- semantic：`opacity 0.05–0.18`，权重越高越可见
- logical：`opacity 0.06–0.16`，置信度越高越可见
- **无 hover 标签，无点击面板，无颜色区分**

### MemoryLines（记忆引用虚线）
- 颜色来自节点分类颜色映射表（`CATEGORY_LINE_COLORS`），饱和度 70%
- `strokeWidth: 1.5`，`strokeDasharray: "6 5"`
- 仅在输入框有内容时显示

---

## 优先级队列

### P0（阻塞用户）
- 无当前 P0

### P1（核心体验）
| 任务 | 文件 | 说明 |
|------|------|------|
| 静默吞错改善 | `canvasStore.ts`, `Canvas.tsx` | `endConversation` catch → `lastError` → Canvas toast ✅ v0.2.56 |
| 节点虚拟化 | `Canvas.tsx` | viewport culling，80+ 节点时生效 ✅ v0.2.56 |
| 主页 `@` 决策调用沉淀 | `InputBox.tsx`, `AnswerModal.tsx`, `canvasStore.ts` | 已支持主页 `@persona〔普通/灵思〕` 调用，但 trace 对照和历史复盘还可以继续增强 |

### P2（体验优化）
| 任务 | 说明 | 状态 |
|------|------|------|
| prompt.ts 僵尸文件清理 | 删除或合并，消除双路径维护隐患 | ✅ v0.2.59 已完成 |
| 节点布局算法 | 新节点生成位置避免重叠（当前是随机偏移） | 待做 |
| `@` 联想双层选择 | 在不增加过多噪音的前提下，让用户在 `@persona` 时可切换 `普通 / 灵思` | ✅ v0.5.16 已完成 |

### P3（未来方向）
| 阶段 | 内容 | 状态 |
|------|------|------|
| B：记忆系统升级 | 结构化用户模型（User Mental Model）+ 主动记忆触发 + 跨节点推理 | ✅ v0.2.59 B1 完成 / v0.2.66 B2 完成 / v0.2.67 B3 完成 |
| C：交互范式升级 | 时间轴视图 + 话题聚焦模式 + 主动对话（Proactive AI）| ✅ v0.2.68 C1 完成 / v0.2.69 C2 完成 / v0.2.70 C3 完成 |
| D：平台化 | 多模型路由 + 插件/工具系统 | 待做 |

---

## 已完成版本

| 版本 | 日期 | 核心内容 |
|------|------|----------|
| v0.5.18 | 2026-03-17 | 稳定性与发布收口：修复 Lenny 入口 `灵思` badge 挤压样式、修复 onboarding 关闭后仍残留教程模式、重新规范化 Lenny/张小龙 eval 产物，并完成版本号/文档/SOP/部署同步 |
| v0.5.17 | 2026-03-17 | LingSi latest source sync + 张小龙基线评测：同步 `anima-base@851effb`，把 seeds 扩到 `2 personas / 33 sources / 53 approved units`，新增 `npm run lingsi:evaluate:zhang`，完成张小龙 case-based eval 基线 `decision 6 : normal 0 : tie 1` |
| v0.5.16 | 2026-03-17 | LingSi 主页接入：主页 Space 入口新增 `灵思` 标识，`@persona` 支持 `普通 / 灵思` 结构化 mention token 与整块删除，AnswerModal 新增独立决策轨迹视图，并把主页 persona 调用接入统一 decisionTrace 链路 |
| v0.5.15 | 2026-03-17 | LingSi 最新数据层 refresh：同步 `anima-base@eb83d12`，新增 8 条真实来源，把 seeds 扩到 25 sources / 41 approved units，覆盖 Lenny 留存优先、风险 rollout、设计评审，以及张小龙运营克制、功能生命周期、社交设计、平台治理 |
| v0.5.14 | 2026-03-17 | LingSi 多 persona 扩展：同步 `anima-base@65ca4c7`，新增张小龙 persona、6 条真实来源、8 条 approved units，并在张小龙 Space 接入 `normal / 灵思` 模式 |
| v0.5.13 | 2026-03-17 | 灵思数据层扩充：从最新 `anima-base` 导入 4 条高价值 Lenny 来源，把种子库扩到 11 sources / 20 approved units，覆盖 PMF 案例、路线图、决策不确定性与职业决策 |
| v0.5.12 | 2026-03-17 | 灵思正文脚注：在回答正文插入 `[1][2]` 锚点，并完成 anima-base 远端增量价值评估，锁定下一轮高价值来源 |
| v0.5.11 | 2026-03-17 | 灵思证据展示：AnswerModal 新增脚注与决策轨迹面板，展示 DecisionUnit 命中和真实来源摘录 |
| v0.5.10 | 2026-03-17 | 稳定性补丁：修复 Lenny/Custom Space 切换残留 onboarding 状态；清理失效本地 token 以恢复浏览器真实提问链路 |
| v0.5.4 | 2026-03-14 | bootstrap-facts 幂等判断修复：改用 agent_tasks.payload.conversationId，彻底消除重复入队 |
| v0.5.3 | 2026-03-14 | UI/UX polish：悬浮 pill 侧边栏、@mention pill chip、文件下载、头像统一、设置菜单重命名 |
| v0.5.2 | 2026-03-14 | Space 向量索引全量补全；custom space convSource 修复；bootstrap-facts API |
| v0.5.1 | 2026-03-14 | embedding 共享库提取（消除三处重复）；Space 文件列表；张/王头像统一；+5 embedding 单元测试 |
| v0.5.0 | 2026-03-13 | 代码 AI 友好重构：intentDetector 提取 + PublicSpaceCanvas 统一四个 Space 组件 |
| v0.2.74 | 2026-03-09 | 多 token 登录 403 修复：鉴权对 token 做 trim；部署脚本支持 SYNC_ENV=1 同步 .env；服务器多 token 须配置 ACCESS_TOKENS |
| v0.2.71 | 2026-03-08 | Code Review 修复：C3 token/TimelineView碰撞/focusedCategory重置/B2防卫；新增 46 测试（共 345） |
| v0.2.70 | 2026-03-08 | C3 主动对话 — 距上次对话 >24h 时主动弹出 Toast 提醒 |
| v0.2.69 | 2026-03-08 | C2 话题聚焦模式 — 点击 ClusterLabel 聚焦分类，其余节点淡出 |
| v0.2.68 | 2026-03-08 | C1 时间轴视图 — 工具栏 Clock 按钮切换节点时间轴排列 |
| v0.2.67 | 2026-03-08 | B3 跨节点推理 — System Prompt Layer 2.7 注入 logical_edges 逻辑脉络 |
| v0.2.66 | 2026-03-08 | B2 主动记忆触发 — 对话结束后 10min 冷却自动入队 extract_mental_model |
| v0.2.65 | 2026-03-08 | 初始加载重叠检测后自动 kick，坐标已分散时不重排 |
| v0.2.64 | 2026-03-08 | 冷启动冻结布局力（TEMPERATURE_INIT=0）+ 公转增强（torque 3x） |
| v0.2.63 | 2026-03-08 | 彻底修复画布拖拽/缩放闪回 + 节点拖不动 + 星云标签卡顿 |
| v0.2.62 | 2026-03-08 | 力模拟引擎（两层力系统 + 公转）+ 拖拽推挤 + 渲染架构重构 |
| v0.2.61 | 2026-03-08 | 全量 bug review 修复：processTask 超时/needsRelayout 越界判断/dedup 匹配/placeholder 清理 |
| v0.2.60 | 2026-03-07 | Code Review 修复：层级排序/刷新轮询/JSON校验/触发上限/DB DEFAULT |
| v0.2.59 | 2026-03-07 | B1 结构化心智模型 + P2 prompt.ts 清理 |
| v0.2.58 | 2026-03-07 | 分类系统升级：原型向量 embedding + detectIntent 全量计分 |
| v0.2.57 | 2026-03-07 | code review 修复：viewport 公式、mouseup 泄露、detectIntent 全面迭代、error surface |
| v0.2.56 | 2026-03-07 | 节点物理感 + 视口裁剪 + 静默吞错 toast + 分类重识别接口 |
| v0.2.55 | 2026-03-07 | 极简视觉重设计（连线统一黑色 + 节点纯白 + 左侧 accent 条） |
| v0.2.53 | 2026-03-07 | MemoryLines 语义化颜色 + 逻辑边入场动画 |
| v0.2.52 | 2026-03-07 | 逻辑边 bug 修复 + 节点碰撞检测 + Ghost Text + ThinkingSection 分阶段 |
| v0.2.51 | 2026-03-07 | 代码质量重构：大文件拆分，289/289 测试 |
| v0.2.49–50 | 2026-03-07 | Edge 白色毛玻璃重设计 + 逻辑边去重 |
| v0.2.48 | 2026-03-07 | 连线可解释性 + L3 逻辑边提取（6色系统） |
| v0.2.47 | 2026-03-07 | Embedding 内置化 + 语义边 + 多模态 |
| v0.2.45 | — | 新手引导全链路 + 对话历史持久化 |

---

## 技术债清单

| 问题 | 优先级 | 状态 |
|------|--------|------|
| 节点无虚拟化（80+ 帧率下降） | P1 | ✅ v0.2.56 viewport culling |
| 静默吞错（AI/存储失败无感知） | P1 | ✅ v0.2.56 toast 提示 |
| prompt.ts 僵尸文件 | P2 | ✅ v0.2.59 已删除 |
| E2E token 污染用户库 | P0 | ✅ v0.2.54 已修复 |
| 语义边/逻辑边视觉混乱 | P1 | ✅ v0.2.55 极简重设计 |
| 心智模型层级优先级错误（静态摘要挤占动态事实 budget）| P1 | ✅ v0.2.60 已修复 |
| 刷新按钮无后置轮询（用户看不到更新结果） | P2 | ✅ v0.2.60 已修复 |
| agentWorker 无任务超时（单任务阻塞整个 tick）| P1 | ✅ v0.2.61 Promise.race 30s 超时 |
| needsRelayout 触发条件误判合法边缘节点 | P1 | ✅ v0.2.61 改为严格越界判断 |
| dedup keep 严格匹配导致事实静默丢失 | P2 | ✅ v0.2.61 双层匹配修复 |
| 原型向量部分初始化时完全降级 | P2 | ✅ v0.2.61 >=4 即启用 |
| rule dedup r.preference 可能 undefined | P2 | ✅ v0.2.61 防御性修复 |
| 刷新失败无提示（用户无法感知操作结果） | P2 | ✅ v0.2.60 patch 已修复 |
| agentTasks model_json 被 LLM 额外字段污染 | P2 | ✅ v0.2.60 patch 已修复 |
| 幂等去重未排除 running 状态（极端并发两次提炼）| P2 | ✅ v0.2.60 patch 已修复 |
| 节点拖拽后闪回原位（force sim 内部坐标未同步）| P0 | ✅ v0.2.63 updateSimNode API |
| 画布平移/缩放闪回（isDragging state 触发重渲染）| P0 | ✅ v0.2.63 改用 ref + isLocalWriteRef |
| 星云标签拖拽卡顿（90帧 store 延迟）| P1 | ✅ v0.2.63 force sim 每帧直写 DOM |
| 初始加载节点重叠（冷启动不触发布局力）| P1 | ✅ v0.2.65 重叠检测后自动 kick |
| C3 token 获取用 window hack（脆弱）| P1 | ✅ v0.2.71 改用 getAuthToken() |
| TimelineView 同日期多节点叠在一起 | P1 | ✅ v0.2.71 动态行高 + 垂直堆叠 |
| closeModal 未清空 focusedCategory | P2 | ✅ v0.2.71 closeModal + clearAllForOnboarding 同步清空 |
| B2 updated_at Invalid Date 未防卫 | P2 | ✅ v0.2.71 isNaN 防卫 |
| 多 token 服务器登录 403（.env 未同步 / token 首尾空格）| P1 | ✅ v0.2.74 鉴权 trim + 部署 SYNC_ENV 同步 .env |
| persistCluster 逐个写文件（N 次 JSON 序列化）| P1 | ⏳ 待优化 |
| flushToStore 未注册 beforeunload（关页面丢失偏移）| P2 | ⏳ 待修复 |
| 力计算 O(N²) 未利用牛顿第三定律减半 | P2 | ⏳ 待优化（<60 节点暂无影响）|

---

## 决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-03-17 | 主页 `@` 若要支持 `灵思` mode，必须把 mention 从纯文本替换升级成结构化 token | 当前 `InputBox.tsx` 依赖 `@name` 字符串与额外 pill，同步删除和 mode 表达都不稳定，继续叠逻辑只会积累状态 bug |
| 2026-03-17 | Space 入口必须直接标明是否支持 `灵思` | 决策能力是关键差异点，不应要求用户进入 Space 后才发现 |
| 2026-03-17 | 决策轨迹从“证据面板”升级为“独立视图” | 现有面板适合看脚注，不足以支持回放、复盘和后续对照评测 |
| 2026-03-17 | 张小龙 persona 下一轮优先扩“运营克制/功能生命周期/社交设计/平台治理” | `anima-base@eb83d12` 新增 `case-18`~`case-21`，正好覆盖这四个高价值决策面 |
| 2026-03-17 | persona 评测从单一 Lenny 扩到张小龙 case-based baseline | 当第二 persona 已进入真实产品链路后，评测必须按 persona 分层，避免只用 Lenny 基线判断效果 |
| 2026-03-16 | 灵思 MVP 先只做 Lenny，不同步扩展多 persona | 单点打透证据层和交互链路，减少范围扩散 |
| 2026-03-17 | 第二个 persona 先扩张到张小龙，并保持 `anima-base` 持续同步 | 张小龙在产品原则、社交增长、克制商业化上有高价值差异，且最新 base 已有成型案例库 |
| 2026-03-16 | 灵思 MVP 支持泛决策，但证据不足时只给初步倾向 | 问题范围可以广，但证据门槛不能虚 |
| 2026-03-16 | 首批 DecisionUnit 采用“自动提候选 + 人工审核上线” | 兼顾速度与可信度，避免把抽取草稿直接暴露给用户 |
| 2026-03-16 | `anima-base` 保持独立仓库，只拷必要子集进入主项目 | 降低主仓库噪音，保留来源真相库的独立演进能力 |
| 2026-03-16 | 灵思按里程碑走 SOP，而不是每个小 patch 都走完整发布流程 | 控制节奏，同时保证每个阶段都有文档、测试和 review 闭环 |
| 2026-03-08 | 力模拟引擎纯 TS 实现（不引入 d3）| 零依赖，完全控制力参数；d3-force 打包体积大且 API 不适合 DOM-direct 渲染模式 |
| 2026-03-08 | force sim 只写 DOM，不写 Zustand store | 写 store 触发 React 重渲染，motion.div 读 store 坐标会覆盖 DOM，产生闪回；DOM 直写每帧 60fps，store 每 90 帧低频同步一次 |
| 2026-03-08 | 初始温度为 0，不做开场重排 | 用户已手动摆好布局，不应每次刷新都重排；只在检测到重叠时才自动 kick |
| 2026-03-07 | 去掉逻辑边六色和语义边紫色虚线 | 颜色叠加造成视觉噪音；用户看到的是混乱不是信息；连线存在本身已传达"有关联"，颜色无法承载额外价值 |
| 2026-03-07 | 节点背景改纯白 + 左侧 accent 色条 | 苹果/微信设计哲学：主体保持中性，分类用极细线索暗示而非整块涂色 |
| 2026-03-07 | 建立 PROJECT.md 作为唯一项目入口 | ROADMAP.md 偏路线图，changelog.md 偏历史，需要一个当前状态 + 优先队列的聚焦视图 |
| 2026-03-07 | 心智模型层 2.5 放在层 3 之后 | 动态 memory_facts 与当前对话相关性更高，应优先占用 CONTEXT_BUDGET；静态心智模型摘要是补充信息，不应挤占动态内容 |
| 2026-03-07 | 自动触发上限设为 5 次（100 facts）| 100 条事实后心智模型已趋于稳定，继续触发 ROI 低；用户可手动刷新触发重提炼 |
| 2026-03-08 | B2 冷却 10min 而非立即触发 | 避免连续多轮对话每条都触发 extract_mental_model，10min 冷却确保话题收尾后再提炼 |
| 2026-03-08 | Layer 2.7 只取当前 conversationId 的直接边（top 5，confidence≥0.6）| 全量边注入 token 开销过大；直接边相关性最高，且受 CONTEXT_BUDGET 保护 |
| 2026-03-08 | TimelineView contentLayer display:none 而非 unmount | 保留 force sim 状态，切换回画布视图时无需重初始化，消除回切闪烁 |
| 2026-03-08 | C3 使用 sessionStorage 而非 localStorage | sessionStorage 让每次重新打开 App 都有机会看到主动提醒；localStorage 会永久屏蔽（违背产品设计意图） |
| 2026-03-09 | 鉴权用请求 token 的 trim 结果比较 | 复制粘贴或 .env 换行导致首尾空格时不再 403；userId 以 trim 后 token 派生 |
| 2026-03-09 | 部署脚本不打包 .env，可选 SYNC_ENV=1 同步 | 安全考虑默认不传 .env；多 token 时执行 SYNC_ENV=1 bash docs/scripts/deploy.sh 将本地 .env 上传并重启 |
