import { useState } from 'react'
import { Field, FormDialog, SelectField } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { PhoneLink } from '../../components/PhoneLink'
import { useEnrolmentApi } from '../../enrolment/EnrolmentApiProvider'
import {
  SETTINGS_LIMITS,
  type AdminEnrolmentRow,
  type AdminState,
  type EnrolmentSettings,
} from '../../enrolment/enrolmentApi'
import {
  useAllEnrolments,
  useEnrolmentSettings,
  useRefreshEnrolment,
} from '../../enrolment/queries'
import { formatGrade } from '../../lib/grade'
import { useTeachers } from '../queries'
import { explainError } from '../errors'
import { STATE_LABEL } from '../enrolmentLabels'

type FilterKey = 'active' | 'all' | AdminState

const ACTIVE: AdminState[] = ['needs_approval', 'incomplete', 'open', 'choice_open', 'chosen']

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'active', label: 'Aktivne' },
  { key: 'needs_approval', label: STATE_LABEL.needs_approval },
  { key: 'incomplete', label: STATE_LABEL.incomplete },
  { key: 'open', label: STATE_LABEL.open },
  { key: 'choice_open', label: STATE_LABEL.choice_open },
  { key: 'chosen', label: STATE_LABEL.chosen },
  { key: 'assigned', label: STATE_LABEL.assigned },
  { key: 'rejected', label: STATE_LABEL.rejected },
  { key: 'all', label: 'Sve' },
]

const SOURCE_NOTE: Record<AdminEnrolmentRow['source'], string | null> = {
  signup: null,
  teacher: 'dodao nastavnik',
  legacy: 'ostao bez nastavnika',
}

const nameOf = (row: AdminEnrolmentRow) =>
  row.firstName && row.lastName ? `${row.firstName} ${row.lastName}` : row.email

const times = (count: number) => (count === 1 ? '1 put' : `${count} puta`)

/** The switch of the front page and the three numbers that set the pace of the choice. */
function SettingsPanel() {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const settings = useEnrolmentSettings()
  return (
    <Loaded query={settings}>
      {(saved) => <SettingsForm saved={saved} api={api} refresh={refresh} />}
    </Loaded>
  )
}

