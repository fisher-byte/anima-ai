/**
 * 실시간 성능 오버레이를 페이지에 주입해서 실제 사용자 조작 중 FPS와
 * React 렌더링 횟수를 직접 측정한다.
 * 사용법: npx tsx scripts/inject-perf.ts
 * 브라우저가 열리면 직접 트랙패드로 zoom해보고 오버레이 수치를 확인한다.
 */
import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 0 })
  const page = await browser.newPage()

  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // 关掉 onboarding
  for (const text of ['下一步', '下一步', '开始使用']) {
    const btn = page.locator(`button:has-text("${text}")`).first()
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click(); await page.waitForTimeout(200)
    }
  }

  // 注入实时 FPS + React 渲染计数器 + Long Task 检测
  await page.evaluate(`
    // FPS meter
    let frames = 0, fps = 0, lastFpsTime = performance.now()
    function rafLoop() {
      frames++
      const now = performance.now()
      if (now - lastFpsTime >= 500) {
        fps = Math.round(frames * 1000 / (now - lastFpsTime))
        frames = 0
        lastFpsTime = now
        if (overlay) overlay.querySelector('#fps').textContent = 'FPS: ' + fps
      }
      requestAnimationFrame(rafLoop)
    }
    requestAnimationFrame(rafLoop)

    // Long Task observer
    let longTasks = 0
    try {
      const obs = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          longTasks++
          console.warn('[LongTask] ' + Math.round(e.duration) + 'ms at ' + Math.round(e.startTime) + 'ms')
          if (overlay) overlay.querySelector('#lt').textContent = 'LongTasks: ' + longTasks
        }
      })
      obs.observe({ entryTypes: ['longtask'] })
    } catch(e) {}

    // Wheel event timing
    let wheelCount = 0, wheelTotalMs = 0
    const origProto = EventTarget.prototype
    const origAddEvt = origProto.addEventListener
    // Instead patch directly on canvas after it's found
    setTimeout(() => {
      const canvas = document.querySelector('.dot-grid')
      if (!canvas) return
      canvas.addEventListener('wheel', function perfWheel(e) {
        const t0 = performance.now()
        // measure after all other listeners run (use rAF as proxy)
        requestAnimationFrame(() => {
          const dt = performance.now() - t0
          wheelCount++
          wheelTotalMs += dt
          if (overlay) {
            overlay.querySelector('#wc').textContent = 'Wheel#: ' + wheelCount
            overlay.querySelector('#wt').textContent = 'WheelAvg: ' + (wheelTotalMs/wheelCount).toFixed(1) + 'ms'
          }
        })
      }, { passive: true, capture: true })
    }, 500)

    // Overlay UI
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;top:60px;left:8px;z-index:99999;background:rgba(0,0,0,0.75);color:#0f0;font:13px monospace;padding:8px 12px;border-radius:8px;pointer-events:none;line-height:1.8'
    overlay.innerHTML = '<div id="fps">FPS: -</div><div id="lt">LongTasks: 0</div><div id="wc">Wheel#: 0</div><div id="wt">WheelAvg: -</div>'
    document.body.appendChild(overlay)
    window.__perfOverlay = overlay
    console.log('[perf] overlay injected')
  `)

  console.log('Performance overlay injected.')
  console.log('브라우저가 열렸습니다. 트랙패드로 직접 zoom해보세요.')
  console.log('콘솔에 [LongTask] 경고가 출력되면 그게 카지는 원인입니다.')
  console.log('Ctrl+C to exit.')

  // 30초 후 LongTask 리포트 출력
  await new Promise(resolve => setTimeout(resolve, 30000))

  const report = await page.evaluate(`({
    longTasks: window.__perfOverlay?.querySelector('#lt')?.textContent,
    wheelCount: window.__perfOverlay?.querySelector('#wc')?.textContent,
    wheelAvg: window.__perfOverlay?.querySelector('#wt')?.textContent,
    fps: window.__perfOverlay?.querySelector('#fps')?.textContent
  })`) as any

  console.log('\n=== 30s Report ===')
  console.log(report.fps)
  console.log(report.longTasks)
  console.log(report.wheelCount)
  console.log(report.wheelAvg)

  if (errors.length) { console.log('\n=== Errors ==='); errors.forEach(e => console.error(e)) }

  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
