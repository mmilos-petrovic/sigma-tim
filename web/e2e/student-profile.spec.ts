import { expect, test } from '@playwright/test'
import { sql } from './api.ts'
import { signInAs } from './helpers.ts'
import { forgetStranger, setEnrolmentSettings } from './stranger.ts'

// A student or a parent a teacher added confirms the profile once before anything else; afterwards the gear in the header
// leads to it, and the student can ask for lessons in another subject. On the phone-sized screens, against the local stack.
const LUKA = 'ucenik1@example.test'

const confirmed = (on: boolean) =>
  sql(
    `update public.profiles set profile_confirmed_at = ${on ? 'now()' : 'null'}
      where email = '${LUKA}';`,
  )

test.describe('the profile of a student, on a phone', () => {
  test.afterEach(async ({ request }) => {
    confirmed(true)
    // what the second request left behind
    sql(`
      delete from public.enrolment_requests
       where applicant_id = (select id from public.profiles where email = '${LUKA}');
      delete from public.notifications where kind like 'enrolment_%';
      delete from public.student_details
       where profile_id = (select id from public.profiles where email = '${LUKA}');
      -- what the seed gave the student, which the test changed
      update public.students set grade = '7'
       where profile_id = (select id from public.profiles where email = '${LUKA}');
      update public.person_phones set phone = '+381600000006'
       where profile_id = (select id from public.profiles where email = '${LUKA}');
    `)
    forgetStranger()
    await setEnrolmentSettings(request, { enabled: false })
  })

  test('confirms what the teacher entered, then changes it and asks for another subject', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    confirmed(false)
    await setEnrolmentSettings(request, { enabled: true })

    // 1. the only thing to see is the profile, with what the teacher entered
    await signInAs(page, 'Učenik')
    await expect(page).toHaveURL(/\/ucenik$/)
    await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible()
    await expect(page.getByText(/Proveri podatke koje je upisao nastavnik/)).toBeVisible()
    const form = page.getByRole('form', { name: 'Profil' })
    await expect(form.getByLabel('Škola')).toHaveValue('OŠ Vuk Karadžić')
    await expect(form.getByLabel('Razred')).toHaveValue('7')
    await expect(page.getByRole('heading', { name: 'Predstojeći časovi' })).toHaveCount(0)
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(scrolls).toBe(false)

    // 2. it needs the policy; then the lessons are there
    await form.getByRole('button', { name: 'Potvrdi podatke' }).click()
    await expect(page.getByRole('alert')).toContainText('Prihvatite politiku privatnosti')
    await form.getByRole('checkbox').check()
    await form.getByLabel('Telefon (nije obavezno)').fill('064 555 666')
    await form.getByRole('button', { name: 'Potvrdi podatke' }).click()
    await expect(page.getByRole('heading', { name: 'Predstojeći časovi' })).toBeVisible()
    expect(
      sql(
        `select count(*) from public.profiles where email = '${LUKA}' and profile_confirmed_at is not null;`,
      ).trim(),
    ).toBe('1')

    // 3. the gear leads to the profile, where everything can be changed
    await page.getByRole('link', { name: 'Podešavanja' }).click()
    await expect(page.getByRole('heading', { name: 'Podešavanja', level: 1 })).toBeVisible()
    await expect(page.getByLabel('Telefon (nije obavezno)')).toHaveValue('064 5556 66')
    await page.getByLabel('Razred').fill('8')
    await page.getByLabel('Deo grada (nije obavezno)').fill('Zemun')
    await page.getByRole('button', { name: 'Sačuvaj izmene' }).click()
    await expect(page.getByRole('status')).toContainText('Podaci su sačuvani.')
    expect(
      sql(
        `select grade from public.students where profile_id = (select id from public.profiles where email = '${LUKA}') limit 1;`,
      ).trim(),
    ).toBe('8')

    // 4. another subject: the tab is always there, only the subject is asked, and the profile is reused
    await page.goto('/ucenik')
    await page.getByRole('link', { name: 'Prijava za časove' }).click()
    const another = page.getByRole('region', { name: 'Nova prijava' })
    await another.getByLabel('Predmet').selectOption({ label: 'Hemija' })
    await another.getByRole('button', { name: 'Nova prijava' }).click()
    const card = page.getByRole('region', { name: 'Prijava za Hemija' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Tvoj zahtev je primljen')
    expect(
      sql(`
        select school || '|' || grade || '|' || coalesce(city_part, '') || '|' || (profile_completed_at is not null)
          from public.enrolment_requests
         where applicant_id = (select id from public.profiles where email = '${LUKA}');
      `).trim(),
    ).toBe('OŠ Vuk Karadžić|8|Zemun|true')

    // 5. and for a second subject too
    await another.getByLabel('Predmet').selectOption({ label: 'Fizika' })
    await another.getByRole('button', { name: 'Nova prijava' }).click()
    await expect(page.getByRole('region', { name: 'Prijava za Fizika' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Prijava za Hemija' })).toBeVisible()
  })
})
