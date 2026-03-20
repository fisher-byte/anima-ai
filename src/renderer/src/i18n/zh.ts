/**
 * 中文翻译
 */

export interface Translations {
  canvas: {
    nodeCount: (n: number) => string
    spacesLabel: string
    zoomIn: string
    zoomOut: string
    resetView: string
    timeline: string
    history: string
    moreApps: string
    globalSearch: string
    aboutMemory: string
    evolutionLog: string
    newBadge: string
    preferences: string
    githubLink: string
    mergeNodes: string
    analyzing: string
    merged: (n: number) => string
    mergeProgress: (done: number, total: number) => string
    welcomeDefault: string
    welcomeRecent: (topic: string) => string
    welcomeGoal: (goal: string) => string
    greeting: (goal: string) => string
    nightCare: string
    mondayReminder: (topic: string) => string
    preferenceMemorized: (p: string) => string
    mergeBanner: (n: number) => string
    mergeBtn: string
    lennySubtitle: string
    pgSubtitle: string
    zhangSubtitle: string
    wangSubtitle: string
    fileLibrary: string
    skills: string
    hideSpaces: string
    showSpaces: string
    ongoingDecisions: string
    ongoingDecisionsCount: (n: number) => string
    ongoingDecisionsEmpty: string
    ongoingDecisionsHint: string
    ongoingDecisionDue: (date: string) => string
    ongoingDecisionNoDate: string
    ongoingDecisionStatusActive: string
    ongoingDecisionStatusRevisited: string
  }
  input: {
    placeholder: string
    collapse: string
    expand: string
    removeRef: string
    fileTooLarge: (name: string, size: string) => string
    imageLabel: (name: string) => string
    invalidKey: string
    keyTimeout: string
    uploadFailed: (status: number) => string
    uploadNetworkError: string
    needApiKey: string
    setApiKey: string
    apiKeyPlaceholder: string
    cancel: string
    validating: string
    save: string
    parsing: string
    uploadFile: string
    memoryBadge: (n: number) => string
    send: string
    hint: string
    fileSearch: string
    vectorizing: string
    noFileMatch: string
    atSpaces: string
    atFiles: string
    noSpaceMatch: string
    skillsLabel: string
    skillsPolish: string
    skillsPolishDesc: string
    skillsAnalyze: string
    skillsAnalyzeDesc: string
    skillsSummarize: string
    skillsSummarizeDesc: string
    skillsTranslate: string
    skillsTranslateDesc: string
    skillsBrainstorm: string
    skillsBrainstormDesc: string
    skillsCodeReview: string
    skillsCodeReviewDesc: string
    skillsApply: string
  }
  settings: {
    title: string
    identityCode: string
    copied: string
    copy: string
    identityHelper: string
    cancelMigration: string
    migratePrompt: string
    identityCodePlaceholder: string
    migrateBtn: string
    apiKeyLabel: string
    sharedKeyNotice: string
    apiKeySavedPlaceholder: string
    apiKeyDefaultPlaceholder: string
    apiKeySavedHelper: string
    apiKeySecureHelper: string
    baseUrlLabel: string
    baseUrlPlaceholder: string
    modelLabel: string
    kimiGroup: string
    openaiGroup: string
    saveSuccess: string
    saveError: string
    saving: string
    saveBtn: string
    language: string
    exportDataLabel: string
    exportDataBtn: string
    exporting: string
  }
  space: {
    backToMySpace: string
    talkTo: string
    knowsYourMemory: string
    conversationHistory: string
    settingsTooltip: string
    loading: (name: string) => string
    historyTitle: (name: string) => string
    noHistory: string
    noContent: string
    deleteNodeTitle: string
    deleteNodeWarning: string
    deleteCancel: string
    deleteConfirm: string
    clickHint: string
    deleteNodeTooltip: string
    decisionModeNormal: string
    decisionModeLingSi: string
    lennyPlaceholder: string
    pgPlaceholder: string
    zhangPlaceholder: string
    wangPlaceholder: string
    customPlaceholder: (name: string) => string
    conversationCount: (n: number) => string
    createSpaceTitle: string
    createSpaceName: string
    createSpaceNamePlaceholder: string
    createSpaceTopic: string
    createSpaceTopicPlaceholder: string
    createSpaceColor: string
    createSpacePrompt: string
    createSpacePromptPlaceholder: string
    createSpaceAvatar: string
    createSpaceAvatarPlaceholder: string
    createSpaceCreate: string
    createSpaceCancel: string
    createSpaceCreating: string
    createSpaceMaxReached: string
    createSpaceNameRequired: string
    mySpaces: string
    addSpace: string
    deleteSpaceTitle: string
    deleteSpaceWarning: string
    deleteSpaceConfirm: string
  }
  sidebar: {
    historyTab: string
    memoryTab: string
    evolutionTab: string
    loading: string
    noHistory: string
    aboutMemory: string
    refreshMemory: string
    consolidating: string
    consolidate: string
    consolidateTip: string
    memoryDesc: string
    loadingMemory: string
    memoryWritten: string
    memoryAdded: (n: number) => string
    noMemory: string
    chatMore: string
    editMemory: string
    deleteMemory: string
    cancel: string
    save: string
    userProfile: string
    edit: string
    clear: string
    clearProfileTitle: string
    clearProfileMsg: string
    clearProfileConfirm: string
    forgetLabel: string
    writingStyleLabel: (style: string) => string
    lastUpdated: (date: string) => string
    mentalModel: string
    refresh: string
    mentalModelTooltip: string
    consolidateQueued: string
    consolidateBusy: string
    mentalModelQueued: string
    mentalModelSaved: string
    refreshError: string
    mentalCognition: string
    mentalGoals: string
    mentalThinking: string
    mentalDomain: string
    mentalEmotion: string
    mentalInputHint: string
    mentalDomainHint: string
    evolutionDesc: string
    noPreferences: string
    lastActive: (date: string) => string
    forgetPreference: string
    profOccupation: string
    profLocation: string
    profWritingStyle: string
    profInterests: string
    profTools: string
    profGoals: string
    appliedMemories: (n: number) => string
  }
  feedback: {
    title: string
    typeBug: string
    typeSuggestion: string
    placeholder: string
    uploadImage: string
    submit: string
    submitting: string
    thanks: string
    error: string
  }
  login: {
    subtitle: string
    enterToken: string
    invalidToken: string
    serverError: string
    networkError: string
    verifying: string
    enter: string
  }
  onboarding: {
    splitTitle: string
    splitBody: string
    splitBold: string
    splitBodySuffix: string
    startExplore: string
  }
  modal: {
    onboardingHint: string
    memorized: string
    /** 对话窗顶部：空间 + 模式说明 */
    sessionSpaceLenny: string
    sessionSpacePg: string
    sessionSpaceZhang: string
    sessionSpaceWang: string
    sessionSpaceCustom: (name: string) => string
    sessionSpaceCustomDefault: string
    sessionModeLingSi: string
    sessionModeNormal: string
    sessionModelThinking: string
    sessionBadgeSep: string
    lingsiEvidence: string
    lingsiMode: string
    lingsiDecisionTrace: string
    lingsiUnits: (n: number) => string
    lingsiSources: (n: number) => string
    lingsiOpenTrace: string
    lingsiTraceWaitForCompletion: string
    lingsiTraceView: string
    lingsiMatchedUnits: string
    lingsiNoMatchedUnits: string
    lingsiNoMatchedUnitsBody: string
    lingsiStatePack: string
    lingsiStatePackSummary: string
    lingsiStatePackFallback: string
    lingsiPreferredPath: string
    lingsiNextActions: string
    lingsiFollowUpQuestions: string
    exportMd: string
    exportJson: string
    connecting: string
    cancel: string
    send: string
    memoriesRef: (n: number) => string
    edit: string
    copy: string
    regenerate: string
    retry: string
    stopGeneration: string
    clarifyTitle: string
    clarifyOpt1: string
    clarifyOpt2: string
    clarifyPrefix: string
    clarifyPlaceholder: string
    exportMdLabel: string
    exportJsonLabel: string
    fileTooBig: string
    uploadFailed: (status: number) => string
    uploadNetworkError: string
    evolutionActive: (n: number) => string
    geneRecorded: string
    profileUpdated: string
    backgroundAnalysis: string
    gotIt: string
    closingMemoryGenerated: string
    closingNoted: string
    closingApplied: (n: number) => string
    onboardingIntroPlaceholder: string
    replyPlaceholder: string
    chars: (n: number) => string
    decisionCardTitle: string
    decisionCardStatusDraft: string
    decisionCardStatusAnswered: string
    decisionCardStatusAdopted: string
    decisionCardStatusRevisited: string
    decisionCardStatusArchived: string
    decisionCardNextActions: string
    decisionCardAdoptTitle: string
    decisionCardAdoptBody: string
    decisionCardAdopt: string
    decisionCardAdoptDays: (days: number) => string
    decisionCardRevisitAt: (date: string) => string
    decisionCardOutcomeTitle: string
    decisionCardOutcomeWorking: string
    decisionCardOutcomeMixed: string
    decisionCardOutcomeNotWorking: string
    decisionCardOutcomeUnknown: string
    decisionCardOutcomeNotesPlaceholder: string
  }
  timeline: {
    noNodes: string
    noTitle: string
    filesRow: string
    fileLabel: (name: string) => string
  }
  nodeTimeline: {
    conversations: (n: number) => string
    since: (date: string) => string
    loading: string
    noRecords: string
    noContent: string
    continue: string
  }
  search: {
    placeholder: string
    tabNodes: (n: number) => string
    tabContent: (n: number) => string
    typeToSearch: string
    noResults: string
    escHint: string
  }
  importMemory: {
    title: string
    stepSelect: string
    stepConfirm: string
    stepPaste: (name: string) => string
    stepGeneric: string
    confirmGemini: string
    geminiCopied: string
    pastePlaceholder: (name: string) => string
    saving: string
    save: string
    copied: string
    copy: string
    genericNote: string
    genericPlaceholder: string
    otherAI: string
    otherAIDesc: string
    externalAI: string
  }
  grayHint: {
    concise: string
    avoid: string
    structured: string
    yourPref: string
    prefix: string
  }
  thinking: {
    analyzing: string
    deepReasoning: string
    fullThinking: string
    waiting: string
    doneSummary: (n: number) => string
    done: string
  }
  fileBubble: {
    size: string
    type: string
    unknown: string
    download: string
  }
  clusterLabel: {
    capability: string
    memories: (n: number) => string
    clickToUse: string
  }
}

