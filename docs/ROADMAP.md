# Anima 更新路线图

## 计划中版本

#### v0.5.23 - Decision trace visibility + modal usability（已完成）
- [x] `types.ts` / `lingsiDecisionEngine.ts`：`DecisionTrace` 增加 `productStateUsed / productStateDocRefs`，主页 `@persona` 决策回答即使主要依赖产品状态包，也能稳定显示轨迹
- [x] `AnswerModal.tsx` / `AnswerModalSubcomponents.tsx`：轨迹面板支持展示产品状态包来源
- [x] `AnswerModal.tsx` / `AnswerModalSubcomponents.tsx`：底部输入框支持 auto-grow，长文本粘贴后先扩高再滚动
- [x] `AnswerModal.tsx`：顶部新增拖拽手柄，允许调整对话窗口高度并持久化
- [x] 验证：`npm run typecheck`、`npx vitest run src/shared/__tests__/lingsiDecisionEngine.test.ts src/renderer/src/components/__tests__/AnswerModalSubcomponents.test.tsx`、`npm test`（606/606）、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）

#### v0.5.21 - Decision state refresh + source sync + deploy verification（已完成）
- [x] `scripts/generate-lingsi-product-state.ts` / `src/shared/lingsiProductState.ts`：新增产品状态包自动刷新链路，从 `changelog`、eval 报告和当前 seeds 基线生成动态字段
- [x] `package.json`：新增 `npm run lingsi:state-pack` 与 `npm run lingsi:refresh`，把状态包刷新纳入 LingSi 标准收口命令
- [x] `decision-product-state.json` / `lingsiDecisionEngine.ts`：状态包新增 `dataSnapshot`，决策 persona 能看到当前 `personas / sources / approved units / unitsByPersona / animaBaseHead`
- [x] `anima-base`：同步到 `083974d`；最新 upstream 增量为王慧文材料，本轮确认无新的 Lenny / 张小龙来源需要并入，LingSi seeds 维持 `2 personas / 37 sources / 59 approved units`
- [x] `docs/scripts/deploy.sh`：发布后健康检查改为验证服务器内网 `127.0.0.1:3001` 与线上域名，修复 `HTTP 状态: 000` 假阴性
- [x] 验证：`npm run lingsi:state-pack`、`npm run lingsi:extract`（`Files changed: 0`）、`npm run lingsi:evaluate`（`decision 15 : normal 0`）、`npm run lingsi:evaluate:zhang`（`decision 6 : normal 0 : tie 1`）、`npm test`（604/604）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）、deploy

#### v0.5.20 - Product state pack + decision context sync（已完成）
- [x] `seeds/lingsi/decision-product-state.json`：新增结构化产品状态包，沉淀当前版本、完成项、风险、评测结果与待决策
- [x] `constants.ts` / `main/index.ts` / `lingsiSeedData.ts` / `services/lingsi.ts`：把 `decision-product-state.json` 接入 storage 白名单、bundled seed 与首次写入/读取链路
- [x] `lingsiDecisionEngine.ts`：新增“当前项目问题”识别与状态包注入逻辑；仅对 `Anima / 首页 / @ / 轨迹 / 决策模式` 等当前项目问题注入，避免污染泛问题
- [x] `lingsi.test.ts` / `lingsiDecisionEngine.test.ts` / `lingsiProductState.test.ts`：补充状态包注入、过滤与 seed 基线测试
- [x] 验证：`npm run lingsi:extract`（`2 personas / 37 sources / 59 approved units`）、`npm run lingsi:evaluate`（`decision 15 : normal 0`）、`npm run lingsi:evaluate:zhang`（`decision 6 : normal 0 : tie 1`）、`npm test`（597/597）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）、deploy

#### v0.5.19 - Decision UX + flywheel + latest source sync（已完成）
- [x] `Canvas.tsx`：首页 Lenny / 张小龙卡片改为 badge 绝对定位，标题完整显示，不再被 `决策` 标签挤压或截断
- [x] `InputBox.tsx` / `inputMentions.ts`：主页 `@persona` 对支持决策的 persona 改成 decision-only suggestion，不再暴露普通模式；token 文本保持纯 `@名字`
- [x] `zh.ts` / `en.ts`：前端用户可见文案从 `灵思` 统一为 `决策`，降低认知成本；系统内部仍保留 `LingSi` 工程名
- [x] `AnswerModalSubcomponents.tsx` / `AnswerModal.tsx`：`查看轨迹` 在流式输出期间禁用，trace modal 改为 portal 渲染并移除嵌套 button，修复页面卡死问题
- [x] `anima-base`：同步到 `a6c1078`，纳入最新 Lenny `ai-evals-framework` / `product-velocity-framework` 与张小龙 `2012-wechat-product-philosophy-speech` / `talk-wxg-leadership-2016`
- [x] `scripts/extract-lingsi-seeds.ts`：新增 4 条 source manifest 与 6 条 approved units，把 seeds 刷新为 `2 personas / 37 sources / 59 approved units`
- [x] `docs/lingsi-flywheel.md`：新增产品飞轮文档，定义产品状态包、persona 消费策略、人工审核与评测闭环
- [x] 验证：`npm run lingsi:extract`（`2 personas / 37 sources / 59 approved units`）、`npm run lingsi:evaluate`（`decision 14 : normal 1`）、`npm run lingsi:evaluate:zhang`（`decision 6 : normal 0 : tie 1`）、`npm test`（593/593）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）、deploy

#### v0.5.18 - LingSi stability + release sync（已完成）
- [x] `Canvas.tsx`：修复首页 Lenny / 张小龙 Space 入口中 `决策` badge 挤压标题的问题
- [x] `canvasStore.ts` / `canvasStore.lennyMode.test.ts`：关闭 onboarding 弹层时退出教程模式，清空 phase / resume residue，并避免把 onboarding 历史写入普通对话历史
- [x] `docs/lingsi-eval-m4.md` / `reports/lingsi-m4-eval.json`：重新生成 Lenny 全量评测产物，当前结果 `decision 14 : normal 1`
- [x] 版本与发布同步：`package.json` / `APP_VERSION` / active docs / SOP / deployment docs 已统一到 `v0.5.18`
- [x] 验证：`npm run lingsi:extract`（Files changed: 0）、`npm run lingsi:evaluate`（`decision 14 : normal 1`）、`npm run lingsi:evaluate:zhang`（`decision 6 : normal 0 : tie 1`）、`npm test`（589/589）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）

