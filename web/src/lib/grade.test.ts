import { describe, expect, it } from 'vitest'
import { formatGrade, GRADE_PROBLEM, gradeProblem } from './grade'

describe('formatGrade', () => {
  it('writes the number and the word', () => {
    expect(formatGrade('7')).toBe('7 razred')
    expect(formatGrade(' 12 ')).toBe('12 razred')
  })

  it('has nothing to say for no grade', () => {
    expect(formatGrade(null)).toBeNull()
    expect(formatGrade('  ')).toBeNull()
  })

  it('leaves an old entry that is not a number as it is', () => {
    expect(formatGrade('7a')).toBe('7a')
  })
})

describe('gradeProblem', () => {
  it('accepts nothing and a number of one or two digits', () => {
    for (const typed of ['', '  ', '1', '8', '12']) expect(gradeProblem(typed)).toBeNull()
  })

  it('refuses words, long numbers and mixes', () => {
    for (const typed of ['sedmi', '7a', '123', '7 razred', '-1']) {
      expect(gradeProblem(typed)).toBe(GRADE_PROBLEM)
    }
  })

  it('lets an old entry stay while it is not touched, but not a new one like it', () => {
    expect(gradeProblem('7a', '7a')).toBeNull()
    expect(gradeProblem('7b', '7a')).toBe(GRADE_PROBLEM)
  })
})
