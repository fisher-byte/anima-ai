# LingSi Lenny Evaluation

Generated at: 2026-03-17T23:33:05.983Z
Persona: Lenny Rachitsky
Source units: 37
Cases: 15

## Summary

- Decision wins: 14
- Normal wins: 1
- Ties: 0
- Normal avg (directness/actionability/trustworthiness): 3.80 / 4.00 / 3.33
- Decision avg (directness/actionability/trustworthiness): 4.67 / 4.80 / 4.40

## Score Table

| Case | Category | Matched Units | Winner | Normal D/A/T | Decision D/A/T | Note |
| --- | --- | ---: | --- | --- | --- | --- |
| pmf-before-growth | product | 2 | normal | 5/5/5 | 4/5/4 | Normal更直接且最后主动追问数据缺口，承认判断依赖更多信息；Decision引用框架略有包装且语气更绝对。 |
| find-best-segment | product | 1 | decision | 5/5/2 | 4/4/5 | Normal过度自信未承认不确定性，Decision明确依赖数据验证假设，决策更可靠。Normal行动性更强但可信度不足。 |
| prioritize-roadmap | product | 3 | decision | 4/4/4 | 5/5/5 | Decision更直接给出行动指令，RICE框架可立即执行，且明确承认评分非完美；Normal也很好，但行动步骤稍分散。 |
| pricing-value-metric | pricing | 1 | decision | 2/2/3 | 5/5/4 | Decision回答直接给出判断框架和倾向，提供3个可执行验证动作，并承认不确定性；Normal回答缺失但基于典型B2B定价回答模式推演其更泛泛而谈。 |
| pricing-upgrade-path | pricing | 2 | decision | 4/5/4 | 5/4/5 | Decision更聚焦核心问题，三个验证动作可立即执行，且明确询问当前数据以确认判断，不确定性处理更坦诚。 |
| growth-loop | growth | 2 | decision | 4/4/4 | 5/5/5 | Decision 用 growth loop vs 漏斗框架直接切中核心矛盾，给出画流程图、PMF 调研、小规模测试三个可立即执行的验证动作，且明确前置条件。Normal 虽有判断但较分散，执行细节不够具体。 |
| daci-decision | org | 3 | decision | 3/4/3 | 5/5/4 | Decision开篇即给明确判断，三步动作具体可执行；Normal铺垫过长，虽有框架但不够直接。两者都承认复杂性，Decision更克制。 |
| two-way-door | org | 3 | decision | 5/4/3 | 4/5/4 | Decision更结构化地提出可执行步骤（3个具体动作），并明确列出需检验的关键假设，体现适当不确定性；Normal虽更直接但略显过度自信。 |
| meeting-redesign | org | 2 | decision | 3/4/3 | 5/5/4 | Decision 开头直接给判断，无铺垫；动作更具体（DACI、24小时、5分钟）；明确承认需验证假设并追问，不过度装懂。 |
| pre-mortem | risk | 1 | decision | 3/4/4 | 5/5/4 | Decision回答更直接给出核心框架，kill criteria表格和48小时行动清单更具可执行性。 |
| make-implicit-explicit | decision | 1 | decision | 4/5/3 | 5/4/5 | Decision更快给出核心判断，区分决策与结果质量，显式引入置信度和运气因素，更严谨。 |
| leading-signals | decision | 1 | decision | 3/4/3 | 5/5/4 | Decision开头直接给判断，3个动作具体可执行且有时间节点；Normal铺垫较多，指标罗列全面但缺乏优先级，两者都较可信但Decision引用来源更严谨。 |
| career-switch | career | 0 | decision | 4/3/3 | 5/5/4 | Decision回答开篇即给明确判断，并用表格结构化决策框架，actionability更强；Normal回答虽内容丰富但结构较散，决策表格更清晰可执行。 |
| cofounder-choice | career | 1 | decision | 5/4/4 | 4/5/5 | Decision提供结构化验证框架、可逆实验设计与具体追问清单，更系统处理不确定性；Normal直接但工具性稍弱。 |
| general-overload | general | 0 | decision | 3/3/2 | 4/5/4 | Decision开头直接给出判断，提供三个具体可执行动作，并明确承认不确定性，决策质量更优。 |

## Details

## pmf-before-growth
- Category: product
- Matched Units: lenny-retention-before-acquisition, lenny-pmf-validate-before-growth
- Winner: normal
- Judge Note: Normal更直接且最后主动追问数据缺口，承认判断依赖更多信息；Decision引用框架略有包装且语气更绝对。

### Prompt
我们刚上线一个协作 SaaS，注册转化还行，但第 4 周留存只有 6%。团队现在想开始投放买量。你会怎么决策？

### Normal
先暂停买量。现在投广告等于往漏水的桶里注水——你有多少预算就能烧多少。

6% 的4周留存对协作 SaaS 来说是灾难级的。作为参照，健康的 B2B SaaS D28 留存通常在 30-40%+，即使是较差的也该有 15-20%。6% 意味着你几乎留不住任何用户，这时候大规模买量只是加速失败。

**当前最该做的三件事：**

**1. 区分是激活问题还是价值问题**
协作产品的流失通常发生在两个环节：
- **第一周没 get 到价值**（激活问题）：用户没邀请到同事，或者没完成第一个协作动作
- **用了一周觉得没用**（PMF 问题）：产品解决的需求不够痛，或者方案不够好

看数据：D1 和 D7 留存是多少？如果 D1 留存很高但 D7 崩了，是价值问题；如果 D1 就崩了，是激活/上手体验问题。

**2. 找到协作产品的 "aha moment"**
对协作 SaaS 来说，aha moment 通常是：
- 邀请 ≥2 个同事加入
- 完成第一次真正的协作（不只是注册，而是共创/评论/分配任务）
- 在某个文档/项目里停留超过 X 分钟

去分析那 6% 的留存用户，他们在第一周做了什么不同的事？那个动作就是你的北极星指标。

**3. 优化到 D28 ≥20% 再考虑买量**
协作产品的网络效应意味着：如果你能让一个团队真正用起来，留存应该很好。现在的数据说明要么产品没解决真问题，要么 onboarding 设计有问题。

**我建议的下一步：**
暂停增长，全员 focus 在诊断上。访谈 10 个流失用户，问他们为什么第二周就不用了；同时分析那 6% 留存用户的共同行为模式。

你们现在 D1 和 D7 留存具体是多少？以及用户主要的激活动作是什么（比如邀请同事、创建项目）？这会影响我给你的具体建议。

### Decision
先停掉买量，把预算和精力全押在留存修复上。

**6%的4周留存意味着你的桶底还在大漏**，这时候加水（买量）只会把漏洞放大。我见过太多团队在这个阶段砸钱获客，最后烧掉几十万才发现——原来不是获客问题，是产品留不住人。

**当前阶段判断**：你们还在PMF验证期，没到增长扩张期。

协作SaaS的D30留存基准应该在15-25%才算"可用"，6%说明大部分用户还没找到"aha moment"就流失了。这时候买量的ROI会惨不忍睹，而且会让你误以为"流量质量差"，而不是直面产品核心问题。

**主要权衡**：
- 买量带来的短期DAU增长 vs 真实留存曲线的恶化
- 团队精力分散在投放优化 vs 深度理解用户为什么在第7天就离开

基于Elena Verna的框架，Retention is the new Acquisition——留存提升的复利效应远大于买量的线性增长。

**3个你现在就该做的动作**：

1. **把最近2-3个cohort的留存曲线拉出来对比**——看看留存是在改善还是恶化？如果连续几个cohort都稳定在6%，说明是结构性问题；如果在下滑，情况更急迫。

2. **对最近2-4周的活跃用户跑一轮PMF调研**——直接问"如果明天不能用这个产品，你会有多失望？"如果"非常失望"的比例不到40%，你们还没找到PMF，别谈买量。

3. **把本月新增预算的50%转去activation修复**——找到用户流失的关键节点（通常是D1-D7之间），搞清楚他们在哪个协作环节卡住，而不是研究投放素材。

所以当下最危险的事，就是让团队觉得"只要流量够大就能掩盖留存问题"。先让早期用户留下来，再考虑放大。

## find-best-segment
- Category: product
- Matched Units: lenny-pmf-find-best-segment
- Winner: decision
- Judge Note: Normal过度自信未承认不确定性，Decision明确依赖数据验证假设，决策更可靠。Normal行动性更强但可信度不足。

