import { Fragment } from 'react'
import { Link } from 'react-router'
import { ShellFooter } from '../../components/shellFooter'
import { useMemberCvs } from '../../cv/queries'

/**
 * The footer of the student's and parent's screens: "CV nastavnika:" and the name of each teacher who teaches this
 * student, as a link to the CV. The CV list carries no teacher id, so a teacher is found by name. Nothing is shown while
 * it loads, when it fails, or when none of the teachers has a CV to read.
 */
export function TeacherCvLinks({
  teachers,
  base,
}: {
  /** Full names, as the student's records give them. */
  teachers: readonly string[]
  /** The path a CV opens under: `<base>/<slug>`. */
  base: string
}) {
  const cvs = useMemberCvs()
  const links = teachers.flatMap((name) => {
    const cv = cvs.data?.find((row) => `${row.firstName} ${row.lastName}` === name)
    return cv ? [{ name, slug: cv.slug }] : []
  })
  if (links.length === 0) return null

  return (
    <ShellFooter>
      <nav aria-label="CV nastavnika" className="shell__footer-nav">
        CV nastavnika:{' '}
        {links.map((link, index) => (
          <Fragment key={link.slug}>
            {index > 0 && ', '}
            <Link to={`${base}/${link.slug}`}>{link.name}</Link>
          </Fragment>
        ))}
      </nav>
    </ShellFooter>
  )
}
