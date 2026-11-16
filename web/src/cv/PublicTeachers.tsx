import { CvCards } from './CvCards'
import { usePublicCvs } from './queries'

/**
 * "Naši nastavnici" on the front page: the teachers who made their CV public. Nothing is shown while it loads, when it
 * fails or when there is nobody: the front page has to look right without it.
 */
export function PublicTeachers() {
  const cvs = usePublicCvs()
  if (!cvs.data || cvs.data.length === 0) return null
  return (
    <section className="landing__section" id="nastavnici" aria-labelledby="teachers-title">
      <h2 id="teachers-title">Naši nastavnici</h2>
      <CvCards cvs={cvs.data} base="/nastavnici" />
    </section>
  )
}
