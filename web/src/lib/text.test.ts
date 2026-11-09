import { describe, expect, it } from 'vitest'
import { containsWords, fold } from './text'

describe('fold', () => {
  it('drops the case and the diacritics, and writes đ as dj', () => {
    expect(fold('Đorđe ŠĆEPANOVIĆ čćž')).toBe('djordje scepanovic ccz')
  })
})

describe('containsWords', () => {
  it('finds every word, in any order and anywhere', () => {
    expect(containsWords('Ana Petrović', 'petrovic ana')).toBe(true)
    expect(containsWords('Ana Petrović', 'na etr')).toBe(true)
  })

  it('does not find a word that is not there', () => {
    expect(containsWords('Ana Petrović', 'ana marko')).toBe(false)
  })

  it('finds everything for nothing typed', () => {
    expect(containsWords('Ana Petrović', '')).toBe(true)
    expect(containsWords('Ana Petrović', '   ')).toBe(true)
    expect(containsWords('', '')).toBe(true)
  })
})