### Prompt
一个 AI 记账工具同时被自由职业者、小微商家、个人记账用户使用。资源有限时，我该先服务谁？

### Normal
我的直接建议是：**先聚焦自由职业者**。

这是一个经典的"谁最痛苦、谁最愿意付费、谁最容易服务"的三角判断。让我拆解这三个群体，你就会明白为什么：

**自由职业者（推荐）**
- 痛点最尖锐：收入不稳定 + 税务焦虑 + 发票管理混乱，这三件事让他们夜不能寐
- 付费意愿强：相比个人用户，他们把这当"生意成本"而非"消费"
- 需求边界清晰：不像小微商家那样需要库存、员工工资等复杂功能，但又比个人记账复杂到AI能产生真实价值
- 网络效应：自由职业者有社群，做得好会口碑传播

**小微商家**
- 这是我通常会劝你**暂缓**的群体。为什么？因为他们要的不是"记账工具"，是"ERP-lite"。你需要发票打印、多店铺管理、供应商对账... 功能深度一旦开始，就是个无底洞。而且他们迁移成本高，一旦用了你，期待是全方位的。

**个人记账用户**
- 最大的陷阱。用户量大但付费转化率极低（你看随手记、挖财做了多少年，盈利模型是什么？）。更要命的是，个人用户对"AI价值"的感知很弱——"我就记个账，AI能帮我什么？"

---

**具体怎么做：**

1. **验证信号**：跑一下Sean Ellis测试——如果明天关掉产品，哪个群体会有超过40%的人"非常失望"？我猜是自由职业者。

2. **观察留存**：看D30留存。个人用户可能D7就流失了，自由职业者如果D30还在用，说明你抓住了他们的工作流程。

3. **定价测试**：自由职业者月付30-50元不会眨眼，个人用户月付10元都要想三天。

4. **扩展路径**：做透自由职业者后，自然向上延伸到"超级个体"（带团队的小商家），向下兼容个人记账反而容易——功能做减法总比做加法简单。

最后提醒一点：我见过太多记账工具死在"我谁都想服务"上。你在早期需要的不是市场份额，是**一群爱你爱到愿意付钱的死忠用户**。自由职业者群体足够大（中国几千万），痛点足够痛，这就是你的滩头阵地。

你现在有多少用户？我可以帮你看看数据是否支持这个判断。

### Decision
我的诚实看法是：**先锁定小微商家**。

不是因为他们市场规模最大，而是因为他们最可能有"付费意愿+高频需求+强痛感"的组合。自由职业者虽然也有收入支出管理的需求，但很多人用Excel就能凑合；个人记账用户付费意愿普遍低，且流失率高。小微商家不同——税务合规、现金流管理、多平台收款对账，这些是真痛点，而且做不好会直接影响生意。

但这取决于你现在的数据。如果你还没有做过Sean Ellis的PMF测试（问用户"如果产品没了你会多失望"），那现在的选择其实是盲猜。

**关键权衡在这里**：
- 小微商家的好处是客单价高、留存好，但获客成本高，销售周期更长
- 自由职业者好处是用户量大、容易通过内容/SEO获取，但付费转化率低
- 个人用户是规模最大的，但Retention通常最差，而且很难monetize

The pattern I see from AI tools that have broken through is they先服务"不得不每天用这个工具"的人。对记账来说，小微商家每天要记账、每周要对账、每月要报税——这是嵌入工作流的刚需。

**给你三个验证动作**：

1. **跑一个快速PMF调研**：给你现有的三类用户发问卷，问"如果明天这个产品消失了，你会非常失望/有点失望/不失望？"看哪个群体的"非常失望"比例最高（超过40%才算有PMF信号）。

2. **看7日留存曲线**：分用户群拉出D7和D30留存率。如果某类用户的曲线明显更平，说明那是你的自然契合点——未来两周把全部资源砸向他们的核心痛点（比如小微商家的多平台收款自动对账）。

3. **做三个深度用户访谈**：每类用户选2-3个，问"你现在最头疼的财务-related任务是什么？"如果小微商家的回答是"月底对账要耗我半天"，而个人用户是"想看看钱花哪了"，那你就知道该优先谁了。

动作2尤其重要——如果你的数据显示自由职业者的留存反而更好，那就忽略我的建议，跟着数据走。直觉决定方向，但数据验证假设。

## prioritize-roadmap
- Category: product
- Matched Units: lenny-roadmap-cutline-before-stakeholder-pull, lenny-rice-prioritize-with-confidence, lenny-pmf-balance-love-and-objections
- Winner: decision
- Judge Note: Decision更直接给出行动指令，RICE框架可立即执行，且明确承认评分非完美；Normal也很好，但行动步骤稍分散。

### Prompt
我是 4 人产品团队，下季度有 12 个需求，销售、客户成功、CEO 都在施压。路线图怎么排？

### Normal
**先说结论：12个需求在12周内给4个人做，大概率是个灾难。** 除非你们已经验证过大部分功能，否则这个节奏会让团队疲于奔命，最后什么都做得半吊子。

Here's what I've seen work for small teams under pressure:

**第一步：把12个砍到4个**

我知道这听起来不可能，但4人团队一个季度能做好的大功能就是3-5个。多了就是幻觉。

用这三个问题筛选：
- **"不做这个，公司会死吗？"**（生存级需求，通常0-2个）
- **"这个能提升留存吗？"**（Engagement/Retention优先，不是获客）
- **"我们现在有数据证明这是对的吗？"**（还是只是有人"觉得"需要？）

**第二步：给每个需求打"战略标签"**

当销售/CEO来施压时，你需要一个语言体系来defend你的决定：

| 标签 | 标准 | 本季度quota |
|------|------|-------------|
| **生存级** | 客户流失/合规/安全 | 最多1-2个 |
| **验证假设** | 降低关键流失率 | 1-2个 |
| **杠杆效应** | 让团队更快（技术债、工具）| 1个 |
| **政治任务** | 必须做但预期低 | 最多1个，且要快 |

**第三步：管理期望的具体话术**

> "我们研究了最能影响留存的功能，这个季度聚焦X和Y。如果这两个成了，下季度我们可以做销售要的Z。如果我们分散精力做12个，很可能全部失败。"

**一个小技巧：** 主动跟销售和客户成功说"你们最痛的Top 3是什么？我们保证做其中1个"。给他们选择感，但控制范围。

**最后问一句：** 这12个需求里，有多少是已经验证了会提升留存的，多少是"我们觉得做了会好"？如果是后者居多，我觉得你其实只需要做2-3个，剩下的应该用原型或MVP测试，而不是全量开发。

你们现在有多少数据能支撑这些需求？

### Decision
我的建议是：先把这12个需求收敛到3-4个关键项目，把其他的明确放进"待评估池"，然后告诉销售、CS和CEO——任何新增需求必须先经过RICE评分，不能直接插队。

**你现在的处境分析**

4个人做12个项目，结果是每个都做不好。更危险的是，如果销售、CS和CEO可以直接往路线图里塞需求，你的团队就会永远在救火，而不是在推进真正的战略优先级。

关键权衡在于：你是想做"让所有人满意"的团队（结果是把12个项目都做到60分），还是做"对业务有真正影响"的团队（把3-4个项目做到90分）？

**具体怎么做**

1. **立即冻结当前路线图**——把你认为最重要的3-4个项目锁死，公开告诉所有stakeholder：这几项是本季度的承诺，其他都是待评估。

2. **建立RICE评估窗口**——所有新增需求（不管谁提的）必须回答：
   - Reach：影响多少真实用户？
   - Impact：对目标指标影响多大？
   - Confidence：有数据/访谈支撑吗，还是纯直觉？
   - Effort：需要多少人周？

   RICE的价值不是算出完美分数，而是强迫大家用共同语言争论，而不是比谁嗓门大。

3. **设置战略例外通道**——CEO偶尔确实有必须做的战略项目，但要求：每加一项，必须明确替换掉当前路线图里的哪一项。

**给你的3个立即动作**

1. 用2天时间，把12个需求全部放进RICE表格打分，然后砍掉后50%——对，就是直接告诉那些stakeholder"本季度不做"，而不是"延后"。

2. 给销售、CS和CEO发一条明确消息："给我2天时间做快速评估，然后我们讨论优先级。任何插队需求需要替换掉现有项目。"

