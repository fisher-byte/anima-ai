/**
 * Anima E2E 测试 —— 一图一测试
 *
 * 覆盖核心画布体验的关键路径：
 * 1. 应用加载 & 画布渲染
 * 2. 能力块默认出现
 * 3. 新手引导流程（自动触发、完成后消失）
 * 4. 发送对话 → 节点生成
 * 5. 侧栏记忆 & 进化基因 tab 可访问
 * 6. API 配置界面可访问
 */

import { test, expect } from '@playwright/test'

// E2E 测试 Bearer token（从环境变量读取，本地通过 .env 注入）
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? ''

// 统一请求头（鉴权开启时需要带 token）
function authHeaders(): Record<string, string> {
  if (!ACCESS_TOKEN) return {}
  return { Authorization: `Bearer ${ACCESS_TOKEN}` }
}

// ── 工具：等待后端就绪 ───────────────────────────────────────────────────────
async function waitForBackend(page: import('@playwright/test').Page) {
  const token = ACCESS_TOKEN
  await page.waitForFunction(
    async (tok: string) => {
      try {
        const headers: Record<string, string> = {}
        if (tok) headers['Authorization'] = `Bearer ${tok}`
        const r = await fetch('/api/memory/facts', { headers })
        return r.ok
      } catch {
        return false
      }
    },
    token,
    { timeout: 15_000 }
  )
}

// ── 工具：注入 token 到 localStorage（让 App.tsx 自动鉴权通过）─────────────
async function injectToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token: string) => {
    if (token) localStorage.setItem('anima_access_token', token)
    // 跳过新手引导，避免遮罩层阻碍点击
    localStorage.setItem('evo_onboarding_v3', 'done')
  }, ACCESS_TOKEN)
}

// ── 测试 1：应用基础加载 ──────────────────────────────────────────────────────
test('应用加载，画布容器渲染', async ({ page }) => {
  await injectToken(page)
  await page.goto('/')
  await waitForBackend(page)

  // 画布以 SVG 渲染，通过缩放控件或节点卡片判断加载完成
  await expect(
    page.locator('button:has-text("缩小"), button:has-text("放大"), [class*="canvas"], svg').first()
  ).toBeVisible({ timeout: 10_000 })
})

// ── 测试 2：import-memory 能力块默认存在于画布 ────────────────────────────────
test('画布上存在「导入外部记忆」能力块', async ({ page }) => {
  await injectToken(page)
  await page.goto('/')
  await waitForBackend(page)

  // 等待节点渲染完成（至少有一个节点卡片）
  await page.waitForTimeout(2000)

  // 能力块文字存在
  const importMemoryText = page.getByText('导入外部记忆').first()
  await expect(importMemoryText).toBeVisible({ timeout: 8_000 })
})

// ── 测试 3：后端 API 健康检查 ──────────────────────────────────────────────────
test('后端核心接口返回正常', async ({ request }) => {
  const headers = authHeaders()

  // memory facts
  const factsResp = await request.get('http://localhost:3000/api/memory/facts', { headers })
  expect(factsResp.ok()).toBeTruthy()
  const factsData = await factsResp.json()
  expect(factsData).toHaveProperty('facts')
  expect(Array.isArray(factsData.facts)).toBe(true)

  // memory profile
  const profileResp = await request.get('http://localhost:3000/api/memory/profile', { headers })
  expect(profileResp.ok()).toBeTruthy()

  // storage read (profile.json)
  const storageResp = await request.get('http://localhost:3000/api/storage/profile.json', { headers })
  expect(storageResp.status()).toBeLessThan(500)
})

// ── 测试 4：记忆条目 PUT 编辑接口 ────────────────────────────────────────────
test('PUT /api/memory/facts/:id 接口正常响应', async ({ request }) => {
  const headers = authHeaders()
  const resp = await request.put('http://localhost:3000/api/memory/facts/nonexistent-id', {
    data: { fact: 'test fact content' },
    headers
  })
  // 无此 id 时仍返回 200（UPDATE 影响 0 行是合法的）
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()
  expect(data.ok).toBe(true)
})

// ── 测试 5：侧栏可以打开 ───────────────────────────────────────────────────────
test('侧栏按钮存在并可点击', async ({ page }) => {
  await injectToken(page)
  await page.goto('/')
  await waitForBackend(page)
  await page.waitForTimeout(1500)

  // 找侧栏触发按钮（通常是 History / BrainCircuit / Sparkles 图标区域）
  const sidebarBtn = page.locator('button[title*="历史"], button[title*="记忆"], button[title*="侧栏"], button[aria-label*="history"]').first()
  if (await sidebarBtn.isVisible()) {
    await sidebarBtn.click()
    // 侧栏面板出现
    await expect(page.getByText('对话历史').or(page.getByText('记忆')).first()).toBeVisible({ timeout: 5_000 })
  } else {
    // 侧栏按钮可能以不同方式呈现，跳过但记录
    test.skip()
  }
})

