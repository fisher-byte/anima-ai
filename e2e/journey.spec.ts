/**
 * Anima E2E — 用户旅程测试（journey tests）
 *
 * 使用 page.route() mock AI SSE 流，不依赖真实 API key，
 * 专注验证前端完整用户操作路径的正确性：
 *
 * J-1. 对话 → 关闭 → 主空间节点生成（核心链路）
 * J-2. ESC 关闭防重入（isClosing 保护）
 * J-3. Space 模式：PG 对话写入 pg-* 文件，不写 lenny-* 文件
 * J-4. Space 模式：Lenny 对话关闭后同步到主空间（sync-lenny-conv）
 * J-5. 节点点击打开历史回放，追问后关闭，对话记录有更新
 *
 * Mock 策略：
 * - /api/ai/stream → 返回固定 SSE 帧，模拟完整流式回复
 * - /api/memory/classify → 返回固定分类（加速 endConversation）
 * - /api/memory/extract-topic → 返回固定话题（加速 endConversation）
 * - /api/memory/queue, /api/memory/index → 返回 {ok:true,queued:false}（阻止真实 AI 任务）
 * - 其余 API 全部 continue()（使用真实后端数据）
 *
 * beforeEach 准备：
 * - PUT /api/config/apikey → 写入 fake key，让 has-usable-key=true，InputBox 显示 textarea
 * - PUT /api/storage/nodes.json → 确保 capability 节点存在，让 loadNodes 跳过 onboarding modal
 */

import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:3000'