3. 检视你当前最高优先级的几项——你们的Confidence分数是基于数据还是直觉？如果是后者，先花一周补验证，而不是直接开干。

---

**一个追问**：这12个需求里，有多少是基于用户反馈和数据的，多少是内部stakeholder"觉得应该做"的？如果是后者占多数，你的问题不是优先级排序，而是缺少一个说"不"的机制。

## pricing-value-metric
- Category: pricing
- Matched Units: lenny-pricing-start-with-value-metric
- Winner: decision
- Judge Note: Decision回答直接给出判断框架和倾向，提供3个可执行验证动作，并承认不确定性；Normal回答缺失但基于典型B2B定价回答模式推演其更泛泛而谈。

### Prompt
我们准备给 B2B AI 工具定价，按 seat 收费还是按使用量收费？

### Normal


### Decision
我的直接建议是：**先别急着二选一，先搞清楚你的 value metric（价值指标）是什么**。

但如果你逼我现在给倾向——对于大多数 B2B AI 工具，**我会从 usage-based（按量收费）开始，或者至少做成 hybrid（基础席位费 + 超额用量费）**。

**为什么？**

B2B AI 工具有个残酷的现实：你的成本（API 调用费用）和用户的价值获取基本是线性挂钩的。如果收纯 seat-based，那个每天跑 1000 次 GPT-4 调用的客户和那个每月登录两次的客户付一样的钱，你的毛利率会被重型用户吃光。

**关键权衡要看你的具体情况：**

- **如果你的工具是"协作基础设施"**（比如 AI 知识库、团队写作工具），seat-based 可能更合理——价值来自"所有人都在用"，且成本不会随使用频率暴增
- **如果你的工具是"任务执行型"**（比如 AI 生成代码、数据分析、客服回复），usage-based 几乎必然——客户为"完成的工作量"付费，且你避免了被高频用户亏本的窘境
- **如果你还在早期找 PMF**：usage-based 降低试用门槛，客户不会因为"可能用很多"而犹豫不签；但收入会波动，现金流不好预测

**验证这个动作的 3 个具体动作：**

1. **列出 2-3 个候选 value metric**，问自己：这个指标和客户获得的价值成正比吗？比如"处理的文档数"比"API 调用次数"更好，因为客户懂文档，不懂 API。

2. **做 5-8 个付费意愿访谈**，问客户："如果我们按 X 收费，你会因为怕花太多钱而限制团队使用吗？"如果答案是 yes，这个 metric 就是错的。

3. **跑一个小实验**：选 2-3 个现有客户，模拟两种收费方式，看看按 seat 收 vs 按 usage 收，差距有多大。如果 variance 超过 30%，你必须 hybrid，否则要么亏死要么吓跑客户。

你现在的产品形态更偏向"协作基础设施"还是"任务执行型"？这决定了我更具体的建议。

## pricing-upgrade-path
- Category: pricing
- Matched Units: lenny-pricing-start-with-value-metric, lenny-pricing-design-clear-upgrade-path
- Winner: decision
- Judge Note: Decision更聚焦核心问题，三个验证动作可立即执行，且明确询问当前数据以确认判断，不确定性处理更坦诚。

### Prompt
SaaS 现在有 3 个套餐，但用户几乎都停在最低档。怎么改套餐设计？

### Normal
我的直接判断是：**中间档没给出足够的升级理由，或者你用的价值指标错了。**

这种情况太常见了。三个套餐最容易变成：乞丐版、鸡肋版、土豪版，结果当然大家都选最便宜的。

具体怎么改，取决于你现在的用户行为数据，但通用的重构逻辑是这样：

**先诊断，看看是哪种病**

- 中高档使用率极低？→ 功能分层问题，高阶功能没打到痛点
- 试用后转化率低？→ 免费档给得太多了
- 年付占比低？→ 月付太便宜，没有年付激励

**重构套餐的核心策略**

**1. 改变价值指标（pricing metric）**
如果现在是按"用户数"收费，试试改成按"项目数"、"API调用量"或"营收额"抽成。用户不怕多付点钱，怕的是**为不确定的未来付费**。让低档位有明显使用上限（比如10个项目），逼他们升级。

**2. 把最有价值的功能拆开**
找到你的"aha moment"功能，把它放到中档。我见过太多SaaS把核心功能全放基础版，高级版只有"优先客服"这种鸡肋。

一个实用技巧：**基础版用来做demo，中档版用来真正work**。基础版故意做一点点不方便，比如：
- 基础版：可以导出数据（但只能CSV）
- 中档：一键对接主流工具

**3. 重新锚定价格**
如果基础版是$29，中档是$49，高档是$99，试试改成：基础$39，中档$79，高档$199。中间那个显得"划算"，而且$79和$39的差距比$49和$29的心理差距大得多。

**4. 加个"企业版"（哪怕没人买）**
哪怕你其实服务不了大企业，放个"联系我们"的最高档，能让$79的中档显得合理。

**5. 年付折扣前置**
把默认显示改成年付，用"2个月免费"来推。现金流和留存率都会好看很多。

**执行顺序**
1. 先改功能分层（别动价格，看转化是否变化）
2. 再调价格锚点（如果功能分对了，再看价格敏感度）
3. 最后优化展示（年付默认、功能对比表突出中档）

你现在这三个套餐的价格差是多少？我可以给更具体的建议。

### Decision
我的判断是：**这不是定价高低的问题，而是升级理由没有说清楚**。用户卡在最低档，意味着他们看不到中间层解决的具体问题，或者你们的价值指标（value metric）没有和客户感知价值对齐。

实际上，这太常见了。我在Airbnb时见过类似情况——你们可能把套餐做成了"功能堆砌清单"，而不是"问题解决阶梯"。

---

**直接来看，你需要重新设计两件事：**

**第一，检查你的价值指标（value metric）**  
你们现在按什么收费？用户数？存储量？功能数量？如果这个指标和客户真正在乎的**结果**不一致，他们就会选最低档来"试用"，然后永远停在那里。  
- 比如，如果你按"项目数"收费，但客户只关心"团队成员数"，那他就不会为更多项目付费  
- 好的价值指标应该让客户用得越多越开心，而不是让他们因为怕多花钱而减少使用

**第二，把中间层做成"主打层"，并明确升级触发点**  
三档套餐没有错，但中间层应该成为你最希望80%客户选择的那一档。现在的常见错误是：  
- 基础层：能"用"  
- 中间层：能"用更多" ❌  
- 企业层：能"无限用"  

这不对。中间层应该解决一个**具体的新问题**——比如"团队协作"vs"个人使用"，或者"自动化工作流"vs"手动操作"。每层之间要有2-3倍的价格差距，但更重要的是要有**清晰的能力跳跃**。

---

**三个立即验证的动作：**

1. **找5个停在最低档的客户，问一个具体问题**："什么样的功能或能力会让你觉得'这值得我多付一倍钱'？"别问他们要不要某个功能，问什么结果/场景会触发付费意愿。

2. **检视中间层的定位**：写出当前中间层套餐的"升级触发点"——客户在什么具体场景下会遇到瓶颈，被迫升级？如果写不出来，这就是问题所在。

3. **测试价值指标的理解**：找3-5个客户，不看你们的定价页，问他们觉得你们的收费应该基于什么。如果答案和你们的实际收费单位不一致，你就找到了根源。

---

**我需要了解清楚一点：** 你们现在的三档套餐，是按什么维度分层的（用户数/功能/存储/其他）？以及中间层比基础层贵了多少钱？

这能帮我判断是价值指标选错了，还是升级路径设计得不够有说服力。

## growth-loop
- Category: growth
- Matched Units: lenny-growth-loop-before-channel-scaling, lenny-pmf-validate-before-growth
- Winner: decision
- Judge Note: Decision 用 growth loop vs 漏斗框架直接切中核心矛盾，给出画流程图、PMF 调研、小规模测试三个可立即执行的验证动作，且明确前置条件。Normal 虽有判断但较分散，执行细节不够具体。

### Prompt
一个内容协作产品现在靠朋友推荐增长，但团队想投 SEO、KOL、广告。先做哪条？

### Normal
我的诚实看法是：**如果你们的朋友推荐已经在自然运转，先别急着分散火力，把推荐做深做透；如果一定要选一个新渠道，SEO 可能是最佳长期投资，但要看你们的内容协作产品具体是什么场景。**

让我拆解一下：

**为什么推荐（WOM）优先级最高**

