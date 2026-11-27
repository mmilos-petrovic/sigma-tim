import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { destinationFor } from '../auth/destination'
import { Dialog } from '../components/Dialog'
import { FormDialog, SelectField } from '../components/FormDialog'
import { Loaded, Notice } from '../components/Loaded'
import { PhoneLink } from '../components/PhoneLink'
import { useCvApi } from '../cv/CvApiProvider'
import { CvView } from '../cv/CvView'
import { explainError } from '../admin/errors'
import { useEnrolmentApi } from './EnrolmentApiProvider'
import type { ApplicantRole, MyEnrolmentRequest, OfferRow } from './enrolmentApi'
import { ProfileForm } from './ProfileForm'
import { useEnrolmentFormInfo, useOfferedCv, useOffers, useRefreshEnrolment } from './queries'

const fullName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`

function OfferedCvDialog({
  requestId,
  offer,
  onClose,
}: {
  requestId: string
  offer: OfferRow
  onClose: () => void
}) {
  const cvApi = useCvApi()
  const cv = useOfferedCv(requestId, offer.teacherId)
  return (
    <Dialog title={`CV: ${fullName(offer)}`} onClose={onClose}>
      <Loaded query={cv}>
        {(data) =>
          data ? (
            <CvView cv={data} photoSrc={data.photoPath ? cvApi.photoUrl(data.photoPath) : null} />
          ) : (
            <p className="empty">Ovaj nastavnik nema CV.</p>
          )
        }
      </Loaded>
      <div className="actions actions--end">
        <button type="button" className="button button--secondary" onClick={onClose}>
          Zatvori
        </button>
      </div>
    </Dialog>
  )
}

function ChooseDialog({
  request,
  offer,
  onClose,
  onDone,
}: {
  request: MyEnrolmentRequest
  offer: OfferRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const api = useEnrolmentApi()
  const { reloadRoles } = useAuth()
  const refresh = useRefreshEnrolment()
  return (
    <FormDialog
      title="Prihvatanje ponude"
      action="chooseTeacher"
      submitLabel="Prihvati ponudu"
      onClose={onClose}
      onSubmit={async () => {
        const result = await api.chooseTeacher(request.id, offer.teacherId)
        await refresh()
        // a student is a member of the school from now on
        if (result === 'assigned') reloadRoles()
        onDone(
          result === 'assigned'
            ? `Nastavnik ${fullName(offer)} ti je dodeljen.`
            : `Nastavnik ${fullName(offer)} je izabran. On treba da upiše email adresu deteta da bi upis bio završen.`,
        )
      }}
    >
      <p>
        Prihvatiti ponudu nastavnika <strong>{fullName(offer)}</strong>? Ostale ponude se zatvaraju,
        a drugi nastavnici ne dobijaju obaveštenje.
      </p>
    </FormDialog>
  )
}

/** The teachers who offered, with what the person decides by. An offer can be accepted at once. */
function Offers({
  request,
  onNotice,
}: {
  request: MyEnrolmentRequest
  onNotice: (message: string) => void
}) {
  const offers = useOffers(request.id)
  const [cvOf, setCvOf] = useState<OfferRow | null>(null)
  const [choosing, setChoosing] = useState<OfferRow | null>(null)
  const chosen = request.status === 'chosen'

  return (
    <Loaded query={offers}>
      {(all) => {
        const rows = chosen ? all.filter((offer) => offer.isChosen) : all
        return (
          <>
            {rows.length > 0 && (
              <ul className="offers" aria-label="Ponude nastavnika">
                {rows.map((offer) => (
                  <li key={offer.teacherId} className="offers__item">
                    <div>
                      <strong>{fullName(offer)}</strong>
                      {offer.subjects.length > 0 && (
                        <ul className="chips" aria-label="Predmeti">
                          {offer.subjects.map((subject) => (
                            <li key={subject}>{subject}</li>
                          ))}
                        </ul>
                      )}
                      <p className="offers__phone">
                        {offer.phone ? <PhoneLink phone={offer.phone} /> : 'Broj telefona nije dat'}
                      </p>
                    </div>
                    <div className="actions">
                      {offer.cvSlug && (
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          aria-label={`CV: ${fullName(offer)}`}
                          onClick={() => setCvOf(offer)}
                        >
                          CV
                        </button>
                      )}
                      {!chosen && (
                        <button
                          type="button"
                          className="button button--small"
                          aria-label={`Prihvati ponudu: ${fullName(offer)}`}
                          onClick={() => setChoosing(offer)}
                        >
                          Prihvati ponudu
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {cvOf && (
              <OfferedCvDialog requestId={request.id} offer={cvOf} onClose={() => setCvOf(null)} />
            )}
            {choosing && (
              <ChooseDialog
                request={request}
                offer={choosing}
                onClose={() => setChoosing(null)}
                onDone={(message) => {
                  setChoosing(null)
                  onNotice(message)
                }}
              />
            )}
          </>
        )
      }}
    </Loaded>
  )
}

/** The subjects to choose from: the current one stays in the list even when nobody offers it for new requests any more. */
function useSubjectChoices(request: MyEnrolmentRequest) {
  const form = useEnrolmentFormInfo().data
  if (!form) return null
  return request.subjectId && !form.subjects.some((subject) => subject.id === request.subjectId)
    ? [...form.subjects, { id: request.subjectId, name: request.subjectName ?? 'Predmet' }]
    : form.subjects
}

/** Changes the subject of an open request until a teacher is chosen; the offers of teachers who do not teach it are withdrawn. */
function useChangeSubject(request: MyEnrolmentRequest) {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const change = async (subjectId: string) => {
    if (busy) return
    if (!subjectId) {
      setError('Izaberi predmet.')
      return false
    }
    setBusy(true)
    setError(null)
    try {
      await api.setSubject(request.id, subjectId)
      await refresh()
      return true
    } catch (failure) {
      setError(explainError(failure, 'setEnrolmentSubject'))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { change, error, busy }
}

/** A student a teacher left behind has no subject yet and says which one they want. */
function SubjectPicker({ request }: { request: MyEnrolmentRequest }) {
  const choices = useSubjectChoices(request)
  const { change, error, busy } = useChangeSubject(request)
  const [subjectId, setSubjectId] = useState('')

  return (
    <div className="enrolment-profile">
      <p>Izaberi predmet iz kog želiš časove, da bi te videli nastavnici tog predmeta.</p>
      {choices && (
        <SelectField label="Predmet" value={subjectId} onChange={setSubjectId}>
          <option value="">Izaberi predmet</option>
          {choices.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectField>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void change(subjectId)}
        >
          Sačuvaj predmet
        </button>
      </div>
    </div>
  )
}

/**
 * The title of an open request is its subject, and the person's choice: they pick another one in the title itself until a
 * teacher is chosen. The title is plain text once a teacher is.
 */
function RequestTitle({ request }: { request: MyEnrolmentRequest }) {
  const choices = useSubjectChoices(request)
  const { change, error, busy } = useChangeSubject(request)
  if (request.status !== 'open' || !request.subjectId || !choices) {
    return <h2>{request.subjectName ?? 'Časovi'}</h2>
  }
  return (
    <>
      <h2 className="enrolment-request__title">
        <select
          className="enrolment-request__subject"
          aria-label="Predmet"
          value={request.subjectId}
          disabled={busy}
          onChange={(event) => void change(event.target.value)}
        >
          {choices.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </h2>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </>
  )
}

/** Deletes a request that still waits; the offers go with it, and the person may make a new one. */
function CancelDialog({ request, onClose }: { request: MyEnrolmentRequest; onClose: () => void }) {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  return (
    <FormDialog
      title="Brisanje prijave"
      action="cancelEnrolment"
      submitLabel="Obriši prijavu"
      danger
      onClose={onClose}
      onSubmit={async () => {
        await api.cancelRequest(request.id)
        await refresh()
        onClose()
      }}
    >
      <p>
        Obrisati prijavu za <strong>{request.subjectName ?? 'časove'}</strong>? Ponude nastavnika se
        brišu zajedno sa njom. Posle toga možeš da napraviš novu prijavu.
      </p>
    </FormDialog>
  )
}

function RequestCard({
  request,
  defaults,
  canCancel,
}: {
  request: MyEnrolmentRequest
  defaults: { firstName: string; lastName: string }
  canCancel: boolean
}) {
  const { state } = useAuth()
  const refresh = useRefreshEnrolment()
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const saved = () => {
    setEditing(false)
    setNotice(null)
    void refresh()
  }
  const name =
    request.studentFirstName && request.studentLastName
      ? `${request.studentFirstName} ${request.studentLastName}`
      : null

  let body
  if (request.status === 'assigned') {
    body = (
      <>
        <p>Nastavnik ti je dodeljen.</p>
        {state.status === 'ready' && state.roles && (
          <div className="actions">
            <Link className="button" to={destinationFor(state.roles, null)}>
              Otvori aplikaciju
            </Link>
          </div>
        )}
      </>
    )
  } else if (request.status === 'chosen') {
    body = (
      <>
        <p>Nastavnik je izabran. On treba da upiše email adresu deteta da bi upis bio završen.</p>
        <Offers request={request} onNotice={setNotice} />
      </>
    )
  } else if (!request.subjectId) {
    body = <SubjectPicker request={request} />
  } else if (!request.profileCompleted) {
    body = (
      <>
        {/* somebody who signed up is welcomed above the cards, with the same words */}
        {request.source !== 'signup' && <p>Popuni profil da bi te videli nastavnici.</p>}
        <ProfileForm request={request} defaults={defaults} onSaved={saved} />
      </>
    )
  } else if (editing) {
    body = <ProfileForm request={request} defaults={defaults} onSaved={saved} />
  } else {
    body = (
      <>
        <p>Tvoj zahtev je primljen. Kada neki nastavnik ponudi časove, videćeš ga ovde.</p>
        <p className="muted">
          {name} · {request.school}, {request.grade}
        </p>
        <p className="muted">Predmet možeš da promeniš dok nastavnik nije izabran.</p>
        <Offers request={request} onNotice={setNotice} />
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setEditing(true)}
          >
            Izmeni profil
          </button>
        </div>
      </>
    )
  }

  return (
    <section
      className="enrolment-request"
      aria-label={`Prijava za ${request.subjectName ?? 'časove'}`}
    >
      <RequestTitle request={request} />
      {request.role === 'parent' && name && <p className="muted">Dete: {name}</p>}
      <Notice message={notice} />
      {body}
      {canCancel && (request.status === 'open' || request.status === 'chosen') && (
        <div className="actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setCancelling(true)}
          >
            Obriši prijavu
          </button>
        </div>
      )}
      {cancelling && <CancelDialog request={request} onClose={() => setCancelling(false)} />}
    </section>
  )
}

/**
 * A new request: the subject, and for a parent also whose lessons it is, one of the children who are students already
 * (their profile is reused) or another child (the profile is asked next).
 */
function StartAnother({
  role,
  childOptions,
}: {
  role: ApplicantRole
  childOptions: { id: string; name: string }[]
}) {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const info = useEnrolmentFormInfo()
  const [subjectId, setSubjectId] = useState('')
  // a parent's first child unless they chose; '' is another child
  const [chosenChild, setChosenChild] = useState<string | null>(null)
  const childId = chosenChild ?? childOptions[0]?.id ?? ''
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = async () => {
    if (busy) return
    if (!subjectId) return setError('Izaberi predmet.')
    setBusy(true)
    setError(null)
    try {
      await api.startEnrolment(subjectId, role, childId || undefined)
      await refresh()
      setSubjectId('')
    } catch (failure) {
      setError(explainError(failure, 'startEnrolment'))
    } finally {
      setBusy(false)
    }
  }

  // the school does not take sign-ups right now, or there is nothing to choose from: nothing to offer
  if (!info.data?.enabled || info.data.subjects.length === 0) return null
  return (
    <section className="enrolment-request" aria-label="Nova prijava">
      <h2>Nova prijava</h2>
      <div className="enrolment-profile">
        {role === 'parent' && (
          <SelectField label="Dete" value={childId} onChange={setChosenChild}>
            {childOptions.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
            <option value="">Drugo dete</option>
          </SelectField>
        )}
        <SelectField label="Predmet" value={subjectId} onChange={setSubjectId}>
          <option value="">Izaberi predmet</option>
          {info.data.subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectField>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="button" disabled={busy} onClick={() => void start()}>
            Nova prijava
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * The sign-ups of the signed-in person: the profile to fill in, the offers and the choice. `defaults` is the name of the
 * Google account, for a student who signs up. A parent may also start another request.
 */
export function RequestsView({
  requests,
  defaults,
  canStartAnother,
  canCancel = false,
  startAs,
  childOptions = [],
}: {
  requests: MyEnrolmentRequest[]
  defaults: { firstName: string; lastName: string }
  canStartAnother: boolean
  /** A request that still waits can be deleted (a member of the school, on the page of their requests). */
  canCancel?: boolean
  /** Who asks for more lessons: a parent also says for which child. By default what the requests say. */
  startAs?: ApplicantRole
  /** The children of a parent who are students already, for a new request about one of them. */
  childOptions?: { id: string; name: string }[]
}) {
  // who signed up and has not filled in the request yet
  const welcome = requests.find(
    (request) =>
      request.source === 'signup' && request.status === 'open' && !request.profileCompleted,
  )
  return (
    <>
      {welcome && (
        <p className="callout">
          {welcome.role === 'parent'
            ? 'Dobrodošli u Sigma Tim! Popunite prijavu da bi dete videli nastavnici.'
            : 'Dobrodošao u Sigma Tim! Popuni prijavu da bi te videli nastavnici.'}
        </p>
      )}
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          defaults={request.role === 'student' ? defaults : { firstName: '', lastName: '' }}
          canCancel={canCancel}
        />
      ))}
      {canStartAnother && (
        <StartAnother
          role={
            startAs ??
            (requests.some((request) => request.role === 'parent') ? 'parent' : 'student')
          }
          childOptions={childOptions}
        />
      )}
    </>
  )
}