function SettingsForm({
  saved,
  api,
  refresh,
}: {
  saved: EnrolmentSettings
  api: ReturnType<typeof useEnrolmentApi>
  refresh: () => Promise<unknown>
}) {
  const [enabled, setEnabled] = useState(saved.formEnabled)
  const [cap, setCap] = useState(String(saved.dailyCap))
  const [days, setDays] = useState(String(saved.choiceAfterDays))
  const [offers, setOffers] = useState(String(saved.choiceAfterOffers))
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const inRange = (value: string, limits: { min: number; max: number }) => {
    const number = Number(value)
    return Number.isInteger(number) && number >= limits.min && number <= limits.max ? number : null
  }

  const save = async () => {
    if (busy) return
    const dailyCap = inRange(cap, SETTINGS_LIMITS.dailyCap)
    const choiceAfterDays = inRange(days, SETTINGS_LIMITS.choiceAfterDays)
    const choiceAfterOffers = inRange(offers, SETTINGS_LIMITS.choiceAfterOffers)
    setNotice(null)
    if (dailyCap === null || choiceAfterDays === null || choiceAfterOffers === null) {
      setError('Brojevi moraju biti celi i u dozvoljenim granicama.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.saveSettings({ formEnabled: enabled, dailyCap, choiceAfterDays, choiceAfterOffers })
      await refresh()
      setNotice('Podešavanja su sačuvana.')
    } catch (failure) {
      setError(explainError(failure, 'saveEnrolmentSettings'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="panel enrolment-settings"
      aria-label="Podešavanja prijave"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      noValidate
    >
      <h2>Podešavanja</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Prijava za časove je uključena na početnoj strani</span>
      </label>
      {!enabled && (
        <p className="muted">
          Dok je isključena, početna strana prikazuje samo broj telefona škole.
        </p>
      )}
      <Field
        label={`Prijava u jednom danu bez odobrenja (${SETTINGS_LIMITS.dailyCap.min} do ${SETTINGS_LIMITS.dailyCap.max})`}
        type="number"
        value={cap}
        onChange={setCap}
        maxLength={4}
      />
      <p className="muted">
        Posle toga nove prijave čekaju vaše odobrenje, a niko ne dobija poruku da su prijave
        zatvorene.
      </p>
      <Field
        label={`Izbor nastavnika se otvara posle (dana, ${SETTINGS_LIMITS.choiceAfterDays.min} do ${SETTINGS_LIMITS.choiceAfterDays.max})`}
        type="number"
        value={days}
        onChange={setDays}
        maxLength={2}
      />
      <Field
        label={`... ili čim stigne ponuda (${SETTINGS_LIMITS.choiceAfterOffers.min} do ${SETTINGS_LIMITS.choiceAfterOffers.max})`}
        type="number"
        value={offers}
        onChange={setOffers}
        maxLength={2}
      />
      <p className="muted">
        Posle isteka dana izbor se otvara samo ako je bar jedan nastavnik ponudio; ako niko nije,
        čekanje počinje ispočetka, a prijava se označava u spisku.
      </p>
      <Notice message={notice} />
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

function AssignDialog({
  row,
  onClose,
  onDone,
}: {
  row: AdminEnrolmentRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const teachers = useTeachers()
  const [teacherId, setTeacherId] = useState('')
  const [childEmail, setChildEmail] = useState('')
  const offered = new Set(row.offers.map((offer) => offer.teacherId))
  // a parent who signed up has no record for the child yet: the email of the child makes it
  const asksForChild = row.role === 'parent' && row.source === 'signup'
  const active = (teachers.data ?? [])
    .filter((teacher) => teacher.isActive && !teacher.erased)
    .sort(
      (a, b) =>
        Number(offered.has(b.id)) - Number(offered.has(a.id)) ||
        a.lastName.localeCompare(b.lastName, 'sr-Latn'),
    )

  return (
    <FormDialog
      title="Dodela nastavnika"
      action="assignEnrolment"
      submitLabel="Dodeli"
      onClose={onClose}
      validate={() => (teacherId ? null : 'Izaberite nastavnika.')}
      onSubmit={async () => {
        const result = await api.assign(
          row.requestId,
          teacherId,
          childEmail.trim().toLowerCase() || null,
        )
        await refresh()
        const teacher = active.find((t) => t.id === teacherId)
        const who = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Nastavnik'
        onDone(
          result === 'chosen'
            ? `${who} je dodeljen. Treba da upiše email adresu deteta.`
            : `${who} je dodeljen: ${nameOf(row)} je njegov učenik.`,
        )
      }}
    >
      <p>
        Nastavnik se dodeljuje odmah, i kada ne predaje taj predmet. Ostale ponude se zatvaraju.
        Nastavnik i učenik dobijaju obaveštenje.
      </p>
      <SelectField label="Nastavnik" value={teacherId} onChange={setTeacherId}>
        <option value="">Izaberi nastavnika</option>
        {active.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.firstName} {teacher.lastName}
            {offered.has(teacher.id) ? ' (ponudio)' : ''}
          </option>
        ))}
      </SelectField>
      {asksForChild && (
        <Field
          label="Email adresa deteta (nije obavezno)"
          type="email"
          value={childEmail}
          onChange={setChildEmail}
          maxLength={254}
        />
      )}
    </FormDialog>
  )
}

function EnrolmentCard({
  row,
  busy,
  onApprove,
  onReject,
  onAssign,
}: {
  row: AdminEnrolmentRow
  busy: boolean
  onApprove: () => void
  onReject: () => void
  onAssign: () => void
}) {
  const note = SOURCE_NOTE[row.source]
  const closed = row.state === 'assigned' || row.state === 'rejected'
  return (
    <article className="panel pool-card" aria-label={nameOf(row)}>
      <header className="pool-card__head">
        <h3>{nameOf(row)}</h3>
        <ul className="chips" aria-label="Stanje">
          <li>{STATE_LABEL[row.state]}</li>
        </ul>
        <p className="muted">
          {row.subjectName ?? 'Predmet nije izabran'} ·{' '}
          {row.role === 'parent' ? 'Roditelj' : 'Učenik'}
          {note && ` · ${note}`}
          {row.listedAt && ` · čeka ${row.daysWaiting} d`}
        </p>
      </header>
      {row.state === 'open' && row.restarts > 0 && (
        <p className="callout" role="note">
          Nijedan nastavnik se nije ponudio, pa je čekanje počelo ispočetka ({times(row.restarts)}).
          Možete odmah da dodelite nastavnika.
        </p>
      )}
      <dl className="details">
        {row.phone && (
          <div>
            <dt>Telefon</dt>
            <dd>
              <PhoneLink phone={row.phone} />
            </dd>
          </div>
        )}
        <div>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${row.email}`}>{row.email}</a>
          </dd>
        </div>
        {row.school && (
          <div>
            <dt>Škola</dt>
            <dd>
              {row.school}
              {row.grade && `, ${formatGrade(row.grade)}`}
            </dd>
          </div>
        )}
        {row.cityPart && (
          <div>
            <dt>Deo grada</dt>
            <dd>{row.cityPart}</dd>
          </div>
        )}
        {row.situation && (
          <div>
            <dt>Školska situacija</dt>
            <dd>{row.situation}</dd>
          </div>
        )}
        {!closed && (
          <div>
            <dt>Ponude</dt>
            <dd>
              {row.offers.length === 0
                ? 'Još nema'
                : row.offers.map((offer) => offer.name).join(', ')}
            </dd>
          </div>
        )}
      </dl>
      {!closed && (
        <div className="actions">
          {row.state === 'needs_approval' && (
            <button
              type="button"
              className="button button--small"
              aria-label={`Odobri: ${nameOf(row)}`}
              disabled={busy}
              onClick={onApprove}
            >
              Odobri
            </button>
          )}
          {row.state !== 'incomplete' && (
            <button
              type="button"
              className="button button--small button--secondary"
              aria-label={`Dodeli nastavnika: ${nameOf(row)}`}
              disabled={busy}
              onClick={onAssign}
            >
              Dodeli nastavnika
            </button>
          )}
          {row.source === 'signup' && (
            <button
              type="button"
              className="button button--small button--secondary"
              aria-label={`Odbij: ${nameOf(row)}`}
              disabled={busy}
              onClick={onReject}
            >
              Odbij
            </button>
          )}
        </div>
      )}
    </article>
  )
}

/**
 * The sign-ups for lessons: the switch and the pace of the choice, and every request with where it is. The administrator
 * approves the ones past the daily cap, turns one down, or assigns any teacher at any time.
 */
export function EnrolmentsPage() {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const all = useAllEnrolments()
  const [filter, setFilter] = useState<FilterKey>('active')
  const [assigning, setAssigning] = useState<AdminEnrolmentRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const act = async (
    row: AdminEnrolmentRow,
    run: () => Promise<void>,
    action: 'approveEnrolment' | 'rejectEnrolment',
    done: string,
  ) => {
    if (busyId) return
    setBusyId(row.requestId)
    setNotice(null)
    setError(null)
    try {
      await run()
      await refresh()
      setNotice(done)
    } catch (failure) {
      setError(explainError(failure, action))
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader title="Prijave za časove" />
      <SettingsPanel />
      <Notice message={notice} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <Loaded query={all}>
        {(rows) => {
          const count = (state: AdminState) => rows.filter((row) => row.state === state).length
          const shown = rows.filter((row) =>
            filter === 'all'
              ? true
              : filter === 'active'
                ? ACTIVE.includes(row.state)
                : row.state === filter,
          )
          return (
            <>
              <label className="field">
                <span>Prikaz</span>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as FilterKey)}
                >
                  {FILTERS.map((option) => {
                    const n =
                      option.key === 'active' || option.key === 'all' ? 0 : count(option.key)
                    return (
                      <option key={option.key} value={option.key}>
                        {option.label}
                        {n > 0 ? ` (${n})` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
              {shown.length === 0 ? (
                <p className="empty-note">Nema prijava u ovom prikazu.</p>
              ) : (
                <div className="stack">
                  {shown.map((row) => (
                    <EnrolmentCard
                      key={row.requestId}
                      row={row}
                      busy={busyId === row.requestId}
                      onApprove={() =>
                        void act(
                          row,
                          () => api.approve(row.requestId),
                          'approveEnrolment',
                          'Prijava je odobrena: nastavnici je sada vide.',
                        )
                      }
                      onReject={() =>
                        void act(
                          row,
                          () => api.reject(row.requestId),
                          'rejectEnrolment',
                          'Prijava je odbijena.',
                        )
                      }
                      onAssign={() => {
                        setNotice(null)
                        setAssigning(row)
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )
        }}
      </Loaded>

      {assigning && (
        <AssignDialog
          row={assigning}
          onClose={() => setAssigning(null)}
          onDone={(message) => {
            setAssigning(null)
            setNotice(message)
          }}
        />
      )}
    </>
  )
}