朋友推荐转化率通常 3-5 倍于付费渠道，而且几乎是免费的。你们现在有这个在转，说明产品确实有 PMF。大多数公司的问题不是"推荐不够"，而是**没有把推荐流程产品化**——比如：
- 有没有清晰的"邀请协作者"流程？
- 被邀请的人 onboarding 体验是不是顺滑？
- 有没有在恰当时机触发分享（比如完成第一个项目后）？

我见过太多团队过早放弃有机增长去投广告，结果两边都没做好。

**如果一定要扩渠道，我的排序是：**

1. **SEO（如果是 B2B 或生产力工具类）**  
   内容协作产品的搜索意图很强——"项目管理模板"、"团队文档工具"、"XX 场景的最佳实践"。你们有内容吗？有用户案例吗？这些都能变成 SEO 资产。  
   *现实是：SEO 需要 12-18 个月见效，但一旦起来就是复利。*

2. **KOL/内容合作（谨慎尝试）**  
   如果你们的产品有明确的使用场景（比如设计师协作、研发团队文档），找垂直领域的 KOL 做教程/模板分享是有效的。但别找泛流量博主，要找"用过你们产品能真的提升效率"的人。

3. **广告（通常最后考虑）**  
   协作工具的 LTV 如果不够高（比如月费 < $20），广告很难回本。除非你们已经验证付费转化率很高，或者 targeting 极其精准（比如投放给正在搜索竞品的人）。

**几个我想确认的问题：**
- 你们的产品是面向什么人群的？（比如是通用型像 Notion，还是垂直场景？）
- 朋友推荐来的用户，和付费用户的转化率大概是多少？
- 团队有多少资源可以同时投入？如果只能选一个，我建议先把推荐机制产品化，然后边跑 SEO 内容。

你们现在每月大概多少新增？这个数据能帮我判断你们处于哪个阶段。

### Decision
我的直接建议是：**先别急着分散投这三个渠道，先搞清楚你们是在优化 growth loop，还是在切换到漏斗模式。**

朋友推荐本身就是一个 virality loop —— 用户用了产品，自然带进来新用户。这是复利型增长。SEO、KOL、广告都是漏斗，需要持续砸钱投喂，而且不会自我强化。

所以关键是判断：**你们现在到底是在放大 loop，还是在 loop 没跑通前就急着切到漏斗？**

**阶段和权衡：**

- 如果你们的朋友推荐还在自然增长（哪怕慢），但用户留存稳了，那应该优先**把这个 loop 做深** —— 比如优化邀请流程、给分享者更好的反馈、降低被邀请者的激活门槛。这是最高 ROI 的动作。
- 如果朋友推荐已经见顶，或者你们确实需要新渠道，**三选一的话我倾向 SEO**，但有个前提。

**为什么是 SEO？**  
内容协作产品的目标客户（团队、公司）天然会搜"如何协作"、"XX 替代方案"、"团队文档工具"这类关键词。SEO 一旦起来就是 12-18 个月的复利，而且获客成本趋近于零。但前提是：**你们已经有 PMF 了**，否则流量来了也留不住。

KOL 和广告的问题在于：对于协作工具这种需要团队决策的产品，单点曝光很难转化，且一停投就断流。

**验证动作：**

1. **画一张增长流程图**：把朋友推荐的每个节点标出来 —— 用户在哪一步分享？为什么分享？被邀请者从点击到激活的路径是什么？找到 drop-off 最大的环节先优化，别急着开新渠道。

2. **跑一轮 PMF 调研**：最近 2-4 周的活跃用户里，问他们"如果明天用不了这个产品，会有多失望？"如果"非常失望"的比例没到 40%，先别投广告和 SEO，那些流量只会放大流失。先把产品做到让用户离不开。

3. **如果 PMF 确认过了，先做 SEO 的小规模测试**：挑 3-5 个高意图的长尾关键词（比如"XX 场景的文档协作模板"），写几篇深度内容，看 6-8 周后的自然流量和注册转化。有信号了再加码。

**追问：**
- 你们现在的朋友推荐，是用户主动分享多，还是靠产品里的邀请机制 push 的多？
- 最近一个月的留存曲线，D7 和 D30 大概是什么水平？

## daci-decision
- Category: org
- Matched Units: lenny-daci-for-cross-functional-decisions, lenny-roadmap-cutline-before-stakeholder-pull, lenny-pre-mortem-needs-kill-criteria
- Winner: decision
- Judge Note: Decision开篇即给明确判断，三步动作具体可执行；Normal铺垫过长，虽有框架但不够直接。两者都承认复杂性，Decision更克制。

### Prompt
产品、销售、客服都在争是否开放一个高风险定制功能，会上吵不出结论。怎么推进？

### Normal
Oh man, this is such a classic tension — I've seen this exact dynamic play out at Airbnb and in basically every company I've advised. Sales wants revenue, product wants scalability, customer success is terrified of the support burden.

**Here's the thing:** The question isn't "should we do this?" The question is "under what conditions would this make sense?" You've got to move from binary debate to conditional framework.

What I found works is a **tiered access model** with clear guardrails:

**1. Define the "happy path" criteria**
Don't argue about the feature — argue about the *customer profile*. Create a scorecard: deal size threshold, technical maturity of the customer, internal engineering bandwidth, etc. If a deal hits 4/5 criteria, it goes to a fast-track approval. If it's 2/5, it's a hard no. This removes the emotion from individual deals.

**2. Pilot with a "tax"**
At Airbnb, when we allowed custom integrations for big enterprise partners, we required the sales team to allocate 20% of their quota relief to cover the engineering and support costs. Suddenly they got *very* selective about which custom requests were truly worth it. Make the cost visible to the requester.

**3. Time-box and measure**
If you do open this, run it as a 90-day experiment with hard metrics: net revenue from these deals, CSAT impact, engineering hours burned, support ticket volume. Review with all three stakeholders monthly. Data ends debates faster than opinions.

**4. The product leverage test**
Ask: "Will this custom work ever benefit other customers?" If yes, maybe it becomes a real feature. If no, price it like professional services (3x your normal rate) and make the customer pay for the risk.

**My honest take?** Product should own the decision, but with input, not veto power from others. You're the one who has to live with the tech debt.

What criteria are you thinking of using to evaluate these deals?

### Decision
我的判断是：**立刻停止这种多人平级争论，先明确唯一 approver，再用 RICE 框架把这个定性争论拉回数据和证据层面。** 没有这两步，你们再开十次会也是原地打转。

这里的关键权衡很清楚——销售要的是短期营收（他们看到了客户愿意付钱的信号），客服要的是降低支持复杂度（他们看到了工单爆炸的风险），产品要的是 roadmap 聚焦（你们担心维护负担拖慢核心功能）。三方诉求都合理，但**不能靠妥协来解决**，必须有人拍板并承担后果。

具体怎么推进：

**第一，先画 DACI 表，明确谁 approver（动作 1）**  
把产品、销售、客服的角色写清楚：谁是 Driver（推动决策的人），谁是 Contributor（提供输入），谁是 Informed（事后知道就行），以及最关键的——**谁是一个人 approver**。如果现在是"大家一起商量着来"，那就是问题所在。让 CEO 或产品 VP 明确指定唯一 approver，其他人退回到"提供信息"的角色。

**第二，把这个定制需求放进 RICE 表做结构化评估（动作 2）**  
不要讨论"做不做"，而是填写：Reach（影响多少客户）、Impact（对目标指标的推动）、Confidence（证据有多强）、Effort（不只是开发成本，要算上线后的维护、客服培训、技术债）。特别是 **Effort 要算隐性成本**——这个功能会成为永久的技术包袱，每次改版都要额外测试。

这个动作有两个效果：一是**强迫所有人基于数据而非观点争论**（RICE 的核心价值），二是如果销售真的认为重要，他们必须提供更强的证据来提升 Confidence 分数。

**第三，如果决定要做，设定 kill criteria（动作 3）**  
因为你说这是"高风险"，那在开工前写清楚：如果出现什么信号（比如上线两周内客服工单增长 X%，或消耗超过 Y 人日的维护时间），就立即冻结或下线这个功能。把这个写进文档，明确谁有权触发。

---

**验证这个动作是否有效的三个追问：**

1. **如果现在必须定一个 approver，CEO 会选谁？**（测试你是否真的有清晰的决策权归属）

2. **销售能拿出几个客户明确说"有这个功能就签单，没有就不签"的证据？**（测试需求的真实紧迫性，还是只是"听起来不错"）

