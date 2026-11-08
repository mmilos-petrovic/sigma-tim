import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../../auth/roles'
import { Loaded, PageHeader } from '../../components/Loaded'
import { useMember } from '../../components/guards'
import { pickRecord, recordLabel } from '../lessonList'
import { readLastRecord, writeLastRecord } from '../memory'
import { useRecords, useSlots } from '../queries'
import type { StudentContext } from '../studentApi'
import type { StudentView } from '../view'

/** Heading, the choice of whose lessons (only when there is more than one), the two tabs, and the tab itself. */
export function StudentLayout({ context }: { context: StudentContext }) {
  const profileId = useMember().roles.profileId
  const records = useRecords(context)
  const [chosen, setChosen] = useState<string | null>(() => readLastRecord(profileId, context))
  const home = homePath(context)

  const record = pickRecord(records.data ?? [], chosen)
  const slots = useSlots(record?.teacherId ?? null)

  return (
    <div className="student">
      <PageHeader title={CONTEXT_LABEL[context]} />
      <Loaded query={records}>
        {(all) =>
          !record ? (
            <p className="empty">Za ovaj nalog nema podataka o učeniku.</p>
          ) : (
            <>
              {all.length > 1 && (
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

              {!record.teacherId && (
                <p className="callout">
                  {context === 'parent' ? `${record.name} trenutno nema` : 'Trenutno nemate'}{' '}
                  nastavnika, pa nema slobodnih termina.
                </p>
              )}

              <div key={record.id}>
                <Outlet context={{ context, record, home, profileId } satisfies StudentView} />
              </div>
            </>
          )
        }
      </Loaded>
    </div>
  )
}
