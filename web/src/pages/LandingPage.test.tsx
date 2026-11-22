import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../admin/adminApi'
import { peekPendingEnrolment } from '../enrolment/pending'
import { createFakeCvApi, FIXTURE_CVS } from '../test/fakeCvApi'
import { createFakeEnrolmentApi, FIXTURE_FORM } from '../test/fakeEnrolmentApi'
import { personas } from '../test/fixtures'
import { renderPublic, stranger, visitor, where } from '../test/renderPublic'

const FRONT_PAGE = 'Sigma tim Kruševac'
const heading = (name: string, level = 1) => screen.findByRole('heading', { name, level })
const phoneLinks = () => screen.getAllByRole('link', { name: '064 4994 235' })

describe('the front page', () => {
  it('has the logo, the address and a call button that dials, and the phone again in the footer', async () => {
    renderPublic('/')
    await heading(FRONT_PAGE)
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('img', { name: 'Sigma Tim' })).toHaveAttribute('src', '/img/logo.webp')
    expect(header.getByRole('link', { name: 'Pozovi odmah' })).toHaveAttribute(
      'href',
      'tel:+381644994235',
    )
    expect(header.getByText('Hajduk')).toBeInTheDocument()
    expect(header.getByText('Kruševac')).toBeInTheDocument()
    // and again at the bottom, next to the privacy policy
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: '064 4994 235' })).toBeInTheDocument()
    expect(footer.getByRole('link', { name: 'Politika privatnosti' })).toHaveAttribute(
      'href',
      '/politika-privatnosti',
    )
  })

  it('says who the school is for, in the words of the owner', async () => {
    renderPublic('/')
    await heading(FRONT_PAGE)
    expect(screen.getByText('Časovi za osnovce, srednjoškolce i studente')).toBeInTheDocument()
    expect(screen.getByText(/udruženje nastavnika/)).toBeInTheDocument()
  })

  it('shows the photo of the team with a text that says what it shows', async () => {
    renderPublic('/')
    await heading(FRONT_PAGE)
    const photo = screen.getByRole('img', { name: /Članovi Sigma tima/ })
    expect(photo).toHaveAttribute('src', '/img/members-1200.webp')
    expect(photo).toHaveAttribute('width', '1200')
    expect(photo).toHaveAttribute('height', '900')
  })

  it('explains in three steps how it works', async () => {
    renderPublic('/')
    const how = within(await screen.findByRole('region', { name: 'Kako Sigma tim radi' }))
    const steps = how.getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent('Prijavi se Google nalogom')
    expect(steps[1]).toHaveTextContent('Nastavnici ti odgovaraju')
    expect(steps[2]).toHaveTextContent('Izaberi nastavnika')
  })

  it('has a skip link to the content', async () => {
    renderPublic('/')
    await heading(FRONT_PAGE)
    expect(screen.getByRole('link', { name: 'Preskoči na sadržaj' })).toHaveAttribute(
      'href',
      '#sadrzaj',
    )
  })

  it('sets the title and the description for search engines', async () => {
    renderPublic('/')
    await heading(FRONT_PAGE)
    expect(document.title).toBe('Sigma tim Kruševac – časovi za osnovce, srednjoškolce i studente')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('Udruženje nastavnika'),
    )
  })

  describe('the form', () => {
    it('asks for a subject and who the person is, with the subjects the school teaches', async () => {
      renderPublic('/')
      const subject = await screen.findByLabelText('Izaberi predmet iz kog želiš časove')
      const names = within(subject)
        .getAllByRole('option')
        .map((option) => option.textContent)
      // the order of the database: the subject with most teachers first
      expect(names).toEqual(['Izaberi predmet', 'Matematika', 'Fizika', 'Hemija'])
      // Matematika is chosen already; who the person is is not
      expect(subject).toHaveValue('sub-mat')
      const role = screen.getByRole('group', { name: 'Ja sam:' })
      expect(within(role).getByRole('radio', { name: 'Učenik' })).not.toBeChecked()
      expect(within(role).getByRole('radio', { name: 'Roditelj' })).not.toBeChecked()
      expect(screen.getByRole('button', { name: 'Nastavite sa Google-om' })).toBeInTheDocument()
    })

    it('does not go to Google when the subject was taken away', async () => {
      const { auth } = renderPublic('/')
      await userEvent.selectOptions(
        await screen.findByLabelText('Izaberi predmet iz kog želiš časove'),
        'Izaberi predmet',
      )
      await userEvent.click(await screen.findByRole('button', { name: 'Nastavite sa Google-om' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Izaberi predmet.')
      expect(auth.signInWithGoogle).not.toHaveBeenCalled()
      expect(peekPendingEnrolment()).toBeNull()
    })

    it('does not go to Google without saying who the person is', async () => {
      const { auth } = renderPublic('/')
      await userEvent.selectOptions(
        await screen.findByLabelText('Izaberi predmet iz kog želiš časove'),
        'Fizika',
      )
      await userEvent.click(screen.getByRole('button', { name: 'Nastavite sa Google-om' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Izaberi da li si učenik ili roditelj.',
      )
      expect(auth.signInWithGoogle).not.toHaveBeenCalled()
    })

    it('keeps the choice for the way back from Google, and leaves for Google', async () => {
      const { auth } = renderPublic('/')
      await userEvent.selectOptions(
        await screen.findByLabelText('Izaberi predmet iz kog želiš časove'),
        'Fizika',
      )
      await userEvent.click(screen.getByRole('radio', { name: 'Roditelj' }))
      await userEvent.click(screen.getByRole('button', { name: 'Nastavite sa Google-om' }))
      expect(auth.signInWithGoogle).toHaveBeenCalledWith(null)
      expect(peekPendingEnrolment()).toEqual({ subjectId: 'sub-fiz', role: 'parent' })
    })

    it('says so when Google cannot be reached, and lets the person try again', async () => {
      const { auth } = renderPublic('/')
      auth.signInWithGoogle.mockRejectedValueOnce(new Error('network'))
      await userEvent.selectOptions(
        await screen.findByLabelText('Izaberi predmet iz kog želiš časove'),
        'Matematika',
      )
      await userEvent.click(screen.getByRole('radio', { name: 'Učenik' }))
      await userEvent.click(screen.getByRole('button', { name: 'Nastavite sa Google-om' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Prijava nije uspela.')
      const again = screen.getByRole('button', { name: 'Nastavite sa Google-om' })
      expect(again).toBeEnabled()
      await userEvent.click(again)
      expect(auth.signInWithGoogle).toHaveBeenCalledTimes(2)
    })

    it('does not send somebody who is signed in with Google there again', async () => {
      const { auth } = renderPublic('/', { auth: stranger() })
      await userEvent.selectOptions(
        await screen.findByLabelText('Izaberi predmet iz kog želiš časove'),
        'Hemija',
      )
      await userEvent.click(screen.getByRole('radio', { name: 'Učenik' }))
      await userEvent.click(screen.getByRole('button', { name: 'Nastavite sa Google-om' }))
      expect(auth.signInWithGoogle).not.toHaveBeenCalled()
      // the front page takes the choice from here: it makes the request and shows it
      expect(await heading('Prijava za časove')).toBeInTheDocument()
      expect(where()).toBe('/upis')
    })

    it('is where the button "Počni prijavu" takes the person, with the cursor on the subjects', async () => {
      renderPublic('/')
      const subject = await screen.findByLabelText('Izaberi predmet iz kog želiš časove')
      await userEvent.click(screen.getByRole('link', { name: 'Počni prijavu' }))
      await waitFor(() => expect(subject).toHaveFocus())
    })
  })

  describe('when nobody can sign up', () => {
    it.each([
      ['the administrator turned the form off', { ...FIXTURE_FORM, enabled: false }],
      ['no teacher teaches a subject', { enabled: true, subjects: [] }],
    ])('shows only the phone when %s', async (_why, form) => {
      renderPublic('/', { enrolment: createFakeEnrolmentApi({ form }) })
      expect(await screen.findByText(/Za časove pozovite:/)).toBeInTheDocument()
      expect(screen.queryByLabelText('Izaberi predmet iz kog želiš časove')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Nastavite sa Google-om' }),
      ).not.toBeInTheDocument()
      expect(phoneLinks().length).toBeGreaterThanOrEqual(2)
      expect(screen.queryByRole('link', { name: 'Počni prijavu' })).not.toBeInTheDocument()
      // no word about a closed form
      expect(screen.queryByText(/zatvoren/i)).not.toBeInTheDocument()
    })

    it('shows only the phone when the form cannot be loaded, without an error', async () => {
      const enrolment = createFakeEnrolmentApi()
      enrolment.getFormInfo.mockRejectedValue(new AdminError('network', 'offline'))
      renderPublic('/', { enrolment })
      expect(await screen.findByText(/Za časove pozovite:/)).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('for a member of the school', () => {
    it('gives the way into the app and no form', async () => {
      renderPublic('/', { roles: personas.student })
      expect(await screen.findByRole('link', { name: 'Otvori aplikaciju' })).toHaveAttribute(
        'href',
        '/ucenik',
      )
      expect(screen.queryByLabelText('Izaberi predmet iz kog želiš časove')).not.toBeInTheDocument()
    })
  })

  describe('the teachers', () => {
    it('are not on the page for now, even when they made their CV public', async () => {
      const cv = createFakeCvApi(FIXTURE_CVS, [FIXTURE_CVS[0]!])
      renderPublic('/', { cv })
      await screen.findByLabelText('Izaberi predmet iz kog želiš časove')
      expect(screen.queryByRole('region', { name: 'Naši nastavnici' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Marija Jovanović/ })).not.toBeInTheDocument()
      expect(cv.calls.listPublicCvs).not.toHaveBeenCalled()
    })
  })

  describe('the header', () => {
    it('offers to sign in to a visitor, straight to Google', async () => {
      const { auth } = renderPublic('/', { auth: visitor() })
      await userEvent.click(await screen.findByRole('button', { name: 'Prijava' }))
      expect(auth.signInWithGoogle).toHaveBeenCalledWith(null)
    })

    it('says so when Google cannot be reached, and lets the person try again', async () => {
      const { auth } = renderPublic('/', { auth: visitor() })
      auth.signInWithGoogle.mockRejectedValueOnce(new Error('network'))
      await userEvent.click(await screen.findByRole('button', { name: 'Prijava' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Prijava nije uspela. Pokušajte ponovo.',
      )
      await userEvent.click(screen.getByRole('button', { name: 'Prijava' }))
      expect(auth.signInWithGoogle).toHaveBeenCalledTimes(2)
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    })

    it('offers the app to a member', async () => {
      renderPublic('/', { roles: personas.teacher })
      const header = within(await screen.findByRole('banner'))
      expect(await header.findByRole('link', { name: 'Aplikacija' })).toHaveAttribute(
        'href',
        '/moj-raspored',
      )
      expect(header.queryByRole('button', { name: 'Prijava' })).not.toBeInTheDocument()
    })

    it('offers to sign out to somebody who signed up and is not a member yet', async () => {
      const { auth } = renderPublic('/', { auth: stranger() })
      await userEvent.click(await screen.findByRole('button', { name: 'Odjavi se' }))
      expect(auth.signOut).toHaveBeenCalled()
    })
  })
})

describe('the privacy policy', () => {
  it('is in the same frame as the front page, with the way back', async () => {
    renderPublic('/politika-privatnosti')
    expect(await heading('Politika privatnosti')).toBeInTheDocument()
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Pozovi odmah' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Politika privatnosti' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. Ko obrađuje vaše podatke' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: '← Početna strana' }))
    expect(where()).toBe('/')
  })

  it('sets its own title', async () => {
    renderPublic('/politika-privatnosti')
    await heading('Politika privatnosti')
    expect(document.title).toBe('Politika privatnosti – Sigma Tim')
  })
})

describe('the old sign-in address', () => {
  it('leads to the front page', async () => {
    renderPublic('/prijava')
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(where()).toBe('/')
  })
})
