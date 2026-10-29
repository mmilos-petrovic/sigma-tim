import type { LocaleInput } from '@fullcalendar/react'

/**
 * Serbian, Latin script. FullCalendar's own `sr` locale cannot be used: its Latin words contain Cyrillic "е" look-alikes
 * (U+0435), and under the code `sr` the browser formats weekday and month names in Cyrillic. The code `sr-Latn` makes
 * Intl produce "pon, 2. novembar".
 */
export const srLatn: LocaleInput = {
  code: 'sr-Latn',
  firstDay: 1, // Monday
  prevText: 'Prethodna',
  nextText: 'Sledeća',
  todayText: 'Danas',
  yearText: 'Godina',
  monthText: 'Mesec',
  weekTextLong: 'Nedelja',
  weekTextShort: 'Ned',
  dayText: 'Dan',
  listText: 'Spisak',
  allDayText: 'Ceo dan',
  moreLinkText: (count: number) => `+ još ${count}`,
  noEventsText: 'Nema događaja za prikaz',
  timedText: 'Termini',
  prevYearText: 'Prethodna godina',
  nextYearText: 'Sledeća godina',
  // the spoken texts (screen readers, tooltips) default to English as well
  closeHint: 'Zatvori',
  eventsHint: 'Događaji',
  todayHint: 'Idi na današnji dan',
  prevHint: (unitText: string) => `Prethodna ${unitText.toLowerCase()}`,
  nextHint: (unitText: string) => `Sledeća ${unitText.toLowerCase()}`,
  viewHint: (viewButtonText: string) => `Prikaz: ${viewButtonText.toLowerCase()}`,
  viewChangeHint: 'Promena prikaza',
  navLinkHint: 'Idi na $0',
  moreLinkHint: (count: number) => `Prikaži još ${count}`,
}
