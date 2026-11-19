import type { QueryClient } from '@tanstack/react-query'
import type { CvData, CvSummary } from '../cv/cvApi'
import { publicCvKey, publicCvsKey } from '../cv/queries'

/** The id of the `<script type="application/json">` in a prerendered page that carries what the page was made from. */
export const PRERENDERED_ID = 'prerendered-data'

/**
 * What a prerendered page was made from. The browser puts it in its cache before the first render, so the page that
 * replaces the HTML looks the same and does not jump while the same answers are asked for again.
 */
export interface Prerendered {
  /** The front page: the teachers with a public CV. */
  publicCvs?: CvSummary[]
  /** A CV page. */
  publicCv?: CvData
}

export function seedQueries(client: QueryClient, data: Prerendered) {
  if (data.publicCvs) client.setQueryData(publicCvsKey, data.publicCvs)
  if (data.publicCv) client.setQueryData(publicCvKey(data.publicCv.slug), data.publicCv)
}

/** What the page that was loaded was made from, or nothing for a page that was not prerendered (or whose data is damaged). */
export function readPrerendered(doc: Document): Prerendered | null {
  const element = doc.getElementById(PRERENDERED_ID)
  if (!element?.textContent) return null
  try {
    const value: unknown = JSON.parse(element.textContent)
    return value !== null && typeof value === 'object' ? (value as Prerendered) : null
  } catch {
    return null
  }
}
