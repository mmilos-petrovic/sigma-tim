/** The teacher's own lessons, until they choose a colour. */
export const OWN_COLOR = '#1f4fd8'

// The colours a teacher can choose from. The database keeps the name; the shades are decided here and are all dark
// enough for white text (checked by a test).
export const COLORS = {
  red: { label: 'Crvena', hex: '#b3261e' },
  orange: { label: 'Narandžasta', hex: '#a34100' },
  brown: { label: 'Smeđa', hex: '#8a4b08' },
  olive: { label: 'Maslinasta', hex: '#4a5a00' },
  green: { label: 'Zelena', hex: '#1d6b3a' },
  teal: { label: 'Tirkizna', hex: '#006a6a' },
  blue: { label: 'Plava', hex: '#1f4fd8' },
  indigo: { label: 'Indigo', hex: '#3949ab' },
  purple: { label: 'Ljubičasta', hex: '#6b3fa0' },
  magenta: { label: 'Ciklama', hex: '#9c2b6d' },
  wine: { label: 'Bordo', hex: '#7b1e3a' },
  slate: { label: 'Siva', hex: '#475569' },
} as const

export type ColorKey = keyof typeof COLORS
export const COLOR_KEYS = Object.keys(COLORS) as ColorKey[]

export const isColorKey = (value: unknown): value is ColorKey =>
  typeof value === 'string' && Object.hasOwn(COLORS, value)

/** The shade of a chosen colour; null for no choice (or a name a newer version of the database may have added). */
export const chosenColor = (key: string | null | undefined): string | null =>
  isColorKey(key) ? COLORS[key].hex : null

// What colleagues are drawn with until they choose: dark enough for white text, none of them is the blue of the owner.
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
