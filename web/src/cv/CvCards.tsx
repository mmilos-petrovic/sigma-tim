import { Link } from 'react-router'
import { useCvApi } from './CvApiProvider'
import type { CvSummary } from './cvApi'
import { CvPhoto } from './CvPhoto'

const EXCERPT = 160

const excerpt = (text: string) =>
  text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text

/** The teachers as cards: photo, name, subjects and the start of what they wrote. Each opens `<base>/<slug>`. */
export function CvCards({ cvs, base }: { cvs: CvSummary[]; base: string }) {
  const api = useCvApi()
  return (
    <ul className="cv-cards">
      {cvs.map((cv) => (
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
              {cv.subjects.length > 0 && <span className="muted">{cv.subjects.join(', ')}</span>}
              {cv.about && <span>{excerpt(cv.about)}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
