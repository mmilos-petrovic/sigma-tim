import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../admin/adminApi'
import { peekPendingEnrolment } from '../enrolment/pending'
import { createFakeCvApi, FIXTURE_CVS } from '../test/fakeCvApi'
import { createFakeEnrolmentApi, FIXTURE_FORM } from '../test/fakeEnrolmentApi'
import { personas } from '../test/fixtures'
import { renderPublic, stranger, visitor, where } from '../test/renderPublic'

const heading = (name: string, level = 1) => screen.findByRole('heading', { name, level })
const phoneLinks = () => screen.getAllByRole('link', { name: '064 4994 235' })

describe('the front page', () => {
  it('has the logo and the phone of the school as a link that dials', async () => {
    renderPublic('/')
    await heading('Časovi za osnovce, srednjoškolce i studente')
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('img', { name: 'Sigma Tim' })).toHaveAttribute('src', '/img/logo.webp')
    expect(header.getByRole('link', { name: '064 4994 235' })).toHaveAttribute(
      'href',
      'tel:+381644994235',
    )
    // and again at the bottom, next to the privacy policy
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: '064 4994 235' })).toBeInTheDocument()
    expect(footer.getByRole('link', { name: 'Politika privatnosti' })).toHaveAttribute(
      'href',
      '/politika-privatnosti',
    )
  })

  it('shows the pictures of the school with a text that says what they show', async () => {
    renderPublic('/')
    await heading('Časovi za osnovce, srednjoškolce i studente')
    expect(screen.getByRole('img', { name: /Učionica/ })).toHaveAttribute('width', '1200')
    expect(screen.getByRole('img', { name: /Zgrada/ })).toBeInTheDocument()
  })

  it('sets the title and the description for search engines', async () => {
    renderPublic('/')
    await heading('Časovi za osnovce, srednjoškolce i studente')
    expect(document.title).toBe('Sigma Tim – Časovi za osnovce, srednjoškolce i studente')
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('Privatni časovi'),
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
      const role = screen.getByRole('group', { name: 'Ja sam:' })
      expect(within(role).getByRole('radio', { name: 'Učenik' })).not.toBeChecked()
      expect(within(role).getByRole('radio', { name: 'Roditelj' })).not.toBeChecked()
      expect(screen.getByRole('button', { name: 'Nastavite sa Google-om' })).toBeInTheDocument()
    })

    it('does not go to Google without a subject', async () => {
      const { auth } = renderPublic('/')
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
      // the sign-in page takes the choice from here: it makes the request and shows it
      expect(await heading('Prijava za časove')).toBeInTheDocument()
      expect(where()).toBe('/upis')
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

  describe('our teachers', () => {
    it('lists the teachers who made their CV public, each with a link to the public page', async () => {
      renderPublic('/', { cv: createFakeCvApi(FIXTURE_CVS, [FIXTURE_CVS[0]!]) })
      const section = within(await screen.findByRole('region', { name: 'Naši nastavnici' }))
      const card = section.getByRole('link', { name: /Marija Jovanović/ })
      expect(card).toHaveAttribute('href', '/nastavnici/marija-jovanovic')
      expect(card).toHaveTextContent('Matematika, Fizika')
      // a CV that is not public is not on the page
      expect(section.queryByRole('link', { name: /Nikola Ilić/ })).not.toBeInTheDocument()
    })

    it('has no such section when nobody made a CV public', async () => {
      renderPublic('/', { cv: createFakeCvApi(FIXTURE_CVS, []) })
      await heading('Časovi za osnovce, srednjoškolce i studente')
      await screen.findByLabelText('Izaberi predmet iz kog želiš časove')
      expect(screen.queryByRole('heading', { name: 'Naši nastavnici' })).not.toBeInTheDocument()
    })

    it('has no such section, and no error, when the CVs cannot be loaded', async () => {
      const cv = createFakeCvApi()
      cv.calls.listPublicCvs.mockRejectedValue(new AdminError('network', 'offline'))
      renderPublic('/', { cv })
      await screen.findByLabelText('Izaberi predmet iz kog želiš časove')
      expect(screen.queryByRole('heading', { name: 'Naši nastavnici' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('the header', () => {
    it('offers to sign in to a visitor', async () => {
      renderPublic('/', { auth: visitor() })
      expect(await screen.findByRole('link', { name: 'Prijava' })).toHaveAttribute(
        'href',
        '/prijava',
      )
    })

    it('offers to sign out to somebody who signed up and is not a member yet', async () => {
      const { auth } = renderPublic('/', { auth: stranger() })
      await userEvent.click(await screen.findByRole('button', { name: 'Odjavi se' }))
      expect(auth.signOut).toHaveBeenCalled()
    })
  })
})
