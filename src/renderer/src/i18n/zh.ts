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
    lennyPlaceholder: string
    pgPlaceholder: string
    conversationCount: (n: number) => string
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
    mentalCognition: string
    mentalGoals: string
    mentalThinking: string
    mentalDomain: string
    mentalEmotion: string
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
    preferences: '偏好设置',
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
    mentalCognition: '认知框架',
    mentalGoals: '长期目标',
    mentalThinking: '思维偏好',
    mentalDomain: '领域知识',
    mentalEmotion: '情绪模式',
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
    lennyPlaceholder: '向 Lenny 提问…',
    pgPlaceholder: '向 Paul Graham 提问…',
    conversationCount: (n: number) => `${n} 条对话`,
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
}