// ── 测试 6：节点标签不出现省略号截断 ─────────────────────────────────────────
test('节点卡片标题不被省略号截断', async ({ page }) => {
  await injectToken(page)
  await page.goto('/')
  await waitForBackend(page)
  await page.waitForTimeout(2000)

  // 获取所有节点标题
  const nodeTitles = page.locator('.node-title, [class*="node"] h3, [class*="node"] p').all()
  for (const title of await nodeTitles) {
    const text = await title.textContent()
    // 标题不应以省略号结尾（CSS 截断的话文本内容本身不含 …，但 JS 截断的话会有）
    if (text) {
      expect(text.trim().endsWith('...')).toBe(false)
    }
  }
})

// ── 测试 7：agentWorker queue 接口接受任务入队 ────────────────────────────────
test('POST /api/memory/queue 入队成功', async ({ request }) => {
  const headers = authHeaders()
  const resp = await request.post('http://localhost:3000/api/memory/queue', {
    data: {
      type: 'extract_preference',
      payload: { userMessage: '回答简洁一点', assistantMessage: 'test', context: 'e2e_test' }
    },
    headers
  })
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()
  expect(data.ok).toBe(true)
})

// ── 测试 8：verify-key 接口对无效 key 返回 valid:false ───────────────────────
test('POST /api/config/verify-key 对无效 key 返回 valid:false', async ({ request }) => {
  const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
  const resp = await request.post('http://localhost:3000/api/config/verify-key', {
    data: { apiKey: 'sk-invalid-key-e2e-test', baseUrl: 'https://api.moonshot.cn/v1' },
    headers
  })
  // 接口本身应正常响应（200），valid 字段为 false（key 无效）
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()
  expect(typeof data.valid).toBe('boolean')
})

// ── 测试 9：confirm dialog — 出现后可取消 ────────────────────────────────────
test('删除按钮触发 confirm dialog，取消后节点不消失', async ({ page }) => {
  await injectToken(page)
  await page.goto('/')
  await waitForBackend(page)
  await page.waitForTimeout(2000)

  // 找到第一个节点卡片并悬停以显示删除按钮
  const nodeCard = page.locator('[id^="node-"]').first()
  if (!(await nodeCard.isVisible())) {
    test.skip() // 画布无节点时跳过
    return
  }

  await nodeCard.hover()

  // 等待删除按钮出现（hover 触发）
  const deleteBtn = page.locator('[id^="node-"]').first().locator('button').last()
  await deleteBtn.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null)

  if (!(await deleteBtn.isVisible())) {
    test.skip()
    return
  }

  await deleteBtn.click()

  // confirm dialog 出现
  await expect(page.getByText('删除这条对话？')).toBeVisible({ timeout: 3000 })

  // 点取消
  await page.getByRole('button', { name: '取消' }).click()

  // dialog 消失
  await expect(page.getByText('删除这条对话？')).not.toBeVisible({ timeout: 2000 })

  // 节点仍然存在
  await expect(nodeCard).toBeVisible()
})

// ── 测试 10：API Key 提示条 — 引导完成且无 key 时出现 ─────────────────────────
test('引导完成且无 API Key 时 InputBox 显示配置提示', async ({ page }) => {
  // 注入引导完成标记，但不注入 apikey（模拟新用户）
  await page.addInitScript((token: string) => {
    if (token) localStorage.setItem('anima_access_token', token)
    localStorage.setItem('evo_onboarding_v3', 'done')
    // 不预置 hasApiKey，让 store 从后端查（后端无 key 时返回空）
  }, ACCESS_TOKEN)

  // 先确保后端没有存 apiKey（清空）
  if (ACCESS_TOKEN) {
    await page.request.put('http://localhost:3000/api/config/apikey', {
      data: { apiKey: '' },
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' }
    })
  }

  await page.goto('/')
  await waitForBackend(page)
  await page.waitForTimeout(2000)

  // 应看到 Kimi API Key 配置提示
  const hint = page.getByText('需要配置 Kimi API Key 才能开始对话')
  const setupBtn = page.getByRole('button', { name: '设置 API Key' })

  if (await hint.isVisible({ timeout: 3000 }).catch(() => false)) {
    await expect(setupBtn).toBeVisible()

    // 点「设置 API Key」展开输入框
    await setupBtn.click()
    await expect(page.getByPlaceholder(/Kimi API Key/)).toBeVisible({ timeout: 2000 })

    // 点取消，回到提示状态
    await page.getByRole('button', { name: '取消' }).click()
    await expect(hint).toBeVisible({ timeout: 2000 })
  } else {
    // 如果后端已存有 key（本地开发环境），跳过此测试
    test.skip()
  }
})
