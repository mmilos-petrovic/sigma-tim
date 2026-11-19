import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { renderToString } from 'react-dom/server'
import { Route, Routes, StaticRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthProvider'
import type { AuthApi } from '../auth/authApi'
import { CvApiProvider } from '../cv/CvApiProvider'
import type { CvApi, CvData, CvSummary } from '../cv/cvApi'
import { PublicCvPage } from '../cv/PublicCvPage'
import { createSupabaseCvApi } from '../cv/supabaseCvApi'
import { EnrolmentApiProvider } from '../enrolment/EnrolmentApiProvider'
import type { EnrolmentApi } from '../enrolment/enrolmentApi'
import { LandingPage } from '../pages/LandingPage'
import type { Database } from '../lib/database.types'
import { cvMeta, LANDING_META, type PageMeta } from '../lib/publicMeta'
import { assemblePage, robotsTxt, schoolJsonLd, sitemapXml, teacherJsonLd } from './page'
import { seedQueries, type Prerendered } from './seed'

/**
 * What `scripts/prerender.mjs` uses at build time (the script builds this file for Node, it is not part of the app).
 * The pages are rendered with the same components as in the browser, with the answers the database gives a visitor who
 * has not signed in.
 */

/** The public side of the database, as a visitor who has not signed in sees it. */
export function createPublicCvApi(url: string, key: string): CvApi {
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return createSupabaseCvApi(client)
}

// Effects do not run when a page is rendered to a string, so nothing asks these for anything: they only have to exist.
const noAuth: AuthApi = {
  getSession: () => new Promise(() => {}),
  subscribe: () => () => {},
  loadRoles: () => new Promise(() => {}),
  signInWithGoogle: () => Promise.reject(new Error('not while building')),
  signOut: () => Promise.resolve(),
}
const noEnrolment = {} as EnrolmentApi

/** The HTML of the app on one address, made from the data a page of that kind needs. */
export function renderPublicPage(path: string, data: Prerendered, cvApi: CvApi): string {
  const client = new QueryClient()
  seedQueries(client, data)
  return renderToString(
    <QueryClientProvider client={client}>
      <CvApiProvider api={cvApi}>
        <EnrolmentApiProvider api={noEnrolment}>
          <AuthProvider api={noAuth}>
            <StaticRouter location={path}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/nastavnici/:slug" element={<PublicCvPage />} />
              </Routes>
            </StaticRouter>
          </AuthProvider>
        </EnrolmentApiProvider>
      </CvApiProvider>
    </QueryClientProvider>,
  )
}

export interface PublicPage {
  path: string
  meta: PageMeta
  data: Prerendered
  jsonLd: ((siteUrl: string) => object) | undefined
}

export const cvPath = (slug: string) => `/nastavnici/${slug}`

export function frontPage(cvs: Prerendered['publicCvs']): PublicPage {
  return { path: '/', meta: LANDING_META, data: { publicCvs: cvs }, jsonLd: schoolJsonLd }
}

export function cvPage(cv: CvData, photoUrl: string | null): PublicPage {
  return {
    path: cvPath(cv.slug),
    meta: cvMeta(cv),
    data: { publicCv: cv },
    jsonLd: (siteUrl) => teacherJsonLd(siteUrl, cv, photoUrl),
  }
}

export interface SiteInput {
  /** The `index.html` that `vite build` wrote. */
  template: string
  /** The list of public CVs and each of them whole. */
  cvs: CvSummary[]
  cvData: CvData[]
  api: CvApi
  /** The address of the site, if it is known (`https://sigmatim.com`). */
  siteUrl: string | null
  /** True only on the real site: elsewhere the pages ask search engines to stay away. */
  indexable: boolean
}

/** Every file the prerender adds to the build, by its path inside `dist`: the pages, `robots.txt` and `sitemap.xml`. */
export function makeSite(input: SiteInput): Record<string, string> {
  const { template, api, siteUrl, indexable } = input
  const pages = [
    frontPage(input.cvs),
    ...input.cvData.map((cv) => cvPage(cv, cv.photoPath ? api.photoUrl(cv.photoPath) : null)),
  ]
  const files: Record<string, string> = {}
  for (const page of pages) {
    // `/nastavnici/ana` is served from `nastavnici/ana.html`, the way Cloudflare Pages serves a page at an address without an extension
    const file = page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`
    files[file] = assemblePage(template, {
      path: page.path,
      meta: page.meta,
      body: renderPublicPage(page.path, page.data, api),
      data: page.data,
      siteUrl,
      indexable,
      jsonLd: siteUrl ? page.jsonLd?.(siteUrl) : undefined,
    })
  }
  files['robots.txt'] = robotsTxt(siteUrl, indexable)
  if (siteUrl && indexable) {
    files['sitemap.xml'] = sitemapXml(
      siteUrl,
      pages.map((page) => page.path),
    )
  }
  return files
}
