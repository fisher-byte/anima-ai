/**
 * Playwright debug script — 打开浏览器、抓 console 报错、截图
 * 用法：npx tsx scripts/debug-browser.ts [url]
 * 默认 url: http://localhost:5173
 */
import { chromium } from '@playwright/test'

const url = process.argv[2] || 'http://localhost:5173'

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const page = await browser.newPage()

  const errors: string[] = []
  const warnings: string[] = []

  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`
    if (msg.type() === 'error') errors.push(text)
    else if (msg.type() === 'warning') warnings.push(text)
    else console.log(text)
  })

  page.on('pageerror', err => {
    errors.push(`[pageerror] ${err.message}`)
    console.error('[pageerror]', err.message)
  })

  console.log(`Opening ${url} ...`)
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // 截图
  await page.screenshot({ path: 'scripts/screenshot-initial.png', fullPage: false })
  console.log('Screenshot saved: scripts/screenshot-initial.png')

  // 模拟 zoom（在画布中心滚动）
  console.log('Simulating zoom (scroll)...')
  const canvas = page.locator('.dot-grid').first()
  const box = await canvas.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    // 连续滚动 20 次模拟用户缩放
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, -100)
      await page.waitForTimeout(30)
    }
  }

  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'scripts/screenshot-after-zoom.png' })
  console.log('Screenshot saved: scripts/screenshot-after-zoom.png')

  console.log('\n=== Console Errors ===')
  if (errors.length === 0) console.log('None')
  else errors.forEach(e => console.error(e))

  console.log('\n=== Console Warnings ===')
  if (warnings.length === 0) console.log('None')
  else warnings.forEach(w => console.warn(w))

  // 保持浏览器打开供人工检查（Ctrl+C 退出）
  console.log('\nBrowser left open for manual inspection. Ctrl+C to exit.')
  await new Promise(() => {}) // hang
}

main().catch(err => { console.error(err); process.exit(1) })
