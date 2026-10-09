import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_MANAGED_BASE_URL
const VALID_TOKEN = process.env.E2E_MANAGED_TOKEN ?? 'e2e-fake-token-not-real'

test.skip(!BASE, 'requires E2E_MANAGED_BASE_URL pointing at an isolated managed instance')

const LOGIN_INPUT = 'input[type="password"]'
const SUBMIT_BTN = 'button:has-text("进入"), button:has-text("Enter"), button:has-text("登录")'
const APP_INPUT = 'textarea, input[placeholder*="问"], input[placeholder*="Ask" i]'

test.describe('managed auth login flow', () => {
  test('冷启动 + 无效 token → 显示登录页', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('anima_user_token', 'definitely-wrong-token')
    })
    await page.goto(BASE!)
    await expect(page.locator(LOGIN_INPUT)).toBeVisible({ timeout: 15000 })
    await expect(page.locator(APP_INPUT).first()).toHaveCount(0)
  })

  test('登录成功 → 登录框消失且画布输入框可见', async ({ page }) => {
    await page.goto(BASE!)
    const input = page.locator(LOGIN_INPUT)
    await expect(input).toBeVisible({ timeout: 15000 })
    await input.fill(VALID_TOKEN)
    await page.locator(SUBMIT_BTN).first().click()
    await expect(input).toHaveCount(0, { timeout: 15000 })
    await expect(page.locator(APP_INPUT).first()).toBeVisible({ timeout: 20000 })
  })

  test('错误 token 登录失败 → 仍在登录页可重试', async ({ page }) => {
    await page.goto(BASE!)
    const input = page.locator(LOGIN_INPUT)
    await expect(input).toBeVisible({ timeout: 15000 })
    await input.fill('wrong-token-again')
    await page.locator(SUBMIT_BTN).first().click()
    await page.waitForTimeout(1500)
    await expect(input).toBeVisible()
    await expect(page.locator(APP_INPUT).first()).toHaveCount(0)
    await input.fill(VALID_TOKEN)
    await page.locator(SUBMIT_BTN).first().click()
    await expect(input).toHaveCount(0, { timeout: 15000 })
    await expect(page.locator(APP_INPUT).first()).toBeVisible({ timeout: 20000 })
  })

  test('auth/status 网络失败 → 错误态可重试而非幻影登录', async ({ page }) => {
    let failOnce = true
    await page.route('**/api/auth/status', async (route) => {
      if (failOnce) {
        failOnce = false
        await route.abort()
      } else {
        await route.continue()
      }
    })
    await page.goto(BASE!)
    const retryBtn = page.locator('button:has-text("重试"), button:has-text("Retry")')
    await expect(retryBtn).toBeVisible({ timeout: 15000 })
    await expect(page.locator(APP_INPUT).first()).toHaveCount(0)
    await retryBtn.click()
    await expect(page.locator(LOGIN_INPUT)).toBeVisible({ timeout: 15000 })
  })

  test('managed 设置：API Key 输入被禁用且显示托管提示', async ({ page }) => {
    await page.goto(BASE!)
    const input = page.locator(LOGIN_INPUT)
    await expect(input).toBeVisible({ timeout: 15000 })
    await input.fill(VALID_TOKEN)
    await page.locator(SUBMIT_BTN).first().click()
    await expect(page.locator(APP_INPUT).first()).toBeVisible({ timeout: 20000 })

    await page.locator('[data-testid="menu-btn"]').click()
    await page.locator('button:has-text("设置"), button:has-text("Settings")').first().click()
    const keyInput = page.locator('input[type="password"]')
    await expect(keyInput).toBeVisible({ timeout: 10000 })
    await expect(keyInput).toBeDisabled()
    await expect(page.locator('text=/托管|Managed free/i').first()).toBeVisible()
  })
})
