import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseLocation, readLastLocation, writeLastLocation } from './locationFilter'

const places = [
  { id: 'l-zemun', name: 'Zemun', rooms: [] },
  { id: 'l-main', name: 'Glavna lokacija', rooms: [] },
  { id: 'l-cukarica', name: 'Čukarica', rooms: [] },
]

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('choosing the location whose colleagues are shown', () => {
  it('keeps the one that was chosen before, when it is still one of the teacher’s', () => {
    expect(chooseLocation(places, 'l-zemun')).toBe('l-zemun')
  })

  it('takes the first by name when nothing was chosen before', () => {
    expect(chooseLocation(places, null)).toBe('l-cukarica') // Č sorts with C, before G and Z
  })

  it('takes the first by name when the chosen one is no longer the teacher’s', () => {
    expect(chooseLocation(places, 'l-gone')).toBe('l-cukarica')
  })

  it('has nothing to choose without a location', () => {
    expect(chooseLocation([], 'l-main')).toBeNull()
    expect(chooseLocation([], null)).toBeNull()
  })

  it('does not change the list it was given', () => {
    const before = places.map((p) => p.id)
    chooseLocation(places, null)
    expect(places.map((p) => p.id)).toEqual(before)
  })
})

describe('remembering the choice in the browser', () => {
  it('reads back what was written, for the same teacher only', () => {
    writeLastLocation('p-ana', 'l-zemun')
    expect(readLastLocation('p-ana')).toBe('l-zemun')
    expect(readLastLocation('p-marko')).toBeNull()
  })

  it('reads as nothing before anything was written', () => {
    expect(readLastLocation('p-ana')).toBeNull()
  })

  it('works without storage: it reads as nothing and writing does no harm', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readLastLocation('p-ana')).toBeNull()
    expect(() => writeLastLocation('p-ana', 'l-zemun')).not.toThrow()
  })
})