#### v0.5.17 - LingSi latest source sync + 张小龙 case-based eval（已完成）
- [x] `anima-base`：同步到 `851effb`，纳入最新 Lenny 定价 / GEM-DHM / PLG / discovery / activation / feedback 案例与张小龙小程序 / 开放平台材料
- [x] `scripts/extract-lingsi-seeds.ts`：新增 8 条 source manifest 与 12 条 approved units，把 seeds 刷新为 `2 personas / 33 sources / 53 approved units`
- [x] `scripts/evaluate-lingsi.ts` / `package.json`：新增 persona-scoped 张小龙评测入口 `npm run lingsi:evaluate:zhang`，输出 `docs/lingsi-eval-zhang.md` / `reports/lingsi-zhang-eval.json`
- [x] `lingsiSeeds.test.ts` / `lingsiDecisionEngine.test.ts`：更新数量基线，并补充 Lenny PLG/TTV 与张小龙场景入口命中断言
- [x] 验证：`npm run lingsi:extract`、`LINGSI_EVAL_PERSONA=zhang npm run lingsi:evaluate`（`decision 6 : normal 0 : tie 1`）、`npm test`（588/588）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）

#### v0.5.16 - LingSi 主页入口 + @mention 重构（已完成）
- [x] `Canvas.tsx`：在主页左侧 Space 入口直接标识哪些 persona 支持 `决策`
- [x] `InputBox.tsx`：主页 `@` 联想支持 persona mention，并可走决策模式
- [x] `InputBox.tsx` / `canvasStore.ts`：把当前 `@name + pill` 模式重构为结构化 mention token，支持整块删除与稳定回退
- [x] `AnswerModal.tsx` / `AnswerModalSubcomponents.tsx`：把当前 evidence panel 扩成独立“决策轨迹视图”，支持 `personaId / mode / matchedDecisionUnitIds / sourceRefs` 回放
- [x] 持续同步 `anima-base` 最新高价值案例到人工审核链路
- [x] 验证：`npm run lingsi:extract`、`npm run lingsi:evaluate`、`npm test`、`npm run typecheck`、`npm run build`、`npm run test:e2e`

## 已完成版本

#### v0.5.15 - LingSi 最新数据层 refresh（已完成）
- [x] `anima-base`：同步到 `eb83d12`，纳入 Lenny 最新留存/rollout/设计评审案例与张小龙最新运营/社交/治理案例
- [x] `scripts/extract-lingsi-seeds.ts`：新增 8 条 source manifest 与 13 条 approved units
- [x] `seeds/lingsi/*`：刷新为 `2 personas / 25 sources / 41 approved units`
- [x] `lingsiSeeds.test.ts` / `lingsiDecisionEngine.test.ts`：更新基线并补充 Lenny 留存、张小龙运营克制命中断言
- [x] 验证：`npm run lingsi:extract`、`npm test`（577/577）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）、`LINGSI_EVAL_CASE=pmf-before-growth npm run lingsi:evaluate`

#### v0.5.14 - LingSi 张小龙 persona + anima-base 同步（已完成）
- [x] `anima-base`：同步到 `65ca4c7`，纳入张小龙首批 `decision-cases` / `frameworks` 增量
- [x] `scripts/extract-lingsi-seeds.ts`：从单 persona 扩展到多 persona，新增 `zhang` persona、6 条来源、8 条 approved units
- [x] `AnswerModal.tsx` / `canvasStore.ts` / `PublicSpaceCanvas.tsx`：张小龙 Space 接入 `normal / decision` 模式切换与 `decisionTrace.personaId` 持久化
- [x] `scripts/evaluate-lingsi.ts`：Lenny 评测改为 persona scoped，避免被张小龙 units 污染
- [x] 验证：`npm run lingsi:extract`、`npm test`（575/575）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）

#### v0.5.13 - LingSi anima-base 数据扩充（已完成）
- [x] `scripts/extract-lingsi-seeds.ts`：接入 `case-01-superhuman-pmf-survey-decision.md`、`product-roadmap-planning-framework.md`、`uncertainty-decision-framework.md`、`pm-career-path-decision-framework.md`
- [x] 新增 7 条 `DecisionUnit`，覆盖 PMF 分层、50/50 路线图、solution deepening、goals-first roadmap、不确定性决策、PM 职业决策
- [x] `seeds/lingsi/*`：刷新为 `1 persona / 11 sources / 20 approved units`，来源 commit 更新到 `anima-base@4d27b3b`
- [x] `lingsiSeeds.test.ts`：更新数据基线断言，确保 manifest / unit 数量与最新种子一致
- [x] 验证：`npm run lingsi:extract`、`npm run lingsi:evaluate`（`decision 15 : normal 0`）、`npm test`（571/571）、`npm run typecheck`、`npm run build`、`npm run test:e2e`（44 passed / 4 skipped）

#### v0.5.12 - LingSi 正文脚注 + anima-base 增量筛选（已完成）
- [x] `lingsiTrace.ts`：把来源脚注编号插入回答正文首个自然段，并避免重复插入
- [x] `AnswerModalSubcomponents.tsx`：脚注面板来源项增加锚点 id，支持正文编号跳转
- [x] 核查 `anima-base origin/main` 新增 `12` 个提交，确认以下文件值得纳入下一轮数据层补充：
  - `people/product/lenny-rachitsky/decision-cases/case-01-superhuman-pmf-survey-decision.md`
  - `people/product/lenny-rachitsky/articles/uncertainty-decision-framework.md`
  - `people/product/lenny-rachitsky/frameworks/product-roadmap-planning-framework.md`
  - `people/product/lenny-rachitsky/articles/pm-career-path-decision-framework.md`
- [x] 下一轮数据层：已把上述高价值材料转成新的 `DecisionUnit` / `source manifest` 条目

#### v0.5.11 - LingSi 证据展示层（已完成）
- [x] `AnswerModal.tsx`：根据 `decisionTrace` 展示当前对话的灵思证据面板
- [x] `AnswerModalSubcomponents.tsx`：新增 `LingSiTracePanel`，展示 DecisionUnit 命中与 `sourceRefs.locator / excerpt`
- [x] `lingsiTrace.ts`：抽出来源标签与 DecisionUnit 标题解析，避免 UI 内联硬编码
- [x] 验证：`npm test` 569/569、`npm run typecheck`、`npm run build`、`npm run test:e2e`（45 passed / 3 skipped）

#### v0.5.10 - LingSi 稳定性补丁（已完成）
- [x] `App.tsx`：启动时修复失效 `anima_user_token`，默认库已配置可用 key 时自动回退，恢复浏览器真实提问链路
- [x] `canvasStore.ts`：切换 Lenny / PG / 张 / 王 / Custom Space 时清空 onboarding residue、modal、当前对话和历史，避免状态串扰
- [x] 新增 `appToken.test.ts` 与 Space 状态回归测试
- [x] 验证：`npm test` 566/566、`npm run typecheck`、`npm run build`、`npm run test:e2e`（45 passed / 3 skipped）

