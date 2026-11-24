import { useState } from 'react'
import { Link } from 'react-router'
import { explainError } from '../../admin/errors'
import { homePath } from '../../auth/roles'
import { Field, FormDialog } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { PhoneLink } from '../../components/PhoneLink'
import { useEnrolmentApi } from '../../enrolment/EnrolmentApiProvider'
import type { ChosenRow, PoolRow } from '../../enrolment/enrolmentApi'
import { useChosen, usePool, useRefreshEnrolment } from '../../enrolment/queries'
import { formatGrade } from '../../lib/grade'
import { useMyCv } from '../queries'
import { waitingText } from '../waiting'

const fullName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`

const SOURCE_NOTE: Record<PoolRow['source'], string | null> = {
  signup: null,
  teacher: 'Dodao nastavnik',
  legacy: 'Ostao bez nastavnika',
}

function CompleteDialog({
  row,
  onClose,
  onDone,
}: {
  row: ChosenRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const [email, setEmail] = useState('')
  return (
    <FormDialog
      title="Email adresa deteta"
      action="completeChosenEnrolment"
      submitLabel="Završi upis"
      onClose={onClose}
      validate={() => (email.trim() === '' ? 'Upišite email adresu deteta.' : null)}
      onSubmit={async () => {
        await api.completeChosen(row.requestId, email.trim().toLowerCase())
        await refresh()
        onDone(`${fullName(row)} je među vašim učenicima.`)
      }}
    >
      <p>
        Roditelj vas je izabrao za nastavnika deteta <strong>{fullName(row)}</strong>. Upišite email
        adresu (Google nalog) deteta. Mora da bude različita od roditeljeve.
      </p>
      <Field
        label="Email adresa deteta (Google nalog)"
        type="email"
        value={email}
        onChange={setEmail}
        maxLength={254}
      />
    </FormDialog>
  )
}

/** Parents who chose this teacher; the child is a student as soon as the teacher says the child's email. */
function ChosenSection({ onNotice }: { onNotice: (message: string) => void }) {
  const chosen = useChosen()
  const [completing, setCompleting] = useState<ChosenRow | null>(null)
  if (!chosen.data || chosen.data.length === 0) return null
  return (
    <section aria-labelledby="chosen-title">
      <h2 id="chosen-title" className="section-title">
        Čekaju email adresu deteta
      </h2>
      <p className="muted">
        Roditelji koji su vas izabrali. Upis se završava kada upišete email adresu deteta.
      </p>
      <ul className="requests">
        {chosen.data.map((row) => (
          <li key={row.requestId}>
            <span>
              <strong>{fullName(row)}</strong>
              {row.subjectName ? `, ${row.subjectName}` : ''}
              <span className="muted">
                {' '}
                · roditelj: <PhoneLink phone={row.phone} />, {row.email}
              </span>
            </span>
            <span className="table__actions">
              <button
                type="button"
                className="button button--small"
                aria-label={`Upiši email deteta: ${fullName(row)}`}
                onClick={() => setCompleting(row)}
              >
                Upiši email
              </button>
            </span>
          </li>
        ))}
      </ul>
      {completing && (
        <CompleteDialog
          row={completing}
          onClose={() => setCompleting(null)}
          onDone={(message) => {
            setCompleting(null)
            onNotice(message)
          }}
        />
      )}
    </section>
  )
}

function PoolCard({
  row,
  canOffer,
  busy,
  onOffer,
  onWithdraw,
}: {
  row: PoolRow
  canOffer: boolean
  busy: boolean
  onOffer: () => void
  onWithdraw: () => void
}) {
  const note = SOURCE_NOTE[row.source]
  return (
    <article className="panel pool-card" aria-label={fullName(row)}>
      <header className="pool-card__head">
        <h3>{fullName(row)}</h3>
        <p className="muted">
          {row.subjectName ?? 'Predmet nije izabran'} ·{' '}
          {row.role === 'parent' ? 'Roditelj' : 'Učenik'} · čeka {waitingText(row.daysWaiting)}
          {note && ` · ${note}`}
        </p>
      </header>
      <dl className="details">
        <div>
          <dt>Telefon</dt>
          <dd>
            <PhoneLink phone={row.phone} />
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${row.email}`}>{row.email}</a>
          </dd>
        </div>
        <div>
          <dt>Škola</dt>
          <dd>
            {row.school}, {formatGrade(row.grade)}
          </dd>
        </div>
        {row.schoolTeacher && (
          <div>
            <dt>Nastavnik u školi</dt>
            <dd>{row.schoolTeacher}</dd>
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
      </dl>
      <div className="actions">
        {row.offered ? (
          <>
            <span className="muted">Ponudili ste se.</span>
            <button
              type="button"
              className="button button--secondary button--small"
              aria-label={`Povuci ponudu: ${fullName(row)}`}
              disabled={busy}
              onClick={onWithdraw}
            >
              Povuci ponudu
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button--small"
            aria-label={`Ponudi se: ${fullName(row)}`}
            disabled={busy || !canOffer}
            onClick={onOffer}
          >
            Ponudi se
          </button>
        )}
      </div>
    </article>
  )
}

/**
 * The students who look for a teacher of a subject this teacher teaches, the one who waits for the shortest time first. A
 * teacher does not take anybody: they offer, and the student (or the parent) chooses after a few days or a few offers.
 */
export function PoolPage() {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const pool = usePool()
  const cv = useMyCv()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // the choice is made by the CV, so the database wants its "about" text before the first offer
  const canOffer = !!cv.data?.about.trim()

  const act = async (
    row: PoolRow,
    run: () => Promise<void>,
    action: 'offerEnrolment' | 'withdrawOffer',
  ) => {
    if (busyId) return
    setBusyId(row.requestId)
    setNotice(null)
    setError(null)
    try {
      await run()
      await refresh()
    } catch (failure) {
      setError(explainError(failure, action))
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader title="Neraspoređeni učenici" />
      <p>
        Učenici koji traže nastavnika za predmete koje predajete. Vi ne uzimate učenika: ponudite
        se, a učenik ili roditelj prihvata ponudu koja mu odgovara. Ponudu možete da povučete dok
        nastavnik nije izabran.
      </p>
      {cv.data !== undefined && !canOffer && (
        <p className="callout" role="note">
          Da biste mogli da se ponudite, napišite opis u svom CV-u, jer po njemu učenik bira.{' '}
          <Link to={`${homePath('teacher')}/moj-cv`}>Otvori Moj CV</Link>
        </p>
      )}
      <Notice message={notice} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <ChosenSection onNotice={setNotice} />

      <Loaded query={pool}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="empty-note">Trenutno nema učenika koji traže nastavnika.</p>
          ) : (
            <div className="stack">
              {rows.map((row) => (
                <PoolCard
                  key={row.requestId}
                  row={row}
                  canOffer={canOffer}
                  busy={busyId === row.requestId}
                  onOffer={() => void act(row, () => api.offer(row.requestId), 'offerEnrolment')}
                  onWithdraw={() =>
                    void act(row, () => api.withdrawOffer(row.requestId), 'withdrawOffer')
                  }
                />
              ))}
            </div>
          )
        }
      </Loaded>
    </>
  )
}
