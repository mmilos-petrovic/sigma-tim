import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Field, FormDialog } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { useAdminApi } from '../AdminApiProvider'
import { MAX_LOCATION_PHOTOS, type LocationRow, type Photo, type Room } from '../adminApi'
import { explainError } from '../errors'
import { PHOTO_ACCEPT, shrinkImage } from '../image'
import { duplicateMessage, hasName } from '../names'
import { useLocations, usePhotoUrls, useRefresh } from '../queries'

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit' | 'delete'; location: LocationRow }
  | { kind: 'renameRoom' | 'deleteRoom'; room: Room }
  | { kind: 'deletePhoto'; photo: Photo }
  | null

interface DialogProps {
  onClose: () => void
  onDone: (message: string) => void
}

function LocationDialog({
  location,
  others,
  onClose,
  onDone,
}: DialogProps & {
  location?: LocationRow
  /** The names of the other locations. */
  others: string[]
}) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [name, setName] = useState(location?.name ?? '')
  const [address, setAddress] = useState(location?.address ?? '')

  return (
    <FormDialog
      title={location ? 'Izmena lokacije' : 'Nova lokacija'}
      action={location ? 'updateLocation' : 'addLocation'}
      submitLabel={location ? 'Sačuvaj' : 'Dodaj'}
      onClose={onClose}
      validate={() => {
        if (!name.trim() || !address.trim()) return 'Unesite naziv i adresu lokacije.'
        return hasName(others, name)
          ? duplicateMessage(location ? 'updateLocation' : 'addLocation')
          : null
      }}
      onSubmit={async () => {
        const input = { name: name.trim(), address: address.trim() }
        if (location) await api.updateLocation(location.id, input)
        else await api.addLocation(input)
        await refresh()
        onDone(location ? 'Lokacija je sačuvana.' : 'Lokacija je dodata.')
      }}
    >
      <Field label="Naziv" value={name} onChange={setName} maxLength={100} />
      <Field
        label="Adresa"
        value={address}
        onChange={setAddress}
        maxLength={300}
        autoComplete="street-address"
      />
    </FormDialog>
  )
}

function DeleteLocationDialog({
  location,
  onClose,
  onDone,
}: DialogProps & { location: LocationRow }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  return (
    <FormDialog
      title="Brisanje lokacije"
      action="deleteLocation"
      submitLabel="Obriši"
      danger
      onClose={onClose}
      onSubmit={async () => {
        await api.deleteLocation(location.id)
        await refresh()
        onDone('Lokacija je obrisana.')
      }}
    >
      <p>
        Da li sigurno želite da obrišete lokaciju <strong>{location.name}</strong> i njene
        fotografije? Lokacija sa učionicama ili časovima ne može da se obriše.
      </p>
    </FormDialog>
  )
}

function RoomDialog({
  room,
  siblings,
  rename,
  onClose,
  onDone,
}: DialogProps & {
  room: Room
  /** The names of the other rooms of the same location. */
  siblings: string[]
  rename: boolean
}) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [name, setName] = useState(room.name)

  if (!rename) {
    return (
      <FormDialog
        title="Brisanje učionice"
        action="deleteRoom"
        submitLabel="Obriši"
        danger
        onClose={onClose}
        onSubmit={async () => {
          await api.deleteRoom(room.id)
          await refresh()
          onDone('Učionica je obrisana.')
        }}
      >
        <p>
          Da li sigurno želite da obrišete učionicu <strong>{room.name}</strong>?
        </p>
      </FormDialog>
    )
  }
  return (
    <FormDialog
      title="Preimenovanje učionice"
      action="renameRoom"
      submitLabel="Sačuvaj"
      onClose={onClose}
      validate={() => {
        if (!name.trim()) return 'Unesite naziv učionice.'
        return hasName(siblings, name) ? duplicateMessage('renameRoom') : null
      }}
      onSubmit={async () => {
        await api.renameRoom(room.id, name.trim())
        await refresh()
        onDone('Učionica je preimenovana.')
      }}
    >
      <Field label="Naziv" value={name} onChange={setName} maxLength={100} />
    </FormDialog>
  )
}

function DeletePhotoDialog({ photo, onClose, onDone }: DialogProps & { photo: Photo }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  return (
    <FormDialog
      title="Brisanje fotografije"
      action="removePhoto"
      submitLabel="Obriši"
      danger
      onClose={onClose}
      onSubmit={async () => {
        await api.removePhoto(photo)
        await refresh()
        onDone('Fotografija je obrisana.')
      }}
    >
      <p>Da li sigurno želite da obrišete fotografiju {photo.position}?</p>
    </FormDialog>
  )
}

