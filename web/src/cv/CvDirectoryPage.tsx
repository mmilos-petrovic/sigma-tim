import { Loaded, PageHeader } from '../components/Loaded'
import { CvCards } from './CvCards'
import { useMemberCvs } from './queries'

/** The CVs of the teachers who share them with signed-in people (and of a student's own teacher, always). `base` is this page's path. */
export function CvDirectoryPage({ base }: { base: string }) {
  const cvs = useMemberCvs()
  return (
    <div className="cv-directory">
      <PageHeader title="CV nastavnika" />
      <Loaded query={cvs}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="empty">Nijedan nastavnik još nije objavio CV.</p>
          ) : (
            <CvCards cvs={rows} base={base} />
          )
        }
      </Loaded>
    </div>
  )
}
