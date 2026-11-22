import { describe, expect, it } from 'vitest'
import { kindLabel } from './notificationLabels'

describe('kindLabel', () => {
  it('names the alert for the administrator', () => {
    expect(kindLabel('delivery_alert')).toBe('Upozorenje da obaveštenja ne stižu (administratoru)')
  })

  it('shows a kind the app does not know as it is written', () => {
    expect(kindLabel('something_new')).toBe('something_new')
  })
})
