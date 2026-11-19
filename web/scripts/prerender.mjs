// Makes the public pages (the front page and one page for each public CV) as HTML at build time, so that search engines and
// the first paint get the content without running the app. Runs after `vite build` (see the `build` script); the app takes
// over in the browser as before.
//
// On Cloudflare Pages (`CF_PAGES` is set) or with PRERENDER=required a failure fails the build: better no deployment than
// one with a front page that has lost its teachers. Anywhere else (a pull request check, a laptop without database
// settings) a missing setting or an unreachable database only skips the step, with a warning, and the build stays as it was.
//
// Settings: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (the same as the app), SITE_URL (optional; defaults to
// https://sigmatim.com on the production branch and to the address of the deployment elsewhere on Cloudflare).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, loadEnv } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = path.join(root, 'dist')
const bundle = path.join(root, 'node_modules', '.prerender')
const required = Boolean(process.env.CF_PAGES) || process.env.PRERENDER === 'required'

function giveUp(reason, error) {
  if (required) {
    console.error(`prerender: ${reason}`)
    if (error) console.error(error)
    process.exit(1)
  }
  console.warn(`prerender: skipped, ${reason}`)
  process.exit(0)
}

const env = loadEnv('production', root, 'VITE_')
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) giveUp('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set')

// The real site is the production branch; every other build (staging, previews, a laptop) asks search engines to stay away.
const production = process.env.CF_PAGES_BRANCH === 'main'
const siteUrl = (
  process.env.SITE_URL ?? (production ? 'https://sigmatim.com' : (process.env.CF_PAGES_URL ?? ''))
).replace(/\/+$/, '')

let template
try {
  template = await readFile(path.join(dist, 'index.html'), 'utf8')
} catch (error) {
  giveUp('dist/index.html is missing: run `vite build` first', error)
}

try {
  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: 'src/prerender/entry.tsx',
      outDir: bundle,
      emptyOutDir: true,
      copyPublicDir: false,
    },
  })
  const entry = await import(pathToFileURL(path.join(bundle, 'entry.js')).href)

  const api = entry.createPublicCvApi(url, key)
  const cvs = await api.listPublicCvs()
  const cvData = []
  for (const summary of cvs) {
    const cv = await api.getPublicCv(summary.slug)
    // hidden between the two calls: it is not public any more
    if (cv) cvData.push(cv)
  }

  const files = entry.makeSite({
    template,
    cvs: cvData.map((cv) => cvs.find((summary) => summary.slug === cv.slug)),
    cvData,
    api,
    siteUrl: siteUrl || null,
    indexable: production,
  })
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dist, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  console.log(
    `prerender: ${Object.keys(files).length} files (${cvData.length} CV pages), ${production ? 'indexable' : 'not indexable'}`,
  )
} catch (error) {
  giveUp('the pages could not be made', error)
} finally {
  await rm(bundle, { recursive: true, force: true })
}
