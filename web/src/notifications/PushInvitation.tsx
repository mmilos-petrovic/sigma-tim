import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import { InstallSteps } from './NotificationSettings'
import { usePushDevice } from './PushDevice'
import { readPromptState, writePromptState, type PromptState } from './promptState'

/**
 * Notifications are on by default, but a browser only allows them after a tap. So the first time somebody is signed in on
 * a device they get one window asking for it; "Ne sada" leaves a banner on the page; closing the banner leaves only the
 * settings. Nothing is shown once it is on, when the browser has it blocked or in a build without push.
 */
export function PushInvitation({ profileId }: { profileId: string }) {
  const device = usePushDevice()
  const [state, setState] = useState<PromptState>(() => readPromptState(profileId))
  const [howTo, setHowTo] = useState(false)

  if (!device || (device.status !== 'off' && device.status !== 'needs-install')) return null

  const move = (next: Exclude<PromptState, null>) => {
    writePromptState(profileId, next)
    setState(next)
  }
  const needsInstall = device.status === 'needs-install'

  const turnOn = async () => {
    await device.enable()
    // a refusal in the browser's own window must not bring the invitation back
    move('asked')
  }

  if (state === null) {
    return (
      <Dialog
        title={needsInstall ? 'Dodajte aplikaciju na početni ekran' : 'Uključite obaveštenja'}
        onClose={() => move('asked')}
      >
        {needsInstall ? (
          <InstallSteps />
        ) : (
          <p>
            Javićemo vam kada se čas zakaže, pomeri ili otkaže, i podsetićemo vas pre časa.
            Obaveštenja stižu na ovaj uređaj.
          </p>
        )}
        {device.failed && (
          <p role="alert" className="form-error">
            Nije uspelo. Proverite internet vezu i pokušajte ponovo.
          </p>
        )}
        <div className="actions actions--end">
          <button type="button" className="button button--secondary" onClick={() => move('asked')}>
            {needsInstall ? 'U redu' : 'Ne sada'}
          </button>
          {!needsInstall && (
            <button
              type="button"
              className="button"
              disabled={device.busy}
              onClick={() => void turnOn()}
            >
              Uključi obaveštenja
            </button>
          )}
        </div>
      </Dialog>
    )
  }

  if (state === 'dismissed') return null

  return (
    <>
      <aside className="push-banner" aria-label="Obaveštenja">
        <span>
          {needsInstall
            ? 'Da biste dobijali obaveštenja, dodajte aplikaciju na početni ekran.'
            : 'Obaveštenja su isključena na ovom uređaju.'}
        </span>
        <span className="push-banner__actions">
          <button
            type="button"
            className="button button--small"
            disabled={device.busy}
            onClick={() => (needsInstall ? setHowTo(true) : void device.enable())}
          >
            {needsInstall ? 'Kako' : 'Uključi'}
          </button>
          <button
            type="button"
            className="button button--small button--secondary"
            aria-label="Zatvori obaveštenje o obaveštenjima"
            onClick={() => move('dismissed')}
          >
            Zatvori
          </button>
        </span>
      </aside>
      {howTo && (
        <Dialog title="Dodajte aplikaciju na početni ekran" onClose={() => setHowTo(false)}>
          <InstallSteps />
          <div className="actions actions--end">
            <button type="button" className="button" onClick={() => setHowTo(false)}>
              U redu
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}
