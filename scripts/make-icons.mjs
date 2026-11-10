// Draws the app icons (a white sigma on the brand blue) into web/public. Run again only when the look changes:
//   node scripts/make-icons.mjs
// Uses Playwright's own Chromium; set ICON_BROWSER_CHANNEL=msedge (or chrome) to use an installed browser instead.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('../web/node_modules/@playwright/test')
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public')

// `inset`: the share of the square kept clear around the letter. A maskable icon may be cropped to a circle, so its
// letter stays inside the central 80%.
const icons = [
  { file: 'icon-192.png', size: 192, inset: 0.18 },
  { file: 'icon-512.png', size: 512, inset: 0.18 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.3 },
  { file: 'apple-touch-icon.png', size: 180, inset: 0.18 },
]

const browser = await chromium.launch({ channel: process.env.ICON_BROWSER_CHANNEL })
const page = await browser.newPage()
for (const { file, size, inset } of icons) {
  await page.setViewportSize({ width: size, height: size })
  const letter = Math.round(size * (1 - 2 * inset) * 1.15)
  await page.setContent(`<!doctype html><body style="margin:0"><div style="
    width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
    background:#1f5eff;color:#fff;font:700 ${letter}px/1 system-ui,'Segoe UI',Arial,sans-serif">Σ</div></body>`)
  await page.screenshot({ path: path.join(out, file), clip: { x: 0, y: 0, width: size, height: size } })
}
await browser.close()
console.log('icons written to', out)
