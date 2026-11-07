import { describe, expect, it } from 'vitest'
import { INVALID_PHONE, normalizePhone, phoneProblem } from './phone'

describe('normalising a phone number the way the database does', () => {
  it('removes spaces, dashes, dots and brackets', () => {
    expect(normalizePhone('+381 64 123 4567')).toBe('+381641234567')
    expect(normalizePhone('+381-64-123.4567')).toBe('+381641234567')
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671')
    expect(normalizePhone('  +381641234567  ')).toBe('+381641234567')
  })

  it('turns a leading 00 into a +', () => {
    expect(normalizePhone('00381641234567')).toBe('+381641234567')
    expect(normalizePhone('00 381 64 123 4567')).toBe('+381641234567')
  })

  it('takes seven to fifteen digits', () => {
    expect(normalizePhone('+1234567')).toBe('+1234567')
    expect(normalizePhone('+123456789012345')).toBe('+123456789012345')
    expect(normalizePhone('+123456')).toBeNull()
    expect(normalizePhone('+1234567890123456')).toBeNull()
  })

  it('refuses what is not an international number', () => {
    expect(normalizePhone('0641234567')).toBeNull() // no country
    expect(normalizePhone('381641234567')).toBeNull() // no +
    expect(normalizePhone('+0641234567')).toBeNull() // a country code does not start with 0
    expect(normalizePhone('+38164abc4567')).toBeNull()
    expect(normalizePhone('+381 64 123 4567 ext 5')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
  })
})

describe('what is wrong with a number a person typed', () => {
  it('asks for a required number that is empty', () => {
    expect(phoneProblem('', true)).toBe('Unesite broj telefona.')
    expect(phoneProblem('   ', true)).toBe('Unesite broj telefona.')
  })

  it('lets an optional number stay empty', () => {
    expect(phoneProblem('', false)).toBeNull()
    expect(phoneProblem('  ', false)).toBeNull()
  })

  it('explains a number that is not one, with an example, whether it is required or not', () => {
    expect(phoneProblem('064 123 4567', true)).toBe(INVALID_PHONE)
    expect(phoneProblem('064 123 4567', false)).toBe(INVALID_PHONE)
    expect(INVALID_PHONE).toContain('+381 64 123 4567')
  })

  it('accepts a good number', () => {
    expect(phoneProblem('+381 64 123 4567', true)).toBeNull()
    expect(phoneProblem('00381641234567', false)).toBeNull()
  })
})
