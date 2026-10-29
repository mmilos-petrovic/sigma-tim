import { describe, expect, it } from 'vitest'
import { hasName, sameName } from './names'

describe('names', () => {
  it('ignores case and surrounding blanks', () => {
    expect(sameName('Fizika', ' fizika ')).toBe(true)
    expect(sameName('Učionica 1', 'UČIONICA 1')).toBe(true)
    expect(sameName('Đorđe', 'đORĐE')).toBe(true)
  })

  it('tells different names apart', () => {
    expect(sameName('Fizika', 'Hemija')).toBe(false)
    expect(sameName('Učionica 1', 'Učionica 10')).toBe(false)
  })

  it('looks a name up in a list', () => {
    expect(hasName(['Matematika', 'Fizika'], 'FIZIKA')).toBe(true)
    expect(hasName(['Matematika'], 'Fizika')).toBe(false)
    expect(hasName([], 'Fizika')).toBe(false)
  })
})
