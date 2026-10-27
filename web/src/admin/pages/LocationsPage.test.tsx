import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeAdminApi } from '../../test/fakeAdminApi'
import { inDialog, page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'
import { shrinkImage } from '../image'

vi.mock('../image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image')>()),
  shrinkImage: vi.fn(),
}))

const location = (name: string) => screen.findByRole('article', { name })
const open = async (api = createFakeAdminApi()) => {
  const view = renderAdmin('/administracija/lokacije', { api })
  await page('Lokacije')
  await location('Glavna lokacija')
  return view
}

beforeEach(() => {
  vi.mocked(shrinkImage).mockReset()
  vi.mocked(shrinkImage).mockResolvedValue(new Blob(['shrunk'], { type: 'image/jpeg' }))
})

describe('locations list', () => {
  it('shows each location with its address, rooms and photos', async () => {
    await open()
    const main = within(await location('Glavna lokacija'))
    expect(main.getByText('Ulica 1, Beograd')).toBeInTheDocument()
    expect(main.getByText('Učionica 1')).toBeInTheDocument()
    expect(main.getByText('Učionica 2')).toBeInTheDocument()
    const photo = await main.findByRole('img', { name: 'Fotografija 1: Glavna lokacija' })
    expect(photo).toHaveAttribute('src', 'https://signed.example.test/l-main/a.jpg')

    const second = within(await location('Zemun'))
    expect(second.getByText('Još nema učionica.')).toBeInTheDocument()
    expect(second.getByText('Još nema fotografija.')).toBeInTheDocument()
  })

  it('invites the admin to add the first location', async () => {
    renderAdmin('/administracija/lokacije', { api: createFakeAdminApi({ locations: [] }) })
    expect(await screen.findByText('Još nema lokacija. Dodajte prvu.')).toBeInTheDocument()
  })

  it('explains a failure and offers a retry', async () => {
    const api = createFakeAdminApi()
    api.failNext('listLocations', new AdminError('network'))
    renderAdmin('/administracija/lokacije', { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await location('Glavna lokacija')).toBeInTheDocument()
  })
})

describe('locations', () => {
  it('adds a location', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj lokaciju' }))
    const dialog = await inDialog('Nova lokacija')
    await userEvent.type(dialog.getByLabelText('Naziv'), ' Novi Beograd ')
    await userEvent.type(dialog.getByLabelText('Adresa'), 'Bulevar 5')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))

    expect(adminApi.addLocation).toHaveBeenCalledWith({
      name: 'Novi Beograd',
      address: 'Bulevar 5',
    })
    expect(await location('Novi Beograd')).toBeInTheDocument()
  })

  it('needs a name and an address', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj lokaciju' }))
    const dialog = await inDialog('Nova lokacija')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText('Unesite naziv i adresu lokacije.')).toBeInTheDocument()
    expect(adminApi.addLocation).not.toHaveBeenCalled()
  })

  it('explains a duplicate name', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj lokaciju' }))
    const dialog = await inDialog('Nova lokacija')
    await userEvent.type(dialog.getByLabelText('Naziv'), 'zemun')
    await userEvent.type(dialog.getByLabelText('Adresa'), 'x')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Lokacija sa tim nazivom već postoji.',
    )
  })

  it('edits a location', async () => {
    const { adminApi } = await open()
    await userEvent.click(within(await location('Zemun')).getByRole('button', { name: 'Izmeni' }))
    const dialog = await inDialog('Izmena lokacije')
    expect(dialog.getByLabelText('Naziv')).toHaveValue('Zemun')
    await userEvent.clear(dialog.getByLabelText('Adresa'))
    await userEvent.type(dialog.getByLabelText('Adresa'), 'Nova ulica 3')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(adminApi.updateLocation).toHaveBeenCalledWith('l-second', {
      name: 'Zemun',
      address: 'Nova ulica 3',
    })
    expect(await within(await location('Zemun')).findByText('Nova ulica 3')).toBeInTheDocument()
  })

  it('deletes an empty location after confirmation', async () => {
    const { adminApi } = await open()
    await userEvent.click(within(await location('Zemun')).getByRole('button', { name: 'Obriši' }))
    const dialog = await inDialog('Brisanje lokacije')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši' }))

    expect(adminApi.deleteLocation).toHaveBeenCalledWith('l-second')
    await location('Glavna lokacija')
    expect(screen.queryByRole('article', { name: 'Zemun' })).not.toBeInTheDocument()
  })

  it('says a location with rooms must be emptied first', async () => {
    await open()
    await userEvent.click(
      within(await location('Glavna lokacija')).getByRole('button', { name: 'Obriši' }),
    )
    const dialog = await inDialog('Brisanje lokacije')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Lokacija ima učionice ili časove i ne može da se obriše. Prvo obrišite učionice.',
    )
  })
})