#### v0.5.5 - LingSi 决策版 MVP（里程碑收口）
- [x] 文档定稿：`初步决策系统MVP设计(1).MD`、`docs/PROJECT.md`、`docs/ROADMAP.md`、`docs/sop-release.md`
- [x] 数据层：新增 `decision-units.json`、`decision-personas.json`、`decision-source-manifest.json` 白名单与 schema
- [x] 来源策略：`anima-base` 保持独立仓库，首批仅导入必要子集，记录来源文件与 commit
- [x] 证据标准：每个核心判断至少 1 条真实来源线索，整条回答最多 3–5 个脚注
- [x] 首批 seeds：生成 `seeds/lingsi/decision-personas.json`、`seeds/lingsi/decision-source-manifest.json`、`seeds/lingsi/decision-units.json`
- [ ] 生成策略：补齐“自动提候选 + 人工审核上线”链路到可持续流程
- [x] 交互：Lenny Space 增加 `normal / decision` 模式切换；Space 打开时自动补齐 LingSi seed 资产
- [x] 持久化：对话记录增加 `mode`、`matchedDecisionUnitIds`、`sourceRefs`
- [x] 请求链路：`extraContext` 可与 `systemPromptOverride` 共存，决策证据可进入服务端上下文
- [x] 验证：`15` 个真实问题对照测试已完成，`decision` 赢 `15` 题；详见 `docs/lingsi-eval-m4.md`
- [x] 匹配修正：补充 `segment / growth / DACI / two-way-door` 触发词，并阻断仅靠泛标签的误命中
- [x] 交付节奏：按里程碑执行文档同步、测试、code review、GitHub 备份

#### v0.5.4 - bootstrap-facts 幂等修复（已完成）
- [x] `memory.ts`：幂等判断改为基于 `agent_tasks.payload.conversationId`，不再重复入队历史对话
- [x] `enqueueTask` 调用补充 `conversationId` 字段
- [x] 服务器验证：queued=0，全部 23 条历史对话已处理
- [x] vitest 522/522 | tsc 0 errors

#### v0.5.3 - UI/UX polish batch（已完成）
- [x] `Canvas.tsx`：侧边栏折叠后改为悬浮 pill 卡片（L/PG 头像 + Spaces 文字 + chevron）
- [x] `Canvas.tsx`：张/王侧边栏头像统一为 bg-gray-900（原为蓝/绿）
- [x] `InputBox.tsx`：@mention 选中后显示 indigo pill chip，含删除按钮
- [x] `FileBrowserPanel.tsx`：文件下载按钮（auth-aware fetch+blob 方式）
- [x] i18n：'偏好设置'→'设置' / 'Preferences'→'Settings'
- [x] vitest 522/522 | tsc 0 errors

#### v0.5.2 - Space 向量索引全量补全（已完成）
- [x] `memory.ts`：custom space convSource 修复（`custom-{id}` 不再降级为 `lenny`）
- [x] `POST /api/memory/bootstrap-facts`：历史对话记忆提取 + 向量索引幂等补全
- [x] vitest 522/522 | tsc 0 errors

#### v0.5.1 - embedding 共享库 + Space 文件列表 + 头像统一（已完成）
- [x] 新建 `src/server/lib/embedding.ts`：cosineSim / fetchEmbedding / embedTextWithUserKey 等共享函数
- [x] `memory.ts` / `ai.ts`：删除 ~140 行重复实现，从 lib import
- [x] `PublicSpaceCanvas.tsx`：新增文件库 FileBrowserPanel 入口
- [x] 张/王 SpaceCanvas：avatarBg 统一为 gray-900
- [x] 新增 5 个 embedding 单元测试
- [x] vitest 522/522 (+5) | tsc 0 errors

#### v0.5.0 - 代码 AI 友好重构 + SpaceCanvas 统一组件（已完成）
- [x] 新建 `intentDetector.ts`：从 canvasStore 提取 detectIntent 六类关键词体系为独立纯函数
- [x] `canvasStore.ts`：内联 100 行分类逻辑缩减为 3 行委托调用，文件从 2357 行降至 2245 行
- [x] 新建 `PublicSpaceCanvas.tsx`（978 行）：统一 Lenny/PG/Zhang/Wang 四个画布，差异由 SpaceConfig 配置
- [x] Lenny/PG/Zhang/WangSpaceCanvas.tsx：从 ~880 行降至 45 行薄包装
- [x] docs：testing.md/dev-guide.md/architecture.md/README.md/changelog.md 版本号同步 v0.5.0

#### v0.4.9 - 跨空间记忆同步全覆盖 + Skills 加权打分（已完成）
- [x] `memory.ts`：`sync-lenny-conv` 支持 zhang/wang source，修复历史 id/source 错误问题
- [x] `canvasStore.ts`：自定义空间（Custom Space）对话结束后同步到主空间，触发记忆提取和进化基因更新
- [x] `InputBox.tsx`：Skills 意图检测改为加权打分，多命中关键词的技能优先弹出
- [x] README.md 版本号 + 测试数更新；architecture.md 版本号同步

#### v0.4.8 - Skills 自动触发 + 工具栏重设计 + Spaces 折叠（已完成）
- [x] `InputBox.tsx`：移除 ⚡ Zap 按钮，改为关键词自动场景检测，触发技能建议 chip（可应用/关闭）
- [x] `InputBox.tsx`：Paperclip + AtSign 合并为 `+` 操作菜单按钮
- [x] `Canvas.tsx`：Spaces 侧边栏折叠/展开，状态 localStorage 持久化
- [x] i18n 新增 `skillsApply` / `hideSpaces` / `showSpaces` 键

#### v0.4.5 - MEMORY_BUDGET 环境变量 + SettingsModal 修复（已完成）
- [x] `MEMORY_BUDGET` env var：控制 system prompt 注入层 token 预算（默认 1500，支持动态调整）
- [x] 非数字/空值降级到 1500
- [x] `SettingsModal.tsx`：修复 `isOpen` 未条件渲染导致 z-[60] overlay 始终遮挡页面的严重 bug
- [x] `SettingsModal.tsx`：添加 ESC 键关闭支持 + `data-testid="settings-close-btn"`
- [x] E2E 测试修复：mockAIStream done 帧补充 fullText、汉堡菜单/J-3/J-4 overlay 处理
- [x] 文档同步：dev-guide/sop/architecture/ROADMAP/ai.ts JSDoc 版本号与内容更新
- [x] vitest 517/517 | E2E 44/48 通过 3 skip | tsc 0 errors

#### v0.4.4 - 会话级记忆摘要（Session Memory）（已完成）
- [x] `session_memory.json`：长对话（≥10 轮）自动生成摘要，存于 SQLite storage 表
- [x] `generateSessionSummary`：AI 轻量摘要 + setImmediate 异步生成，不阻塞响应
- [x] 系统提示层 3.5 注入（CONTEXT_BUDGET 之外）
- [x] 自动清理：保留最近 50 条，防止无限增长
- [x] 新增 10 个单元测试 | vitest 517/517 | tsc 0 errors

