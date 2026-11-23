import { Link, useParams } from 'react-router'
import { Loaded } from '../components/Loaded'
import { useCvApi } from './CvApiProvider'
import { CvView } from './CvView'
import { useMemberCv } from './queries'

/** One CV. `base` is the path of the list, to go back to; a screen without a list says where else to go back to. */
export function CvDetailPage({
  base,
  back = { to: base, label: '← Svi nastavnici' },
}: {
  base: string
  back?: { to: string; label: string }
}) {
  const api = useCvApi()
  const { slug = '' } = useParams()
  const cv = useMemberCv(slug)
  return (
    <div className="cv-detail">
      <p>
        <Link to={back.to}>{back.label}</Link>
      </p>
      <Loaded query={cv}>
        {(data) =>
          data ? (
            <CvView cv={data} photoSrc={data.photoPath ? api.photoUrl(data.photoPath) : null} />
          ) : (
            <p className="empty">Ovaj CV nije dostupan.</p>
          )
        }
      </Loaded>
    </div>
  )
}
