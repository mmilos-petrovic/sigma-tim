import { createContext, useContext, type ReactNode } from 'react'
import type { CvApi } from './cvApi'

const CvApiContext = createContext<CvApi | null>(null)

export function CvApiProvider({ api, children }: { api: CvApi; children: ReactNode }) {
  return <CvApiContext.Provider value={api}>{children}</CvApiContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCvApi(): CvApi {
  const api = useContext(CvApiContext)
  if (!api) throw new Error('useCvApi must be used inside <CvApiProvider>')
  return api
}