#### v0.4.3 - 记忆评分系统（Memory Quality v1）（已完成）
- [x] `MEMORY_STRATEGY` 环境变量：baseline / scored 策略切换
- [x] `MEMORY_DECAY` 环境变量：指数时间衰减（半衰期 69 天）
- [x] `fetchScoredFacts`：importance + decay + accessBonus 综合评分
- [x] `memory_scores.json`：旁路评分存储（storage 表，不修改主数据结构）
- [x] `loadMemoryScores` / `saveMemoryScores`：异步非阻塞写回
- [x] 新增 9 个单元测试 | vitest 502/502 | tsc 0 errors

#### v0.4.2 - 用户自定义 Space（已完成）
- [x] `CustomSpaceCanvas.tsx`：通用参数化画布，6 色主题，动态 CSS 点阵，无种子节点
- [x] `CreateCustomSpaceModal.tsx`：name/topic/color/prompt/avatar 创建弹窗
- [x] `canvasStore.ts`：isCustomSpaceMode + 5 actions + 6 处文件路由隔离
- [x] `constants.ts`：CUSTOM_SPACE_FILE_RE + isValidFilename 双重验证 + buildCustomSpacePrompt
- [x] `Canvas.tsx`：My Spaces 区域 + 新建/删除入口
- [x] i18n：18 个新 key（customPlaceholder + createSpace* + mySpaces + deleteSpace*）
- [x] 新增 18 个单元测试 | vitest 493/493 | tsc 0 errors

#### v0.4.1 - 设置页数据导出 + 时间轴上传文件行（已完成）
- [x] `SettingsModal.tsx`：新增导出区，调用 `/api/storage/export` 下载全量 JSON
- [x] `TimelineView.tsx`：新增文件行，按日期展示历史上传文件（amber 主题卡片）
- [x] i18n：`settings.exportDataLabel/Btn/exporting` + `timeline.filesRow/fileLabel`
- [x] vitest 475/475 | tsc 0 errors

#### v0.4.0 - 张小龙 & 王慧文 Public Space（已完成）
- [x] `ZhangSpaceCanvas.tsx`：35 颗种子节点，蓝色主题，ZHANG_SYSTEM_PROMPT
- [x] `WangSpaceCanvas.tsx`：30 颗种子节点，emerald 主题，WANG_SYSTEM_PROMPT
- [x] canvasStore 4-way 空间模式（isZhangMode / isWangMode）
- [x] Canvas.tsx 入口按钮（张小龙 + 王慧文）
- [x] AnswerModal.tsx 4-way 系统 prompt 路由
- [x] 新增 24 个单元测试 | vitest 475/475 | tsc 0 errors

#### v0.3.3 - 文件检索增强（大文件分块 + 跨对话引用）（已完成）
- [x] `search_files` tool：AI 可主动检索历史上传文件片段（语义向量检索）
- [x] `searchFileChunks` 函数：embedding → 余弦相似度 → Top-5 片段
- [x] SSE search_round 文案区分 web/memory/file 三类
- [x] InputBox @ 触发历史文件联想面板（懒加载 + 键盘导航）
- [x] 发送时追加隐藏 AI 提示，AI 知道可调用 search_files 检索
- [x] vitest 451/451 | tsc 0 errors

#### v0.3.2 - AI 工具能力补全（URL读取 + 主动记忆查询）（已完成）
- [x] URL 内容预取：检测消息里的 URL，通过 Jina Reader 抓取内容注入上下文
- [x] search_memory 工具：AI 可主动查询记忆库（function calling）
- [x] SSE 消息区分 search_round 类型（web/memory）
- [x] 代码质量修复：fetchUrlContent/URL_REGEX/TOOLS_WITH_MEMORY 提升到模块级，消除 lastMsgText 重复
- [x] 新增 url_fetch SSE 事件（fetching/done/failed 进度反馈）+ usage SSE 事件（token 用量）
- [x] vitest 445/445 | tsc 0 errors | E2E 45/48

#### v0.3.1 - code review P1/P2 修复（已完成）
- [x] sync-lenny-conv 幂等检查改用 JSON 精确匹配（防止前缀误判）
- [x] useForceSimulation CENTER_GRAVITY 全 capability 节点时跳过（防反向引力）
- [x] vitest 427/427 | tsc 0 errors | E2E 45/48

#### v0.3.0 - sync-lenny-conv 补生成主空间节点（已完成）
- [x] sync-lenny-conv 写完对话后同步写 nodes.json，画布可见 Lenny/PG 节点
- [x] source 字段区分 lenny/pg，节点 id 前缀正确
- [x] 服务器补偿：9 条历史对话生成节点（15→23）
- [x] vitest 427/427 | tsc 0 errors | E2E 45/48

#### v0.2.99 - useForceSimulation CENTER_GRAVITY 根因修复（已完成）
- [x] CENTER_GRAVITY 指向几何重心而非坐标原点，Lenny/PG 节点不再飞向左上角堆叠
- [x] vitest 427/427 | tsc 0 errors | E2E 45/48

#### v0.2.98 - Lenny/PG 空间全面修复（已完成）
- [x] useForceSimulation：noSameAttract / noClusterForce / noStoreSync 选项
- [x] LennySpaceCanvas 使用 noSameAttract+noClusterForce+noStoreSync
- [x] PGSpaceCanvas 增强斥力参数，移除同类弹簧力
- [x] 多轮对话历史序列化修复（AnswerModal handleClose）
- [x] 记忆管道任务类型修复（extract_profile / extract_preference）
- [x] P0：addNode 在 Lenny 模式提前 return，杜绝主空间污染
- [x] P0：/memory/search 过滤 lenny-* / pg-* 前缀
- [x] vitest 427/427 | tsc 0 errors | E2E 45/48

#### v0.2.97 - 全量 code review + AI 路由 body 限制（已完成）
- [x] 全量 code review：db.ts / agentWorker.ts / memory.ts / ai.ts / canvasStore.ts 无 P0 问题
- [x] `ai.ts POST /stream` 新增 20MB body 上限（防超大图片 base64 消息）
- [x] `ai.ts POST /summarize` 新增 1MB body 上限
- [x] 文档同步：ROADMAP 补全 v0.2.91~v0.2.96 版本历史
- [x] vitest 427/427 | tsc 0 errors | E2E 45/48

#### v0.2.96 - 修复 E2E 测试污染 Google Analytics 数据（已完成）
- [x] `index.html` 加 `location.hostname` 检测，localhost/127.0.0.1 时不加载 gtag.js
- [x] 修复前 GA 数据严重虚高（每次跑 48 个测试 = 48 次假页面访问）
- [x] 清理服务器上 2 个 E2E 测试账户遗留数据