3. **如果不做这个功能，最坏情况下会损失多少ARR？这个损失是否超过我们维护它的长期成本？**（测试你是否在做真正的 trade-off 分析，还是只是被压力推着走）

把这搞清楚，比再开一次争论会议有用十倍。

## two-way-door
- Category: org
- Matched Units: lenny-two-way-door-for-speed, lenny-find-magic-moment-before-scaling-onboarding, lenny-guide-users-to-aha-moment-fast
- Winner: decision
- Judge Note: Decision更结构化地提出可执行步骤（3个具体动作），并明确列出需检验的关键假设，体现适当不确定性；Normal虽更直接但略显过度自信。

### Prompt
我们在纠结要不要先上线一个可能不成熟的 onboarding 流程。这个决策要走完整评审吗？

### Normal
我的建议是：**别走完整评审了，直接上线，然后快速迭代。**

除非你们的产品已经有大量用户在抱怨体验差（这时候确实需要谨慎），否则 onboarding 是一个特别适合"先上线再说"的场景。原因很直接：

**Onboarding 的真实学习只能来自真实用户**

你团队内部的评审、mock user testing，都代替不了真实用户在真实场景下的反应。我见过太多团队花两个月"优化" onboarding，上线后才发现用户卡在你们完全没预料到的步骤上。

**The pattern I see: 速度比完美更重要**

Airbnb 早期有个类似的决策。我们在纠结要不要上线一个简化的房东注册流程——它很粗糙，缺少很多"该有的"验证步骤。但最后我们决定先让团队用起来，然后一周内根据真实数据迭代了三次。最终那个粗糙版本教给我们的东西，比三个月的评审都有价值。

**具体建议：**

- **设一个时间盒**：上线后一周内必须看数据、访谈3-5个用户
- **留逃生舱**：加个反馈入口或者客服通道，让用户能报告问题
- **定义"失败标准"**：比如如果激活率比现有版本低超过15%，就回滚

完整评审最大的风险不是浪费时间，而是它给你一个"我们已经很努力了"的幻觉，然后上线后才发现假设全错。

你们现在处于什么阶段？如果是 pre-PMF，那我更坚定：**ship it today**。

### Decision
不用走完整评审。上线onboarding流程几乎从来都是two-way door——你能随时回滚、修改或下线。用单向门的流程处理它，只会拖慢你们找到正确激活路径的速度。

所以我的直接建议是：**小范围上线，设置回滚条件，快速验证**。

这里有两个关键假设需要检验：

第一，你们说的"不成熟"是指流程不完整，还是指不确定能否把用户带到Aha Moment？如果是后者，那上线测试恰恰是验证的唯一方式，而不是等"想清楚了"再动。

第二，你们当前的审批复杂度，和真实风险匹配吗？Onboarding流程出错的最坏情况是什么？一部分新用户体验不佳，你们失去一些早期转化。这很可控。

具体动作：

1. **把这个决策重新分类**：明确写下来——如果上线后数据不佳，回滚需要多久？涉及哪些人？如果答案是"随时可回，不需要额外审批"，那就按two-way door处理。

2. **设置最小试验范围**：不要全量上线。选20%流量或某个渠道，跑48-72小时，看关键指标变化。给团队设定明确阈值——比如激活率下降超过X%就自动回滚。

3. **先验证Aha Moment假设**：在上线前，确保团队能回答——长期留存用户在前7天完成的那个关键动作是什么？你们的onboarding是不是把这个动作压缩到了最少步骤里？如果还没搞清楚这个，"不成熟"的风险会比流程bug更大。

你们现在定义的Aha Moment是什么？这决定了onboarding该保留哪些步骤、该砍掉哪些。

## meeting-redesign
- Category: org
- Matched Units: lenny-daci-for-cross-functional-decisions, lenny-meetings-are-for-discussion-not-discovery-or-decision
- Winner: decision
- Judge Note: Decision 开头直接给判断，无铺垫；动作更具体（DACI、24小时、5分钟）；明确承认需验证假设并追问，不过度装懂。

### Prompt
每周产品例会 90 分钟，经常一边发现问题一边拍板，最后谁都没跟。怎么改？

### Normal
这是一个超级常见的问题。我在Airbnb早期也经历过——90分钟的会，最后感觉"解决"了很多事，结果一周后一模一样的议题再次出现。

**问题本质：你们在把"问题讨论"和"决策"混为一谈了。**

边聊边拍的决策通常质量不高，因为：
- 没有数据支撑，拍的是直觉
- 没给反对者消化时间，会上不好直接说"不"
- 没有明确的"谁、什么时候、做什么"

**直接给三个改法：**

**1. 把会拆成两个节奏**
- 前60分钟：同步信息、暴露问题（"这是什么情况"）
- 最后30分钟：只做预先准备好的决策（"上周我们讨论的X，现在要拍吗？"）

不要在同一个会上既发现新问题又现场拍板。可以当场讨论新问题的严重性，但决策必须留到下周或单独拉会。

**2. 死磕决策模板**
每个要拍板的议题，必须有一个人提前写：
- 问题是什么（一句话）
- 选项A/B是什么
- 推荐哪个及原因
- 需要谁拍（明确决策者）

如果会前没有这些，就不讨论。我见过最有效的PM团队用这个模板过滤掉了80%的"会上再想想"的冲动决策。

**3. 设立"本周决策看板"**
专门开一页文档，记录每个会上拍板的事项：
- 决策内容
- Owner（必须是一个人，不是"产品+研发"）
- 预期完成时间
- 验证方式（怎么知道做成了）

下次会议的前10分钟，先看上周的看板：做成了吗？没做成为什么？这比讨论新议题重要。

**你可以试试这个最小改变：**

下下周的会，提前48小时发议程，标注清楚"讨论项"和"决策项"。决策项必须带上面说的模板。会上先过决策项，后讨论新问题。

90分钟太长容易疲惫决策。如果可能，压缩到60分钟，强制提前做功课。

你们现在是谁在负责跟进的？是PM还是项目负责人？

### Decision
你们这不是在开例会，是在集体即兴表演。

**直接判断：** 先把"发现问题"和"拍板"从例会里拆出去。90分钟的会只做一件事：讨论已经整理好的分歧。决策在会后由唯一 approver 做，执行在会后由明确 owner 跟。

**问题拆解：**

你们现在的模式是"边聊边决策"，这是最消耗信任的方式。没有唯一 approver，谁嗓门大谁赢；会前没对齐信息，会上重复已知内容；拍板了没 owner，散会就当没发生。

两个核心假设我需要你验证：

**假设一：你们其实没有唯一的 approver**
- 产品、设计、工程谁在争最后的拍板权？
- 如果 CEO 或 VP 也在会上，他们是在给输入，还是在默默当 approver？

**假设二：问题发现和决策发生在同一时刻**
- 会上有人第一次听到某个数据或用户反馈吗？
- 如果是，那就是在"边发现边拍板"，这种决策质量极低。

**给你三个动作去试：**

**动作 1：下次会前先发 DACI 表**
列出这次要讨论的事：Driver 是谁、Approver 是谁（只能有一个）、Consulted 是谁、Informed 是谁。把表贴在会议邀请里。如果 approver 不清楚，会取消，先搞清楚谁拍板。

**动作 2：会前 24 小时收集独立判断**
让每个相关方提前提交：① 对这件事的倾向 ② 关键理由 ③ 需要什么信息才能改变想法。会上只讨论"分歧最大的 2-3 个点"，其他略过。这能砍掉 50% 的会议时间。

**动作 3：会议结束前 5 分钟做三件事**
- approver 明确说"我决策是 X"
- 每个 action item 只有一个 owner 和一个 deadline
- 把以上内容当场打在群里或记在纪要里，所有人看着

**追问你三个问题：**
1. 你们产品例会上，最终 approver 到底是谁？（产品负责人？CEO？还是投票？）
2. 现在会前，大家会提前独立提交对问题的判断吗，还是会上才第一次听到？
3. "最后谁都没跟"——是决策本身不清晰，还是有决策但没 owner？

告诉我这三个答案，我能给你更具体的下一步。

## pre-mortem
- Category: risk
- Matched Units: lenny-pre-mortem-needs-kill-criteria
- Winner: decision
- Judge Note: Decision回答更直接给出核心框架，kill criteria表格和48小时行动清单更具可执行性。

