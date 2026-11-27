import { useState } from 'react'
import { Link, NavLink, Outlet, useMatch } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../../auth/roles'
import { Loaded, PageHeader } from '../../components/Loaded'
import { useMember } from '../../components/guards'
import { TeacherCvLinks } from '../components/TeacherCvLinks'
import { pickRecord, recordLabel, teachersOf } from '../lessonList'
import { readLastRecord, writeLastRecord } from '../memory'
import { useRecords, useSlots } from '../queries'
import type { StudentContext } from '../studentApi'
import type { StudentView } from '../view'

/**
 * Heading, the choice of whose lessons (only when there is more than one), the two tabs, and the tab itself. The requests for
 * lessons are not a tab: they are reached from the header, and have a page of their own, without the tabs.
 */
export function StudentLayout({ context }: { context: StudentContext }) {
  const profileId = useMember().roles.profileId
  const records = useRecords(context)
  const [chosen, setChosen] = useState<string | null>(() => readLastRecord(profileId, context))
  const home = homePath(context)
  const onRequests = useMatch(`${home}/prijava`) !== null

  const record = pickRecord(records.data ?? [], chosen)
  const slots = useSlots(record?.teacherId ?? null)

  return (
    <div className="student">
      <PageHeader title={onRequests ? 'Moje prijave' : CONTEXT_LABEL[context]} />
      <Loaded query={records}>
        {(all) =>
          !record ? (
            <p className="empty">Za ovaj nalog nema podataka o učeniku.</p>
          ) : (
            <>
              {onRequests && (
                <p>
                  <Link to={home}>← {CONTEXT_LABEL[context]}</Link>
                </p>
              )}

              {all.length > 1 && !onRequests && (
                <label className="field student__choice">
                  <span>{context === 'parent' ? 'Dete' : 'Nastavnik'}</span>
                  <select
                    value={record.id}
                    onChange={(event) => {
                      setChosen(event.target.value)
                      writeLastRecord(profileId, context, event.target.value)
                    }}
                  >
                    {all.map((option) => (
                      <option key={option.id} value={option.id}>
                        {recordLabel(context, option)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {!onRequests && (
                <nav className="tabs" aria-label="Prikaz">
                  <NavLink to={home} end>
                    Časovi
                  </NavLink>
                  {record.teacherId && (
                    <NavLink to={`${home}/termini`}>
                      Slobodni termini
                      {slots.data && slots.data.length > 0 && (
                        <span className="tabs__count">{slots.data.length}</span>
                      )}
                    </NavLink>
                  )}
                </nav>
              )}

              {!record.teacherId && !onRequests && (
                <p className="callout">
                  {context === 'parent' ? `${record.name} trenutno nema` : 'Trenutno nemate'}{' '}
                  nastavnika, pa nema slobodnih termina.{' '}
                  <Link to={`${home}/prijava`}>Prijava za časove</Link>
                </p>
              )}

              <div key={record.id}>
                <Outlet context={{ context, record, home, profileId } satisfies StudentView} />
              </div>

              <TeacherCvLinks
                teachers={teachersOf(context, all, record)}
                base={`${home}/nastavnici`}
              />
            </>
          )
        }
      </Loaded>
    </div>
  )
}
