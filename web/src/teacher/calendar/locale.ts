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
  // a view of a few days (the phone's) is not one unit, so it has no unit text
  prevHint: (unitText?: string) =>
    unitText ? `Prethodna ${unitText.toLowerCase()}` : 'Prethodni dani',
  nextHint: (unitText?: string) =>
    unitText ? `Sledeća ${unitText.toLowerCase()}` : 'Sledeći dani',
  viewHint: (viewButtonText: string) => `Prikaz: ${viewButtonText.toLowerCase()}`,
  viewChangeHint: 'Promena prikaza',
  navLinkHint: 'Idi na $0',
  moreLinkHint: (count: number) => `Prikaži još ${count}`,
}
