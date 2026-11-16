import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { shrinkImage } from '../../admin/image'
import { createFakeTeacherApi, OWN_PROFILE } from '../../test/fakeTeacherApi'
import { page, renderTeacher } from '../../test/renderTeacher'
import type { MyCv } from '../teacherApi'

vi.mock('../../admin/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../admin/image')>()),
  shrinkImage: vi.fn(),
}))

const PATH = '/moj-raspored/moj-cv'

const savedCv: MyCv = {
  slug: 'tara-osoba',
  about: 'Predajem matematiku.',
  showPublic: true,
  showMembers: false,
  photoPath: `${OWN_PROFILE}/old.jpg`,
  experience: [
    {
      employer: 'Gimnazija',
      position: 'Profesor',
      period: '2015 – 2020',
      description: 'Matematika',
    },
    { employer: 'Škola', position: 'Nastavnik', period: '', description: '' },
  ],
  education: [{ institution: 'Matematički fakultet', degree: 'Master', period: '2008 – 2013' }],
  skills: ['Strpljenje', 'Zadaci za prijemni'],
}

async function open(cv: MyCv | null = null) {
  const api = createFakeTeacherApi({ cv })
  const view = renderTeacher(PATH, { api })
  await page('Moj CV')
  await screen.findByRole('button', { name: 'Sačuvaj CV' })
  return { ...view, api }
}

const save = () => screen.getByRole('button', { name: 'Sačuvaj CV' })
const about = () => screen.getByLabelText('Kratak opis')
const publicSwitch = () => screen.getByRole('checkbox', { name: /^Javno/ })
const membersSwitch = () => screen.getByRole('checkbox', { name: /^Prijavljenim korisnicima/ })

