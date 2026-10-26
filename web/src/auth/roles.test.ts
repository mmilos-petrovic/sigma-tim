import { describe, expect, it } from 'vitest'
import { personas } from '../test/fixtures'
import { contextForPath, contextsOf, homePath, resolveDestination } from './roles'

describe('contextsOf', () => {
  it('lists the contexts of each account in a fixed order', () => {
    expect(contextsOf(personas.admin)).toEqual(['admin'])
    expect(contextsOf(personas.adminTeacher)).toEqual(['admin', 'teacher'])
    expect(contextsOf(personas.teacher)).toEqual(['teacher'])
    expect(contextsOf(personas.student)).toEqual(['student'])
    expect(contextsOf(personas.parent)).toEqual(['parent'])
  })

  it('is empty without a profile and for a profile with no role in force', () => {
    expect(contextsOf(null)).toEqual([])
    expect(contextsOf(personas.deactivatedTeacher)).toEqual([])
  })

  it('orders any combination the same way', () => {
    const all = { ...personas.admin, isTeacher: true, isStudent: true, isParent: true }
    expect(contextsOf(all)).toEqual(['admin', 'teacher', 'student', 'parent'])
    expect(contextsOf({ ...personas.parent, isTeacher: true })).toEqual(['teacher', 'parent'])
  })
})

describe('contextForPath', () => {
  it('maps a path to the context it belongs to', () => {
    expect(contextForPath('/administracija')).toBe('admin')
    expect(contextForPath('/moj-raspored')).toBe('teacher')
    expect(contextForPath('/ucenik')).toBe('student')
    expect(contextForPath('/roditelj')).toBe('parent')
  })

  it('covers sub-paths, queries and hashes, but only at a segment boundary', () => {
    expect(contextForPath('/moj-raspored/nedelja/2026-11-02')).toBe('teacher')
    expect(contextForPath('/moj-raspored?dan=1')).toBe('teacher')
    expect(contextForPath('/ucenik#top')).toBe('student')
    expect(contextForPath('/moj-raspored-x')).toBeNull()
  })

  it('knows nothing about other paths', () => {
    expect(contextForPath('/')).toBeNull()
    expect(contextForPath('/prijava')).toBeNull()
    expect(contextForPath('/izbor')).toBeNull()
  })
})

describe('homePath', () => {
  it('is the root of each context', () => {
    expect(homePath('admin')).toBe('/administracija')
    expect(homePath('teacher')).toBe('/moj-raspored')
    expect(homePath('student')).toBe('/ucenik')
    expect(homePath('parent')).toBe('/roditelj')
  })
})

describe('resolveDestination', () => {
  const none = { lastContext: null, returnTo: null }

  it('sends someone without any role to the "not a member" page', () => {
    expect(resolveDestination({ contexts: [], ...none })).toBe('/nije-clan')
    expect(
      resolveDestination({ contexts: [], lastContext: 'teacher', returnTo: '/moj-raspored' }),
    ).toBe('/nije-clan')
  })

  it('goes straight to the only context', () => {
    expect(resolveDestination({ contexts: ['student'], ...none })).toBe('/ucenik')
    expect(resolveDestination({ contexts: ['parent'], lastContext: 'admin', returnTo: null })).toBe(
      '/roditelj',
    )
  })

  it('asks which context when there are several and none is remembered', () => {
    expect(resolveDestination({ contexts: ['admin', 'teacher'], ...none })).toBe('/izbor')
  })

  it('returns to the remembered context when it is still held', () => {
    expect(
      resolveDestination({
        contexts: ['admin', 'teacher'],
        lastContext: 'teacher',
        returnTo: null,
      }),
    ).toBe('/moj-raspored')
    expect(
      resolveDestination({ contexts: ['admin', 'teacher'], lastContext: 'admin', returnTo: null }),
    ).toBe('/administracija')
  })

  it('asks again when the remembered context is no longer held', () => {
    expect(
      resolveDestination({ contexts: ['admin', 'teacher'], lastContext: 'parent', returnTo: null }),
    ).toBe('/izbor')
  })

  it('goes back to the page the person came from when it is one they may open', () => {
    expect(
      resolveDestination({
        contexts: ['admin', 'teacher'],
        lastContext: 'admin',
        returnTo: '/moj-raspored/nedelja?x=1',
      }),
    ).toBe('/moj-raspored/nedelja?x=1')
    expect(resolveDestination({ contexts: ['student'], ...none, returnTo: '/ucenik/casovi' })).toBe(
      '/ucenik/casovi',
    )
  })

  it('ignores a return page of a context the person does not hold, or that is not a context page', () => {
    expect(
      resolveDestination({ contexts: ['student'], lastContext: null, returnTo: '/administracija' }),
    ).toBe('/ucenik')
    expect(resolveDestination({ contexts: ['student'], lastContext: null, returnTo: '/' })).toBe(
      '/ucenik',
    )
    expect(
      resolveDestination({ contexts: ['student'], lastContext: null, returnTo: '/negde' }),
    ).toBe('/ucenik')
  })
})
