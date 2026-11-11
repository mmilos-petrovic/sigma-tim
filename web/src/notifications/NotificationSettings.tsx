import { Dialog } from '../components/Dialog'
import { BellIcon } from '../components/icons'
import { Loading } from '../components/Loaded'
import { usePushDevice } from './PushDevice'

/** What an iPhone or iPad needs before it can show notifications at all. */
export function InstallSteps() {
  return (
    <>
      <p>Na iPhone-u i iPad-u obaveštenja rade samo kada je aplikacija dodata na početni ekran.</p>
      <ol className="steps">
        <li>Otvorite ovu stranicu u pregledaču Safari.</li>
        <li>Dodirnite dugme „Podeli“ (kvadrat sa strelicom nagore).</li>
        <li>Izaberite „Dodaj na početni ekran“.</li>
        <li>Otvorite Sigma Tim sa početnog ekrana i tamo uključite obaveštenja.</li>
      </ol>
    </>
  )
}

/** The device's switch for notifications, with the reason whenever it cannot be used. */
export function NotificationSettings() {
  const device = usePushDevice()
  if (!device || device.status === 'unconfigured') return null
  if (device.status === null) return <Loading />

  const { status, busy, failed } = device
  return (
    <div className="notification-settings">
      {status === 'on' && (
        <>
          <p>Obaveštenja su uključena na ovom uređaju.</p>
          <p className="muted">
            Stižu kada se čas zakaže, pomeri ili otkaže, kada se rezervacija potvrdi i kao podsetnik
            pre časa.
          </p>
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => void device.disable()}
          >
            Isključi obaveštenja
          </button>
        </>
      )}
      {status === 'off' && (
        <>
          <p>Obaveštenja su isključena na ovom uređaju.</p>
          <p className="muted">Dok su isključena, neka obaveštenja stižu na email.</p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void device.enable()}
          >
            Uključi obaveštenja
          </button>
        </>
      )}
      {status === 'blocked' && (
        <p>
          Obaveštenja su blokirana u pregledaču. Dozvolite ih u podešavanjima sajta u pregledaču, pa
          osvežite stranicu.
        </p>
      )}
      {status === 'unsupported' && <p>Ovaj pregledač ne podržava obaveštenja.</p>}
      {status === 'needs-install' && <InstallSteps />}
      {failed && (
        <p role="alert" className="form-error">
          Nije uspelo. Proverite internet vezu i pokušajte ponovo.
        </p>
      )}
    </div>
  )
}

/** The button in the header that opens the settings: the word, or only a bell. Hidden in a build without push. */
export function NotificationsButton({
  onOpen,
  iconOnly = false,
}: {
  onOpen: () => void
  iconOnly?: boolean
}) {
  const device = usePushDevice()
  if (!device || device.status === 'unconfigured') return null
  return (
    <button
      type="button"
      className={iconOnly ? 'button button--secondary button--icon' : 'button button--secondary'}
      aria-label={iconOnly ? 'Obaveštenja' : undefined}
      title={iconOnly ? 'Obaveštenja' : undefined}
      onClick={onOpen}
    >
      {iconOnly ? <BellIcon /> : 'Obaveštenja'}
    </button>
  )
}

export function NotificationsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Obaveštenja" onClose={onClose}>
      <NotificationSettings />
      <div className="actions actions--end">
        <button type="button" className="button button--secondary" onClick={onClose}>
          Zatvori
        </button>
      </div>
    </Dialog>
  )
}
