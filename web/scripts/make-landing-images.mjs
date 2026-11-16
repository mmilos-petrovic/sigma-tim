// Shrinks the photos in planning/landing_page/ into web/public/img/ (run by hand when a source photo changes):
//   cd web && node scripts/make-landing-images.mjs
// The browser does the work (canvas), so no image library is needed.
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const SOURCE = new URL('../../planning/landing_page/', import.meta.url)
const TARGET = new URL('../public/img/', import.meta.url)

// crop: [x, y, width, height] of the source in pixels (the logo is 5334 x 3000 with a wide white margin); width: pixels of the result.
const JOBS = [
  {
    from: 'logo.jpg',
    crop: [160, 293, 4934, 2373],
    width: 600,
    to: 'logo.webp',
    type: 'image/webp',
    quality: 0.9,
  },
  {
    from: 'main-classroom.jpg',
    width: 1200,
    to: 'classroom-1200.webp',
    type: 'image/webp',
    quality: 0.78,
  },
  {
    from: 'main-classroom.jpg',
    width: 640,
    to: 'classroom-640.webp',
    type: 'image/webp',
    quality: 0.78,
  },
  { from: 'exterior.jpg', width: 800, to: 'exterior-800.webp', type: 'image/webp', quality: 0.78 },
  { from: 'exterior.jpg', width: 480, to: 'exterior-480.webp', type: 'image/webp', quality: 0.78 },
  // the picture shown when the link is shared: 1200 x 630, the classroom cut to that shape
  {
    from: 'main-classroom.jpg',
    width: 1200,
    height: 630,
    to: 'og.jpg',
    type: 'image/jpeg',
    quality: 0.82,
  },
]

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
for (const job of JOBS) {
  const base64 = (await readFile(new URL(job.from, SOURCE))).toString('base64')
  const out = await page.evaluate(
    async ({ base64, job }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes]))
      let [sx, sy, sw, sh] = job.crop ?? [0, 0, bitmap.width, bitmap.height]
      const width = job.width
      const height = job.height ?? Math.round((width * sh) / sw)
      if (job.height) {
        // cover: cut the source to the shape of the result
        const want = width / height
        if (sw / sh > want) {
          const w = sh * want
          sx += (sw - w) / 2
          sw = w
        } else {
          const h = sw / want
          sy += (sh - h) / 2
          sh = h
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, job.type, job.quality))
      const buffer = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (let i = 0; i < buffer.length; i += 0x8000)
        binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
      return { base64: btoa(binary), width, height }
    },
    { base64, job },
  )
  const bytes = Buffer.from(out.base64, 'base64')
  await writeFile(new URL(job.to, TARGET), bytes)
  console.log(`${job.to}: ${out.width}x${out.height}, ${Math.round(bytes.length / 1024)} KiB`)
}
await browser.close()
