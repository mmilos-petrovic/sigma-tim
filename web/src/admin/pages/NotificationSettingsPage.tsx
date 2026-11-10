import { useState } from 'react'
import { TimeField } from '../../components/DateTimeFields'
import { Loaded, LoadError, Loading, Notice, PageHeader } from '../../components/Loaded'
import { formatDay, formatTime } from '../../teacher/format'
import { useAdminApi } from '../AdminApiProvider'
import {
  NOTIFICATION_STATES,
  type NotificationKindRow,
  type NotificationLogRow,
  type NotificationSettingsAndKinds,
  type NotificationState,
} from '../adminApi'
import { explainError } from '../errors'
import { CHANNEL_LABEL, kindLabel, STATE_LABEL } from '../notificationLabels'
import { useNotificationLog, useNotificationSettings, useRefresh } from '../queries'

const MIN_REMINDER = 5
const MAX_REMINDER = 720

const when = (iso: string) => `${formatDay(iso)} ${formatTime(iso)}`

/** Quiet hours, the reminder, and the texts of the welcome email. */
function SettingsForm({ settings }: { settings: NotificationSettingsAndKinds }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [quietOn, setQuietOn] = useState(settings.quietHoursEnabled)
  const [quietStart, setQuietStart] = useState(settings.quietStart)
  const [quietEnd, setQuietEnd] = useState(settings.quietEnd)
  const [reminderOn, setReminderOn] = useState(settings.reminderEnabled)
  const [minutes, setMinutes] = useState(String(settings.reminderMinutes))
  const [welcome, setWelcome] = useState(settings.welcomeText)
  const [contact, setContact] = useState(settings.schoolContact)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reminderMinutes = Number(minutes)
  const problem = (): string | null => {
    if (quietStart === quietEnd) return 'Tihi sati ne mogu da počnu i završe se u isto vreme.'
    if (
      minutes.trim() === '' ||
      !Number.isInteger(reminderMinutes) ||
      reminderMinutes < MIN_REMINDER ||
      reminderMinutes > MAX_REMINDER
    ) {
      return `Vreme podsetnika mora biti između ${MIN_REMINDER} i ${MAX_REMINDER} minuta.`
    }
    return null
  }

  const save = async () => {
    setNotice(null)
    const found = problem()
    if (found) {
      setError(found)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await api.saveNotificationSettings({
        quietHoursEnabled: quietOn,
        quietStart,
        quietEnd,
        reminderEnabled: reminderOn,
        reminderMinutes,
        welcomeText: welcome,
        schoolContact: contact,
      })
      await refresh()
      setNotice('Podešavanja su sačuvana.')
    } catch (failure) {
      setError(explainError(failure, 'saveNotificationSettings'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="panel"
      aria-label="Tihi sati i podsetnici"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h2>Tihi sati i podsetnici</h2>
      <Notice message={notice} />

      <fieldset className="choice">
        <legend>Tihi sati</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={quietOn}
            onChange={(event) => setQuietOn(event.target.checked)}
          />
          Ne šalji obaveštenja u tihim satima
        </label>
        <div className="inline-form">
          <TimeField label="Od" value={quietStart} onChange={setQuietStart} disabled={!quietOn} />
          <TimeField label="Do" value={quietEnd} onChange={setQuietEnd} disabled={!quietOn} />
        </div>
        <p className="muted">
          Obaveštenja koja nastanu u tihim satima čekaju do njihovog kraja. Podsetnici pre časa i
          dobrodošlica se šalju uvek. Vreme je po beogradskom satu.
        </p>
      </fieldset>

      <fieldset className="choice">
        <legend>Podsetnik pre časa</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={reminderOn}
            onChange={(event) => setReminderOn(event.target.checked)}
          />
          Šalji podsetnik pre časa
        </label>
        <label className="field">
          <span>Koliko minuta pre početka časa</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_REMINDER}
            max={MAX_REMINDER}
            value={minutes}
            disabled={!reminderOn}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <p className="muted">
          Podsetnik dobijaju učenici, roditelji i nastavnik. Čas koji je zakazan ili potvrđen
          kasnije od toga nema podsetnik.
        </p>
      </fieldset>

      <fieldset className="choice">
        <legend>Email dobrodošlice</legend>
        <label className="field">
          <span>Tekst dobrodošlice</span>
          <textarea
            rows={4}
            maxLength={1000}
            value={welcome}
            onChange={(event) => setWelcome(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Kontakt podaci škole</span>
          <textarea
            rows={3}
            maxLength={500}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
          />
        </label>
        <p className="muted">
          Tekst se dodaje u email dobrodošlice koji dobija svako ko se doda u sistem. Ostavite
          prazno za podrazumevani tekst.
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          Sačuvaj podešavanja
        </button>
      </div>
    </form>
  )
}

/** Which kinds of notice are emailed when the person has no push on their device. Each switch saves at once. */
function EmailSwitches({ kinds }: { kinds: NotificationKindRow[] }) {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (kind: string, enabled: boolean) => {
    setError(null)
    setBusy(true)
    try {
      await api.setEmailFallback(kind, enabled)
      await refresh()
    } catch (failure) {
      setError(explainError(failure, 'setEmailFallback'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-label="Email umesto obaveštenja">
      <h2>Email umesto obaveštenja</h2>
      <p className="muted">
        Kada primalac nema uključena obaveštenja na uređaju, šaljemo email za vrste koje su
        označene. Dnevno ograničenje emailova je 300; ostalo čeka sledeći dan.
      </p>
      <div className="stack">
        {[...kinds]
          .sort((a, b) => kindLabel(a.kind).localeCompare(kindLabel(b.kind), 'sr'))
          .map((row) => (
            <label key={row.kind} className="check">
              <input
                type="checkbox"
                checked={row.alwaysEmail || row.emailFallback}
                disabled={busy || row.alwaysEmail}
                onChange={(event) => void toggle(row.kind, event.target.checked)}
              />
              <span>
                {kindLabel(row.kind)}
                {row.alwaysEmail && (
                  <>
                    {' '}
                    <span className="muted">(uvek se šalje emailom)</span>
                  </>
                )}
              </span>
            </label>
          ))}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  )
}

function TestNotice() {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setNotice(null)
    setError(null)
    setBusy(true)
    try {
      await api.sendTestNotification()
      await refresh()
      setNotice(
        'Probno obaveštenje je u redu za slanje. Stiže vama, a dnevnik ispod pokazuje kako je prošlo.',
      )
    } catch (failure) {
      setError(explainError(failure, 'sendTestNotification'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-label="Probno obaveštenje">
      <h2>Probno obaveštenje</h2>
      <p className="muted">Šalje obaveštenje samo vama, da proverite da li stižu i push i email.</p>
      <Notice message={notice} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button type="button" className="button" disabled={busy} onClick={() => void send()}>
        Pošalji probno obaveštenje
      </button>
    </section>
  )
}

function stateText(row: NotificationLogRow): string {
  if (row.state === 'waiting') return `${STATE_LABEL.waiting} (do ${when(row.deliverAfter)})`
  if (row.state === 'sent' && row.channel)
    return `${STATE_LABEL.sent} · ${CHANNEL_LABEL[row.channel]}`
  return STATE_LABEL[row.state]
}

/** What was queued, to whom and how it went. Failed notices can be sent again. */
function Log() {
  const api = useAdminApi()
  const refresh = useRefresh()
  const [state, setState] = useState<NotificationState | null>(null)
  const log = useNotificationLog(state)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resend = async (row: NotificationLogRow) => {
    setNotice(null)
    setError(null)
    try {
      await api.resendNotification(row.id)
      await refresh()
      setNotice('Obaveštenje je ponovo u redu za slanje.')
    } catch (failure) {
      setError(explainError(failure, 'resendNotification'))
    }
  }

  const rows = log.data?.pages.flat() ?? []
  return (
    <section className="panel" aria-label="Dnevnik obaveštenja">
      <h2>Dnevnik obaveštenja</h2>
      <p className="muted">
        Prikazuje ko je dobio obaveštenje i kako je prošlo, ne i sam tekst obaveštenja.
      </p>
      <label className="field">
        <span>Stanje</span>
        <select
          value={state ?? ''}
          onChange={(event) => setState((event.target.value || null) as NotificationState | null)}
        >
          <option value="">Sva stanja</option>
          {NOTIFICATION_STATES.map((value) => (
            <option key={value} value={value}>
              {STATE_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <Notice message={notice} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      {log.isPending ? (
        <Loading />
      ) : log.isError ? (
        <LoadError error={log.error} onRetry={() => void log.refetch()} />
      ) : rows.length === 0 ? (
        <p className="empty-note">Nema obaveštenja.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Nastalo</th>
                  <th>Vrsta</th>
                  <th>Primalac</th>
                  <th>Stanje</th>
                  <th>Greška</th>
                  <th>
                    <span className="visually-hidden">Radnje</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{when(row.createdAt)}</td>
                    <td>{kindLabel(row.kind)}</td>
                    <td>
                      {row.recipientName}
                      <br />
                      <span className="muted">{row.recipientEmail}</span>
                    </td>
                    <td>{stateText(row)}</td>
                    <td>{row.lastError ?? ''}</td>
                    <td className="table__actions">
                      {row.state === 'failed' && (
                        <button
                          type="button"
                          className="button button--small"
                          aria-label={`Pošalji ponovo: ${kindLabel(row.kind)}, ${row.recipientName}`}
                          onClick={() => void resend(row)}
                        >
                          Pošalji ponovo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {log.hasNextPage && (
            <div className="actions">
              <button
                type="button"
                className="button button--secondary"
                disabled={log.isFetchingNextPage}
                onClick={() => void log.fetchNextPage()}
              >
                Prikaži starija
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Administrator: when notices may go out, what is emailed instead of pushed, and how sending is going. */
export function NotificationSettingsPage() {
  const settings = useNotificationSettings()
  return (
    <>
      <PageHeader title="Podešavanja" />
      <Loaded query={settings}>
        {(loaded) => (
          <div className="stack">
            <SettingsForm settings={loaded} />
            <EmailSwitches kinds={loaded.kinds} />
            <TestNotice />
            <Log />
          </div>
        )}
      </Loaded>
    </>
  )
}