#### v0.2.95 - 服务端安全加固（已完成）
- [x] P0-2: `storage.ts` PUT 文本上限 10MB，POST append 上限 1MB，防 DoS
- [x] P0-1: `GET /file/:id` Content-Disposition 补 ASCII fallback，符合 RFC 6266
- [x] P1-4: `feedback.ts` message ≤ 5000 字符，imageData ≤ 5MB
- [x] P1-5: `config.ts` PUT /settings 验证 baseUrl 必须 http/https；verify-key 防 SSRF
- [x] vitest 427/427 | tsc 0 errors | E2E 45/48

#### v0.2.94 - Playwright journey 测试全套通过（已完成）
- [x] 修复 J-1/J-2 反复失败根因：`getRelevantMemories` 降级路径读历史记录导致 mergeIntoNode
- [x] `beforeEach` 清空 `conversations.jsonl`，mock `/api/memory/search` 返回空结果
- [x] `canvasStore.ts` 集成 Zustand devtools + `window.__CANVAS_STORE__` 暴露（dev 环境）
- [x] J-1 ✓ J-2 ✓ J-3 ✓ J-4 ✓ J-5 ✓，全套 45/48 通过（3 skip 为条件性跳过）

#### v0.2.93 - 所有 Space 对话同步到主空间（已完成）
- [x] PG Space、Lenny Space 对话关闭后均同步到主空间 `conversations.jsonl`
- [x] 触发记忆提取 + 节点生成，实现跨 Space 记忆积累

#### v0.2.92 - PG/Lenny Space isPGMode 时序竞争修复（已完成）
- [x] `AnswerModal.tsx` handleClose 开始时快照 `wasPGMode`/`wasLennyMode`
- [x] setTimeout 回调里恢复正确状态，杜绝 500ms 内 mode 被覆盖的竞争条件

#### v0.2.91 - 多租户修复 + onboarding bug 修复（已完成）
- [x] 多租户数据隔离修复，各用户独立 SQLite DB
- [x] Onboarding 全链路修复

#### v0.2.88 - 代码质量：全量英文化 + 零残留中文（已完成）
- [x] `canvasStore.ts` 修复 2 处用户可见 `lastError` 中文字符串 → 英文
- [x] `AnswerModal.tsx` 修复 4 处 console.error 中文 → 英文
- [x] `InputBox.tsx` 修复 1 处 console.error 中文 → 英文
- [x] `src/services/ai.ts` 修复 2 处 console.error 中文 → 英文
- [x] `src/services/fileParsing.ts` 修复 2 处 console.error 中文 + Error message → 英文
- [x] 全量扫描确认：项目中零残留中文用户可见字符串或开发日志
- [x] vitest 427/427 | tsc 0 errors | playwright E2E 33/33

#### v0.2.87 - 全量 i18n 收尾 + TypeScript 零错误 + E2E 修正（已完成）
- [x] Canvas.tsx、ConversationSidebar.tsx 全部硬编码中文字符串 i18n 化（welcomeDefault/greeting/nightCare/mondayReminder/mergeBanner/consolidateQueued/consolidateBusy/mentalModelQueued/refreshError/mentalModelTooltip）
- [x] zh.ts / en.ts 新增 5 个 sidebar 字段（支持双语）
- [x] canvasStore.ts 移除未使用的 `configService` import（消除 TS6133）
- [x] feedback.test.ts 使用 `Hono<Env>` 泛型修复 context `.set('db')` 类型错误（消除 TS2769）
- [x] `npx tsc --noEmit` 零错误通过
- [x] `npx vitest run` 427/427 通过
- [x] E2E 测试 33/33 通过（更新测试 21/22 反映开放认证模型）

#### v0.2.86 - 全量 i18n 双语支持（已完成）
- [x] 所有 UI 组件支持中英双语（15 个组件，11 个新命名空间）
- [x] 新增命名空间：login / onboarding / modal / timeline / nodeTimeline / search / importMemory / grayHint / thinking / fileBubble / clusterLabel
- [x] AnswerModal.tsx `turns.map` 循环变量 `t → turn` 避免与 `useT()` 冲突



**界面改进**:
- [x] 修复返回画布无效问题
- [x] 移除模拟模式，使用真实API
- [x] 优化对话界面（ChatGPT风格气泡对话）
- [x] 添加过渡动画（打开/关闭模态框）
- [ ] 改进节点生成位置（避免重叠）

**交互优化**:
- [ ] 支持点击画布任意位置创建节点
- [ ] 节点拖拽重新排序
- [ ] 键盘快捷键增强（Cmd+K搜索、Cmd+N新建）

**稳定性**:
- [ ] API错误友好提示
- [ ] 网络断开自动重连
- [ ] 数据备份提醒

---

#### v0.1.5 - 记忆驱动与无声进化 (已完成)

**核心功能**:
- [x] 实现语义记忆检索：对话发起前检索相关历史对话并注入 Prompt
- [x] 优化反馈交互：移除生硬提示，改为“微光”图标与自然进化的语气
- [x] 对话上下文动态切换：根据当前话题唤醒特定类别的记忆片段

**体验优化**:
- [x] 优化 NodeCard 视觉：减轻阴影，提升“通透感”
- [x] API Key 与模型管理 UI：增加侧边或角落的优雅设置层

---

#### v0.1.6 - 知识图谱与 Apple-like 动效 (已完成)

**视觉升级**:
- [x] 实现节点连线 (Edges)：同类或同次对话节点自动绘制联结线
- [x] 自动聚类布局：同类节点在画布上自然靠近，形成“记忆板块”
- [x] 全局 Framer Motion 动效：弹簧反馈、平滑切换与渐变缩放

**稳定性**:
- [x] 大量节点下的渲染性能优化
- [x] 搜索结果高亮与定位增强

---

#### v0.1.7 - 多模态交互与原生级体验 (已完成)

**核心功能**:
- [x] **Kimi 2.5 升级**: 全面支持最新多模态模型，支持图片理解。
- [x] **图片拖入支持**: 对话框支持直接拖入/粘贴/上传图片（Base64 编码）。
- [x] **原生级联网搜索**: 集成 Kimi 2.5 `web_search` 工具，支持实时信息查询。
- [x] **消息编辑与重发**: 支持对已发送消息进行二次编辑并触发重新回答。

**交互优化**:
- [x] **UI 精简与重构**: 合并视图控制挂件，引入“应用中心”下拉菜单。
- [x] **拖拽 Bug 修复**: 引入位移阈值逻辑，彻底解决拖拽误触问题。

---

#### v0.1.8 - 流体交互与视觉打磨 (已完成)