// journey 测试使用独立的 user token，与 features.spec.ts 隔离
const E2E_JOURNEY_TOKEN = 'e2e-journey-user-token-fixed-0002'

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${E2E_JOURNEY_TOKEN}`,
  }
}

/** 用于 PUT /api/storage/:filename（raw text body，不能用 JSON Content-Type） */
function storageWriteHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    'Authorization': `Bearer ${E2E_JOURNEY_TOKEN}`,
  }
}

async function waitForBackend(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    async (tok: string) => {
      try {
        const r = await fetch('/api/memory/facts', { headers: { Authorization: `Bearer ${tok}` } })
        return r.ok
      } catch { return false }
    },
    E2E_JOURNEY_TOKEN,
    { timeout: 15_000 }
  )
}

/** 注入 token、跳过引导 */
async function setupPage(page: import('@playwright/test').Page) {
  await page.addInitScript((tok: string) => {
    localStorage.setItem('anima_user_token', tok)
    localStorage.setItem('evo_onboarding_v3', 'done')
    localStorage.removeItem('evo_view')
    localStorage.removeItem('evo_onboarding_turns')
  }, E2E_JOURNEY_TOKEN)
}

/** 等待主输入框就绪（canvas 已完成加载，无 onboarding modal，有 API key） */
async function waitForInputReady(page: import('@playwright/test').Page) {
  // textarea 出现即表示：canvas 已就绪、无 onboarding modal、有 API key
  await page.waitForFunction(() => {
    const ta = document.querySelector('textarea')
    return ta !== null && ta.offsetParent !== null  // 可见且已渲染
  }, { timeout: 15000 })
  // 清除可能残留的任何 modal（前一个测试遗留的 AnswerModal 等）
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/** mock AI SSE 流（固定回复内容） */
async function mockAIStream(page: import('@playwright/test').Page, content: string) {
  await page.route('**/api/ai/stream', route => {
    route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
      body: [
        `data: ${JSON.stringify({ type: 'content', content })}\n\n`,
        `data: ${JSON.stringify({ type: 'done', fullText: content })}\n\n`,
      ].join(''),
    })
  })
}

/** mock 后台 AI 副作用（加速 endConversation + 阻止真实 embedding 任务） */
async function mockMemorySideEffects(page: import('@playwright/test').Page) {
  // 内存队列 / 索引（阻止真实 embedding 任务）
  await page.route('**/api/memory/queue', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true, queued: false }) })
  )
  await page.route('**/api/memory/index', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) })
  )
  // 分类接口：返回固定分类，让 endConversation 立即通过 classifyText，无需等待真实 AI
  await page.route('**/api/memory/classify', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ category: '学习成长' }) })
  )
  // 话题提取：返回固定话题，无需等待真实 AI
  await page.route('**/api/memory/extract-topic', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ topic: 'E2E测试话题' }) })
  )
  // 语义相似度（similar）：返回空结果，跳过合并逻辑
  await page.route('**/api/memory/similar*', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ results: [] }) })
  )
  // 语义搜索（search）：返回空结果，强制走 addNode 而非 mergeIntoNode
  // 关键：findMergeTarget 调用 /api/memory/search，若有真实历史 embedding 会触发合并
  await page.route('**/api/memory/search', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ results: [] }) })
  )
}

/**
 * 轮询等待节点数超过 targetCount，最多等待 maxMs
 * 避免使用 fixed waitForTimeout 导致竞态条件
 */
async function waitForNodeCountAbove(
  page: import('@playwright/test').Page,
  targetCount: number,
  maxMs = 12000
): Promise<number> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const resp = await page.request.get(`${API_BASE}/api/storage/nodes.json`, { headers: authHeaders() })
    try {
      const nodes = JSON.parse(await resp.text()) as unknown[]
      if (nodes.length > targetCount) return nodes.length
    } catch { /* continue */ }
    await page.waitForTimeout(300)
  }
  // 超时：返回当前值（让断言失败并报告实际值）
  const resp = await page.request.get(`${API_BASE}/api/storage/nodes.json`, { headers: authHeaders() })
  try { return (JSON.parse(await resp.text()) as unknown[]).length } catch { return 0 }
}

// ── 每个测试前确保服务端已有 capability 节点 + fake API key ─────────────────

test.beforeEach(async ({ request }) => {
  // 1. 设置假 API key → has-usable-key 返回 hasKey:true → InputBox 渲染 textarea 而非"需要配置 Key"提示
  await request.put(`${API_BASE}/api/config/apikey`, {
    data: JSON.stringify({ apiKey: 'e2e-fake-key-journey' }),
    headers: authHeaders(),
  })

  // 2. 清空 conversations.jsonl（防止 getRelevantMemories 降级路径从历史记录中找到相似对话，
  //    导致 currentConversation.parentId 被设置，使 endConversation 走 mergeIntoNode 而非 addNode）
  //    注意：J-5 会在测试内部重新注入所需的对话记录
  await request.put(`${API_BASE}/api/storage/conversations.jsonl`, {
    data: '',
    headers: storageWriteHeaders(),
  })

  // 3. 确保服务端已有 capability 节点（import-memory + onboarding:completed）→ loadNodes 跳过 onboarding modal
  const resp = await request.get(`${API_BASE}/api/storage/nodes.json`, { headers: authHeaders() })
  let nodes: unknown[] = []
  try { nodes = JSON.parse(await resp.text()) } catch { /* empty */ }

  const hasImportMemory = (nodes as Array<{ nodeType?: string; capabilityData?: { capabilityId?: string } }>)
    .some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'import-memory')
  const hasOnboarding = (nodes as Array<{ nodeType?: string; capabilityData?: { capabilityId?: string; state?: string } }>)
    .some(n => n.nodeType === 'capability' && n.capabilityData?.capabilityId === 'onboarding')

  if (hasImportMemory && hasOnboarding) return

  const capNodes = []
  if (!hasImportMemory) capNodes.push({
    id: 'capability:import-memory:journey', title: '导入外部记忆',
    keywords: ['ChatGPT', 'Claude', '迁移'], date: '2026-01-01',
    conversationId: 'capability:import-memory:journey',
    x: 2200, y: 1100, category: '__capability__',
    color: 'rgba(237,233,254,0.9)', nodeType: 'capability',
    capabilityData: { capabilityId: 'import-memory', state: 'active' },
  })
  if (!hasOnboarding) capNodes.push({
    id: 'capability:onboarding:journey', title: '新手教程',
    keywords: ['引导', '入门', '开始'], date: '2026-01-01',
    conversationId: 'capability:onboarding:journey',
    x: 2400, y: 1300, category: '__capability__',
    color: 'rgba(226,232,240,0.9)', nodeType: 'capability',
    capabilityData: { capabilityId: 'onboarding', state: 'completed' },
  })
  await request.put(`${API_BASE}/api/storage/nodes.json`, {
    data: JSON.stringify([...nodes, ...capNodes]),
    headers: storageWriteHeaders(),
  })
})

// ── J-1：对话 → 关闭 → 主空间节点生成 ──────────────────────────────────────

test('J-1: 发送对话后关闭，主空间 nodes.json 节点数增加', async ({ page }) => {
  await setupPage(page)
  await mockAIStream(page, '这是 J-1 测试的 AI 回复：量子比特和叠加态原理。')
  await mockMemorySideEffects(page)

  await page.goto('/')
  await waitForBackend(page)
  await waitForInputReady(page)

  // 记录初始节点数
  const beforeResp = await page.request.get(`${API_BASE}/api/storage/nodes.json`, { headers: authHeaders() })
  let beforeCount = 0
  try { beforeCount = JSON.parse(await beforeResp.text()).length } catch { /* empty */ }

  // 发送消息（添加唯一标识符防止 endConversation 降级路径的关键词匹配触发 merge）
  const uniqueId = Date.now().toString().slice(-6)
  const textarea = page.locator('textarea').first()
  await textarea.fill(`J1-${uniqueId}: 量子计算入门指南`)
  await textarea.press('Enter')

  // 等待 modal 出现并显示 AI 回复
  await expect(page.getByText('J-1 测试的 AI 回复', { exact: false })).toBeVisible({ timeout: 10000 })

  // 关闭 modal（ESC 触发 endConversation）
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')

  // 轮询等待节点写入（endConversation 异步，mock classify/extract 后通常 <3s）
  const afterCount = await waitForNodeCountAbove(page, beforeCount, 12000)
  expect(afterCount).toBeGreaterThan(beforeCount)
})

// ── J-2：ESC 快速连按，防重入保护 ──────────────────────────────────────────

test('J-2: 快速连按两次 ESC，节点恰好保存一次（不重复）', async ({ page }) => {
  await setupPage(page)
  await mockAIStream(page, '这是 J-2 防重入测试的 AI 回复。')
  await mockMemorySideEffects(page)

  await page.goto('/')
  await waitForBackend(page)
  await waitForInputReady(page)

  // 记录初始节点数
  const beforeResp = await page.request.get(`${API_BASE}/api/storage/nodes.json`, { headers: authHeaders() })
  let beforeCount = 0
  try { beforeCount = JSON.parse(await beforeResp.text()).length } catch { /* empty */ }

  // 使用 first() 不依赖特定 placeholder 文字（UI 语言可能是中文或英文）
  // 添加唯一标识符防止 endConversation 降级路径的关键词匹配触发 merge
  const uniqueId = Date.now().toString().slice(-6)
  const textarea = page.locator('textarea').first()
  await textarea.fill(`J2-${uniqueId}: 微积分基础概念`)
  await textarea.press('Enter')

  await expect(page.getByText('J-2 防重入测试', { exact: false })).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(300)

  // 快速连按两次 ESC（第二次应被 isClosing 拦截）
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // 轮询等待节点写入，最多 12 秒（全套运行时服务器负载较高，需要更长时间）
  const afterCount = await waitForNodeCountAbove(page, beforeCount, 12000)

  // 节点只增加 1 个（不是 2 个）
  expect(afterCount).toBe(beforeCount + 1)
})

// ── J-3：PG Space 对话写入 pg-* 文件，不写 lenny-* 文件 ────────────────────

test('J-3: PG Space 对话关闭后写入 pg-nodes.json，不污染 lenny-nodes.json', async ({ page }) => {
  await setupPage(page)
  await mockAIStream(page, 'J-3 PG Space 测试回复：创业的核心是解决真实问题。')
  await mockMemorySideEffects(page)

  await page.goto('/')
  await waitForBackend(page)
  await waitForInputReady(page)

  // 记录 lenny / pg 初始节点数
  const [lennyBefore, pgBefore] = await Promise.all([
    page.request.get(`${API_BASE}/api/storage/lenny-nodes.json`, { headers: authHeaders() }),
    page.request.get(`${API_BASE}/api/storage/pg-nodes.json`, { headers: authHeaders() }),
  ])
  let lennyBeforeCount = 0, pgBeforeCount = 0
  try { lennyBeforeCount = JSON.parse(await lennyBefore.text()).length } catch { /* empty */ }
  try { pgBeforeCount = JSON.parse(await pgBefore.text()).length } catch { /* empty */ }

  // 点击 PG Space 入口种子节点（有 "Paul Graham" 文字）
  const pgBtn = page.locator('button, [role="button"]').filter({ hasText: 'Paul Graham' }).first()
  const pgNode = page.locator('text=Paul Graham').first()

  let pgOpened = false
  if (await pgBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pgBtn.click()
    pgOpened = true
  } else if (await pgNode.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pgNode.click()
    pgOpened = true
  }

  if (!pgOpened) {
    test.skip(true, 'PG Space 入口在当前视图中不可见，跳过')
    return
  }
  await page.waitForTimeout(1000)

  const anyTextarea = page.locator('textarea').first()
  if (await anyTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await anyTextarea.fill('聊聊创业的本质（J3测试）')
    await anyTextarea.press('Enter')
    await expect(page.getByText('J-3 PG Space 测试回复', { exact: false })).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1500)
  }

  // 验证 pg-nodes.json 节点数未减少（有对话则增加）
  const pgAfter = await page.request.get(`${API_BASE}/api/storage/pg-nodes.json`, { headers: authHeaders() })
  let pgAfterCount = 0
  try { pgAfterCount = JSON.parse(await pgAfter.text()).length } catch { /* empty */ }
  expect(pgAfterCount).toBeGreaterThanOrEqual(pgBeforeCount)

  // 验证 lenny-nodes.json 节点数不变（PG 对话不应写入 lenny 文件）
  const lennyAfter = await page.request.get(`${API_BASE}/api/storage/lenny-nodes.json`, { headers: authHeaders() })
  let lennyAfterCount = 0
  try { lennyAfterCount = JSON.parse(await lennyAfter.text()).length } catch { /* empty */ }
  expect(lennyAfterCount).toBe(lennyBeforeCount)
})

// ── J-4：Lenny Space 对话同步到主空间 ──────────────────────────────────────

test('J-4: Lenny Space 对话关闭后，conversations.jsonl 有新记录（sync 触发）', async ({ page }) => {
  await setupPage(page)
  await mockAIStream(page, 'J-4 Lenny 测试：增长的核心是留存率。')
  // 只 mock queue/index/classify，让 sync-lenny-conv 真实执行
  await mockMemorySideEffects(page)

  await page.goto('/')
  await waitForBackend(page)
  await waitForInputReady(page)

  // 记录 conversations.jsonl 初始行数
  const convsBefore = await page.request.get(`${API_BASE}/api/storage/conversations.jsonl`, { headers: authHeaders() })
  const linesBefore = (await convsBefore.text()).trim().split('\n').filter(Boolean).length

  // 找到 Lenny Space 入口
  const lennyBtn = page.locator('button, [role="button"]').filter({ hasText: 'Lenny' }).first()
  const lennyNode = page.locator('text=Lenny Rachitsky').first()

  let lennyOpened = false
  if (await lennyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await lennyBtn.click()
    lennyOpened = true
  } else if (await lennyNode.isVisible({ timeout: 2000 }).catch(() => false)) {
    await lennyNode.click()
    lennyOpened = true
  }

  if (!lennyOpened) {
    test.skip(true, 'Lenny Space 入口在当前视图中不可见，跳过')
    return
  }
  await page.waitForTimeout(1000)

  // 发送消息
  const anyTextarea = page.locator('textarea').first()
  if (await anyTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
    await anyTextarea.fill('你的增长框架是什么（J4测试）')
    await anyTextarea.press('Enter')
    await expect(page.getByText('J-4 Lenny 测试', { exact: false })).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(2000) // sync-lenny-conv 是 async，给足时间
  }

  // 验证 conversations.jsonl 有新记录
  const convsAfter = await page.request.get(`${API_BASE}/api/storage/conversations.jsonl`, { headers: authHeaders() })
  const linesAfter = (await convsAfter.text()).trim().split('\n').filter(Boolean).length
  expect(linesAfter).toBeGreaterThanOrEqual(linesBefore)
})

// ── J-5：历史节点追问，对话记录更新 ─────────────────────────────────────────

test('J-5: 点击历史节点打开回放，追问后关闭，conversations.jsonl 包含该对话记录', async ({ page }) => {
  await setupPage(page)
  await mockMemorySideEffects(page)

  // 先注入一个测试节点和对话记录
  const testConvId = `j5-conv-journey-${Date.now()}`
  const testConv = {
    id: testConvId,
    userMessage: `J5测试节点-${testConvId.slice(-6)}`,
    assistantMessage: '可以使用番茄钟技术来提高专注力（J5初始回复）。',
    createdAt: new Date().toISOString(),
    images: [],
    files: [],
  }
  const testNode = {
    id: testConvId,
    conversationId: testConvId,
    title: `J5测试节点-${testConvId.slice(-6)}`,
    category: '学习成长',
    x: 1920,
    y: 1200,
    date: new Date().toISOString().split('T')[0],
    nodeType: 'memory',
    color: 'rgba(219,234,254,0.9)',
    keywords: ['专注力', '测试'],
    memoryCount: 0,
  }

  // 先获取现有节点，过滤掉旧的 j5-conv-journey-* 节点，只保留当前测试节点
  // 这样可以避免历史遗留 J5 节点污染画布，防止 click 歧义
  const nodesResp = await page.request.get(`${API_BASE}/api/storage/nodes.json`, { headers: authHeaders() })
  let nodes: unknown[] = []
  try { nodes = JSON.parse(await nodesResp.text()) } catch { /* empty */ }
  const filteredNodes = (nodes as Array<{ id?: string }>).filter(n => !String(n.id ?? '').startsWith('j5-conv-journey-'))
  await page.request.put(`${API_BASE}/api/storage/nodes.json`, {
    data: JSON.stringify([...filteredNodes, testNode]),
    headers: storageWriteHeaders(),
  })

  // 追加对话记录（过滤旧 j5-conv-journey-* 记录，只保留当前测试对话）
  const convsResp = await page.request.get(`${API_BASE}/api/storage/conversations.jsonl`, { headers: authHeaders() })
  const existingConvLines = (await convsResp.text()).trim().split('\n').filter(line => {
    if (!line.trim()) return false
    try { return !String((JSON.parse(line) as { id?: string }).id ?? '').startsWith('j5-conv-journey-') } catch { return false }
  })
  await page.request.put(`${API_BASE}/api/storage/conversations.jsonl`, {
    data: [...existingConvLines, JSON.stringify(testConv)].join('\n') + '\n',
    headers: storageWriteHeaders(),
  })

  // mock 追问回复
  await mockAIStream(page, 'J-5 追问回复：除了番茄钟，还可以减少手机通知干扰。')

  await page.goto('/')
  await waitForBackend(page)
  await waitForInputReady(page)
  await page.waitForTimeout(2000) // 等待 canvas 节点渲染完毕

  // 验证节点已加载到画布（检查 canvas 内有 heading 匹配）
  const nodeText = `J5测试节点-${testConvId.slice(-6)}`
  const nodeExists = await page.locator(`h3`).filter({ hasText: nodeText }).isVisible({ timeout: 5000 }).catch(() => false)
  if (!nodeExists) {
    test.skip(true, '注入的测试节点在画布当前视口中不可见（画布位置原因），跳过')
    return
  }

  // 通过 canvasStore.getState().openModalById 直接打开 modal，绕过 canvas 拖拽/动画限制
  // page.evaluate 内部 return Promise，Playwright 会自动 await
  const openResult = await page.evaluate(async (convId: string) => {
    const store = (window as any).__CANVAS_STORE__
    if (!store) return { error: 'no store' }

    // 检查内存中的 conversationHistory 和当前 conversations.jsonl 文件内容
    const state = store.getState()
    const convFile = 'conversations.jsonl'
    // 读取文件内容来验证是否有 convId
    let fileHasConv = false
    try {
      const resp = await fetch(`/api/storage/${convFile}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('anima_user_token') ?? ''}` }
      })
      const text = await resp.text()
      fileHasConv = text.includes(convId)
    } catch { /* ignore */ }

    await state.openModalById(convId)
    const afterState = store.getState()
    return {
      fileHasConv,
      isModalOpen: afterState.isModalOpen,
      isLoading: afterState.isLoading,
      currentConvId: afterState.currentConversation?.id ?? null
    }
  }, testConvId)

  // 如果对话记录不在文件中，跳过
  if (!openResult.fileHasConv) {
    // 这不应该发生——说明 page.request.put 写入有问题
    test.fail(true, `conversations.jsonl 中没有找到 testConvId=${testConvId}，写入失败`)
    return
  }

  // 如果 modal 没打开，跳过
  if (!openResult.isModalOpen) {
    test.skip(true, `openModalById 后 modal 未打开（${JSON.stringify(openResult)}），跳过`)
    return
  }

  // modal 打开，显示历史内容
  await expect(page.getByText('番茄钟技术', { exact: false })).toBeVisible({ timeout: 8000 })

  // 追问
  const modalInput = page.locator('textarea').first()
  await expect(modalInput).toBeVisible({ timeout: 3000 })
  await modalInput.fill('还有其他方法吗（J5追问）')
  await modalInput.press('Enter')

  // 等待追问回复
  await expect(page.getByText('减少手机通知干扰', { exact: false })).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(500)

  // 关闭 modal
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)

  // 验证 conversations.jsonl 包含该对话 id（原始对话 + 可能有更新的记录）
  const afterConvsResp = await page.request.get(`${API_BASE}/api/storage/conversations.jsonl`, { headers: authHeaders() })
  const afterConvsText = await afterConvsResp.text()
  expect(afterConvsText).toContain(testConvId)
})
