import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../admin/adminApi'
import { createFakeCvApi, FIXTURE_CVS } from '../test/fakeCvApi'
import { personas } from '../test/fixtures'
import { page as adminPage, renderAdmin } from '../test/renderAdmin'
import { page as studentPage, renderStudent } from '../test/renderStudent'
import { page as teacherPage, renderTeacher } from '../test/renderTeacher'

describe('the CVs of the teachers, for a signed-in person', () => {
  describe('as a student', () => {
    const open = async (api = createFakeCvApi()) => {
      const view = renderStudent('/ucenik/nastavnici', { cvApi: api })
      await studentPage('Moji časovi')
      await screen.findByRole('heading', { name: 'CV nastavnika', level: 1 })
      return view
    }

    it('is a tab next to the lessons and the free slots', async () => {
      renderStudent('/ucenik')
      await studentPage('Moji časovi')
      await userEvent.click(await screen.findByRole('link', { name: 'CV nastavnika' }))
      expect(
        await screen.findByRole('heading', { name: 'CV nastavnika', level: 1 }),
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'CV nastavnika' })).toHaveAttribute(
        'aria-current',
        'page',
      )
    })

    it('lists the teachers with their subjects and the start of what they wrote', async () => {
      await open()
      const marija = (await screen.findByRole('link', { name: /Marija Jovanović/ })).closest('li')!
      expect(within(marija).getByText('Matematika, Fizika')).toBeInTheDocument()
      expect(within(marija).getByText(/Predajem matematiku osnovcima/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Nikola Ilić/ })).toBeInTheDocument()
    })

    it('shows the photo from the public address, or the initials when there is none', async () => {
      await open()
      const marija = (await screen.findByRole('link', { name: /Marija Jovanović/ })).closest('li')!
      expect(marija.querySelector('img')).toHaveAttribute(
        'src',
        'https://photos.test/p-marija/photo.jpg',
      )
      const nikola = screen.getByRole('link', { name: /Nikola Ilić/ }).closest('li')!
      expect(nikola.querySelector('img')).toBeNull()
      expect(nikola).toHaveTextContent('NI')
    })

    it('shortens a long text, not a short one', async () => {
      const long = 'x'.repeat(300)
      await open(createFakeCvApi([{ ...FIXTURE_CVS[0]!, about: long }]))
      const card = await screen.findByRole('link', { name: /Marija Jovanović/ })
      expect(card).toHaveTextContent(`${'x'.repeat(160)}…`)
      expect(card).not.toHaveTextContent('x'.repeat(161))
    })

    it('says so when nobody has shared a CV', async () => {
      await open(createFakeCvApi([]))
      expect(await screen.findByText('Nijedan nastavnik još nije objavio CV.')).toBeInTheDocument()
    })

    it('opens a CV with its sections, and goes back to the list', async () => {
      await open()
      await userEvent.click(await screen.findByRole('link', { name: /Marija Jovanović/ }))
      const cv = within(await screen.findByRole('article'))
      expect(cv.getByRole('heading', { name: 'Marija Jovanović' })).toBeInTheDocument()
      expect(cv.getByRole('heading', { name: 'O meni' })).toBeInTheDocument()
      expect(cv.getByText('Profesor').closest('li')).toHaveTextContent(
        'Profesor, Gimnazija · 2015 – 2020',
      )
      expect(cv.getByText('Matematika', { selector: 'p' })).toBeInTheDocument()
      expect(cv.getByText('Matematički fakultet').closest('li')).toHaveTextContent(
        'Matematički fakultet, Master · 2008 – 2013',
      )
      expect(cv.getByRole('list', { name: 'Veštine' })).toHaveTextContent('Priprema za prijemni')
      expect(cv.getByRole('list', { name: 'Predmeti' })).toHaveTextContent('Fizika')

      await userEvent.click(screen.getByRole('link', { name: '← Svi nastavnici' }))
      expect(await screen.findByRole('link', { name: /Nikola Ilić/ })).toBeInTheDocument()
    })

    it('leaves out the sections a CV does not have', async () => {
      renderStudent('/ucenik/nastavnici/nikola-ilic')
      await studentPage('Moji časovi')
      const cv = within(await screen.findByRole('article'))
      expect(cv.getByRole('heading', { name: 'Nikola Ilić' })).toBeInTheDocument()
      for (const name of ['O meni', 'Radno iskustvo', 'Obrazovanje', 'Veštine']) {
        expect(cv.queryByRole('heading', { name })).not.toBeInTheDocument()
      }
    })

    it('says that a CV is not available when there is none for this person', async () => {
      renderStudent('/ucenik/nastavnici/nema-takvog')
      await studentPage('Moji časovi')
      expect(await screen.findByText('Ovaj CV nije dostupan.')).toBeInTheDocument()
    })

    it('explains a failure to load, and tries again', async () => {
      const api = createFakeCvApi()
      api.calls.listMemberCvs.mockRejectedValueOnce(new AdminError('network', 'offline'))
      await open(api)
      expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
      await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
      expect(await screen.findByRole('link', { name: /Marija Jovanović/ })).toBeInTheDocument()
    })
  })

  describe('as a parent', () => {
    it("reads the same list, under the parent's own address", async () => {
      renderStudent('/roditelj/nastavnici')
      await studentPage('Časovi dece')
      const card = await screen.findByRole('link', { name: /Marija Jovanović/ })
      expect(card).toHaveAttribute('href', '/roditelj/nastavnici/marija-jovanovic')
    })
  })

  describe('as a teacher', () => {
    it("is reached from the page of the own CV, and a CV opens under the teacher's address", async () => {
      renderTeacher('/moj-raspored/moj-cv')
      await teacherPage('Moj CV')
      await userEvent.click(screen.getByRole('link', { name: 'CV nastavnika' }))
      const card = await screen.findByRole('link', { name: /Marija Jovanović/ })
      expect(card).toHaveAttribute('href', '/moj-raspored/cv-nastavnika/marija-jovanovic')
      await userEvent.click(card)
      expect(await screen.findByRole('article')).toHaveTextContent('Marija Jovanović')
    })
  })

  describe('as an administrator', () => {
    it('is in the menu of the administration', async () => {
      renderAdmin('/administracija', { roles: personas.admin })
      await adminPage('Administracija')
      await userEvent.click(screen.getByRole('link', { name: 'CV nastavnika' }))
      expect(await screen.findByRole('link', { name: /Marija Jovanović/ })).toHaveAttribute(
        'href',
        '/administracija/cv/marija-jovanovic',
      )
    })
  })
})
