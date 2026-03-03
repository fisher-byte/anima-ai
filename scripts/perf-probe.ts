/**
 * Playwright perf probe — 测量 zoom 时的帧率和 React 渲染次数
 */
import { chromium } from '@playwright/test'

const url = process.argv[2] || 'http://localhost:5173'

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console error] ${msg.text()}`)
  })

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // 关掉 onboarding 弹窗（如果有）
  const btn = page.locator('button:has-text("下一步")').first()
  if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(300)
    const btn2 = page.locator('button:has-text("下一步")').first()
    if (await btn2.isVisible({ timeout: 500 }).catch(() => false)) { await btn2.click(); await page.waitForTimeout(300) }
    const btn3 = page.locator('button:has-text("开始使用")').first()
    if (await btn3.isVisible({ timeout: 500 }).catch(() => false)) { await btn3.click(); await page.waitForTimeout(300) }
  }

  await page.waitForTimeout(500)

  // 注入帧率测量（用字符串形式避免 tsx __name 注入问题）
  await page.evaluate(`
    window.__frameCount = 0;
    window.__frameStart = performance.now();
    function __countFrame() {
      window.__frameCount++;
      requestAnimationFrame(__countFrame);
    }
    requestAnimationFrame(__countFrame);
  `)

  // 找画布中心
  const canvas = await page.locator('.dot-grid').first().boundingBox()
  if (!canvas) { console.error('Canvas not found'); await browser.close(); return }

  const cx = canvas.x + canvas.width / 2
  const cy = canvas.y + canvas.height / 2

  await page.mouse.move(cx, cy)
  await page.waitForTimeout(200)

  // 브라우저 내부에서 wheel 이벤트를 직접 dispatch해서 실제 JS 처리 시간 측정
  console.log('Measuring JS handler time from inside the browser...')
  const result = await page.evaluate(`
    new Promise(resolve => {
      const canvas = document.querySelector('.dot-grid')
      if (!canvas) { resolve({ error: 'no canvas' }); return }

      let totalHandlerTime = 0
      let count = 0
      const TARGET = 40

      // Intercept wheel events to measure handler duration
      const orig = canvas._wheelHandlerTime = 0

      const t0 = performance.now()
      for (let i = 0; i < TARGET; i++) {
        const e = new WheelEvent('wheel', {
          deltaY: i < TARGET/2 ? -80 : 80,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
          clientX: window.innerWidth / 2,
          clientY: window.innerHeight / 2,
        })
        const before = performance.now()
        canvas.dispatchEvent(e)
        totalHandlerTime += performance.now() - before
        count++
      }

      // Wait for RAF to flush
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const total = performance.now() - t0
        resolve({
          totalMs: Math.round(total),
          handlerMs: Math.round(totalHandlerTime),
          avgHandlerMs: (totalHandlerTime / count).toFixed(2),
          count
        })
      }))
    })
  `) as any

  console.log('Browser-internal measurement:')
  console.log(`  Total (dispatch + 2 RAFs): ${result.totalMs}ms`)
  console.log(`  Sum of handler times: ${result.handlerMs}ms`)
  console.log(`  Avg per event: ${result.avgHandlerMs}ms`)
  console.log(`  Events: ${result.count}`)

  const { frames, elapsed } = await page.evaluate(`
    ({ frames: window.__frameCount, elapsed: performance.now() - window.__frameStart })
  `) as { frames: number; elapsed: number }
  console.log(`FPS during test: ${(frames / (elapsed / 1000)).toFixed(1)}`)

  await page.screenshot({ path: 'scripts/screenshot-perf.png' })
  console.log('Screenshot: scripts/screenshot-perf.png')

  if (errors.length) {
    console.log('\n=== Errors ===')
    errors.forEach(e => console.error(e))
  }

  await browser.close()
}

main().catch(err => { console.error(err); process.exit(1) })
