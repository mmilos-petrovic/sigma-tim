import { useQuery } from '@tanstack/react-query'
import { useCvApi } from './CvApiProvider'

const cv = ['cv'] as const

export function useMemberCvs() {
  const api = useCvApi()
  return useQuery({ queryKey: [...cv, 'list'], queryFn: () => api.listMemberCvs() })
}

export function useMemberCv(slug: string) {
  const api = useCvApi()
  return useQuery({ queryKey: [...cv, 'one', slug], queryFn: () => api.getMemberCv(slug) })
}

/** The keys of what the public pages show: the prerendered pages hand over these answers, see `prerender/seed.ts`. */
export const publicCvsKey = [...cv, 'public', 'list'] as const
export const publicCvKey = (slug: string) => [...cv, 'public', 'one', slug] as const

export function usePublicCvs() {
  const api = useCvApi()
  return useQuery({ queryKey: publicCvsKey, queryFn: () => api.listPublicCvs() })
}

export function usePublicCv(slug: string) {
  const api = useCvApi()
  return useQuery({
    queryKey: publicCvKey(slug),
    queryFn: () => api.getPublicCv(slug),
  })
}
