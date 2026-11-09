import { describe, expect, it } from 'vitest'
import { cleanReason, MAX_REASON } from './reason'

describe('the reason for cancelling', () => {
  it('is at most 200 characters, like the database says', () => {
    expect(MAX_REASON).toBe(200)
  })

  it('is trimmed before it is sent', () => {
    expect(cleanReason('  Bolestan sam  ')).toBe('Bolestan sam')
    expect(cleanReason('\n Ne mogu\t')).toBe('Ne mogu')
  })

  it('is nothing when nothing was typed, or only blanks', () => {
    expect(cleanReason('')).toBeNull()
    expect(cleanReason('   ')).toBeNull()
    expect(cleanReason(' \n\t ')).toBeNull()
    expect(cleanReason(null)).toBeNull()
    expect(cleanReason(undefined)).toBeNull()
  })

  it('keeps the line breaks inside', () => {
    expect(cleanReason('Prvi red\nDrugi red')).toBe('Prvi red\nDrugi red')
  })
})
