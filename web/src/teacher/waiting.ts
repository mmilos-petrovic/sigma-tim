/** "danas", "1 dan", "3 dana", "21 dan", "11 dana" */
export function waitingText(days: number): string {
  if (days <= 0) return 'od danas'
  return days % 10 === 1 && days % 100 !== 11 ? `${days} dan` : `${days} dana`
}
