/** What the calendar shows: one block of time. The page decides what each block means and whether it may be moved. */
export interface CalendarItem {
  id: string
  /** ISO 8601 instants. */
  start: string
  end: string
  title: string
  /** A second line, for example the students or the teacher. */
  detail?: string
  /** Background of the block. */
  color: string
  /** Style hook: `own`, `busy` (a colleague's lesson, no details), `slot`, `pending`... */
  variant: string
  movable: boolean
  resizable: boolean
}