**视觉体验**:
- [x] **画布动力学**: 实现 Canvas 惯性滑动 (Inertia) 与节点弹簧动效 (Spring)。
- [x] **有机连线**: 升级为贝塞尔曲线 (Bezier) 连线，增加光效阴影，提升视觉张力。
- [x] **Markdown 极致渲染**: 引入 `react-markdown` 与 `typography` 插件，排版对标原生文档。
- [x] **AI 身份极简化**: 移除笨重头像，改为极简文字 Model Tag。

**内容策略**:
- [x] **Prompt 工程**: 重写 System Prompt，强制 AI 回复保持简洁、结论先行。
- [x] **操作布局**: 将复制、编辑等功能移至气泡右下角并智能展示，减少干扰。

---

#### v0.1.9 - 结构化进化与逻辑重构 (已完成)

**逻辑重构**:
- [x] **对话分支 (Branching)**: 引入 `parentId` 机制，支持从任意历史回复开启新对话分支。
- [x] **有机拓扑连线**: 连线逻辑升级，优先基于对话分支关系绘制树状结构，根节点维持板块星型拓扑。
- [x] **伪 3D 景深效果**: 连线粗细、透明度与模糊度随节点距离动态变化，营造空间感。

**体验打磨**:
- [x] **Markdown 表格增强**: 修复表格渲染样式，支持完整 GFM 规范。
- [x] **交互冲突修复**: 彻底解决节点拖拽与点击误触的竞态问题。
- [x] **UI 细节优化**: 重新校准输入框居中逻辑，调整用户气泡为极简灰调风格。

---

#### v0.2.0 - 空间智能与视觉革命 (已完成)

**核心能力**:
- [x] **实时推理流 (Reasoning Stream)**: 全面接入 Kimi 2.5 的 Thinking 过程，支持实时展示 AI 的思考逻辑。
- [x] **意图驱动的分支 (Intent Branching)**: 自动检测用户意图（如工作 vs 生活），并智能关联至历史相关对话分支，实现上下文的物理隔离与自动聚类。
- [x] **对话岛屿 UI (Dialogue Island)**: 颠覆传统全屏模态框，设计为悬浮感极强的“对话岛屿”，引入磨砂玻璃质感与精简的底部工具栏。

**视觉与细节**:
- [x] **空间深度感**: 节点随时间流逝自动产生 Z 轴位移感（活跃节点更大更亮，历史节点轻微模糊），强化画布的层次感。
- [x] **高级表格排版**: 针对 AI 生成的对比表格进行深度样式定制（斑马纹、圆角边框、精致内边距）。

---

#### v0.2.2 - 话题智能与交互大师 (已完成)

**核心功能**:
- [x] **话题智能拆分 (Topic Splitting)**: 自动识别多轮对话中的意图切换，并在画布上自动拆分为独立话题节点，实现物理隔离与逻辑聚类。
- [x] **全屏沉浸式对话**: 回归并升级“沉浸式全屏”布局，采用 `3xl` 深度毛玻璃背景与中心聚焦立柱设计，平衡专注感与通透感。
- [x] **模态框内文件直传**: 对话窗口内新增 `Paperclip` 按钮与拖拽区，支持在对话过程中随时追加图片、PDF、文档与代码。

**视觉与交互**:
- [x] **交互摩擦力修复**: 彻底重构 `NodeCard` 拖拽监听机制，修复“拖拽后倾斜”与“第二次拖动才正”的反馈 Bug，实现极致平滑的归位动画。
- [x] **思考链路持久化**: 实现 AI 思考逻辑的自动折叠与全量持久化，支持在历史回放中完整查看每轮对话的思考过程。
- [x] **记忆联结标识**: 新增 `MemoryRecallTag` 视觉标签，实时显示 AI 当前正在调用哪个分类的“演化记忆”。

---

#### v0.2.3 - 体验与逻辑修复 (已完成)

**记忆与分类**:
- [x] **记忆按当前问题调用**: 连续对话时按当前输入重查相关记忆，压缩后注入 systemPrompt，AI 真正“看过”之前类似内容。
- [x] **按轮展示记忆标签**: 每轮有联结时在气泡旁显示轻量“已联结 xxx 记忆”提示。
- [x] **话题分类修正**: `addNode` 支持 `explicitCategory`，由 `endConversation` 传入分组 category，避免 AI 回复关键词误判（如“好吃的”归生活）。
- [x] **意图关键词微调**: 生活日常增加 `好吃`、`店铺` 等。

**对话 UI**:
- [x] **模型标签**: 在 AI 输出块左上角轻量展示（非整页左上角），首条 AI 回复旁显示模型名。
- [x] **复制/编辑/重试**: 参考 ChatGPT，操作按钮放在气泡/内容框**外**（气泡下方或右侧），hover 显示。
- [x] **编辑态颜色**: 取消/更新按钮对比度降低（灰底、gray-600 主按钮），避免色差过大。
- [x] **多轮对话样式**: 展示时剥离「用户：… AI：」前缀及 # 标题，避免二轮内容错位；思考区与正文结构统一。
- [x] **输出区收窄**: 内容区与输入区 `max-w-xl`；思考区默认折叠与样式。

**画布**:
- [x] **首页伪 3D 循环感**: 画布内层施加轻微持续 rotateY 动画（0→4°→0，12s 循环），形成“一面循环转”的类伪 3D 感。

**本版暂不强调**: 分支按钮（开启新对话）入口保留但未单独强化。

**v0.2.3 补充修复**:
- [x] **模型标签**: 改为对话区顶部单行展示（KIMI-K2.5 / 正在进化中...），不再在左侧占块。
- [x] **用户消息操作**: 为外层容器加上 `group/user`，悬停时正确显示复制、编辑按钮。
- [x] **美食类分类统一**: 生活日常关键词增加「非常好吃」；`loadNodes` 时按对话首句全量重算分类并写回，历史错分节点（如美食归到工作/其他）自动纠正。

---

#### v0.2.4 - 融合改造与画布修复 (已完成)

**融合改造（参考 docs/融合改造设计方案.md）**:
- [x] **对话岛 (Dialogue Island)**: 从底部输入框 Morph 展开的半屏对话面板，顶部记忆引用条，支持停止生成与文件预览。
- [x] **极光背景与 LOD**: `AmbientBackground` 随主导分类变色；缩小画布时节点淡出、显示 `ClusterLabel` 宏观聚类；标签反向缩放保持可读。
- [x] **语义高亮**: 输入时 `detectIntent` + `getRelevantMemories`，画布节点按节点 id 高亮（conversationId 与 nodeId 映射修复）。
- [x] **节点详情面板**: 点击节点打开 `NodeDetailPanel`，支持继续话题、重命名、删除。
- [x] **首次引导**: `OnboardingGuide` 三步引导（漫游、对话、宏微观）。

