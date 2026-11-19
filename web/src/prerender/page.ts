import type { CvData } from '../cv/cvApi'
import type { PageMeta } from '../lib/publicMeta'
import { SCHOOL_NAME, SCHOOL_PHONE } from '../lib/school'
import { PRERENDERED_ID, type Prerendered } from './seed'

/** The empty page that `vite build` writes: what a prerendered page is made from. */
export const TEMPLATE_TITLE = '<title>Sigma Tim</title>'
export const TEMPLATE_ROOT = '<div id="root"></div>'

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** JSON that may stand inside a `<script>`: nothing in it can end the element or start a comment. */
export const jsonForScript = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

export interface PageOptions {
  /** The address of the page without the site, `/` or `/nastavnici/<slug>`. */
  path: string
  meta: PageMeta
  /** The HTML of the app for this page. */
  body: string
  data: Prerendered
  /** `https://sigmatim.com`: without it there is no canonical address, no preview image and no structured data. */
  siteUrl: string | null
  /** Anything but the real site asks search engines to stay away. */
  indexable: boolean
  /** Structured data (schema.org) for the page, if there is some. */
  jsonLd?: object
}

const addressOf = (siteUrl: string, path: string) =>
  path === '/' ? `${siteUrl}/` : `${siteUrl}${path}`

function headTags({ path, meta, siteUrl, indexable, jsonLd }: PageOptions): string {
  const tags = [`<title>${escapeHtml(meta.title)}</title>`]
  if (meta.description) {
    tags.push(`<meta name="description" content="${escapeHtml(meta.description)}" />`)
  }
  if (meta.noindex || !indexable) tags.push('<meta name="robots" content="noindex" />')
  tags.push('<meta property="og:type" content="website" />')
  tags.push(`<meta property="og:site_name" content="${escapeHtml(SCHOOL_NAME)}" />`)
  tags.push('<meta property="og:locale" content="sr_RS" />')
  tags.push(`<meta property="og:title" content="${escapeHtml(meta.title)}" />`)
  if (meta.description) {
    tags.push(`<meta property="og:description" content="${escapeHtml(meta.description)}" />`)
  }
  if (siteUrl) {
    const address = escapeHtml(addressOf(siteUrl, path))
    tags.push(`<link rel="canonical" href="${address}" />`)
    tags.push(`<meta property="og:url" content="${address}" />`)
    tags.push(`<meta property="og:image" content="${escapeHtml(`${siteUrl}/img/og.jpg`)}" />`)
    tags.push('<meta property="og:image:width" content="1200" />')
    tags.push('<meta property="og:image:height" content="630" />')
    tags.push('<meta name="twitter:card" content="summary_large_image" />')
    if (jsonLd) tags.push(`<script type="application/ld+json">${jsonForScript(jsonLd)}</script>`)
  }
  return tags.join('\n    ')
}

/**
 * The page as the template has it, with the head of this page and the HTML of the app in the place of the empty root.
 * The small script keeps the page from showing a front page that is not meant for the address: every address that has no
 * file of its own is answered with the front page (the app is a single page app), and the app takes over from there.
 */
export function assemblePage(template: string, options: PageOptions): string {
  if (template.split(TEMPLATE_TITLE).length !== 2 || template.split(TEMPLATE_ROOT).length !== 2) {
    throw new Error('The built index.html is not the empty page the prerender expects')
  }
  const guard = `<script>(function(){var p=location.pathname.replace(/\\/+$/,'')||'/';if(p!==${jsonForScript(options.path)}){document.getElementById('root').textContent=''}})()</script>`
  const data = `<script type="application/json" id="${PRERENDERED_ID}">${jsonForScript(options.data)}</script>`
  return template
    .replace(TEMPLATE_TITLE, () => headTags(options))
    .replace(TEMPLATE_ROOT, () => `<div id="root">${options.body}</div>\n    ${data}\n    ${guard}`)
}

export function schoolJsonLd(siteUrl: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: SCHOOL_NAME,
    url: `${siteUrl}/`,
    logo: `${siteUrl}/img/logo.webp`,
    telephone: SCHOOL_PHONE,
    image: `${siteUrl}/img/og.jpg`,
  }
}

export function teacherJsonLd(siteUrl: string, cv: CvData, photoUrl: string | null): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: `${cv.firstName} ${cv.lastName}`,
    jobTitle: 'Nastavnik',
    url: addressOf(siteUrl, `/nastavnici/${cv.slug}`),
    ...(photoUrl ? { image: photoUrl } : {}),
    ...(cv.about ? { description: cv.about } : {}),
    ...(cv.subjects.length > 0 ? { knowsAbout: cv.subjects } : {}),
    worksFor: { '@type': 'EducationalOrganization', name: SCHOOL_NAME, url: `${siteUrl}/` },
  }
}

export function sitemapXml(siteUrl: string, paths: string[]): string {
  const urls = paths.map(
    (path) => `  <url><loc>${escapeHtml(addressOf(siteUrl, path))}</loc></url>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

/** Search engines are let in only on the real site; the sitemap is named only there. */
export function robotsTxt(siteUrl: string | null, indexable: boolean): string {
  if (!indexable || !siteUrl) return 'User-agent: *\nDisallow: /\n'
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
}
