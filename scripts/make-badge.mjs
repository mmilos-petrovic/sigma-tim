// Draws the small notification icon (web/public/badge-96.png) from the logo: the shape of the logo in white on a
// transparent background. Android shows only the shape of such an icon, in one colour, in the status bar. Run again
// only when the logo changes:
//   node scripts/make-badge.mjs
// Uses Playwright's own Chromium; set ICON_BROWSER_CHANNEL=msedge (or chrome) to use an installed browser instead.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('../web/node_modules/@playwright/test')
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public')

const SIZE = 96
const MARGIN = 0.08 // the share of the square kept clear on each side

const logo = `data:image/png;base64,${readFileSync(path.join(dir, 'logo-192.png')).toString('base64')}`

const browser = await chromium.launch({
  channel: process.env.ICON_BROWSER_CHANNEL,
})
const page = await browser.newPage()
await page.setContent('<!doctype html><body></body>')
const png = await page.evaluate(
  async ({ logo, SIZE, MARGIN }) => {
    const image = new Image()
    image.src = logo
    await image.decode()

    // the logo sits on white: the less white a pixel is, the more of the shape it belongs to
    const source = document.createElement('canvas')
    source.width = image.width
    source.height = image.height
    const context = source.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, source.width, source.height)
    const smooth = (low, high, x) => {
      const t = Math.min(1, Math.max(0, (x - low) / (high - low)))
      return t * t * (3 - 2 * t)
    }
    let left = source.width
    let top = source.height
    let right = 0
    let bottom = 0
    for (let i = 0; i < pixels.data.length; i += 4) {
      const [r, g, b, a] = [
        pixels.data[i],
        pixels.data[i + 1],
        pixels.data[i + 2],
        pixels.data[i + 3],
      ]
      const alpha = Math.round(255 * smooth(10, 70, 255 - Math.min(r, g, b)) * (a / 255))
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255
      pixels.data[i + 3] = alpha
      if (alpha > 128) {
        const x = (i / 4) % source.width
        const y = Math.floor(i / 4 / source.width)
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
    context.putImageData(pixels, 0, 0)

    // the shape fills the square apart from the margin, centred
    const width = right - left + 1
    const height = bottom - top + 1
    const room = SIZE * (1 - 2 * MARGIN)
    const scale = room / Math.max(width, height)
    const target = document.createElement('canvas')
    target.width = target.height = SIZE
    const out = target.getContext('2d')
    out.imageSmoothingQuality = 'high'
    out.drawImage(
      source,
      left,
      top,
      width,
      height,
      (SIZE - width * scale) / 2,
      (SIZE - height * scale) / 2,
      width * scale,
      height * scale,
    )
    return target.toDataURL('image/png')
  },
  { logo, SIZE, MARGIN },
)
await browser.close()

writeFileSync(path.join(dir, 'badge-96.png'), Buffer.from(png.split(',')[1], 'base64'))
console.log('badge written to', path.join(dir, 'badge-96.png'))
