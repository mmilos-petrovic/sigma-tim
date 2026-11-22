import type { CvData } from '../cv/cvApi'
import { SCHOOL_NAME, SCHOOL_TITLE, TAGLINE } from './school'

/** What the head of a public page says. The page sets it while it is open; the prerendered HTML carries the same. */
export interface PageMeta {
  title: string
  description?: string
  /** Asks search engines to leave the page out of their results. */
  noindex?: boolean
}

const DESCRIPTION_LENGTH = 155

const shorten = (text: string) =>
  text.length > DESCRIPTION_LENGTH ? `${text.slice(0, DESCRIPTION_LENGTH).trimEnd()}…` : text

export const LANDING_META: PageMeta = {
  title: `${SCHOOL_TITLE} – ${TAGLINE.toLowerCase()}`,
  description:
    'Udruženje nastavnika iz Kruševca. Izaberi predmet, prijavi se Google nalogom i sačekaj ponude nastavnika.',
}

export const PRIVACY_META: PageMeta = {
  title: `Politika privatnosti – ${SCHOOL_NAME}`,
  description:
    'Politika privatnosti aplikacije za zakazivanje časova Sigma Tim: koje podatke obrađujemo, zašto i kako ostvarujete svoja prava.',
}

/** The page of one teacher; `null` is a CV that is hidden or never existed. */
export function cvMeta(cv: CvData | null): PageMeta {
  if (!cv) return { title: `CV nije dostupan | ${SCHOOL_NAME}`, noindex: true }
  return {
    title: `${cv.firstName} ${cv.lastName} – nastavnik | ${SCHOOL_NAME}`,
    description: cv.about ? shorten(cv.about) : undefined,
  }
}
