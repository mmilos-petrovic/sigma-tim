import { useState } from 'react'
import { DeleteStudentDialog } from '../../components/DeleteStudentDialog'
import { Field } from '../../components/FormDialog'
import { Loaded, Notice, PageHeader } from '../../components/Loaded'
import { formatDate } from '../../lib/dateField'
import { toWallClock } from '../../teacher/schoolDay'
import { useAdminApi } from '../AdminApiProvider'
import type { AdminStudentRow } from '../adminApi'
import { useRefresh, useStudentList } from '../queries'
import { groupStudents, matchesPerson, NO_TEACHER, type PersonRow } from '../studentsList'

const teacherLabel = (record: AdminStudentRow) => record.teacherName ?? NO_TEACHER
const fullName = (person: PersonRow) => `${person.firstName} ${person.lastName}`

/** The day on the Belgrade calendar, written day.month.year. */
const day = (iso: string) => formatDate(toWallClock(new Date(iso)).date)

/** Every student record of the school, a person who studies with two teachers on one row. */
export function StudentsPage() {
  const api = useAdminApi()
  const refresh = useRefresh()
  const students = useStudentList()
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<{ person: PersonRow; record: AdminStudentRow } | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <>
      <PageHeader title="Učenici" />
      <Notice message={notice} />

      <Loaded query={students}>
        {(rows) => {
          const people = groupStudents(rows)
          const shown = people.filter((person) => matchesPerson(person, query))
          if (people.length === 0) return <p className="empty-note">Još nema učenika.</p>

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
                <p className="empty-note">Nema učenika koji odgovaraju pretrazi.</p>
              ) : (
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Učenik</th>
                        <th>Dodat</th>
                        <th>Nastavnik</th>
                        <th>Lokacije</th>
                        <th>Roditelji</th>
                        <th>
                          <span className="visually-hidden">Radnje</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((person) => (
                        <tr key={person.profileId}>
                          <td>
                            <strong>{fullName(person)}</strong>
                            <div className="muted">{person.email}</div>
                          </td>
                          <td>{day(person.addedAt)}</td>
                          <td>{person.teachers.join(', ')}</td>
                          <td>
                            {person.locations.length > 0 ? (
                              person.locations.join(', ')
                            ) : (
                              <span className="muted">Nema časova</span>
                            )}
                          </td>
                          <td>
                            {person.parents.length > 0 ? (
                              person.parents.join(', ')
                            ) : (
                              <span className="muted">Nema roditelja</span>
                            )}
                          </td>
                          <td className="table__actions">
                            {person.records
                              .filter((record) => record.heldLessons === 0)
                              .map((record) => (
                                <button
                                  key={record.studentId}
                                  type="button"
                                  className="button button--small button--secondary"
                                  aria-label={`Obriši učenika ${fullName(person)} (${teacherLabel(record)})`}
                                  onClick={() => setDeleting({ person, record })}
                                >
                                  {person.records.length > 1
                                    ? `Obriši (${teacherLabel(record)})`
                                    : 'Obriši'}
                                </button>
                              ))}
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

      {deleting && (
        <DeleteStudentDialog
          name={
            deleting.person.records.length > 1
              ? `${fullName(deleting.person)} (${teacherLabel(deleting.record)})`
              : fullName(deleting.person)
          }
          upcoming={deleting.record.upcomingLessons}
          onDelete={async () => {
            await api.deleteStudent(deleting.record.studentId)
            await refresh()
          }}
          onClose={() => setDeleting(null)}
          onDone={(message) => {
            setDeleting(null)
            setNotice(message)
          }}
        />
      )}
    </>
  )
}
