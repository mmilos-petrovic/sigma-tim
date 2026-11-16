import type { SupabaseClient } from '@supabase/supabase-js'
import { run } from '../admin/supabaseAdminApi'
import type { Database } from '../lib/database.types'
import type { CvApi, CvData, CvEducation, CvExperience, CvSummary } from './cvApi'

export const CV_BUCKET = 'cv-photos'

interface SummaryRow {
  slug: string
  first_name: string
  last_name: string
  about: string | null
  photo_path: string | null
  subjects: string[] | null
}

export function mapSummary(row: SummaryRow): CvSummary {
  return {
    slug: row.slug,
    firstName: row.first_name,
    lastName: row.last_name,
    about: row.about,
    photoPath: row.photo_path,
    subjects: row.subjects ?? [],
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** `get_member_cv` and `get_public_cv` answer with one JSON object; a field it does not have is simply empty. */
export function mapCv(value: unknown): CvData | null {
  if (value === null || typeof value !== 'object') return null
  const json = value as Record<string, unknown>
  const list = (key: string): unknown[] =>
    Array.isArray(json[key]) ? (json[key] as unknown[]) : []
  const record = (item: unknown): Record<string, unknown> =>
    item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {}

  return {
    slug: text(json.slug) ?? '',
    firstName: text(json.first_name) ?? '',
    lastName: text(json.last_name) ?? '',
    about: text(json.about),
    photoPath: text(json.photo_path),
    subjects: list('subjects').filter((s): s is string => typeof s === 'string'),
    experience: list('experience').map((item): CvExperience => {
      const e = record(item)
      return {
        employer: text(e.employer) ?? '',
        position: text(e.position) ?? '',
        period: text(e.period),
        description: text(e.description),
      }
    }),
    education: list('education').map((item): CvEducation => {
      const e = record(item)
      return {
        institution: text(e.institution) ?? '',
        degree: text(e.degree),
        period: text(e.period),
      }
    }),
    skills: list('skills').filter((s): s is string => typeof s === 'string'),
  }
}

export function createSupabaseCvApi(client: SupabaseClient<Database>): CvApi {
  return {
    async listMemberCvs() {
      const { data } = await run(client.rpc('list_member_cvs'))
      return (data ?? []).map(mapSummary)
    },

    async getMemberCv(slug) {
      const { data } = await run(client.rpc('get_member_cv', { p_slug: slug }))
      return mapCv(data)
    },

    async listPublicCvs() {
      const { data } = await run(client.rpc('list_public_cvs'))
      return (data ?? []).map(mapSummary)
    },

    async getPublicCv(slug) {
      const { data } = await run(client.rpc('get_public_cv', { p_slug: slug }))
      return mapCv(data)
    },

    photoUrl(path) {
      return client.storage.from(CV_BUCKET).getPublicUrl(path).data.publicUrl
    },
  }
}