**画布与样式修复**:
- [x] **画布拖拽修复**: 画布层添加 `pointer-events-auto`，解决外层 `pointer-events-none` 导致无法拖拽的问题。
- [x] **缩放样式修复**: 移除画布内层 `rotateY` 3D 动画，避免晃动与交互偏移；`ClusterLabel` 增加反向缩放，宏观视图下标签清晰可读。

---

#### v0.2.43 - 基础稳固（已完成）

**P0 Bug 修复**:
- [x] **agentWorker 多租户 bug 修复**：`getAllUserDbs()` 遍历所有用户 db；`enqueueTask` 接受 db 参数；后台任务现在操作正确的用户数据库
- [x] 新增 4 个多租户集成测试，验证 db 隔离正确性
- [x] 文档同步：ROADMAP 更新日志补全 v0.2.12 → v0.2.43

---

#### v0.2.49 - Edge 视觉重设计 + 逻辑边去重（已完成）

**视觉修复**:
- [x] **连线 hover/click 面板白色毛玻璃化**：深黑色解释面板改为白色毛玻璃（与 NodeCard 一致），hover 标签改为白底+主色文字，左侧 accent 竖条替代顶部色条

**逻辑优化**:
- [x] **逻辑边去重**：`addNode` 触发逻辑边提取前先检查 `GET /api/memory/logical-edges/:id`，已有边则跳过 AI 请求，避免重复消耗 API 配额

---

#### v0.2.51 - 代码质量重构 — 大文件拆分（已完成）

**文件拆分**:
- [x] `server.test.ts` (1610行) → 3 文件（629 + 703 + 272行），按 DB 作用域和功能域分组
- [x] `agentWorker.ts` (853行) → `agentWorker.ts` (234行调度入口) + `agentTasks.ts` (626行 AI 任务实现)
- [x] `AnswerModal.tsx` (1339行) → `AnswerModal.tsx` (1112行主逻辑) + `AnswerModalSubcomponents.tsx` (255行纯UI子组件)
- [x] `canvasStore.ts` — 新增架构注释 + `[SECTION:]` 导航标记（Zustand 单store闭包，暂不拆分）

**规范落地**:
- [x] 建立 < 1000 行理想、绝对上限 1500 行的文件大小规范
- [x] AI 友好代码：职责头注释 + `[SECTION:]` 分区标记

---

#### v0.2.50 - 多轮搜索 + 澄清层 + 代码质量（已完成）

**新功能**:
- [x] **多轮 web_search 支持**：后端 while 循环最多 5 轮，tool_calls → `search_round` SSE 事件 → 续轮请求，支持 Moonshot `$web_search` 内置搜索
- [x] **调研前澄清层**：用户输入含调研/分析关键词且无具体锚点时，弹出澄清卡片（行业数据 / 产品对比 / 自定义），不在 onboarding 模式触发
- [x] **搜索进度指示器**：流式回复区域显示"正在进行第 N 轮搜索"动态提示

**代码质量**:
- [x] **P0 修复**：`readRound` 添加 `try/finally reader.releaseLock()`，消除 ReadableStream 资源泄漏
- [x] **P1 修复**：澄清层 onboarding 守卫（`!isOnboardingMode`），`sendClarifiedMessage` 提取复用消除两处重复 `doSend`
- [x] **+20 单元测试**：覆盖 readRound 逻辑、澄清层触发规则、search_round 消息格式、MAX_SEARCH_ROUNDS 边界

---

### 设计参考（SOP）

产品与前端设计、交互方案在迭代时，应**参考顶级开源项目与优秀设计**（如 ChatGPT/Claude 网页端、知名开源 AI 产品、设计系统等），并在需求/方案文档中简要注明参考来源与取舍。新功能评审时检查是否已做参考并文档化。

---

### 🎯 中期（v0.3.x）

#### v0.3.0 — 结构化用户模型（计划）

**核心**：将碎片 `memory_facts` 升级为有层次的 User Mental Model。

- [ ] 用户认知框架：将 facts 自动归类到「职业/成长/偏好/目标/经历」维度
- [ ] 长期目标追踪：识别并持续更新用户的阶段性目标变化
- [ ] 主动记忆触发：对话结束后 AI 判断"这次是否更新了我对用户的理解"，自动写入增量
- [ ] 记忆时间轴：UI 上可查看记忆事实的演变历程

#### v0.3.1 — 画布性能与大规模节点（计划）

- [ ] 节点虚拟化：超过 100 个节点时只渲染视口内节点（类 react-window 方案）
- [ ] 时间轴视图：X 轴时间、Y 轴话题，帮助用户看到"我最近在想什么"
- [ ] 节点搜索优化：当前仅匹配标题/关键词，升级为全文内容搜索

#### v0.3.2 — 多模型路由与本地化（计划）

- [ ] 多模型路由：简单问答走小模型（moonshot-v1-8k），复杂推理走大模型；隐私内容可走本地 Ollama
- [ ] 模型健康检测：启动时自动 ping 配置的 baseUrl，提前发现 API 连通性问题

#### v0.2.85 — 反馈功能（已完成）

- [x] **反馈按钮**：固定在 InputBox 右侧外，点击展开浮层面板
- [x] **类型切换**：🐛 报错 / 💡 建议
- [x] **文字反馈**：textarea 输入，自动收集上下文（url, userAgent, lastConvId）
- [x] **图片上传**：可选截图上传，存为 BLOB
- [x] **`feedback_reports` 表**：SQLite migration 自动建表，支持多租户隔离
- [x] **`GET/POST /api/feedback`** 路由
- [x] **i18n 双语**：中英文切换正常

---

### 🔮 远期（v0.5.0+）

#### v0.5.0 — 导入 / 导出生态

- [ ] 导出完整画布为 `.anima` 文件（含节点、对话、记忆事实）
- [ ] 导入并合并（不覆盖）已有数据
- [ ] 数据加密导出

#### v0.5.1 — 平台化

- [ ] 插件 API（自定义工具集成）
- [ ] 自定义意图分类词典
- [ ] WebDAV / GitHub Gist 增量同步（可选）

---

## 设计理念

### 核心原则

1. **渐进增强** - 每个版本只添加少量功能，保持稳定性
2. **用户优先** - 所有功能必须解决真实问题
3. **本地优先** - 数据所有权属于用户
4. **简洁至上** - 避免功能膨胀

### 否决的功能（保持克制）

- ❌ 社交分享
- ❌ 在线协作（多人实时编辑）
- ❌ 内置浏览器
- ❌ 复杂的权限管理
- ❌ 广告或推荐系统

---

## 贡献指南

### 如何建议新功能

1. 检查是否已有类似Issue
2. 描述使用场景
3. 解释为什么需要这个功能
4. 接受社区讨论

### 优先级标签

