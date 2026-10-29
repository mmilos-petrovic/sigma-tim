/** The teacher's own lessons. */
export const OWN_COLOR = '#1f4fd8'

// Dark enough for white text; none of them is the blue of the owner.
const PALETTE = [
  '#b3261e',
  '#8a4b08',
  '#1d6b3a',
  '#006a6a',
  '#6b3fa0',
  '#9c2b6d',
  '#4a5a00',
  '#a34100',
]

/** One stable colour per colleague, so a person is recognised by it from week to week. */
export function teacherColor(teacherId: string): string {
  let hash = 0
  for (const char of teacherId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
