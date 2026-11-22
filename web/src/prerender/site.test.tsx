import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { publicCvKey, publicCvsKey } from '../cv/queries'
import { createFakeCvApi, FIXTURE_CVS } from '../test/fakeCvApi'
import { cvMeta } from '../lib/publicMeta'
import { makeSite, type SiteInput } from './entry'
import { PRERENDERED_ID, readPrerendered, seedQueries } from './seed'

const TEMPLATE = `<!doctype html><html><head><title>Sigma Tim</title></head><body><div id="root"></div></body></html>`

function input(more: Partial<SiteInput> = {}): SiteInput {
  const api = createFakeCvApi()
  return {
    template: TEMPLATE,
    cvs: FIXTURE_CVS,
    cvData: FIXTURE_CVS,
    api,
    siteUrl: 'https://sigmatim.com',
    indexable: true,
    ...more,
  }
}

describe('makeSite', () => {
  it('makes the front page, the privacy policy and a page for every public CV', () => {
    const files = makeSite(input())
    expect(Object.keys(files).sort()).toEqual([
      'index.html',
      'nastavnici/marija-jovanovic.html',
      'nastavnici/nikola-ilic.html',
      'politika-privatnosti.html',
      'robots.txt',
      'sitemap.xml',
    ])
  })

  it('writes the front page as the app does, without the teachers for now', () => {
    const html = makeSite(input())['index.html']!
    expect(html).toContain(
      '<title>Sigma tim Kruševac – časovi za osnovce, srednjoškolce i studente</title>',
    )
    expect(html).toContain('Kruševac</span></h1>')
    expect(html).toContain('Kako Sigma tim radi')
    expect(html).toContain('/img/members-1200.webp')
    expect(html).not.toContain('Naši nastavnici')
    expect(html).not.toContain('href="/nastavnici/')
    // the call button is in the frame of the page, the form arrives when the app asks whether the school takes sign-ups
    expect(html).toContain('href="tel:+381644994235"')
    expect(html).not.toContain('Nastavite sa Google-om')
  })

  it('writes the privacy policy into its own page, in the same frame', () => {
    const html = makeSite(input())['politika-privatnosti.html']!
    expect(html).toContain('<title>Politika privatnosti – Sigma Tim</title>')
    expect(html).toContain('<h1>Politika privatnosti</h1>')
    expect(html).toContain('href="tel:+381644994235"')
  })

  it('writes the whole CV into its page, with the photo and the structured data', () => {
    const html = makeSite(input())['nastavnici/marija-jovanovic.html']!
    expect(html).toContain('<title>Marija Jovanović – nastavnik | Sigma Tim</title>')
    expect(html).toContain('<h1 class="cv__name">')
    expect(html).toContain('Predajem matematiku osnovcima')
    expect(html).toContain('Matematički fakultet')
    expect(html).toContain('Priprema za prijemni')
    expect(html).toContain('https://photos.test/p-marija/photo.jpg')
    expect(html).toContain('"@type":"Person"')
    expect(html).toContain('"image":"https://photos.test/p-marija/photo.jpg"')
    expect(html).toContain(
      '<link rel="canonical" href="https://sigmatim.com/nastavnici/marija-jovanovic" />',
    )
    expect(html).toContain('<meta name="description" content="Predajem matematiku')
  })

  it('has no page, no link and no photo for a CV that is not public', () => {
    const [shown, hidden] = FIXTURE_CVS as [(typeof FIXTURE_CVS)[0], (typeof FIXTURE_CVS)[0]]
    const files = makeSite(input({ cvs: [shown], cvData: [shown] }))
    expect(Object.keys(files)).not.toContain(`nastavnici/${hidden.slug}.html`)
    for (const content of Object.values(files)) {
      expect(content).not.toContain(hidden.slug)
      expect(content).not.toContain('Hemija')
    }
  })

  it('has only the front page and the privacy policy when nobody is public', () => {
    const files = makeSite(input({ cvs: [], cvData: [] }))
    expect(Object.keys(files).sort()).toEqual([
      'index.html',
      'politika-privatnosti.html',
      'robots.txt',
      'sitemap.xml',
    ])
    expect(files['sitemap.xml']).not.toContain('nastavnici/')
  })

  it("does not let a teacher's text out of its place", () => {
    const [cv] = FIXTURE_CVS as [(typeof FIXTURE_CVS)[0]]
    const hostile = {
      ...cv,
      about: '</script><img src=x onerror=alert(1)> "quoted" & more',
      skills: ['<b>bold</b>'],
    }
    const html = makeSite(input({ cvs: [hostile], cvData: [hostile] }))[
      'nastavnici/marija-jovanovic.html'
    ]!
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).not.toContain('</script><img')
    expect(html.match(/<script/g)!.length).toBe(html.match(/<\/script>/g)!.length)
  })

  it('keeps search engines out, and names no sitemap, anywhere but on the real site', () => {
    const files = makeSite(
      input({ indexable: false, siteUrl: 'https://staging.sigma-tim.pages.dev' }),
    )
    expect(files['robots.txt']).toBe('User-agent: *\nDisallow: /\n')
    expect(files).not.toHaveProperty('sitemap.xml')
    expect(files['index.html']).toContain('<meta name="robots" content="noindex" />')
    expect(files['nastavnici/marija-jovanovic.html']).toContain(
      '<meta name="robots" content="noindex" />',
    )
  })

  it('is still a page without the address of the site, but without the parts that need it', () => {
    const files = makeSite(input({ siteUrl: null, indexable: true }))
    expect(files['robots.txt']).toBe('User-agent: *\nDisallow: /\n')
    expect(files).not.toHaveProperty('sitemap.xml')
    expect(files['index.html']).not.toContain('canonical')
  })

  it('lists exactly the pages it made in the sitemap', () => {
    const sitemap = makeSite(input())['sitemap.xml']!
    expect(sitemap).toContain('<loc>https://sigmatim.com/</loc>')
    expect(sitemap).toContain('<loc>https://sigmatim.com/nastavnici/marija-jovanovic</loc>')
    expect(sitemap).toContain('<loc>https://sigmatim.com/nastavnici/nikola-ilic</loc>')
    expect(sitemap).toContain('<loc>https://sigmatim.com/politika-privatnosti</loc>')
    expect(sitemap.match(/<url>/g)).toHaveLength(4)
  })

  it('gives the browser the answers the page was made from', () => {
    const files = makeSite(input())
    document.body.innerHTML = files['index.html']!.replace(/^[\s\S]*<body>/, '').replace(
      /<\/body>[\s\S]*$/,
      '',
    )
    expect(document.getElementById(PRERENDERED_ID)).not.toBeNull()
    expect(readPrerendered(document)?.publicCvs?.map((cv) => cv.slug)).toEqual([
      'marija-jovanovic',
      'nikola-ilic',
    ])
    document.body.innerHTML = files['nastavnici/nikola-ilic.html']!.replace(
      /^[\s\S]*<body>/,
      '',
    ).replace(/<\/body>[\s\S]*$/, '')
    expect(readPrerendered(document)?.publicCv?.slug).toBe('nikola-ilic')
    document.body.innerHTML = ''
  })
})

