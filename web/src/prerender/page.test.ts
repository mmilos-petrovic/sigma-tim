import { describe, expect, it } from 'vitest'
import { FIXTURE_CVS } from '../test/fakeCvApi'
import {
  assemblePage,
  jsonForScript,
  robotsTxt,
  schoolJsonLd,
  sitemapXml,
  teacherJsonLd,
  type PageOptions,
} from './page'

const TEMPLATE = `<html><head>
    <title>Sigma Tim</title>
    <script type="module" src="/assets/index.js"></script>
  </head><body>
    <div id="root"></div>
  </body></html>`

const options = (more: Partial<PageOptions> = {}): PageOptions => ({
  path: '/',
  meta: { title: 'Naslov', description: 'Opis' },
  body: '<main>sadržaj</main>',
  data: {},
  siteUrl: 'https://sigmatim.com',
  indexable: true,
  ...more,
})

describe('assemblePage', () => {
  it('puts the title, the description and the content in the place of the empty ones', () => {
    const html = assemblePage(TEMPLATE, options())
    expect(html).toContain('<title>Naslov</title>')
    expect(html).not.toContain('<title>Sigma Tim</title>')
    expect(html).toContain('<meta name="description" content="Opis" />')
    expect(html).toContain('<div id="root"><main>sadržaj</main></div>')
    // what the build wrote stays
    expect(html).toContain('<script type="module" src="/assets/index.js"></script>')
  })

  it('names the address, the preview and the school for a page that has a site address', () => {
    const html = assemblePage(
      TEMPLATE,
      options({ path: '/nastavnici/ana', jsonLd: schoolJsonLd('https://sigmatim.com') }),
    )
    expect(html).toContain('<link rel="canonical" href="https://sigmatim.com/nastavnici/ana" />')
    expect(html).toContain(
      '<meta property="og:url" content="https://sigmatim.com/nastavnici/ana" />',
    )
    expect(html).toContain('<meta property="og:image" content="https://sigmatim.com/img/og.jpg" />')
    expect(html).toContain('<meta property="og:title" content="Naslov" />')
    expect(html).toContain('<meta property="og:description" content="Opis" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toContain('<script type="application/ld+json">')
    expect(html).not.toContain('noindex')
  })

  it('makes the front page canonical with a trailing slash only', () => {
    expect(assemblePage(TEMPLATE, options())).toContain('href="https://sigmatim.com/"')
  })

  it('leaves out the address, the preview and the structured data when the address of the site is not known', () => {
    const html = assemblePage(TEMPLATE, options({ siteUrl: null, jsonLd: { a: 1 } }))
    expect(html).not.toContain('canonical')
    expect(html).not.toContain('og:image')
    expect(html).not.toContain('ld+json')
    expect(html).toContain('<meta property="og:title" content="Naslov" />')
  })

  it('asks search engines to stay away from a page that is not on the real site, or that says so itself', () => {
    expect(assemblePage(TEMPLATE, options({ indexable: false }))).toContain(
      '<meta name="robots" content="noindex" />',
    )
    expect(assemblePage(TEMPLATE, options({ meta: { title: 'T', noindex: true } }))).toContain(
      '<meta name="robots" content="noindex" />',
    )
    expect(assemblePage(TEMPLATE, options())).not.toContain('robots')
  })

  it('has no description when there is none', () => {
    const html = assemblePage(TEMPLATE, options({ meta: { title: 'Naslov' } }))
    expect(html).not.toContain('name="description"')
    expect(html).not.toContain('og:description')
  })

  it('escapes what a teacher wrote in the head and keeps it out of the markup of the page', () => {
    const html = assemblePage(
      TEMPLATE,
      options({ meta: { title: 'A "b" <c> & d', description: '"><script>alert(1)</script>' } }),
    )
    expect(html).toContain('<title>A &quot;b&quot; &lt;c&gt; &amp; d</title>')
    expect(html).toContain('content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"')
    expect(html).not.toContain('<script>alert(1)')
  })

  it('carries the data of the page in a script that nothing in the data can end', () => {
    const html = assemblePage(
      TEMPLATE,
      options({
        data: {
          publicCvs: [{ ...FIXTURE_CVS[0]!, about: '</script><script>x()</script> & <!--' }],
        },
      }),
    )
    const script = /<script type="application\/json" id="prerendered-data">(.*?)<\/script>/s.exec(
      html,
    )
    expect(script).not.toBeNull()
    expect(script![1]).not.toMatch(/[<>&]/)
    expect(JSON.parse(script![1]!).publicCvs[0].about).toBe('</script><script>x()</script> & <!--')
    expect(html).not.toContain('<script>x()')
  })

  it('takes the content out again at every address but its own', () => {
    const html = assemblePage(TEMPLATE, options({ path: '/nastavnici/ana' }))
    const guard = /<script>(\(function\(\)\{.*?\}\)\(\))<\/script>/.exec(html)
    expect(guard).not.toBeNull()
    const run = (pathname: string) => {
      const root = { textContent: 'sadržaj' }
      new Function('location', 'document', guard![1]!)({ pathname }, { getElementById: () => root })
      return root.textContent
    }
    expect(run('/nastavnici/ana')).toBe('sadržaj')
    expect(run('/nastavnici/ana/')).toBe('sadržaj')
    expect(run('/nastavnici/ivan')).toBe('')
    expect(run('/prijava')).toBe('')
    expect(run('/')).toBe('')
  })

  it('keeps the content of the front page at its own address only', () => {
    const guard = /<script>(\(function\(\)\{.*?\}\)\(\))<\/script>/.exec(
      assemblePage(TEMPLATE, options()),
    )!
    const run = (pathname: string) => {
      const root = { textContent: 'sadržaj' }
      new Function('location', 'document', guard[1]!)({ pathname }, { getElementById: () => root })
      return root.textContent
    }
    expect(run('/')).toBe('sadržaj')
    expect(run('/prijava')).toBe('')
  })

  it('refuses a template that is not the empty page of the build', () => {
    expect(() => assemblePage('<title>Sigma Tim</title><div id="root">x</div>', options())).toThrow(
      /empty page/,
    )
    // a page that was prerendered already must not be done twice
    expect(() => assemblePage(assemblePage(TEMPLATE, options()), options())).toThrow(/empty page/)
  })

  it('does not read $ in the title as an instruction of the replacement either', () => {
    const html = assemblePage(TEMPLATE, options({ meta: { title: 'Cena $& i $1' } }))
    expect(html).toContain('<title>Cena $&amp; i $1</title>')
  })

  it('does not read $ in the content as an instruction of the replacement', () => {
    const html = assemblePage(TEMPLATE, options({ body: '<p>$& $1 $$</p>' }))
    expect(html).toContain('<p>$&amp; $1 $$</p>'.replace('&amp;', '&'))
  })
})

describe('jsonForScript', () => {
  it('writes the line separators of Unicode as escapes too', () => {
    expect(jsonForScript('a b c')).toBe('"a\\u2028b\\u2029c"')
  })
})

describe('the structured data', () => {
  it('describes the school', () => {
    expect(schoolJsonLd('https://sigmatim.com')).toMatchObject({
      '@type': 'EducationalOrganization',
      name: 'Sigma Tim',
      telephone: '+381644994235',
      url: 'https://sigmatim.com/',
    })
  })

  it('describes a teacher with what the CV says, and nothing it does not', () => {
    expect(
      teacherJsonLd('https://sigmatim.com', FIXTURE_CVS[0]!, 'https://photos.test/a.jpg'),
    ).toMatchObject({
      '@type': 'Person',
      name: 'Marija Jovanović',
      url: 'https://sigmatim.com/nastavnici/marija-jovanovic',
      image: 'https://photos.test/a.jpg',
      knowsAbout: ['Matematika', 'Fizika'],
      description: FIXTURE_CVS[0]!.about,
    })
    const bare = teacherJsonLd('https://sigmatim.com', FIXTURE_CVS[1]!, null) as Record<
      string,
      unknown
    >
    expect(bare).not.toHaveProperty('image')
    expect(bare).not.toHaveProperty('description')
    expect(bare.knowsAbout).toEqual(['Hemija'])
  })
})

describe('sitemapXml and robotsTxt', () => {
  it('lists the addresses of the pages', () => {
    const xml = sitemapXml('https://sigmatim.com', ['/', '/nastavnici/ana'])
    expect(xml).toContain('<loc>https://sigmatim.com/</loc>')
    expect(xml).toContain('<loc>https://sigmatim.com/nastavnici/ana</loc>')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  it('lets search engines in on the real site and names the sitemap', () => {
    expect(robotsTxt('https://sigmatim.com', true)).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://sigmatim.com/sitemap.xml\n',
    )
  })

  it('keeps them out everywhere else', () => {
    expect(robotsTxt('https://staging.example', false)).toBe('User-agent: *\nDisallow: /\n')
    expect(robotsTxt(null, true)).toBe('User-agent: *\nDisallow: /\n')
  })
})