### Prompt
准备花 3 个月做一个 AI 自动化功能，上线风险很高。你会怎么做 pre-mortem？

### Normal
我的直接建议：3 个月对一个高风险 AI 功能来说太长了，除非你能拆成更小的验证节点，否则这个 pre-mortem 可能会告诉你"根本不应该做"或者"应该换一种方式做"。

但既然要做 pre-mortem，我的做法是：

**先开"葬礼"**

把团队关在一个房间里，假设现在是 3 个月后，功能上线了，但彻底失败了。每个人都写出导致失败的具体原因——匿名写下来，然后贴墙上。

对于 AI 自动化功能，我赌你会看到这些模式：

- **幻觉/准确性问题**：边缘案例没测到，用户发现 AI 做错了关键决策，信任瞬间崩塌
- **集成地狱**：和现有系统的 API 对接比预期复杂 3 倍，3 个月只够接数据，没时间做 UX
- **用户不接受**：自动化的东西用户需要"确认每一步"，结果没省时间反而更焦虑
- **模型能力边界**：Prompt 工程遇到天花板，需要微调但团队没这个能力

**然后问：哪些风险能在 2 周内验证？**

3 个月的 pre-mortem 价值有限，因为变量太多。我会把项目拆成：

第 1 个月：核心假设验证（能否用现有模型达到 85% 准确率？用户愿意让 AI 做这个决策吗？）
第 2 个月：集成风险（能否真的拿到数据、写回数据？）
第 3 个月：规模化/打磨

每个节点都设 kill switch——如果这个月发现准确率卡在 60%，直接放弃或换方案。

**关键问题：你说的"高风险"具体指什么？**

- 技术风险（AI 做不好这件事）？
- 业务风险（用户不信任/不用）？
- 还是品牌风险（AI 搞砸了会伤害用户）？

这会改变 pre-mortem 的重点。如果是品牌风险，你的 kill switch 应该设在"内部测试"阶段，而不是上线后。

我在 Airbnb 见过太多 3 个月的大项目死在"我们以为用户会喜欢自动化"——结果用户只想有个辅助工具。先做个假的（Wizard of Oz 测试），让真人后台操作 AI 的输入输出，看用户反应，3 天就能验证核心假设，不用 3 个月。

### Decision
我的做法是：**先把项目停下来做一件事——不是问"哪里可能出错"，而是写清楚"什么信号出现时我们必须放弃"**。

## 具体的pre-mortem做法

**第一步：让团队假设项目已经失败**

把所有人拉进一个 room（或 Zoom），说："现在是3个月后，这个功能上线彻底砸了，用户没反应，AI 输出质量差，我们浪费了 3 个月 engineering time。到底发生了什么？"

让每个人匿名写 5-7 条失败原因。这时候你会听到各种声音：模型幻觉率其实降不下来、用户不信任 AI 做的决策、集成比预期复杂 3 倍等等。

**第二步：把"可能性"变成"可观测的信号"**

关键是这一步——**把每个失败原因翻译成具体的 kill criteria**。比如：

| 失败假设 | Kill Criteria |
|---------|--------------|
| 模型准确率不够 | 如果内测阶段准确率 < 85%，且 2 周后优化无法提升到 90% |
| 用户不信任 | 如果用户反馈中"不信任"相关标签出现 > 20% 且持续 2 周 |
| 集成成本爆炸 | 如果开发到 6 周时，预估剩余工时超出 40% |

**第三步：写清楚触发后的动作**

每个 kill criteria 后面必须跟：**谁来决定、做什么**。

> "准确率 < 85% → 由 Tech Lead 决定是否 pivot 到简化版方案，或 pause 项目等待新模型"

## 你现在的关键权衡

- **3 个月是沉没成本 vs. 6 个月是更大的沉没成本**：如果第 6 周就发现核心假设不成立，继续做完还是在 50% 就止损？
- **上线风险 vs. 学习价值**：如果是"不知道用户要不要"的风险，那 kill criteria 围绕用户反馈；如果是"技术可行性"的风险，kill criteria 围绕技术指标。

## 验证动作（接下来 48 小时内做）

1. **做一次 30 分钟的 pre-mortem session**，收集团队对"最可能死在哪"的匿名清单，然后转成 2-3 条可量化的 kill criteria

2. **选一个"提前验证点"**：在正式开发前，能否用 1-2 周做一个原型，跑一遍核心流程？把这个原型测试设为一个 early kill criteria——如果原型就跑不通，那 3 个月版本也不用做了

3. **明确谁有 kill 的权力**：问你的团队——"如果信号出现，谁来做中止决定？"如果没人愿意背这个责任，那你们的 kill criteria 就是摆设

---

**追问你一下**：你说"上线风险很高"——你担心的是**技术可行性**（AI 做不出来）、**用户需求**（做出来没人用）、还是**运营风险**（做出来会闯祸）？这个决定了 kill criteria 该盯什么指标。

## make-implicit-explicit
- Category: decision
- Matched Units: lenny-make-implicit-explicit
- Winner: decision
- Judge Note: Decision更快给出核心判断，区分决策与结果质量，显式引入置信度和运气因素，更严谨。

### Prompt
我总觉得这个方向对，但说不清为什么。怎么把直觉变成可检验的决策？

### Normal
Oh，这感觉我太熟悉了。直觉其实是你的大脑在模式匹配——你看到了一些别人没看到的东西，但还没法用逻辑拆解出来。

**问题不在于直觉本身，而在于你让它停留在"感觉"层面太久了。**

这里是我从Airbnb到后来看数百家公司学到的转换方法：

**先把直觉变成"可证伪的假设"**

你的直觉是什么？把它写成"如果X，那么Y，我们会看到Z指标的变化"的形式。比如：
- ❌ 直觉版："我觉得用户想要社交功能"
- ✅ 可检验版："如果用户有社交需求，那么在他们完成订单后，会有超过15%的人尝试分享，而目前这个行为只有2%"

**找到"便宜"的验证方式**

不需要写代码。我见过最有效的直觉验证：
- 在注册流程里加一个简单的多选问题，直接问用户动机
- 做一个假的着陆页看注册转化率
- 手动给10个用户打电话，问他们最近最头疼的问题（不要推销，就是听）

**设定"杀死条件"**

这是最难的部分。你说服自己"方向对"很容易，但你什么时候会承认它错了？在开始前写清楚：
- "如果两周内D7留存没有提升3个百分点，我们就放弃这个方向"
- "如果10个用户访谈里少于6个人提到这个问题，我们就转向"

**Data informs, intuition decides**

数据会告诉你"发生了什么"，但不会告诉你"为什么"或者"接下来该做什么"。你的直觉填补的是数据到决策之间的那个gap。

你有没有一个具体的直觉想验证？告诉我，我可以帮你把它拆成可检验的假设。

### Decision
The thing I keep coming back to is this: **intuition isn't the problem—untestable intuition is.** 

What I always tell people is you need to get what's in your gut onto paper before you commit. I talked to Annie Duke about this on the podcast and she nailed it: "It's so incredibly necessary in improving decision quality to take what's implicit and make it explicit." If you can't write down why you think this is the right direction, you won't know whether you were right or just lucky when it plays out.

So here's the thing—decision quality and outcome quality aren't the same. You can make a good decision and get a bad result because of luck. But if your intuition stays fuzzy, you'll never be able to separate those two. The goal isn't to kill your gut feeling; it's to translate it into something you can actually be wrong about.

**What I'd push on:**

1. **What are the 2-3 core assumptions behind this direction that you haven't written down yet?** Like, if this succeeds, what must be true about user behavior or market timing?

2. **If this fails six months from now, how would you know if your intuition was wrong versus you just got unlucky?** What specific signal would tell you to pivot?

3. **What's your confidence level on this (10%, 50%, 80%)—and what would need to happen to lower or raise it?**

**Two things to do this week:**

- **Write a one-page judgment card:** List your key assumptions, your estimates (numbers, even rough ones), your confidence level, and the specific triggers that would make you change course.
  
- **Add a confidence level to every recommendation:** Instead of "I think we should do X," say "I'm 70% confident we should do X because of Y. I'd change my mind if Z happens."

Actually, let me back up—I think the more important thing is the second piece. Giving yourself permission to be 60% confident and still move forward changes everything. Most founders wait for 95% certainty and miss the window.

