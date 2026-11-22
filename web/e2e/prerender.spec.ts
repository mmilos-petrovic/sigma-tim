import { expect, test } from '@playwright/test'
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { preview, type PreviewServer } from 'vite'
import { rpc, sql, tokenFor } from './api.ts'
import { clearTeacherCv, TEACHER } from './stranger.ts'

// The public pages are made when the site is built (scripts/prerender.mjs). This builds the site against the local
// database, as the production branch would, and looks at what a visitor and a search engine get. Slow (two builds).
test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const web = join(import.meta.dirname, '..')
const dist = join(web, 'dist')
const base = 'http://127.0.0.1:4175'
const SLUG = 'ana-nikolic'
const TEXT = 'E2E javni opis nastavnice, "pod navodnicima" i <b>sa oznakom</b>.'
const PHOTO = '11111111-2222-3333-4444-555555555555.jpg'

const build = () =>
  execSync('npx vite build && node scripts/prerender.mjs', {
    cwd: web,
    stdio: 'pipe',
    env: { ...process.env, CF_PAGES_BRANCH: 'main', PRERENDER: 'required' },
  })

const read = (file: string) => readFileSync(join(dist, file), 'utf8')

/** Every text file of the build, by path. */
function textFiles(dir = dist): Record<string, string> {
  const files: Record<string, string> = {}
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) Object.assign(files, textFiles(path))
    else if (/\.(html|xml|txt|js|css|json|webmanifest)$/.test(name))
      files[path] = readFileSync(path, 'utf8')
  }
  return files
}

async function publish(request: Parameters<typeof rpc>[0], show: boolean) {
  await rpc(request, await tokenFor(request, TEACHER), 'save_my_cv', {
    p_about: TEXT,
    p_show_public: show,
    p_show_members: false,
    p_experience: [
      { employer: 'E2E škola', position: 'Nastavnik', period: '2020', description: null },
    ],
    p_education: [],
    p_skills: ['Strpljenje'],
  })
  // the photo is a file in the teacher's own folder; the page only needs the name
  sql(`update public.teacher_cv c set photo_path = c.teacher_id || '/${PHOTO}'
        from public.profiles p where p.id = c.teacher_id and p.email = '${TEACHER}'`)
}

let server: PreviewServer

test.beforeAll(async () => {
  server = await preview({
    root: web,
    logLevel: 'silent',
    preview: { host: '127.0.0.1', port: 4175, strictPort: true },
  })
})

test.afterAll(async ({ request }) => {
  await server?.close()
  await clearTeacherCv(request)
  sql(`update public.teacher_cv c set photo_path = null
        from public.profiles p where p.id = c.teacher_id and p.email = '${TEACHER}'`)
})

test('a public CV is in the HTML before any script runs, and in the sitemap', async ({
  browser,
  request,
}) => {
  await publish(request, true)
  build()

  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(`${base}/nastavnici/${SLUG}`)
  await expect(page).toHaveTitle('Ana Nikolić – nastavnik | Sigma Tim')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana Nikolić')
  await expect(page.locator('.cv__about')).toHaveText(TEXT)
  await expect(page.getByText('Nastavnik, E2E škola')).toBeVisible()
  await expect(page.getByText('Strpljenje')).toBeVisible()
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    `https://sigmatim.com/nastavnici/${SLUG}`,
  )
  await expect(page.locator('meta[name=robots]')).toHaveCount(0)

  await page.goto(`${base}/`)
  // the front page does not list the teachers for now: it has the school, the way to call and how it works
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sigma tim Kruševac')
  await expect(page.getByRole('heading', { name: 'Kako Sigma tim radi' })).toBeVisible()
  await expect(page.locator('#nastavnici')).toHaveCount(0)
  await expect(page.locator(`a[href="/nastavnici/${SLUG}"]`)).toHaveCount(0)
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Politika privatnosti' }),
  ).toHaveAttribute('href', '/politika-privatnosti')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://sigmatim.com/img/og.jpg',
  )
  await context.close()

  // the privacy policy is a page of the build, made like the others, and the old static file is gone
  const policyContext = await browser.newContext({ javaScriptEnabled: false })
  const policy = await policyContext.newPage()
  await policy.goto(`${base}/politika-privatnosti`)
  await expect(policy.getByRole('heading', { level: 1 })).toHaveText('Politika privatnosti')
  expect(read('politika-privatnosti.html')).toContain('Politika privatnosti – Sigma Tim')
  await policyContext.close()

  expect(read('sitemap.xml')).toContain(`<loc>https://sigmatim.com/nastavnici/${SLUG}</loc>`)
  expect(read('sitemap.xml')).toContain('<loc>https://sigmatim.com/politika-privatnosti</loc>')
  expect(read('robots.txt')).toContain('Sitemap: https://sigmatim.com/sitemap.xml')
})

test('the app takes over the prerendered pages without an error, on a desktop and on a phone', async ({
  browser,
}) => {
  for (const device of [
    { viewport: { width: 1280, height: 800 } },
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext(device)
    const page = await context.newPage()
    const problems: string[] = []
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()))
    page.on('pageerror', (error) => problems.push(String(error)))

    await page.goto(`${base}/nastavnici/${SLUG}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ana Nikolić')
    await page.getByRole('link', { name: '← Svi nastavnici' }).click()
    await expect(page.getByRole('heading', { name: 'Sigma tim Kruševac', level: 1 })).toBeVisible()
    // the visitor is not a member: the way in is the way in
    await expect(page.getByRole('button', { name: 'Prijava' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBe(0)
    expect(problems).toEqual([])
    await context.close()
  }
})

test('an address with no page of its own shows the app, not the front page', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${base}/nema-takve-strane`)
  await expect(
    page.getByRole('heading', { name: 'Stranica nije pronađena', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sigma tim Kruševac' })).toHaveCount(0)

  // the old sign-in address is gone: it leads to the front page, where signing in starts now
  await page.goto(`${base}/prijava`)
  await expect(page.getByRole('heading', { name: 'Sigma tim Kruševac', level: 1 })).toBeVisible()
  await expect(page).toHaveURL(`${base}/`)

  // a CV that was never there says so and asks search engines to forget it
  await page.goto(`${base}/nastavnici/nema-takvog`)
  await expect(page.getByRole('heading', { name: 'Ovaj CV nije dostupan' })).toBeVisible()
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex')
  await context.close()
})

test('a CV that is hidden is in no file after the next build, nor is its photo', async ({
  browser,
  request,
}) => {
  expect(existsSync(join(dist, 'nastavnici', `${SLUG}.html`))).toBe(true)
  await publish(request, false)
  build()

  expect(existsSync(join(dist, 'nastavnici', `${SLUG}.html`))).toBe(false)
  for (const [file, content] of Object.entries(textFiles())) {
    expect(content, file).not.toContain(SLUG)
    expect(content, file).not.toContain('E2E javni opis')
    expect(content, file).not.toContain(PHOTO)
  }
  expect(read('sitemap.xml')).not.toContain(SLUG)

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${base}/nastavnici/${SLUG}`)
  await expect(page.getByRole('heading', { name: 'Ovaj CV nije dostupan' })).toBeVisible()
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex')
  await context.close()
})