describe('what the browser does with a prerendered page', () => {
  it('puts the answers in its cache before anything is asked', () => {
    const client = new QueryClient()
    seedQueries(client, { publicCvs: FIXTURE_CVS, publicCv: FIXTURE_CVS[1] })
    expect(client.getQueryData(publicCvsKey)).toEqual(FIXTURE_CVS)
    expect(client.getQueryData(publicCvKey('nikola-ilic'))).toEqual(FIXTURE_CVS[1])
    expect(client.getQueryData(publicCvKey('marija-jovanovic'))).toBeUndefined()
  })

  it('seeds nothing for a page that brought nothing', () => {
    const client = new QueryClient()
    seedQueries(client, {})
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('reads nothing from a page that is not prerendered, or whose data is damaged', () => {
    document.body.innerHTML = '<div id="root"></div>'
    expect(readPrerendered(document)).toBeNull()
    document.body.innerHTML = `<script type="application/json" id="${PRERENDERED_ID}">{not json</script>`
    expect(readPrerendered(document)).toBeNull()
    document.body.innerHTML = `<script type="application/json" id="${PRERENDERED_ID}">42</script>`
    expect(readPrerendered(document)).toBeNull()
    document.body.innerHTML = `<script type="application/json" id="${PRERENDERED_ID}"></script>`
    expect(readPrerendered(document)).toBeNull()
    document.body.innerHTML = ''
  })
})

describe('cvMeta', () => {
  it('names the teacher and starts the description with the text', () => {
    const meta = cvMeta(FIXTURE_CVS[0]!)
    expect(meta.title).toBe('Marija Jovanović – nastavnik | Sigma Tim')
    expect(meta.description).toBe(FIXTURE_CVS[0]!.about)
    expect(meta.noindex).toBeUndefined()
  })

  it('shortens a long text at 155 characters', () => {
    const meta = cvMeta({ ...FIXTURE_CVS[0]!, about: 'a'.repeat(300) })
    expect(meta.description).toBe(`${'a'.repeat(155)}…`)
    expect(cvMeta({ ...FIXTURE_CVS[0]!, about: 'a'.repeat(155) }).description).toBe('a'.repeat(155))
  })

  it('has no description for a CV without text, and asks to be forgotten when there is no CV', () => {
    expect(cvMeta(FIXTURE_CVS[1]!).description).toBeUndefined()
    expect(cvMeta(null)).toEqual({ title: 'CV nije dostupan | Sigma Tim', noindex: true })
  })
})