describe('the CV editor', () => {
  beforeEach(() => {
    vi.mocked(shrinkImage).mockReset()
    vi.mocked(shrinkImage).mockResolvedValue(new Blob(['shrunk'], { type: 'image/jpeg' }))
  })

  it('is reached from the menu of the teacher', async () => {
    renderTeacher('/moj-raspored')
    await page('Moj raspored')
    await userEvent.click(screen.getByRole('link', { name: 'Moj CV' }))
    expect(await page('Moj CV')).toBeInTheDocument()
  })

  it('starts empty for a teacher who has no CV, and offers nothing to save yet', async () => {
    await open()
    expect(about()).toHaveValue('')
    expect(save()).toBeDisabled()
    expect(screen.getByText(/CV nije obavezan/)).toBeInTheDocument()
  })

  it('does not let the CV be shown before there is a text, and says why', async () => {
    await open()
    expect(publicSwitch()).toBeDisabled()
    expect(membersSwitch()).toBeDisabled()
    expect(screen.getByText(/prvo upišite tekst „O meni“/)).toBeInTheDocument()
    await userEvent.type(about(), 'Tekst')
    expect(publicSwitch()).toBeEnabled()
    expect(membersSwitch()).toBeEnabled()
    expect(screen.queryByText(/prvo upišite tekst/)).not.toBeInTheDocument()
  })

  it('saves the text and the switches in one call, and says so', async () => {
    const { api } = await open()
    await userEvent.type(about(), '  Predajem fiziku.  ')
    await userEvent.click(membersSwitch())
    await userEvent.click(save())
    expect(await screen.findByRole('status')).toHaveTextContent('CV je sačuvan.')
    expect(api.calls.saveMyCv).toHaveBeenCalledWith({
      about: 'Predajem fiziku.',
      showPublic: false,
      showMembers: true,
      experience: [],
      education: [],
      skills: [],
    })
    expect(api.state.cv).toMatchObject({ about: 'Predajem fiziku.', showMembers: true })
  })

  it('has nothing to save again until something changes', async () => {
    await open()
    await userEvent.type(about(), 'Tekst')
    await userEvent.click(save())
    await screen.findByText('CV je sačuvan.')
    await waitFor(() => expect(save()).toBeDisabled())
    await userEvent.type(about(), '!')
    expect(save()).toBeEnabled()
  })

  it('shows what is saved: text, entries in order, skills and the public address', async () => {
    await open(savedCv)
    expect(about()).toHaveValue('Predajem matematiku.')
    const jobs = screen.getAllByRole('group', { name: /^Radno iskustvo \d/ })
    expect(jobs).toHaveLength(2)
    expect(within(jobs[0]!).getByLabelText('Poslodavac')).toHaveValue('Gimnazija')
    expect(within(jobs[1]!).getByLabelText('Pozicija')).toHaveValue('Nastavnik')
    expect(
      within(screen.getByRole('group', { name: 'Obrazovanje 1' })).getByLabelText('Ustanova'),
    ).toHaveValue('Matematički fakultet')
    expect(screen.getByLabelText('Veština 2')).toHaveValue('Zadaci za prijemni')
    expect(publicSwitch()).toBeChecked()
    expect(membersSwitch()).not.toBeChecked()
    expect(screen.getByText('/nastavnici/tara-osoba')).toBeInTheDocument()
  })

  describe('the lists', () => {
    it('adds an entry and refuses to save it without an employer and a position', async () => {
      const { api } = await open()
      await userEvent.click(screen.getByRole('button', { name: 'Dodaj radno iskustvo' }))
      await userEvent.type(screen.getByLabelText('Poslodavac'), 'Škola')
      await userEvent.type(about(), 'Tekst')
      await userEvent.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Radno iskustvo 1: upišite poslodavca i poziciju.',
      )
      expect(api.calls.saveMyCv).not.toHaveBeenCalled()

      await userEvent.type(screen.getByLabelText('Pozicija'), 'Nastavnik')
      await userEvent.click(save())
      await screen.findByText('CV je sačuvan.')
      expect(api.state.cv?.experience).toEqual([
        { employer: 'Škola', position: 'Nastavnik', period: '', description: '' },
      ])
    })

    it('names the education that has no institution', async () => {
      await open()
      await userEvent.click(screen.getByRole('button', { name: 'Dodaj obrazovanje' }))
      await userEvent.type(screen.getByLabelText('Zvanje ili smer'), 'Master')
      await userEvent.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent('Obrazovanje 1: upišite ustanovu.')
    })

    it('moves an entry up and down, with what was typed in it', async () => {
      const { api } = await open(savedCv)
      const jobs = () => screen.getAllByRole('group', { name: /^Radno iskustvo \d/ })
      await userEvent.click(within(jobs()[1]!).getByRole('button', { name: 'Gore' }))
      expect(within(jobs()[0]!).getByLabelText('Poslodavac')).toHaveValue('Škola')
      expect(within(jobs()[1]!).getByLabelText('Poslodavac')).toHaveValue('Gimnazija')
      expect(within(jobs()[0]!).getByRole('button', { name: 'Gore' })).toBeDisabled()
      expect(within(jobs()[1]!).getByRole('button', { name: 'Dole' })).toBeDisabled()

      await userEvent.click(save())
      await screen.findByText('CV je sačuvan.')
      expect(api.state.cv?.experience.map((e) => e.employer)).toEqual(['Škola', 'Gimnazija'])
    })

    it('removes the entry that was asked for', async () => {
      const { api } = await open(savedCv)
      const first = screen.getAllByRole('group', { name: /^Radno iskustvo \d/ })[0]!
      await userEvent.click(within(first).getByRole('button', { name: 'Ukloni' }))
      expect(screen.getAllByRole('group', { name: /^Radno iskustvo \d/ })).toHaveLength(1)
      await userEvent.click(save())
      await screen.findByText('CV je sačuvan.')
      expect(api.state.cv?.experience.map((e) => e.employer)).toEqual(['Škola'])
    })

    it('adds and removes skills, and leaves blank ones out when saving', async () => {
      const { api } = await open(savedCv)
      await userEvent.click(screen.getByRole('button', { name: 'Dodaj veštinu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Dodaj veštinu' }))
      await userEvent.type(screen.getByLabelText('Veština 3'), '  Rad sa decom ')
      expect(screen.getByLabelText('Veština 4')).toHaveValue('')
      await userEvent.click(screen.getAllByRole('button', { name: 'Ukloni' }).at(-4)!)
      await userEvent.click(save())
      await screen.findByText('CV je sačuvan.')
      expect(api.state.cv?.skills).toEqual(['Zadaci za prijemni', 'Rad sa decom'])
    })

    it('stops adding at twenty entries', async () => {
      await open()
      const add = screen.getByRole('button', { name: 'Dodaj radno iskustvo' })
      for (let i = 0; i < 20; i++) await userEvent.click(add)
      expect(screen.getAllByRole('group', { name: /^Radno iskustvo \d/ })).toHaveLength(20)
      expect(add).toBeDisabled()
    })
  })

  describe('who may see it', () => {
    it('refuses to save a shown CV whose text was emptied, before asking the server', async () => {
      const { api } = await open(savedCv)
      await userEvent.clear(about())
      await userEvent.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Upišite tekst „O meni“ da bi CV mogao da bude vidljiv.',
      )
      expect(api.calls.saveMyCv).not.toHaveBeenCalled()
    })

    it('lets a shown CV be hidden even when its text is empty', async () => {
      await open(savedCv)
      await userEvent.clear(about())
      expect(publicSwitch()).toBeEnabled()
      await userEvent.click(publicSwitch())
      await userEvent.click(save())
      expect(await screen.findByText('CV je sačuvan.')).toBeInTheDocument()
    })

    it('does not show an address while the CV is not public', async () => {
      await open({ ...savedCv, showPublic: false })
      expect(screen.queryByText(/Javna adresa/)).not.toBeInTheDocument()
    })
  })

  describe('a failed save', () => {
    it('explains a refusal of the server in Serbian and keeps what was typed', async () => {
      const { api } = await open()
      await userEvent.type(about(), 'Tekst')
      api.failNext('saveMyCv', new AdminError('PT409', 'write the about text'))
      await userEvent.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Upišite tekst „O meni“ da bi CV mogao da bude vidljiv.',
      )
      expect(about()).toHaveValue('Tekst')
      expect(save()).toBeEnabled()
    })

    it('says when there is no connection', async () => {
      const { api } = await open()
      await userEvent.type(about(), 'Tekst')
      api.failNext('saveMyCv', new AdminError('network', 'offline'))
      await userEvent.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    })

    it('does not send the same save twice on a double click', async () => {
      const { api } = await open()
      await userEvent.type(about(), 'Tekst')
      const release = api.hold('saveMyCv')
      await userEvent.dblClick(save())
      release()
      await screen.findByText('CV je sačuvan.')
      expect(api.calls.saveMyCv).toHaveBeenCalledTimes(1)
    })
  })

  describe('the photo', () => {
    const file = () => new File(['x'], 'ja.png', { type: 'image/png' })
    const chooser = () => screen.getByLabelText('Izaberi fotografiju') as HTMLInputElement

    it('is shrunk and uploaded as soon as it is chosen', async () => {
      const { api } = await open()
      const original = file()
      await userEvent.upload(chooser(), original)
      expect(await screen.findByText('Fotografija je sačuvana.')).toBeInTheDocument()
      expect(shrinkImage).toHaveBeenCalledWith(original)
      expect(api.calls.setCvPhoto).toHaveBeenCalledWith(OWN_PROFILE, expect.any(Blob))
      expect(api.state.cv?.photoPath).toMatch(/^p-teacher\/photo-/)
    })

    it('does not forget what was typed when the photo changes', async () => {
      await open()
      await userEvent.type(about(), 'Nesačuvan tekst')
      await userEvent.upload(chooser(), file())
      await screen.findByText('Fotografija je sačuvana.')
      expect(about()).toHaveValue('Nesačuvan tekst')
    })

    it('can be replaced and removed', async () => {
      const { api } = await open(savedCv)
      expect(screen.getByText('Zameni fotografiju')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ukloni fotografiju' }))
      expect(await screen.findByText('Fotografija je uklonjena.')).toBeInTheDocument()
      expect(api.calls.setCvPhoto).toHaveBeenCalledWith(OWN_PROFILE, null)
      expect(api.state.cv?.photoPath).toBeNull()
      expect(screen.queryByRole('button', { name: 'Ukloni fotografiju' })).not.toBeInTheDocument()
    })

    it('explains a picture that cannot be used', async () => {
      const { api } = await open()
      vi.mocked(shrinkImage).mockRejectedValue(new AdminError('photoType'))
      await userEvent.upload(chooser(), file())
      expect(await screen.findByRole('alert')).toHaveTextContent('JPEG, PNG ili WebP')
      expect(api.calls.setCvPhoto).not.toHaveBeenCalled()
    })

    it('explains a failed upload', async () => {
      const { api } = await open()
      api.failNext('setCvPhoto', new AdminError('network', 'offline'))
      await userEvent.upload(chooser(), file())
      expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    })
  })

  describe('the preview', () => {
    it('shows the CV as readers will see it, from what is typed now', async () => {
      await open(savedCv)
      await userEvent.click(screen.getByText('Pregled'))
      const preview = within(screen.getByRole('article'))
      expect(preview.getByRole('heading', { name: 'Tara Osoba' })).toBeInTheDocument()
      expect(preview.getByText('Predajem matematiku.')).toBeInTheDocument()
      await userEvent.type(about(), ' Novo.')
      expect(preview.getByText('Predajem matematiku. Novo.')).toBeInTheDocument()
      expect(preview.getByText('Zadaci za prijemni')).toBeInTheDocument()
    })
  })
})
