import type { CvData } from './cvApi'
import { CvPhoto } from './CvPhoto'

/** What the teacher's CV looks like to a reader. The editor shows the same thing as a preview. */
export function CvView({
  cv,
  photoSrc,
  heading: Heading = 'h2',
}: {
  cv: CvData
  photoSrc: string | null
  /** The level of the name: a page of its own makes it the main heading. */
  heading?: 'h1' | 'h2'
}) {
  return (
    <article className="cv">
      <header className="cv__head">
        <CvPhoto src={photoSrc} firstName={cv.firstName} lastName={cv.lastName} size="large" />
        <div>
          <Heading className="cv__name">
            {cv.firstName} {cv.lastName}
          </Heading>
          {cv.subjects.length > 0 && (
            <ul className="chips" aria-label="Predmeti">
              {cv.subjects.map((subject) => (
                <li key={subject}>{subject}</li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {cv.about && (
        <section>
          <h3>O meni</h3>
          <p className="cv__about">{cv.about}</p>
        </section>
      )}

      {cv.experience.length > 0 && (
        <section>
          <h3>Radno iskustvo</h3>
          <ul className="cv__list">
            {cv.experience.map((entry, index) => (
              <li key={index}>
                <strong>{entry.position}</strong>, {entry.employer}
                {entry.period && <span className="muted"> · {entry.period}</span>}
                {entry.description && <p>{entry.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cv.education.length > 0 && (
        <section>
          <h3>Obrazovanje</h3>
          <ul className="cv__list">
            {cv.education.map((entry, index) => (
              <li key={index}>
                <strong>{entry.institution}</strong>
                {entry.degree && <>, {entry.degree}</>}
                {entry.period && <span className="muted"> · {entry.period}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cv.skills.length > 0 && (
        <section>
          <h3>Veštine</h3>
          <ul className="chips" aria-label="Veštine">
            {cv.skills.map((skill, index) => (
              <li key={`${skill}-${index}`}>{skill}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
