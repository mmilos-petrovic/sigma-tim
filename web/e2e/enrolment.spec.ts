import { expect, test } from '@playwright/test'
import { sql } from './api.ts'
import { signInAs, signOut } from './helpers.ts'
import {
  clearTeacherCv,
  forgetStranger,
  giveTeacherACv,
  noticesFor,
  setEnrolmentSettings,
  signUp,
  STRANGER,
  TEACHER,
} from './stranger.ts'

const menu = (page: import('@playwright/test').Page, name: string | RegExp) =>
  page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name }).click()

test.describe('signing up for lessons, from the sign-up to a teacher', () => {
  test.beforeEach(() => forgetStranger())
  test.afterEach(async ({ request }) => {
    forgetStranger()
    await clearTeacherCv(request)
    await setEnrolmentSettings(request, { enabled: false })
  })

  test('a teacher offers, the student chooses and becomes their student', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const run = Date.now().toString(36)
    const first = `Upis${run}`
    // the choice opens after one offer, so the test does not wait for days
    await setEnrolmentSettings(request, { enabled: true, offers: 1 })
    await giveTeacherACv(request)
    await signUp(request, first)

    await test.step('the teacher of the subject sees the request and offers', async () => {
      await signInAs(page, 'Nastavnik')
      await expect(
        page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', {
          name: /^Neraspoređeni učenici \(\d+\)$/,
        }),
      ).toBeVisible()
      await menu(page, /^Neraspoređeni učenici/)
      await expect(
        page.getByRole('heading', { name: 'Neraspoređeni učenici', level: 1 }),
      ).toBeVisible()
      const card = page.getByRole('article', { name: `${first} Prijavljen` })
      await expect(card).toContainText('Matematika · Učenik')
      await expect(card.getByRole('link', { name: '064 5551 234' })).toBeVisible()
      await expect(card).toContainText('Treba mi pomoć iz matematike')
      await card.getByRole('button', { name: /^Ponudi se/ }).click()
      await expect(page.getByRole('status')).toContainText('Ponudili ste se')
      await expect(card.getByText('Ponudili ste se.')).toBeVisible()
    })

    await test.step('the student is told, and the choice opens', async () => {
      expect(noticesFor(STRANGER)).toContain('enrolment_offer')
      // the job runs every minute; here it is run by hand
      sql('select private.advance_enrolments();')
      expect(noticesFor(STRANGER)).toContain('enrolment_choice_open')
    })

    await test.step('the student sees the teacher, with the phone, and chooses', async () => {
      await signOut(page)
      await signInAs(page, 'Stranac (bez profila)')
      await expect(page).toHaveURL(/\/upis$/)
      const offers = page.getByRole('list', { name: 'Ponude nastavnika' })
      await expect(offers).toContainText('Ana Nikolić')
      await page.getByRole('button', { name: 'Izaberi: Ana Nikolić' }).click()
      const dialog = page.getByRole('dialog', { name: 'Izbor nastavnika' })
      await dialog.getByRole('button', { name: 'Izaberi' }).click()
      await expect(page.getByText('Nastavnik ti je dodeljen.')).toBeVisible()
      await page.getByRole('link', { name: 'Otvori aplikaciju' }).click()
      await expect(page.getByRole('heading', { name: 'Moji časovi', level: 1 })).toBeVisible()
    })

    await test.step('the database has a student of that teacher, and the teacher was told', async () => {
      const students = sql(`
        select count(*) from public.students s
          join public.profiles p on p.id = s.profile_id
         where p.email = '${STRANGER}'
           and s.teacher_id = (select id from public.profiles where email = '${TEACHER}');
      `)
      expect(students).toBe('1')
      expect(noticesFor(TEACHER)).toContain('enrolment_chosen')
    })

    await test.step('the request is gone from the pool of the teachers', async () => {
      await signOut(page)
      await signInAs(page, 'Nastavnik')
      await menu(page, /^Neraspoređeni učenici/)
      await expect(page.getByRole('article', { name: `${first} Prijavljen` })).toHaveCount(0)
    })
  })

  test('a teacher cannot offer without the text of the CV', async ({ page, request }) => {
    test.setTimeout(120_000)
    const first = `Bez${Date.now().toString(36)}`
    await setEnrolmentSettings(request, { enabled: true })
    await clearTeacherCv(request)
    await signUp(request, first)

    await signInAs(page, 'Nastavnik')
    await menu(page, /^Neraspoređeni učenici/)
    await expect(page.getByRole('note')).toContainText('napišite opis u svom CV-u')
    await expect(
      page
        .getByRole('article', { name: `${first} Prijavljen` })
        .getByRole('button', { name: /^Ponudi se/ }),
    ).toBeDisabled()
  })

  test('the administrator switches the form on and assigns a teacher at once', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const first = `Dodela${Date.now().toString(36)}`
    await setEnrolmentSettings(request, { enabled: false })

    await test.step('with the form off the front page shows only the phone', async () => {
      await page.goto('/')
      await expect(page.getByText(/Za časove pozovite:/)).toBeVisible()
      await expect(page.getByLabel('Izaberi predmet iz kog želiš časove')).toHaveCount(0)
    })

    await test.step('the administrator switches it on', async () => {
      await signInAs(page, 'Admin')
      await menu(page, 'Prijave za časove')
      const settings = page.getByRole('form', { name: 'Podešavanja prijave' })
      await expect(settings.getByRole('checkbox')).not.toBeChecked()
      await settings.getByRole('checkbox').check()
      await settings.getByRole('button', { name: 'Sačuvaj podešavanja' }).click()
      await expect(page.getByRole('status')).toContainText('Podešavanja su sačuvana.')
    })

    await test.step('a sign-up shows in the list, and the administrator assigns Ana', async () => {
      await signUp(request, first)
      await page.reload()
      const card = page.getByRole('article', { name: `${first} Prijavljen` })
      await expect(card).toContainText('Čeka ponude')
      await card.getByRole('button', { name: /^Dodeli nastavnika/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Dodela nastavnika' })
      await dialog.getByLabel('Nastavnik').selectOption({ label: 'Ana Nikolić' })
      await dialog.getByRole('button', { name: 'Dodeli' }).click()
      await expect(page.getByRole('status')).toContainText('Ana Nikolić je dodeljen')
    })

    await test.step('Ana has a new student, and both were told', async () => {
      expect(
        sql(`
          select count(*) from public.students s join public.profiles p on p.id = s.profile_id
           where p.email = '${STRANGER}'
             and s.teacher_id = (select id from public.profiles where email = '${TEACHER}');
        `),
      ).toBe('1')
      expect(noticesFor(STRANGER)).toContain('enrolment_assigned')
      expect(noticesFor(TEACHER)).toContain('enrolment_assigned')
    })
  })
})
