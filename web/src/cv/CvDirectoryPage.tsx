import { Link } from 'react-router'
import { Loaded, PageHeader } from '../components/Loaded'
import { CvPhoto } from './CvPhoto'
import { useCvApi } from './CvApiProvider'
import { useMemberCvs } from './queries'

const EXCERPT = 160

const excerpt = (text: string) =>
  text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text

/** The CVs of the teachers who share them with signed-in people (and of a student's own teacher, always). `base` is this page's path. */
export function CvDirectoryPage({ base }: { base: string }) {
  const api = useCvApi()
  const cvs = useMemberCvs()
  return (
    <div className="cv-directory">
      <PageHeader title="CV nastavnika" />
      <Loaded query={cvs}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="empty">Nijedan nastavnik još nije objavio CV.</p>
          ) : (
            <ul className="cv-cards">
              {rows.map((cv) => (
                <li key={cv.slug}>
                  <Link className="cv-card" to={`${base}/${cv.slug}`}>
                    <CvPhoto
                      src={cv.photoPath ? api.photoUrl(cv.photoPath) : null}
                      firstName={cv.firstName}
                      lastName={cv.lastName}
                    />
                    <span className="cv-card__body">
                      <strong>
                        {cv.firstName} {cv.lastName}
                      </strong>
                      {cv.subjects.length > 0 && (
                        <span className="muted">{cv.subjects.join(', ')}</span>
                      )}
                      {cv.about && <span>{excerpt(cv.about)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </div>
  )
}