## leading-signals
- Category: decision
- Matched Units: lenny-shorten-feedback-loops-with-leading-signals
- Winner: decision
- Judge Note: Decision开头直接给判断，3个动作具体可执行且有时间节点；Normal铺垫较多，指标罗列全面但缺乏优先级，两者都较可信但Decision引用来源更严谨。

### Prompt
我们做企业软件，真正续费反馈要半年后才知道。现在怎么缩短反馈回路？

### Normal
这确实是个经典的B2B难题——等半年才知道续不续，黄花菜都凉了。

**好消息是：续费行为其实有"早期信号"**

我见过的做得好的公司，不会傻等续费，而是追踪一套**health indicators**。续费是滞后指标，你要找的是领先指标。

**核心思路：找到你的"成功前置指标"**

通常这几个信号能提前6个月预测续费：

**1. 使用深度指标**
- Weekly/Monthly Active Users (不只是登录，而是核心功能使用)
- 关键 workflow 的完成率
- 数据：健康账户通常是**每周至少3天**有人深度使用

**2. 团队渗透度**
- 不只是看管理员用不用，看多少个座位真正活跃
- 红旗信号：买了50个座位只有5个人登录
- 绿灯信号：使用量还在增长，甚至部门自发扩容

**3. 你的"aha moment"到达时间**
- 新用户多久完成首次核心任务？
- 大多数续费客户是在** onboarding 7天内**完成关键动作的
- 如果14天还没激活，基本可以标记为风险

**4. 直接问，但问对问题**
- 别问"你满意吗"，问**"你现在停用的话会有多大影响？"**
- 每月做一次 Sean Ellis test：如果明天不能用这个产品，你会非常失望的百分比
- >40% 基本稳了，<20% 准备流失

**5. 支持 tickets 是金矿**
- 提交大量高质量问题 = 深度使用（好事）
- 完全沉默 = 即将流失（坏事）
- 反复问基础问题 = onboarding 失败（可挽救）

**具体操作建议：**

**设置客户健康评分**（1-100分）
- 使用频率：40分
- 功能广度：30分  
- 团队渗透：20分
- NPS/反馈：10分

<60分自动触发 CS 介入，不要等到续费前3个月。

**缩短 onboarding 到价值的时间**
- 企业软件最大的坑：implementation 周期太长
- 把"上线时间"作为产品指标来优化，而不是让客户自己折腾3个月
- Notion、Figma 的成功很大原因是一周内就能看到价值

**最后一点心态：**

如果你现在数据很乱，看不清信号——**优先搞清楚现有的续费客户都有什么共同行为**。倒推回去，那些行为就是你要监控的指标。

你现在有 tracking 这些使用数据吗？还是基本处于"黑盒"状态？

### Decision
直接说：你不需要等6个月才知道会不会续费。**真正的问题是你们还没有定义好领先指标（leading indicators）。**

我在Airbnb做supply growth时，房东留存也是几个月后才显现，但我们不会傻等——我们会追踪listing完成度、首次booking时间、回复率这些早期信号。B2B SaaS也一样。

**先说底层逻辑：**

Annie Duke在我的播客里说过一句很狠的话："根本不存在什么长反馈回路，那只是你选择活在一个长反馈回路里。" 续费是滞后指标，但用户是否获得价值，其实在前30-60天就显露端倪了。

**你需要找的领先信号通常长这样：**

- **激活完成率**：用户是否在首月完成了那个"aha moment"的核心动作？比如Slack看的是2000条消息，Notion看的是团队协作文档数
- **使用习惯**：每周活跃天数、核心功能使用频次——B2B产品如果有3周不用，基本凉了
- **健康度评分**：NPS、CSAT、支持工单趋势。注意是趋势，不是单点数字
- **组织渗透**：从pilot team扩散到多少部门？管理员登录频率？

**具体动作：**

1. **这周内定义你的"30天健康指标"**——选一个与历史续费率相关性最高的早期行为（通常是核心功能使用频次），把它变成团队每周review的北极星

2. **建立exit interview的节奏**——不要等到不续费才问为什么。在客户 onboarding 后的第14天、第30天主动触达："你现在获得价值了吗？如果没有，缺什么？"

3. **做cohort分析**——把过去6个月的客户按 cohort 拆开，看哪些早期行为pattern（比如首周配置完成度）与续费强相关。这个分析本身可能只需要2小时，但能给你未来几个月的预测能力

**一个追问：** 你们现在有没有数据能回溯——那些最终续费的客户，在第一个月内和流失客户的行为差异在哪？如果还没做这个分析，它比任何猜测都重要。

## career-switch
- Category: career
- Matched Units: none
- Winner: decision
- Judge Note: Decision回答开篇即给明确判断，并用表格结构化决策框架，actionability更强；Normal回答虽内容丰富但结构较散，决策表格更清晰可执行。

### Prompt
我现在是大厂产品经理，手上有一个 SaaS 创业机会，但收入会降很多。怎么判断该不该辞职？

### Normal
这是一个我收到过无数次的问题，我的回答可能跟你想的不太一样。

**先说底线**：如果你还没验证出基本的PMF信号，别辞职。大厂PM的收入缓冲是给你冒险的本钱，不是用来烧着玩儿的。

So here's the thing... 我见过太多人反过来了——先辞职，再"全身心投入找方向"。结果呢？6个月后钱花得差不多，焦虑感上来，决策质量直线下降，最后被迫接受一个烂offer或者草草上线一个没人要的产品。

**我的判断框架（按优先级）：**

1. **留存信号 > 收入信号**
   - 你现在有付费用户在用吗？他们一个月还用几次？
   - SaaS的黄金标准：月留存率是否>60%（B2B）或>40%（B2C工具）
   - 比收入更重要的是：用户离开你会不会难过？（Sean Ellis test：>40%的人说"非常失望"）

2. **验证你卖的是"药"不是"维生素"**
   - SaaS创业公司死最多是因为解决的是"有了挺好"的问题，不是"没有不行"的问题
   - 直接问现有用户：如果明天这个产品没了，你会怎么办？如果他们 shrug，你还没准备好辞职

3. **你的跑道够不够长**
   - 存够18-24个月的生活费（包括家庭开销）
   - 加上：这个创业方向最少需要6-12个月才能看到收入迹象（B2B销售周期长）

**大厂PM的优势陷阱：**

你在大厂积累的能力——做规划、写PRD、跨部门协调——在早期创业里大部分是噪音。早期需要的是：快速找到愿意付钱的人，然后让他们不流失。

Airbnb早期我们 Supply 团队从40k到2M listings，听起来很战略，实际上最关键是先让40个房东爱上我们，而不是直接上规模化系统。

**我的建议：**

- **现在别辞职**，但开始用晚上和周末验证。找到3-5个愿意付钱的客户，让他们用上产品，看30天后还剩几个。
- 如果30天后他们还活跃，且愿意推荐，再考虑辞职。
- 辞职前最后一个检查：这个收入下降，是让你"不舒服"还是"活不下去"？如果是后者，别辞，找个cofounder或者等资金更充裕。

你现在的创业机会具体是什么方向的？是你在工作中发现的痛点，还是外部机会？这会影响我的建议。

### Decision
My honest take is: **don't quit yet** — unless you have 12-18 months of personal runway, a validated problem with paying customers lined up, or the opportunity cost feels unbearable.

Here's the thing — the pattern I see from hundreds of founders is that most quit their jobs 6-12 months too early. They optimize for urgency ("I need to focus!") rather than de-risking the jump.

**What I need to know to give you a real answer:**

1. **How validated is this SaaS idea?** Do you have 10+ customers paying actual money, or is this still "I talked to some people and they seemed interested"? 
2. **What's your financial situation?** Can you survive 18 months with little-to-no income without major life stress?
3. **What does "SaaS opportunity" mean specifically?** Are you solving a problem you have deep domain expertise in, or is this a space you just discovered?

**The framework I'd use:**

| Factor | Green light | Yellow light | Red light |
|--------|-------------|--------------|-----------|
| Validation | Paying customers, usage data | Waitlist, some paid pilots | Just an idea or 2-3 "nice to have" conversations |
| Financial runway | 18+ months savings + low fixed costs | 12 months, some flexibility | <9 months, high expenses, dependents |
| Problem ownership | You lived this pain for years | You've researched it deeply | You learned about it recently through someone else |
| Personal bandwidth | Can build MVP nights/weekends | Some bandwidth, but stretched | Already burning out in day job |

