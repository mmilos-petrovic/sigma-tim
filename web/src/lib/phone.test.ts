import { describe, expect, it } from 'vitest'
import { formatPhone, INVALID_PHONE, normalizePhone, PHONE_EXAMPLE, phoneProblem } from './phone'

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

  it('reads a number that starts with a single 0 as a Serbian one, the way it is written at home', () => {
    expect(normalizePhone('064 1234 567')).toBe('+381641234567')
    expect(normalizePhone('0641234567')).toBe('+381641234567')
    expect(normalizePhone('064/123-4567')).toBeNull() // a slash is not a separator
    expect(normalizePhone('011 1234 567')).toBe('+381111234567')
    expect(normalizePhone('063 123 456')).toBe('+38163123456')
    expect(normalizePhone('0')).toBeNull()
    expect(normalizePhone('0641')).toBeNull() // too short to be a number
  })

  it('refuses what is not an international number', () => {
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
    expect(phoneProblem('0641', true)).toBe(INVALID_PHONE)
    expect(phoneProblem('381 64 123 4567', false)).toBe(INVALID_PHONE)
    expect(INVALID_PHONE).toContain(PHONE_EXAMPLE)
    expect(PHONE_EXAMPLE).toBe('064 1234 567')
  })

  it('accepts a good number', () => {
    expect(phoneProblem('+381 64 123 4567', true)).toBeNull()
    expect(phoneProblem('00381641234567', false)).toBeNull()
    expect(phoneProblem('064 123 4567', true)).toBeNull()
  })
})

describe('showing a number the way it is written at home', () => {
  it('writes a Serbian number with a 0 instead of +381, in groups of 3, 4 and the rest', () => {
    expect(formatPhone('+381644994235')).toBe('064 4994 235')
    expect(formatPhone('+381641110000')).toBe('064 1110 000')
    expect(formatPhone('+381111234567')).toBe('011 1234 567') // Belgrade
  })

  it('ends with a group of two when the number is one digit shorter', () => {
    expect(formatPhone('+38163123456')).toBe('063 1234 56')
  })

  it('leaves no trailing space on a number that ends after two groups', () => {
    expect(formatPhone('+381112345')).toBe('011 2345')
  })

  it('leaves a number from another country as it is', () => {
    expect(formatPhone('+14155552671')).toBe('+14155552671')
    expect(formatPhone('+38598123456')).toBe('+38598123456') // +385 is Croatia, not +381
  })

  it('does not touch what is not a number', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone('abc')).toBe('abc')
  })

  it('gives back the same number once it is typed again', () => {
    for (const number of ['+381644994235', '+38163123456', '+381111234567']) {
      expect(normalizePhone(formatPhone(number))).toBe(number)
    }
  })
})
