import { expect, test } from '@playwright/test'
import { rpc, sql, tokenFor } from './api.ts'
import { signInAs } from './helpers.ts'
import {
  clearTeacherCv,
  forgetStranger,
  giveTeacherACv,
  setEnrolmentSettings,
  signUp,
  TEACHER,
} from './stranger.ts'

// The page of somebody who signed up is made for a phone: this runs on the phone-sized screens.
test.describe('the student who signed up, on a phone', () => {
  test.beforeEach(() => forgetStranger())
  test.afterEach(async ({ request }) => {
    forgetStranger()
    await clearTeacherCv(request)
    await setEnrolmentSettings(request, { enabled: false })
  })

  test('sees who offered, reads a CV and chooses', async ({ page, request }) => {
    test.setTimeout(120_000)
    const first = `Telefon${Date.now().toString(36)}`
    await setEnrolmentSettings(request, { enabled: true, offers: 1 })
    await giveTeacherACv(request)
    const id = await signUp(request, first)
    await rpc(request, await tokenFor(request, TEACHER), 'offer_enrolment', { p_request_id: id })
    sql('select private.advance_enrolments();')

    await signInAs(page, 'Stranac (bez profila)')
    await expect(page).toHaveURL(/\/upis$/)
    await expect(page.getByRole('heading', { name: 'Prijava za časove', level: 1 })).toBeVisible()
    const offers = page.getByRole('list', { name: 'Ponude nastavnika' })
    await expect(offers).toContainText('Ana Nikolić')
    // nothing sticks out of the screen
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(scrolls).toBe(false)

    await page.getByRole('button', { name: 'Prihvati ponudu: Ana Nikolić' }).click()
    await page
      .getByRole('dialog', { name: 'Prihvatanje ponude' })
      .getByRole('button', { name: 'Prihvati ponudu' })
      .click()
    await expect(page.getByText('Nastavnik ti je dodeljen.')).toBeVisible()
    await page.getByRole('link', { name: 'Otvori aplikaciju' }).click()
    await expect(page.getByRole('heading', { name: 'Moji časovi', level: 1 })).toBeVisible()
  })
})