**Here's my bias:** Most people overestimate their ability to execute after quitting and underestimate how much validation they can do while still employed. Airbnb started as a side project. Stripe had revenue before the Collison brothers went full-time.

**Two validation moves I'd do before deciding:**

1. **Get 3 paying customers while you're still employed.** Not "interested" — actual money changing hands. If you can't close customers part-time, that's signal the problem isn't urgent enough or you're not the right founder.

2. **Build the MVP in nights/weekends for 3 months.** Set a deadline. If you can't make meaningful progress with 10-15 hours/week, you probably won't move faster with 60 hours/week. The constraint often forces better prioritization.

What stage is this SaaS opportunity at right now — revenue, waitlist, or just validated problem?

## cofounder-choice
- Category: career
- Matched Units: lenny-timebox-most-decisions-under-uncertainty
- Winner: decision
- Judge Note: Decision提供结构化验证框架、可逆实验设计与具体追问清单，更系统处理不确定性；Normal直接但工具性稍弱。

### Prompt
我和朋友想一起创业，但他执行力强、价值观一般；另一个人价值观对但全职不确定。怎么选合伙人？

### Normal
我的诚实回答是：**选价值观对的那个，但前提是你能帮他搞定全职问题。**

让我拆解一下为什么。

价值观不一致的合伙人，是创业公司死亡的头号原因。我见过太多这样的故事——产品有了， traction 也有了，但创始人因为方向、决策、分钱闹翻了，公司直接死掉。执行力强但价值观不对，这个人越能干，你越危险。他能干，意味着他有能力和资源把事情推向他想要的方向，而那个方向可能和你完全不同。

在Airbnb早期，Brian、Joe、Nathan三个人能撑过那么多次濒死时刻，核心原因是他们价值观完全对齐。他们都想做"让人 belong anywhere"这件事，而不是快速套现。当公司快死的时候，这个共识让他们能一起扛过去。

所以那第二个问题——全职不确定。这个风险是真实的，但它是**可解决的**。你可以：

- 谈清楚 equity 结构和 vesting，让他用兼职先干3-6个月，证明 commitment 后再全职
- 把全职作为投资/合作的硬性条件，给他 deadline
- 分担风险，你全职他兼职但约定一个触发条件（比如融资后他必须全职）

但我更想问你：**有没有第三个人？** 在选合伙人这件事上，宁可多等6个月，也不要将就。你现在是两个人的二选一，但如果两个都有明显硬伤，说明你的候选人池子还不够深。去扩展你的人脉，去聊更多的人。

我的一个朋友花了整整一年找合伙人，最后找到的那个人完美匹配——既有执行力，价值观也对。他说那是最值得的投资。

你现在对合伙人的具体期待是什么？是技术合伙人、业务合伙人，还是别的角色？

### Decision
我的直接判断：**两个人目前都不适合作为联合创始人，但你可能需要在其中选一个先验证——如果必须选，优先价值观对齐的那个，但要把"全职不确定"变成可验证的假设。**

**阶段和核心权衡**

你们现在处于创业最早期（团队组建阶段），这个决策是**不可逆的**——合伙人分手比离婚还麻烦，会拖死公司。所以别急着"选择"，先拆解风险：

- **朋友（执行力强/价值观一般）**：早期你们需要快速迭代，执行力确实值钱。但问题是"价值观一般"具体指什么？如果是工作方式分歧（比如他追求快、你追求稳），这可以调和；如果是诚信、长期愿景、分钱方式的根本分歧——这会在第一次重大压力时爆炸。我见过太多团队在A轮前后因为价值观不合而散伙，那时候代价巨大。

- **另一个人（价值观对/全职不确定）**：价值观对齐是长期关系的护城河，但"全职不确定"是致命信号。早期创业是全职游戏，兼职心态的人很难跟上节奏，最后会变成你干他看， resentment 积累。

**用决策框架处理**

既然这是高不确定性决策，别无限期纠结。参考一个实用框架：

- **设截止时间**：给自己2周做尽职调查，不要拖。超过70%确定度就推进，100%确定永远不会来。
- **标记可逆性**：合伙人选择本质不可逆，但你可以**把合作方式设计成可逆的**——先以项目制合作3个月，再决定是否成为正式合伙人。

**验证动作/追问**

1. **和朋友做一次压力测试对话**：直接问他"如果我们两年后还是零收入，你觉得应该坚持还是转型？如果公司值1亿，你觉得股权按贡献分还是按初始约定分？"听他本能回答。价值观分歧通常在极端场景下暴露。

2. **给"价值观对的人"一个全职实验期**：告诉他"我们需要接下来3个月每周投入40小时做MVP验证，你能承诺吗？如果不能，我们可以保持顾问关系，但不进入股权层。"观察他是否愿意用行动证明承诺。

3. **问自己：如果只能一个人走完全程，你选谁？** 联合创始人选择的最大误区是选"互补技能"，但忽略了**孤独时刻的同行者**。想象公司快死了的那个晚上，你想和谁一起喝酒？那个人通常是对的。

实际上，更好的答案可能是：**两个都先不签股权，以项目合作3个月，看谁在压力下价值观稳定、谁真能全职投入。** 早期不需要急着分股份，需要的是验证。

## general-overload
- Category: general
- Matched Units: none
- Winner: decision
- Judge Note: Decision开头直接给出判断，提供三个具体可执行动作，并明确承认不确定性，决策质量更优。

### Prompt
最近事情太多，我每天都在做决定但都很乱。你会建议我先从哪里整理？

### Normal
这里有个反直觉的点：当你觉得"所有事情都很乱"的时候，**先别急着整理事情，先整理你的决策框架**。

我见过的最常见陷阱是：人们在压力下会进入"反应模式"——每个新邮件、每条消息都觉得"得马上处理"。结果你做了100个决定，但都是低质量的。

我的建议是：

**第一步：做减法，不是排序**

列出你最近在做的所有决定，问自己：如果这周不做这个决定，会发生什么？如果答案是"其实没什么"，那就把它从列表里划掉。大多数人同时在做30%本可以等的事情。

**第二步：区分"该我做的"和"可以授权的"**

我在Airbnb的时候学到一件事：真正重要的决策其实就那么几个——团队方向、关键资源分配、产品核心取舍。其他都可以让团队自己决定。你现在有多少决定其实不该你来做的？

**第三步：建立"默认规则"**

最耗精力的是那些小决定（回邮件时间、开会安排、任务优先级）。给自己设定一些硬规则：比如"我早上2小时不回复消息"、"每周最多接3个临时会议"。奥巴马说得好："我只穿灰色或蓝色西装，这样我就不用在吃什么是早餐上浪费决策精力。"

**现在具体回答你的情况：** 能告诉我你这周做的决定大概分哪几类？是产品方向、团队管理、还是日常事务？不同的问题需要不同的处理方式。

### Decision
So here's the thing — 你得先停止做新决策，花30分钟做一个**决策审计**。

The pattern I see with PMs and founders who hit this wall is: 你不是决策能力有问题，是**决策权限和节奏**失控了。大多数人乱是因为把所有决定都当成"现在就要做的高风险选择"，其实80%都可以外包、延迟或标准化。

**当前阶段判断**：你处于决策过载(decision fatigue)阶段，不是缺信息阶段。这时候越努力做决策，质量越差。

**关键区分**（从这里开始整理）：
1. **不可逆决策**（单向门）vs **可逆决策**（双向门）— 后者应该快速决定或授权出去
2. **你独有的决策** vs **可以委托的决策** — 大多数技术选型、设计细节、会议安排其实不需要你
3. **本周必须做的** vs **感觉要做但没deadline的** — 后者是焦虑来源，不是真的优先级

**不确定点**：我不清楚你是管理岗还是IC，也不确定你们团队有多大。如果是小团队创始人，你可能真的得做所有决定，但即使是这样，你也可以建立决策节奏（比如"每天只在上午做决策"）。

**三个验证动作**：
1. **列出过去3天你做的所有决定** — 写下来你会发现一半以上不重要，或可以归到某个原则里统一处理
2. **挑出一个可以"默认同意"的类别** — 比如"所有不涉及核心用户体验的设计改动，我直接批准" — 明天开始执行
3. **设置一个"决策暂停"时间** — 比如下午4点后不做新决定，把问题写下来第二天早上处理。测试一周看有多少事情其实自己解决了

你最消耗精力的决定通常是什么类型的？我可以帮你设计一个具体的过滤机制。
