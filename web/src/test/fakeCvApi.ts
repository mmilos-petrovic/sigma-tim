import { vi } from 'vitest'
import type { CvApi, CvData, CvSummary } from '../cv/cvApi'

export interface FakeCvApi extends CvApi {
  /** `cvs` are the CVs a signed-in person reads; `publicCvs` the ones with "javno" on (by default the same). */
  state: { cvs: CvData[]; publicCvs: CvData[] }
  calls: {
    listMemberCvs: ReturnType<typeof vi.fn>
    getMemberCv: ReturnType<typeof vi.fn>
    listPublicCvs: ReturnType<typeof vi.fn>
    getPublicCv: ReturnType<typeof vi.fn>
  }
}

export const FIXTURE_CVS: CvData[] = [
  {
    slug: 'marija-jovanovic',
    firstName: 'Marija',
    lastName: 'Jovanović',
    about: 'Predajem matematiku osnovcima i srednjoškolcima već deset godina.',
    photoPath: 'p-marija/photo.jpg',
    subjects: ['Matematika', 'Fizika'],
    experience: [
      {
        employer: 'Gimnazija',
        position: 'Profesor',
        period: '2015 – 2020',
        description: 'Matematika',
      },
    ],
    education: [{ institution: 'Matematički fakultet', degree: 'Master', period: '2008 – 2013' }],
    skills: ['Strpljenje', 'Priprema za prijemni'],
  },
  {
    slug: 'nikola-ilic',
    firstName: 'Nikola',
    lastName: 'Ilić',
    about: null,
    photoPath: null,
    subjects: ['Hemija'],
    experience: [],
    education: [],
    skills: [],
  },
]

const summary = (cv: CvData): CvSummary => ({
  slug: cv.slug,
  firstName: cv.firstName,
  lastName: cv.lastName,
  about: cv.about,
  photoPath: cv.photoPath,
  subjects: cv.subjects,
})

/** An in-memory stand-in for the CVs a signed-in person may read. */
export function createFakeCvApi(cvs: CvData[] = FIXTURE_CVS, publicCvs: CvData[] = cvs): FakeCvApi {
  const state = { cvs, publicCvs }
  const list = vi.fn(async () => state.cvs.map(summary))
  const get = vi.fn(async (slug: string) => state.cvs.find((cv) => cv.slug === slug) ?? null)
  const listPublic = vi.fn(async () => state.publicCvs.map(summary))
  const getPublic = vi.fn(
    async (slug: string) => state.publicCvs.find((cv) => cv.slug === slug) ?? null,
  )
  return {
    state,
    listMemberCvs: list,
    getMemberCv: get,
    listPublicCvs: listPublic,
    getPublicCv: getPublic,
    photoUrl: (path) => `https://photos.test/${path}`,
    calls: {
      listMemberCvs: list,
      getMemberCv: get,
      listPublicCvs: listPublic,
      getPublicCv: getPublic,
    },
  }
}
