import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ShellFooterSlot } from './shellFooterSlot'

/** Content for the footer at the bottom of the page, which the shell draws outside of the screen's own column. */
export function ShellFooter({ children }: { children: ReactNode }) {
  const slot = useContext(ShellFooterSlot)
  return slot ? createPortal(children, slot) : null
}
