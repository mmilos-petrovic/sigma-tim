import { useState } from 'react'
import { Field } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { formatDate } from '../../lib/dateField'
import { containsWords } from '../../lib/text'
import { toWallClock } from '../../teacher/schoolDay'
import { useAdminApi } from '../AdminApiProvider'
import type { AdminParentRow } from '../adminApi'
import { ErasePersonDialog } from '../ErasePersonDialog'
import { useParentList, useRefresh } from '../queries'

const fullName = (parent: AdminParentRow) => `${parent.firstName} ${parent.lastName}`

/** The day on the Belgrade calendar, written day.month.year. */
const day = (iso: string) => formatDate(toWallClock(new Date(iso)).date)

/** Every parent of the school. The only thing to do here is to erase one on their request. */
export function ParentsPage() {
  const api = useAdminApi()
  const refresh = useRefresh()
  const parents = useParentList()
  const [query, setQuery] = useState('')
  const [erasing, setErasing] = useState<AdminParentRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <>
      <PageHeader title="Roditelji" />
      <Notice message={notice} />

      <Loaded query={parents}>
        {(rows) => {
          const shown = rows.filter((parent) =>
            containsWords(`${fullName(parent)} ${parent.email}`, query),
          )
          if (rows.length === 0) return <p className="empty-note">Još nema roditelja.</p>

          return (
            <>
              <div className="list-filter">
                <Field
                  label="Pretraga po imenu ili emailu"
                  type="search"
                  value={query}
                  onChange={setQuery}
                  maxLength={100}
                />
              </div>

              {shown.length === 0 ? (
                <p className="empty-note">Nema roditelja koji odgovaraju pretrazi.</p>
              ) : (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Roditelj</th>
                        <th>Dodat</th>
                        <th>Deca</th>
                        <th>
                          <span className="visually-hidden">Radnje</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((parent) => (
                        <tr key={parent.profileId}>
                          <td>
                            <strong>{fullName(parent)}</strong>
                            <div className="muted">{parent.email}</div>
                          </td>
                          <td>{day(parent.createdAt)}</td>
                          <td>
                            {parent.childNames.length > 0 ? (
                              parent.childNames.join(', ')
                            ) : (
                              <span className="muted">Nema dece</span>
                            )}
                          </td>
                          <td className="table__actions">
                            {parent.childNames.length > 0 ? (
                              <span className="muted">
                                Prvo obrišite učenika ili uklonite roditelja sa učenika.
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="button button--small button--secondary"
                                aria-label={`Obriši na zahtev roditelja ${fullName(parent)}`}
                                onClick={() => setErasing(parent)}
                              >
                                Briši na zahtev
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        }}
      </Loaded>

      {erasing && (
        <ErasePersonDialog
          name={fullName(erasing)}
          isStudent={false}
          onErase={async () => {
            await api.erasePerson(erasing.profileId)
            await refresh()
          }}
          onClose={() => setErasing(null)}
          onDone={(message) => {
            setErasing(null)
            setNotice(message)
          }}
        />
      )}
    </>
  )
}
