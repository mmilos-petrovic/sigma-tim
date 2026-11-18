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
import type { MyEnrolmentRequest, OfferRow } from './enrolmentApi'
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
      title="Izbor nastavnika"
      action="chooseTeacher"
      submitLabel="Izaberi"
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
        Izabrati nastavnika <strong>{fullName(offer)}</strong>? Ostale ponude se zatvaraju, a drugi
        nastavnici ne dobijaju obaveštenje.
      </p>
    </FormDialog>
  )
}

/** The teachers who offered, with what the person decides by. Choosing is possible once the choice is open. */
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
            {rows.length === 0 ? (
              <p className="muted">
                Nastavnici predmeta {request.subjectName} vide tvoj zahtev. Ponude će se pojaviti
                ovde.
              </p>
            ) : (
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
                      {request.choiceOpen && !chosen && (
                        <button
                          type="button"
                          className="button button--small"
                          aria-label={`Izaberi: ${fullName(offer)}`}
                          onClick={() => setChoosing(offer)}
                        >
                          Izaberi
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {rows.length > 0 && !request.choiceOpen && !chosen && (
              <p className="muted">
                Izbor nastavnika se otvara posle nekoliko dana ili kada stigne dovoljno ponuda.
                Obavestićemo te.
              </p>
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

/** A student a teacher left behind without a subject says which one they want. */
function SubjectPicker({ request }: { request: MyEnrolmentRequest }) {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const info = useEnrolmentFormInfo()
  const [subjectId, setSubjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (busy) return
    if (!subjectId) return setError('Izaberi predmet.')
    setBusy(true)
    setError(null)
    try {
      await api.setSubject(request.id, subjectId)
      await refresh()
    } catch (failure) {
      setError(explainError(failure, 'setEnrolmentSubject'))
      setBusy(false)
    }
  }

  return (
    <div className="enrolment-profile">
      <p>Izaberi predmet iz kog želiš časove, da bi te videli nastavnici tog predmeta.</p>
      <Loaded query={info}>
        {(form) => (
          <SelectField label="Predmet" value={subjectId} onChange={setSubjectId}>
            <option value="">Izaberi predmet</option>
            {form.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </SelectField>
        )}
      </Loaded>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="button" disabled={busy} onClick={() => void save()}>
          Sačuvaj predmet
        </button>
      </div>
    </div>
  )
}

function RequestCard({
  request,
  defaults,
}: {
  request: MyEnrolmentRequest
  defaults: { firstName: string; lastName: string }
}) {
  const { state } = useAuth()
  const refresh = useRefreshEnrolment()
  const [editing, setEditing] = useState(false)
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
        <p>Popuni profil da bi te videli nastavnici.</p>
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
      <h2>{request.subjectName ?? 'Časovi'}</h2>
      {request.role === 'parent' && name && <p className="muted">Dete: {name}</p>}
      <Notice message={notice} />
      {body}
    </section>
  )
}

/** A parent asks for lessons for another child, or another subject. */
function StartAnother() {
  const api = useEnrolmentApi()
  const refresh = useRefreshEnrolment()
  const info = useEnrolmentFormInfo()
  const [subjectId, setSubjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = async () => {
    if (busy) return
    if (!subjectId) return setError('Izaberi predmet.')
    setBusy(true)
    setError(null)
    try {
      await api.startEnrolment(subjectId, 'parent')
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
      <h2>Prijavi još jedno dete</h2>
      <div className="enrolment-profile">
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
}: {
  requests: MyEnrolmentRequest[]
  defaults: { firstName: string; lastName: string }
  canStartAnother: boolean
}) {
  return (
    <>
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          defaults={request.role === 'student' ? defaults : { firstName: '', lastName: '' }}
        />
      ))}
      {canStartAnother && <StartAnother />}
    </>
  )
}
