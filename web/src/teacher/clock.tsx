import { createContext, useContext, type ReactNode } from 'react'

const real = () => new Date()
const ClockContext = createContext<() => Date>(real)

/** Lets tests fix "now". Without a value the real clock is used. */
export function ClockProvider({ now, children }: { now?: Date; children: ReactNode }) {
  return <ClockContext.Provider value={now ? () => now : real}>{children}</ClockContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNow(): Date {
  return useContext(ClockContext)()
}
