import { AdminError, type ActionKey } from './adminApi'
import { explainError } from './errors'

/** The message the database's own duplicate error gets, for the cases the screen catches first. */
export const duplicateMessage = (action: ActionKey) => explainError(new AdminError('23505'), action)

/** Whether two names are the same to a person: "Fizika" and " fizika " are, even though the database tells them apart. */
export const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('sr') === b.trim().toLocaleLowerCase('sr')

export const hasName = (names: readonly string[], name: string) =>
  names.some((other) => sameName(other, name))
