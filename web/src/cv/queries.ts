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

export function usePublicCvs() {
  const api = useCvApi()
  return useQuery({ queryKey: [...cv, 'public', 'list'], queryFn: () => api.listPublicCvs() })
}

export function usePublicCv(slug: string) {
  const api = useCvApi()
  return useQuery({
    queryKey: [...cv, 'public', 'one', slug],
    queryFn: () => api.getPublicCv(slug),
  })
}
