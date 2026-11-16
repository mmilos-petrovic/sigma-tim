import { createContext, useContext, type ReactNode } from 'react'
import type { EnrolmentApi } from './enrolmentApi'

const EnrolmentApiContext = createContext<EnrolmentApi | null>(null)

export function EnrolmentApiProvider({
  api,
  children,
}: {
  api: EnrolmentApi
  children: ReactNode
}) {
  return <EnrolmentApiContext.Provider value={api}>{children}</EnrolmentApiContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEnrolmentApi(): EnrolmentApi {
  const api = useContext(EnrolmentApiContext)
  if (!api) throw new Error('useEnrolmentApi must be used inside <EnrolmentApiProvider>')
  return api
}
