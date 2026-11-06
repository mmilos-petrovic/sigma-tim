import { describe, expect, it } from 'vitest'
import { COLOR_KEYS, COLORS, chosenColor, isColorKey, OWN_COLOR, teacherColor } from './colors'

/** WCAG relative luminance and contrast against white, the colour of the text on a block. */
function contrastWithWhite(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return 1.05 / (luminance + 0.05)
}

describe('the palette a teacher chooses from', () => {
  it('has twelve colours, the names the database accepts', () => {
    expect([...COLOR_KEYS]).toEqual([
      'red',
      'orange',
      'brown',
      'olive',
      'green',
      'teal',
      'blue',
      'indigo',
      'purple',
      'magenta',
      'wine',
      'slate',
    ])
  })

  it('has a shade and a Serbian name for each, none repeated', () => {
    for (const key of COLOR_KEYS) {
      expect(COLORS[key].hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(COLORS[key].label).toMatch(/^[A-ZŠĐČĆŽ][a-zšđčćž]+$/)
    }
    expect(new Set(COLOR_KEYS.map((key) => COLORS[key].hex)).size).toBe(12)
    expect(new Set(COLOR_KEYS.map((key) => COLORS[key].label)).size).toBe(12)
  })

  it('is dark enough for white text on every colour', () => {
    for (const key of COLOR_KEYS) {
      expect(contrastWithWhite(COLORS[key].hex), key).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('knows a name from the database from anything else', () => {
    expect(isColorKey('teal')).toBe(true)
    expect(isColorKey('chartreuse')).toBe(false)
    expect(isColorKey(null)).toBe(false)
    expect(isColorKey('#1f4fd8')).toBe(false)
  })
})

describe('the colour of a teacher', () => {
  it('is the shade of the chosen name', () => {
    expect(chosenColor('wine')).toBe(COLORS.wine.hex)
  })

  it('is nothing when there is no choice, or a name this version does not know', () => {
    expect(chosenColor(null)).toBeNull()
    expect(chosenColor(undefined)).toBeNull()
    expect(chosenColor('chartreuse')).toBeNull()
  })

  it('leaves the colours nobody chose as they were', () => {
    expect(OWN_COLOR).toBe('#1f4fd8')
    expect(teacherColor('t-marko')).toBe(teacherColor('t-marko'))
  })
})