describe('rooms', () => {
  it('adds a room to the right location', async () => {
    const { adminApi } = await open()
    const zemun = within(await location('Zemun'))
    await userEvent.type(zemun.getByLabelText('Nova učionica'), ' Učionica 7 ')
    await userEvent.click(zemun.getByRole('button', { name: 'Dodaj učionicu' }))

    expect(adminApi.addRoom).toHaveBeenCalledWith('l-second', 'Učionica 7')
    expect(await within(await location('Zemun')).findByText('Učionica 7')).toBeInTheDocument()
  })

  it('explains a duplicate room name', async () => {
    await open()
    const main = within(await location('Glavna lokacija'))
    await userEvent.type(main.getByLabelText('Nova učionica'), 'učionica 1')
    await userEvent.click(main.getByRole('button', { name: 'Dodaj učionicu' }))
    expect(await main.findByRole('alert')).toHaveTextContent(
      'Učionica sa tim nazivom već postoji na ovoj lokaciji.',
    )
  })

  it('renames a room', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await location('Glavna lokacija')).getByRole('button', {
        name: 'Preimenuj učionicu Učionica 2',
      }),
    )
    const dialog = await inDialog('Preimenovanje učionice')
    await userEvent.clear(dialog.getByLabelText('Naziv'))
    await userEvent.type(dialog.getByLabelText('Naziv'), 'Velika sala')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(adminApi.renameRoom).toHaveBeenCalledWith('r-2', 'Velika sala')
    expect(
      await within(await location('Glavna lokacija')).findByText('Velika sala'),
    ).toBeInTheDocument()
  })

  it('deletes a room after confirmation', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await location('Glavna lokacija')).getByRole('button', {
        name: 'Obriši učionicu Učionica 1',
      }),
    )
    await userEvent.click(
      (await inDialog('Brisanje učionice')).getByRole('button', { name: 'Obriši' }),
    )

    expect(adminApi.deleteRoom).toHaveBeenCalledWith('r-1')
    await location('Glavna lokacija')
    expect(
      within(await location('Glavna lokacija')).queryByText('Učionica 1'),
    ).not.toBeInTheDocument()
  })
})

describe('photos', () => {
  const picture = (type = 'image/jpeg') => new File(['x'], 'zgrada.jpg', { type })

  it('shrinks the picture and uploads the result to the chosen location', async () => {
    const { adminApi } = await open()
    const zemun = within(await location('Zemun'))
    const input = zemun.getByLabelText('Dodaj fotografiju')
    const original = picture()
    await userEvent.upload(input, original)

    expect(shrinkImage).toHaveBeenCalledWith(original)
    expect(adminApi.addPhoto).toHaveBeenCalledOnce()
    const [locationId, blob] = adminApi.calls.addPhoto.mock.calls[0]
    expect(locationId).toBe('l-second')
    expect(await (blob as Blob).text()).toBe('shrunk')
    expect(
      await within(await location('Zemun')).findByRole('img', { name: 'Fotografija 1: Zemun' }),
    ).toBeInTheDocument()
  })

  it('explains a picture that cannot be used, without uploading', async () => {
    vi.mocked(shrinkImage).mockRejectedValue(new AdminError('photoType'))
    const { adminApi } = await open()
    const zemun = within(await location('Zemun'))
    await userEvent.upload(zemun.getByLabelText('Dodaj fotografiju'), picture('image/gif'), {
      applyAccept: false,
    })

    expect(await zemun.findByRole('alert')).toHaveTextContent(
      'Fotografija mora biti JPEG, PNG ili WebP.',
    )
    expect(adminApi.addPhoto).not.toHaveBeenCalled()
  })

  it('explains a failed upload', async () => {
    const api = createFakeAdminApi()
    api.failNext('addPhoto', new AdminError('network'))
    await open(api)
    const zemun = within(await location('Zemun'))
    await userEvent.upload(zemun.getByLabelText('Dodaj fotografiju'), picture())
    expect(await zemun.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
  })

  it('stops at three photos', async () => {
    const api = createFakeAdminApi()
    api.state.locations[1].photos = [1, 2, 3].map((n) => ({
      id: `ph-z${n}`,
      path: `l-second/${n}.jpg`,
      position: n,
    }))
    await open(api)
    const zemun = within(await location('Zemun'))
    expect(zemun.getByLabelText('Dodaj fotografiju')).toBeDisabled()
    expect(zemun.getByText('Najviše 3 fotografije.')).toBeInTheDocument()
  })

  it('removes a photo after confirmation', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await location('Glavna lokacija')).getByRole('button', {
        name: 'Obriši fotografiju 1',
      }),
    )
    await userEvent.click(
      (await inDialog('Brisanje fotografije')).getByRole('button', { name: 'Obriši' }),
    )

    expect(adminApi.removePhoto).toHaveBeenCalledWith({
      id: 'ph-1',
      path: 'l-main/a.jpg',
      position: 1,
    })
    expect(
      await within(await location('Glavna lokacija')).findByText('Još nema fotografija.'),
    ).toBeInTheDocument()
  })
})
