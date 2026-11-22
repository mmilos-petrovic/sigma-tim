import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../admin/adminApi'
import { createFakeCvApi, FIXTURE_CVS } from '../test/fakeCvApi'
import { personas } from '../test/fixtures'
import { renderPublic, where } from '../test/renderPublic'

const robots = () => document.head.querySelector('meta[name="robots"]')

describe('the public page of a teacher', () => {
  it('shows the CV to a visitor who has not signed in', async () => {
    renderPublic('/nastavnici/marija-jovanovic')
    const cv = within(await screen.findByRole('article'))
    expect(cv.getByRole('heading', { name: 'Marija Jovanović', level: 1 })).toBeInTheDocument()
    expect(cv.getByText(/Predajem matematiku osnovcima/)).toBeInTheDocument()
    expect(cv.getByText('Profesor').closest('li')).toHaveTextContent(
      'Profesor, Gimnazija · 2015 – 2020',
    )
    expect(cv.getByRole('list', { name: 'Predmeti' })).toHaveTextContent('Fizika')
    // the photo is decoration next to the name, so it has no role
    expect(screen.getByRole('article').querySelector('img')).toHaveAttribute(
      'src',
      'https://photos.test/p-marija/photo.jpg',
    )
  })

  it('has the logo, the phone and a way back in the frame of the site', async () => {
    renderPublic('/nastavnici/marija-jovanovic')
    await screen.findByRole('article')
    expect(
      within(screen.getAllByRole('banner')[0]!).getByRole('link', { name: 'Pozovi odmah' }),
    ).toHaveAttribute('href', 'tel:+381644994235')
    await userEvent.click(screen.getByRole('link', { name: '← Svi nastavnici' }))
    expect(where()).toBe('/')
  })

  it('is meant to be found: a title with the name, and the start of the text as the description', async () => {
    renderPublic('/nastavnici/marija-jovanovic')
    await screen.findByRole('article')
    expect(document.title).toBe('Marija Jovanović – nastavnik | Sigma Tim')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Predajem matematiku osnovcima i srednjoškolcima već deset godina.',
    )
    expect(robots()).toBeNull()
  })

  it('shortens a long text for the description', async () => {
    const long = { ...FIXTURE_CVS[0]!, about: 'x'.repeat(300) }
    renderPublic('/nastavnici/marija-jovanovic', { cv: createFakeCvApi([long]) })
    await screen.findByRole('article')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      `${'x'.repeat(155)}…`,
    )
  })

  it('does not show a CV that is not public, and asks search engines to forget it', async () => {
    // the CV is shared with signed-in people but its "javno" switch is off
    renderPublic('/nastavnici/marija-jovanovic', { cv: createFakeCvApi(FIXTURE_CVS, []) })
    expect(
      await screen.findByRole('heading', { name: 'Ovaj CV nije dostupan', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Predajem matematiku/)).not.toBeInTheDocument()
    expect(robots()).toHaveAttribute('content', 'noindex')
    expect(document.title).toBe('CV nije dostupan | Sigma Tim')
  })

  it('says the same about an address that never existed', async () => {
    renderPublic('/nastavnici/nema-takvog')
    expect(
      await screen.findByRole('heading', { name: 'Ovaj CV nije dostupan' }),
    ).toBeInTheDocument()
    expect(robots()).toHaveAttribute('content', 'noindex')
  })

  it('forgets the rule for search engines when the person leaves the page', async () => {
    renderPublic('/nastavnici/nema-takvog')
    await screen.findByRole('heading', { name: 'Ovaj CV nije dostupan' })
    await userEvent.click(screen.getByRole('link', { name: '← Svi nastavnici' }))
    await screen.findByRole('heading', { name: 'Sigma tim Kruševac' })
    expect(robots()).toBeNull()
  })

  it('reads the public CVs even for a member, never the ones for signed-in people', async () => {
    const cv = createFakeCvApi(FIXTURE_CVS, [])
    renderPublic('/nastavnici/marija-jovanovic', { cv, roles: personas.student })
    await screen.findByRole('heading', { name: 'Ovaj CV nije dostupan' })
    expect(cv.calls.getPublicCv).toHaveBeenCalledWith('marija-jovanovic')
    expect(cv.calls.getMemberCv).not.toHaveBeenCalled()
  })

  it('explains a failure to load, and tries again', async () => {
    const cv = createFakeCvApi()
    cv.calls.getPublicCv.mockRejectedValueOnce(new AdminError('network', 'offline'))
    renderPublic('/nastavnici/marija-jovanovic', { cv })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('sends the bare /nastavnici to the front page', async () => {
    renderPublic('/nastavnici')
    await screen.findByRole('heading', { name: 'Sigma tim Kruševac' })
    expect(where()).toBe('/')
  })
})
