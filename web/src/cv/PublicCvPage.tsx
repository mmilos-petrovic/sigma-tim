import { Link, useParams } from 'react-router'
import { Loaded } from '../components/Loaded'
import { SiteLayout } from '../components/SiteLayout'
import { usePageMeta } from '../lib/pageMeta'
import { cvMeta } from '../lib/publicMeta'
import { SCHOOL_NAME } from '../lib/school'
import { useCvApi } from './CvApiProvider'
import { CvView } from './CvView'
import { usePublicCv } from './queries'

/**
 * The public page of one teacher, `/nastavnici/<slug>`: what a visitor who has not signed in may read. A link to a CV
 * that is hidden, or never existed, says so and asks search engines to forget it.
 */
export function PublicCvPage() {
  const api = useCvApi()
  const { slug = '' } = useParams()
  const cv = usePublicCv(slug)
  const data = cv.data

  // while it loads, or when the answer did not come, nothing is claimed: only a CV that was looked for and not found asks to be forgotten
  usePageMeta(cv.isSuccess ? cvMeta(data ?? null) : { title: `Nastavnik | ${SCHOOL_NAME}` })

  return (
    <SiteLayout>
      <main className="site__main">
        <p>
          <Link to="/">← Svi nastavnici</Link>
        </p>
        <Loaded query={cv}>
          {(found) =>
            found ? (
              <CvView
                cv={found}
                heading="h1"
                photoSrc={found.photoPath ? api.photoUrl(found.photoPath) : null}
              />
            ) : (
              <div className="empty">
                <h1>Ovaj CV nije dostupan</h1>
                <p>Nastavnik ga je sakrio ili adresa nije ispravna.</p>
              </div>
            )
          }
        </Loaded>
      </main>
    </SiteLayout>
  )
}