export const zh: Translations = {
  // ── Canvas ──────────────────────────────────────────────────────────────
  canvas: {
    nodeCount: (n: number) => `${n} 个节点`,
    spacesLabel: 'Spaces',
    zoomIn: '放大',
    zoomOut: '缩小',
    resetView: '重置视图',
    timeline: '时间轴视图',
    history: '对话历史',
    moreApps: '更多应用',
    globalSearch: '全局搜索',
    aboutMemory: '关于你的记忆',
    evolutionLog: '进化日志',
    newBadge: '新',
    preferences: '设置',
    githubLink: '开源项目 GitHub',
    mergeNodes: '整理相似节点',
    analyzing: '分析中…',
    merged: (n: number) => `已合并 ${n} 组`,
    mergeProgress: (done: number, total: number) => `${done}/${total}`,
    welcomeDefault: '说点什么吧，我会记住的。',
    welcomeRecent: (topic: string) => `最近你在关注「${topic}」，今天有什么新想法？`,
    welcomeGoal: (goal: string) => `你在努力实现「${goal}」，今天走到哪一步了？`,
    greeting: (goal: string) => `你好，上次聊到"${goal}"，有新的进展吗？`,
    nightCare: '我注意到你最近经常在深夜聊天，还好吗？',
    mondayReminder: (topic: string) => `新的一周，上周你在关注「${topic}」，这周想继续吗？`,
    preferenceMemorized: (p: string) => `我记住了：${p}，今天会注意的。`,
    mergeBanner: (n: number) => `发现 ${n} 个历史节点，要整理合并相似话题吗？`,
    mergeBtn: '整理',
    lennySubtitle: 'Product · Growth',
    pgSubtitle: 'Startup · Thinking',
    zhangSubtitle: 'Product · WeChat',
    wangSubtitle: 'Product · Meituan',
    fileLibrary: '文件库',
    skills: '技能',
    hideSpaces: '收起空间列',
    showSpaces: '展开空间列',
    ongoingDecisions: '进行中决策',
    ongoingDecisionsCount: (n: number) => `${n} 条需要继续推进`,
    ongoingDecisionsEmpty: '还没有进行中的决策',
    ongoingDecisionsHint: '当你采纳一条决策建议后，它会出现在这里，方便后续回访。',
    ongoingDecisionDue: (date: string) => `回访时间 · ${date}`,
    ongoingDecisionNoDate: '待设置',
    ongoingDecisionStatusActive: '进行中',
    ongoingDecisionStatusRevisited: '已回访',
  },

  // ── InputBox ─────────────────────────────────────────────────────────────
  input: {
    placeholder: '问我任何事',
    collapse: '折叠',
    expand: '展开',
    removeRef: '移除引用块',
    fileTooLarge: (name: string, size: string) => `文件 "${name}" 超过 10MB 限制（当前 ${size}MB）`,
    imageLabel: (name: string) => `[图片: ${name}]`,
    invalidKey: 'Key 无效，请检查后重试',
    keyTimeout: '验证超时，请检查网络',
    uploadFailed: (status: number) => `上传失败（${status}）`,
    uploadNetworkError: '网络错误，文件未能上传到记忆库',
    needApiKey: '需要配置 Kimi API Key 才能开始对话',
    setApiKey: '设置 API Key',
    apiKeyPlaceholder: '粘贴你的 Kimi API Key（moonshot.cn 获取，如 sk-…）',
    cancel: '取消',
    validating: '验证中…',
    save: '保存',
    parsing: '解析中...',
    uploadFile: '上传文件 (图片、文档、代码)',
    memoryBadge: (n: number) => `${n} 记忆`,
    send: '发送',
    hint: 'Enter 发送 · Shift+Enter 换行',
    fileSearch: '@ 搜索文件 / 空间',
    vectorizing: '向量化中',
    noFileMatch: '未找到匹配文件',
    atSpaces: '空间',
    atFiles: '文件',
    noSpaceMatch: '未找到匹配空间',
    skillsLabel: '技能',
    skillsPolish: '写作润色',
    skillsPolishDesc: '润色并优化文字表达',
    skillsAnalyze: '深度分析',
    skillsAnalyzeDesc: '多角度分析问题',
    skillsSummarize: '总结提炼',
    skillsSummarizeDesc: '提炼核心要点',
    skillsTranslate: '翻译',
    skillsTranslateDesc: '中英互译',
    skillsBrainstorm: '头脑风暴',
    skillsBrainstormDesc: '发散思维，生成创意',
    skillsCodeReview: '代码审查',
    skillsCodeReviewDesc: '检查代码质量与问题',
    skillsApply: '应用',
  },

  // ── SettingsModal ─────────────────────────────────────────────────────────
  settings: {
    title: '应用设置',
    identityCode: '我的身份码',
    copied: '已复制',
    copy: '复制',
    identityHelper: '换设备时，在新设备的设置里输入此码，可恢复你的所有记忆。',
    cancelMigration: '取消迁移',
    migratePrompt: '输入其他设备的身份码来迁移记忆 →',
    identityCodePlaceholder: '粘贴身份码…',
    migrateBtn: '切换身份，加载对应记忆',
    apiKeyLabel: 'API Key (安全存储)',
    sharedKeyNotice: '✓ 服务器已配置共享 Key，目前免费开放使用。如有自己的 Key 可填写以提升额度。',
    apiKeySavedPlaceholder: '已保存，填写新值可覆盖',
    apiKeyDefaultPlaceholder: 'sk-...',
    apiKeySavedHelper: 'API Key 已保存。留空不修改，填写新值可覆盖。',
    apiKeySecureHelper: '你的密钥加密保存在服务端数据库，不会暴露给浏览器。',
    baseUrlLabel: 'API 代理地址 (可选)',
    baseUrlPlaceholder: 'https://api.moonshot.cn/v1',
    modelLabel: '当前模型',
    kimiGroup: 'Kimi (Moonshot)',
    openaiGroup: 'OpenAI',
    saveSuccess: '保存成功',
    saveError: '保存失败，请检查网络',
    saving: '保存中…',
    saveBtn: '保存设置',
    language: '语言',
    exportDataLabel: '导出数据',
    exportDataBtn: '导出全量数据 (JSON)',
    exporting: '导出中…',
  },

  // ── ConversationSidebar ──────────────────────────────────────────────────
  sidebar: {
    historyTab: '历史',
    memoryTab: '记忆',
    evolutionTab: '进化基因',
    loading: '加载中...',
    noHistory: '暂无对话记录',
    aboutMemory: '关于你的记忆',
    refreshMemory: '刷新记忆',
    consolidating: '整理中…',
    consolidate: '整理',
    consolidateTip: 'AI 合并重复或过时的记忆条目，新信息优先保留',
    memoryDesc: 'AI 从每次对话中自动摘取你透露的信息，在这里积累成你的专属记忆。',
    loadingMemory: '正在加载…',
    memoryWritten: '✦ 新记忆已写入',
    memoryAdded: (n: number) => `新增 ${n} 条`,
    noMemory: '暂无记忆条目',
    chatMore: '多聊几次，记忆会自动积累',
    editMemory: '编辑这条记忆',
    deleteMemory: '删除这条记忆',
    cancel: '取消',
    save: '保存',
    userProfile: '用户画像',
    edit: '编辑',
    clear: '清空',
    clearProfileTitle: '清空用户画像？',
    clearProfileMsg: '所有画像信息将被删除，不可恢复。',
    clearProfileConfirm: '清空',
    forgetLabel: '遗忘',
    writingStyleLabel: (style: string) => `回答风格：${style}`,
    lastUpdated: (date: string) => `最近更新：${date}`,
    mentalModel: '心智模型',
    refresh: '刷新',
    mentalModelTooltip: '重新提炼心智模型',
    consolidateQueued: '整理任务已提交，约 30 秒后完成，刷新可查看结果',
    consolidateBusy: '已有整理任务在进行中，稍后刷新查看',
    mentalModelQueued: '心智模型重建任务已提交，约 30 秒后自动刷新',
    mentalModelSaved: '心智模型已保存',
    refreshError: '刷新失败，请检查网络后重试',
    mentalCognition: '认知框架',
    mentalGoals: '长期目标',
    mentalThinking: '思维偏好',
    mentalDomain: '领域知识',
    mentalEmotion: '情绪模式',
    mentalInputHint: '多个条目请用逗号分隔',
    mentalDomainHint: '每行一个领域，格式：领域: 等级',
    evolutionDesc: '每次你觉得回答不对劲，说出来，我就会记住。这里是已经记下来的规则。',
    noPreferences: '尚未习得任何偏好',
    lastActive: (date: string) => `最后活跃：${date}`,
    forgetPreference: '遗忘这条偏好？',
    profOccupation: '职业',
    profLocation: '城市/地区',
    profWritingStyle: '回答风格（如简洁、详细）',
    profInterests: '兴趣（逗号分隔）',
    profTools: '工具/技术（逗号分隔）',
    profGoals: '目标（逗号分隔）',
    appliedMemories: (n: number) => `已应用 ${n} 条记忆`,
  },

  // ── Spaces (shared) ───────────────────────────────────────────────────────
  space: {
    backToMySpace: '我的空间',
    talkTo: '与他对话',
    knowsYourMemory: '他知道你的记忆背景',
    conversationHistory: '对话历史',
    settingsTooltip: '设置',
    loading: (name: string) => `正在加载 ${name} 的知识库…`,
    historyTitle: (name: string) => `${name} 对话历史`,
    noHistory: '还没有对话记录',
    noContent: '（无内容）',
    deleteNodeTitle: '删除这条对话？',
    deleteNodeWarning: '删除后不可恢复。',
    deleteCancel: '取消',
    deleteConfirm: '删除',
    clickHint: '点击节点查看历史或提问，或在此输入 · Enter 发送',
    deleteNodeTooltip: '删除节点',
    decisionModeNormal: '普通',
    decisionModeLingSi: '决策',
    lennyPlaceholder: '向 Lenny 提问…',
    pgPlaceholder: '向 Paul Graham 提问…',
    zhangPlaceholder: '向张小龙提问…',
    wangPlaceholder: '向王慧文提问…',
    customPlaceholder: (name: string) => `向 ${name} 提问…`,
    conversationCount: (n: number) => `${n} 条对话`,
    createSpaceTitle: '创建自定义空间',
    createSpaceName: '名称',
    createSpaceNamePlaceholder: '如：Steve Jobs',
    createSpaceTopic: '主题描述',
    createSpaceTopicPlaceholder: '如：Startup philosophy',
    createSpaceColor: '颜色',
    createSpacePrompt: 'System Prompt',
    createSpacePromptPlaceholder: '描述这个 AI 角色的背景和风格…',
    createSpaceAvatar: '头像缩写',
    createSpaceAvatarPlaceholder: '如：SJ',
    createSpaceCreate: '创建',
    createSpaceCancel: '取消',
    createSpaceCreating: '创建中…',
    createSpaceMaxReached: '最多创建 5 个自定义空间',
    createSpaceNameRequired: '请填写名称',
    mySpaces: '我的空间',
    addSpace: '新建空间',
    deleteSpaceTitle: '删除这个空间？',
    deleteSpaceWarning: '此操作将删除所有对话记录，不可恢复。',
    deleteSpaceConfirm: '删除',
  },

  // ── Feedback ──────────────────────────────────────────────────────────────
  feedback: {
    title: '反馈',
    typeBug: '报错',
    typeSuggestion: '建议',
    placeholder: '描述遇到的问题或建议…',
    uploadImage: '上传截图（可选）',
    submit: '提交',
    submitting: '提交中…',
    thanks: '感谢反馈！',
    error: '提交失败，请重试',
  },

  // ── LoginPage ─────────────────────────────────────────────────────────────
  login: {
    subtitle: '请输入访问令牌以继续',
    enterToken: '请输入访问令牌',
    invalidToken: '令牌无效，请重新输入',
    serverError: '服务异常，请稍后再试',
    networkError: '网络异常，请检查连接',
    verifying: '验证中...',
    enter: '进入',
  },

  // ── OnboardingCompletePopup ───────────────────────────────────────────────
  onboarding: {
    splitTitle: '已拆分成两个节点',
    splitBody: '你的对话已保存到画布，接下来',
    splitBold: '自由探索',
    splitBodySuffix: '就好——随便问我什么，我都会自动帮你整理记忆。',
    startExplore: '开始探索',
  },

  // ── AnswerModal & AnswerModalSubcomponents ────────────────────────────────
  modal: {
    onboardingHint: '随时可以关闭，下次点击「新手教程」继续',
    memorized: '已记住：',
    sessionSpaceLenny: 'Lenny 空间',
    sessionSpacePg: 'Paul Graham 空间',
    sessionSpaceZhang: '张小龙 空间',
    sessionSpaceWang: '王慧文 空间',
    sessionSpaceCustom: (name: string) => `${name} · 自定义空间`,
    sessionSpaceCustomDefault: '自定义空间',
    sessionModeLingSi: '灵思决策',
    sessionModeNormal: '普通对话',
    sessionModelThinking: '模型思考中',
    sessionBadgeSep: ' · ',
    lingsiEvidence: '决策依据',
    lingsiMode: '决策模式',
    lingsiDecisionTrace: '当前回答所依据的决策单元与真实来源片段。',
    lingsiUnits: (n: number) => `命中 ${n} 个 Decision Unit`,
    lingsiSources: (n: number) => `${n} 条来源`,
    lingsiOpenTrace: '查看轨迹',
    lingsiTraceWaitForCompletion: '请等回答生成完成后再查看轨迹',
    lingsiTraceView: '决策轨迹',
    lingsiMatchedUnits: '命中单元',
    lingsiNoMatchedUnits: '这次没有命中具体 Decision Unit',
    lingsiNoMatchedUnitsBody: '这个问题更像在问当前项目的整体状态与下一步判断，所以这次主要依据当前项目状态生成回答。',
    lingsiStatePack: '当前项目状态',
    lingsiStatePackSummary: '这次没有命中具体案例，主要参考了当前冲刺、路线图、变更记录和评测基线。',
    lingsiStatePackFallback: '当前回答引用了当前项目状态，而不只是具体的 Decision Unit。',
    lingsiPreferredPath: '推荐路径',
    lingsiNextActions: '下一步动作',
    lingsiFollowUpQuestions: '追问与校验',
    exportMd: '导出对话 (MD)',
    exportJson: '导出全量数据 (JSON)',
    connecting: '正在连接…',
    cancel: '取消',
    send: '发送',
    memoriesRef: (n: number) => `引用了 ${n} 条记忆：`,
    edit: '编辑',
    copy: '复制',
    regenerate: '重新生成',
    retry: '重试',
    stopGeneration: '停止生成',
    clarifyTitle: '想先确认一下方向，这样调研结果更准 ✦',
    clarifyOpt1: '行业与市场数据（规模、趋势、融资）',
    clarifyOpt2: '产品或技术方案对比（功能、优劣势）',
    clarifyPrefix: '请对以下方向做深度调研：',
    clarifyPlaceholder: '或直接写出你想调研的具体问题…',
    exportMdLabel: '导出对话 (MD)',
    exportJsonLabel: '导出全量数据 (JSON)',
    fileTooBig: '文件过大，无法上传到记忆库',
    uploadFailed: (status: number) => `上传失败（${status}）`,
    uploadNetworkError: '网络错误，文件未能上传到记忆库',
    evolutionActive: (n: number) => `已应用 ${n} 条偏好规则`,
    geneRecorded: '✦ 进化基因已记录',
    profileUpdated: '✦ 人物信息已更新',
    backgroundAnalysis: '✦ 已记下，正在后台分析',
    gotIt: '好的，我记住了。',
    closingMemoryGenerated: '记忆已生成 ✦',
    closingNoted: '已记下来了',
    closingApplied: (n: number) => `已应用 ${n} 条进化基因`,
    onboardingIntroPlaceholder: '在这里介绍你自己…',
    replyPlaceholder: '回复…',
    chars: (n: number) => `${n} 字`,
    decisionCardTitle: '决策卡',
    decisionCardStatusDraft: '待整理',
    decisionCardStatusAnswered: '待采纳',
    decisionCardStatusAdopted: '进行中',
    decisionCardStatusRevisited: '已回访',
    decisionCardStatusArchived: '已归档',
    decisionCardNextActions: '下一步动作',
    decisionCardAdoptTitle: '把这次建议变成一个会被追踪的决策',
    decisionCardAdoptBody: '先选一个回访时间。Anima 会记住这条建议，之后再回来问你结果。',
    decisionCardAdopt: '采纳建议',
    decisionCardAdoptDays: (days: number) => `${days} 天后回访`,
    decisionCardRevisitAt: (date: string) => `下次回访：${date}`,
    decisionCardOutcomeTitle: '后来怎么样了？',
    decisionCardOutcomeWorking: '有效',
    decisionCardOutcomeMixed: '部分有效',
    decisionCardOutcomeNotWorking: '没效果',
    decisionCardOutcomeUnknown: '还没做',
    decisionCardOutcomeNotesPlaceholder: '补一条结果备注：发生了什么，哪里有效，哪里没跑通？',
  },

  // ── TimelineView ──────────────────────────────────────────────────────────
  timeline: {
    noNodes: '暂无节点数据',
    noTitle: '无标题',
    filesRow: '上传文件',
    fileLabel: (name: string) => name,
  },

  // ── NodeTimelinePanel ─────────────────────────────────────────────────────
  nodeTimeline: {
    conversations: (n: number) => `${n} 条对话`,
    since: (date: string) => `· 始于 ${date}`,
    loading: '加载中…',
    noRecords: '暂无对话记录',
    noContent: '（无内容）',
    continue: '续话',
  },

  // ── SearchPanel ───────────────────────────────────────────────────────────
  search: {
    placeholder: '搜索节点标题、关键词...',
    tabNodes: (n: number) => `节点 (${n})`,
    tabContent: (n: number) => `内容 (${n})`,
    typeToSearch: '输入关键词开始搜索',
    noResults: '未找到匹配结果',
    escHint: '按 ESC 关闭',
  },

  // ── ImportMemoryModal ─────────────────────────────────────────────────────
  importMemory: {
    title: '导入外部记忆',
    stepSelect: '从其他 AI 把你的记忆带过来',
    stepConfirm: '已复制提示词，跳转后直接粘贴发送，再粘回来',
    stepPaste: (name: string) => `把 ${name} 的回答粘贴到下方`,
    stepGeneric: '复制下方提示词，去你常用的 AI 发送，把回答粘贴回来',
    confirmGemini: '确认跳转到 Gemini',
    geminiCopied: '提示词已复制，跳转之后直接粘贴发送，把回答复制回来。',
    pastePlaceholder: (name: string) => `把 ${name} 的回答粘贴到这里…`,
    saving: '正在提取记忆节点…',
    save: '保存为记忆节点',
    copied: '已复制',
    copy: '复制',
    genericNote: '把上面的提示词发给你常用的 AI（如豆包、文心、通义等），再把回答粘贴到下方。',
    genericPlaceholder: '把 AI 的回答粘贴到这里…',
    otherAI: '其他 AI / 通用方式',
    otherAIDesc: '复制提示词，粘贴回答',
    externalAI: '外部AI',
  },

  // ── GrayHint ──────────────────────────────────────────────────────────────
  grayHint: {
    concise: '简洁表达',
    avoid: '避免某些内容',
    structured: '结构化输出',
    yourPref: '你的偏好',
    prefix: '我记得你上次更喜欢',
  },

  // ── ThinkingSection ───────────────────────────────────────────────────────
  thinking: {
    analyzing: '正在分析...',
    deepReasoning: '深度推理中...',
    fullThinking: '全力思考中...',
    waiting: '正在思考',
    doneSummary: (n: number) => `思考完毕 · ${n} 字`,
    done: '思考完毕',
  },

  // ── FileBubble ────────────────────────────────────────────────────────────
  fileBubble: {
    size: '大小：',
    type: '类型：',
    unknown: '未知',
    download: '下载文件',
  },

  // ── ClusterLabel & NodeCard ───────────────────────────────────────────────
  clusterLabel: {
    capability: '能力',
    memories: (n: number) => `${n} 条记忆`,
    clickToUse: '点击使用',
  },
}