function Photos({
  location,
  onDelete,
  onNotice,
}: {
  location: LocationRow
  onDelete: (photo: Photo) => void
  onNotice: (message: string) => void
}) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const urls = usePhotoUrls(location.photos.map((photo) => photo.path))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = location.photos.length >= MAX_LOCATION_PHOTOS

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await api.addPhoto(location.id, await shrinkImage(file))
      await refresh()
      onNotice('Fotografija je dodata.')
    } catch (failure) {
      setError(explainError(failure, 'addPhoto'))
    } finally {
      setBusy(false)
      // so that choosing the same file again works
      input.value = ''
    }
  }

  return (
    <section>
      <h3>Fotografije</h3>
      {location.photos.length === 0 ? (
        <p className="empty-note">Još nema fotografija.</p>
      ) : (
        <ul className="photos">
          {location.photos.map((photo) => {
            const url = urls.data?.[photo.path]
            return (
              <li key={photo.id}>
                {url ? (
                  <img
                    src={url}
                    alt={`Fotografija ${photo.position}: ${location.name}`}
                    loading="lazy"
                  />
                ) : (
                  <span className="photos__placeholder" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="button button--small button--secondary"
                  aria-label={`Obriši fotografiju ${photo.position}`}
                  onClick={() => onDelete(photo)}
                >
                  Obriši
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="actions">
        <label className={`button button--secondary${full || busy ? ' is-disabled' : ''}`}>
          Dodaj fotografiju
          <input
            type="file"
            accept={PHOTO_ACCEPT}
            className="visually-hidden"
            disabled={full || busy}
            onChange={(event) => void upload(event)}
          />
        </label>
        {full && <span className="muted">Najviše {MAX_LOCATION_PHOTOS} fotografije.</span>}
        {busy && (
          <span role="status" className="muted">
            Fotografija se otprema…
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  )
}

function Rooms({
  location,
  onRename,
  onDelete,
  onNotice,
}: {
  location: LocationRow
  onRename: (room: Room) => void
  onDelete: (room: Room) => void
  onNotice: (message: string) => void
}) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!name.trim()) {
      setError('Unesite naziv učionice.')
      return
    }
    if (
      hasName(
        location.rooms.map((existing) => existing.name),
        name,
      )
    ) {
      setError(duplicateMessage('addRoom'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.addRoom(location.id, name.trim())
      await refresh()
      setName('')
      onNotice('Učionica je dodata.')
    } catch (failure) {
      setError(explainError(failure, 'addRoom'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>Učionice</h3>
      {location.rooms.length === 0 ? (
        <p className="empty-note">Još nema učionica.</p>
      ) : (
        <ul className="rooms">
          {location.rooms.map((room) => (
            <li key={room.id}>
              <span>{room.name}</span>
              <span className="table__actions">
                <button
                  type="button"
                  className="button button--small button--secondary"
                  aria-label={`Preimenuj učionicu ${room.name}`}
                  onClick={() => onRename(room)}
                >
                  Preimenuj
                </button>
                <button
                  type="button"
                  className="button button--small button--secondary"
                  aria-label={`Obriši učionicu ${room.name}`}
                  onClick={() => onDelete(room)}
                >
                  Obriši
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={(event) => void add(event)} noValidate>
        <label className="field">
          <span>Nova učionica</span>
          <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit" className="button button--small" disabled={busy}>
          Dodaj učionicu
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  )
}

export function LocationsPage() {
  const locations = useLocations()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const done = (message: string) => {
    setDialog(null)
    setNotice(message)
  }
  const close = () => setDialog(null)
  const locationNames = (exceptId?: string) =>
    (locations.data ?? []).filter((l) => l.id !== exceptId).map((l) => l.name)
  const siblingNames = (room: Room) =>
    (locations.data ?? [])
      .find((l) => l.rooms.some((r) => r.id === room.id))
      ?.rooms.filter((r) => r.id !== room.id)
      .map((r) => r.name) ?? []
  const show = (next: Dialog) => {
    setNotice(null)
    setDialog(next)
  }

  return (
    <>
      <PageHeader title="Lokacije">
        <button type="button" className="button" onClick={() => show({ kind: 'add' })}>
          Dodaj lokaciju
        </button>
      </PageHeader>
      <Notice message={notice} />

      <Loaded query={locations}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="empty-note">Još nema lokacija. Dodajte prvu.</p>
          ) : (
            <div className="stack">
              {rows.map((location) => (
                <article key={location.id} className="panel" aria-label={location.name}>
                  <div className="panel__header">
                    <div>
                      <h2>{location.name}</h2>
                      <p className="muted">{location.address}</p>
                    </div>
                    <div className="table__actions">
                      <button
                        type="button"
                        className="button button--small button--secondary"
                        onClick={() => show({ kind: 'edit', location })}
                      >
                        Izmeni
                      </button>
                      <button
                        type="button"
                        className="button button--small button--secondary"
                        onClick={() => show({ kind: 'delete', location })}
                      >
                        Obriši
                      </button>
                    </div>
                  </div>
                  <Rooms
                    location={location}
                    onRename={(room) => show({ kind: 'renameRoom', room })}
                    onDelete={(room) => show({ kind: 'deleteRoom', room })}
                    onNotice={setNotice}
                  />
                  <Photos
                    location={location}
                    onDelete={(photo) => show({ kind: 'deletePhoto', photo })}
                    onNotice={setNotice}
                  />
                </article>
              ))}
            </div>
          )
        }
      </Loaded>

      {dialog?.kind === 'add' && (
        <LocationDialog others={locationNames()} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'edit' && (
        <LocationDialog
          location={dialog.location}
          others={locationNames(dialog.location.id)}
          onClose={close}
          onDone={done}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteLocationDialog location={dialog.location} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'renameRoom' && (
        <RoomDialog
          room={dialog.room}
          siblings={siblingNames(dialog.room)}
          rename
          onClose={close}
          onDone={done}
        />
      )}
      {dialog?.kind === 'deleteRoom' && (
        <RoomDialog room={dialog.room} siblings={[]} rename={false} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'deletePhoto' && (
        <DeletePhotoDialog photo={dialog.photo} onClose={close} onDone={done} />
      )}
    </>
  )
}