- `P0` - 严重bug，必须立即修复
- `P1` - 重要功能，下个版本优先
- `P2` - 有用功能，有精力就实现
- `P3` - 锦上添花，欢迎PR

---

## 更新日志

| 版本 | 日期 | 主要更新 |
|------|------|---------|
| v0.1.0 | 2026-02-28 | MVP发布 |
| v0.1.1 | 2026-02-28 | 安全修复（3项） |
| v0.1.2 | 2026-02-28 | Store重构 + 测试覆盖 |
| v0.1.3 | 2026-02-28 | 体验修复 + 文档体系 |
| v0.1.4 | 2026-02-28 | 体验优化（ChatGPT 风格界面、动画） |
| v0.1.5 | 2026-03-01 | 记忆驱动与无声进化交互 |
| v0.1.6 | 2026-03-01 | 知识图谱布局、视觉连线与全局动效 |
| v0.1.7 | 2026-03-02 | Kimi 2.5 升级、多模态支持、消息编辑与 UI 精简 |
| v0.1.8 | 2026-03-02 | 流体交互、有机连线、Markdown 深度渲染与 UI 打磨 |
| v0.1.9 | 2026-03-02 | 对话分支、伪 3D 连线、交互 Bug 修复与灰调视觉 |
| v0.2.0 | 2026-03-02 | Reasoning Stream、Intent Branching 与空间深度布局 |
| v0.2.1 | 2026-03-02 | 交互体验修复与 UI 布局深度微调 |
| v0.2.2 | 2026-03-02 | 话题智能拆分、全屏沉浸对话、文件直传与交互摩擦修复 |
| v0.2.3 | 2026-03-02 | 记忆按问题调用、分类修正、对话 UI 与模型标签优化 |
| v0.2.4 | 2026-03-02 | 对话岛、极光背景、LOD、语义高亮、节点详情、首次引导、画布拖拽与缩放修复 |
| v0.2.11 | 2026-03-03 | EvoCanvas → Anima 品牌改名、去紫色、引导完成文案、能力节点修复 |
| v0.2.12 | 2026-03-04 | 新手教程简化（自动触发+结束消失）、节点标签修复、智能路由优化 |
| v0.2.20 | 2026-03-05 | 对话历史服务端持久化 |
| v0.2.21 | 2026-03-05 | 新手引导全链路修复 |
| v0.2.22 | 2026-03-05 | 稳定性 & E2E 测试 |
| v0.2.32 | 2026-03-06 | 多租户安全修复 + onboarding bug 修复 |
| v0.2.36 | 2026-03-06 | 跨账号 onboarding 状态污染修复 |
| v0.2.38 | 2026-03-06 | 新用户 onboarding 误判修复 |
| v0.2.42 | 2026-03-06 | 主输入框卡死修复、embedding 超时彻底消除 |
| v0.2.43 | 2026-03-06 | **agentWorker 多租户 bug 修复**（P0）：后台任务现在操作正确的用户数据库 |
| v0.2.49 | 2026-03-07 | Edge 视觉白色毛玻璃重设计 + 逻辑边去重提取 |
| v0.2.50 | 2026-03-07 | 多轮 web_search + 澄清层 + readRound 资源泄漏修复 + 20 新单元测试 |
| v0.2.51 | 2026-03-07 | 代码质量重构：4 个大文件拆分，新增 AI 友好代码规范，289/289 测试通过 |
| v0.2.52 | 2026-03-07 | 逻辑边 bug 修复 + 节点碰撞检测 + Ghost Text 轮换 + ThinkingSection 分阶段 |
| v0.2.53 | 2026-03-07 | MemoryLines 语义化颜色（按节点分类着色）+ 逻辑边初见惊喜入场动画 |
| v0.2.54 | 2026-03-07 | E2E token 隔离修复（P0）+ MemoryLines 颜色映射表修复 |
| v0.2.55 | 2026-03-07 | 极简视觉重设计（连线去色 + 节点纯白 + accent 竖条）|
| v0.2.56 | 2026-03-07 | 节点物理感 + viewport culling P1 技术债 + 分类重识别接口 |
| v0.2.57 | 2026-03-07 | code review 修复（viewport 公式 + mouseup 泄露 + detectIntent 迭代）|
| v0.2.58 | 2026-03-07 | 分类系统升级：原型向量 `/classify` + detectIntent 全量计分 + 300 测试 |
| v0.2.59 | 2026-03-07 | 结构化用户心智模型（User Mental Model）|
| v0.2.60 | 2026-03-07 | 心智模型系统全面修复（5 项主要 Code Review 问题）|
| v0.2.61 | 2026-03-07 | 全量 bug review 第三轮修复 |
| v0.2.62 | 2026-03-08 | 力模拟布局 + 拖拽推挤 + 渲染架构重构 |
| v0.2.63 | 2026-03-08 | 彻底修复画布拖拽/缩放闪回 + 节点拖不动 + 星云卡顿 |
| v0.2.64 | 2026-03-08 | 冷启动冻结布局力 + 增强公转旋转 |
| v0.2.72 | 2026-03-09 | "被记住" 体验层：画布极简化 + 记忆时间前缀 + 主动通知 + NodeDetailPanel 重命名 |
| v0.2.79 | 2026-03-10 | Lenny Space 物理力模拟 + 对话体验对齐主空间 |
| v0.2.80 | 2026-03-10 | canvasStore + AnswerModal 技术债清理 |
| v0.2.81 | 2026-03-11 | **Paul Graham Space** + Lenny 卡片重设计 + anima-base 人物 SOP + 422 测试 |
| v0.2.82 | 2026-03-11 | **多语言支持**（i18n 架构）+ Spaces 极简重设计 + 大师对话氛围 |
| v0.2.83 | 2026-03-11 | **全量 i18n 覆盖**（SettingsModal/InputBox/ConversationSidebar）+ GitHub 入口 + chatanima.com 上线 |
| v0.2.84 | 2026-03-12 | 代码质量：全量英文化 + 零残留中文 + 全量 i18n 双语 + TypeScript 零错误 |
| v0.2.85 | 2026-03-12 | **反馈功能**：FeedbackButton + feedback_reports 表 + 图片上传 + i18n |
| v0.2.91 | 2026-03-12 | Lenny/PG Space isLennyMode 分支 6 处 hardcode 修复 |
| v0.2.92 | 2026-03-12 | isPGMode 时序竞争修复（AnswerModal handleClose 快照）|
| v0.2.93 | 2026-03-12 | 所有 Space 对话同步到主空间（sync-lenny-conv 守卫移除）|
| v0.2.94 | 2026-03-12 | **Playwright journey 测试 J-1~J-5 全套通过**（mock search + conversations 清空）|

---

*最后更新: 2026-03-12（v0.2.94）*
*维护者: Anima Team*
