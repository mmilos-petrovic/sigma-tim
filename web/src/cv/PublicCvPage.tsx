import { Link, useParams } from 'react-router'
import { Loaded } from '../components/Loaded'
import { SiteLayout } from '../components/SiteLayout'
import { usePageMeta } from '../lib/pageMeta'
import { SCHOOL_NAME } from '../lib/school'
import { useCvApi } from './CvApiProvider'
import { CvView } from './CvView'
import { usePublicCv } from './queries'

const DESCRIPTION_LENGTH = 155

const shorten = (text: string) =>
  text.length > DESCRIPTION_LENGTH ? `${text.slice(0, DESCRIPTION_LENGTH).trimEnd()}…` : text

/**
 * The public page of one teacher, `/nastavnici/<slug>`: what a visitor who has not signed in may read. A link to a CV
 * that is hidden, or never existed, says so and asks search engines to forget it.
 */
export function PublicCvPage() {
  const api = useCvApi()
  const { slug = '' } = useParams()
  const cv = usePublicCv(slug)
  const data = cv.data

  usePageMeta({
    title: data
      ? `${data.firstName} ${data.lastName} – nastavnik | ${SCHOOL_NAME}`
      : `CV nije dostupan | ${SCHOOL_NAME}`,
    description: data?.about ? shorten(data.about) : undefined,
    noindex: cv.isSuccess && !data,
  })

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
