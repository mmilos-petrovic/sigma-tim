import { describe, expect, it } from 'vitest'
import { srLatn } from './locale'

describe('the Serbian calendar texts', () => {
  // some texts are functions of a unit name or of a count
  const texts = (value: unknown): string[] => {
    if (typeof value === 'string') return [value]
    if (typeof value !== 'function') return []
    const results: string[] = []
    for (const argument of ['Nedelja', 3]) {
      try {
        results.push(String(value(argument, 'week')))
      } catch {
        // wrong kind of argument for this one
      }
    }
    return results
  }
  const all = Object.values(srLatn).flatMap(texts)

  it('has real texts to check', () => {
    expect(all.length).toBeGreaterThan(15)
  })

  it('is Latin script only: no Cyrillic, including the look-alike "е" of the stock locale', () => {
    for (const text of all) expect(text).not.toMatch(/[Ѐ-ӿ]/)
  })

  it('has no English left over from the defaults', () => {
    for (const text of all)
      expect(text).not.toMatch(/\b(Prev|Next|Today|Timed|All-day|Close|Events|view|Show|more)\b/)
  })

  it('uses the code that makes the browser format dates in Latin script', () => {
    expect(srLatn.code).toBe('sr-Latn')
    expect(
      new Intl.DateTimeFormat('sr-Latn', { weekday: 'short' }).format(
        new Date('2026-11-02T12:00:00Z'),
      ),
    ).toBe('pon')
  })
})
