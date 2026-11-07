import { expect, test, type Page } from '@playwright/test'
import { rpc, select, sql, tokenFor } from './api.ts'
import { localEnv, signInAs } from './helpers.ts'

const row = (page: Page, text: string) => page.getByRole('row', { name: new RegExp(text) })
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })

async function openTeachers(page: Page) {
  await signInAs(page, 'Admin')
  await expect(page.getByRole('heading', { name: 'Administracija', level: 1 })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Glavna navigacija' })
    .getByRole('link', { name: 'Nastavnici' })
    .click()
  await expect(page.getByRole('heading', { name: 'Nastavnici', level: 1 })).toBeVisible()
}

async function confirmErase(page: Page, email: string, name: string) {
  await row(page, email).getByRole('button', { name: 'Obriši nalog' }).click()
  const confirm = dialog(page, 'Brisanje naloga')
  await expect(confirm.getByText('Budući časovi koji se brišu: 0')).toBeVisible()

  // the name has to be typed first
  await confirm.getByRole('button', { name: 'Obriši nalog' }).click()
  await expect(confirm.getByRole('alert')).toHaveText(
    'Upišite ime i prezime nastavnika radi potvrde.',
  )
  await confirm.getByLabel(/Za potvrdu upišite/).fill(name)
  await confirm.getByRole('button', { name: 'Obriši nalog' }).click()
}

test.describe('erasing a teacher', () => {
  test('a teacher who never taught is deleted completely, and the email is free again', async ({
    page,
    request,
  }) => {
    const run = Date.now().toString(36)
    const email = `erase.${run}@example.test`
    const name = `E2E Brisanje${run}`
    const admin = await tokenFor(request, 'admin@example.test')
    const [math] = await select<{ id: string }>(
      request,
      admin,
      'subjects?name=eq.Matematika&select=id',
    )
    const [main] = await select<{ id: string }>(
      request,
      admin,
      'locations?name=eq.Glavna lokacija&select=id',
    )

    await openTeachers(page)
    await page.getByRole('button', { name: 'Dodaj nastavnika' }).click()
    const add = dialog(page, 'Dodaj nastavnika')
    await add.getByLabel('Email').fill(email)
    await add.getByLabel('Ime', { exact: true }).fill('E2E')
    await add.getByLabel('Prezime').fill(`Brisanje${run}`)
    await add.getByLabel('Telefon').fill('+381 64 123 4567')
    await add.getByRole('checkbox', { name: 'Matematika' }).check()
    await add.getByRole('checkbox', { name: 'Glavna lokacija' }).check()
    await add.getByRole('button', { name: 'Dodaj' }).click()
    await expect(row(page, email)).toBeVisible()

    await confirmErase(page, email, name)
    await expect(page.getByRole('status')).toHaveText('Nalog je obrisan.')
    await expect(row(page, email)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Obrisani nalozi' })).toHaveCount(0)

    // nothing is left in the database, and the same address can be used again
    expect(await select(request, admin, `profiles?email=eq.${email}&select=id`)).toEqual([])
    await rpc(request, admin, 'create_teacher', {
      p_email: email,
      p_first_name: 'E2E',
      p_last_name: `Ponovo${run}`,
      p_subject_ids: [math.id],
      p_location_ids: [main.id],
      p_phone: '+381641234567',
    })
    expect(await select(request, admin, `profiles?email=eq.${email}&select=id`)).toHaveLength(1)

    // tidy up: the second profile has no lessons, so the same screen can remove it
    await page.reload()
    await confirmErase(page, email, `E2E Ponovo${run}`)
    await expect(row(page, email)).toHaveCount(0)
  })

  test('a teacher with a lesson that took place stays as a record, and the lesson stays', async ({
    page,
    request,
  }) => {
    const run = Date.now().toString(36)
    const email = `erase.history.${run}@example.test`
    const admin = await tokenFor(request, 'admin@example.test')
    const [math] = await select<{ id: string }>(
      request,
      admin,
      'subjects?name=eq.Matematika&select=id',
    )
    const [main] = await select<{ id: string }>(
      request,
      admin,
      'locations?name=eq.Glavna lokacija&select=id',
    )
    const teacherId = await rpc<string>(request, admin, 'create_teacher', {
      p_email: email,
      p_first_name: 'E2E',
      p_last_name: `Evidencija${run}`,
      p_subject_ids: [math.id],
      p_location_ids: [main.id],
      p_phone: '+381641234567',
    })

    try {
      // a lesson that already took place cannot be created through the app
      sql(`
        insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin, confirmed_at)
        select '${teacherId}', s.id, l.id,
               date_trunc('hour', now()) - interval '3 hours', date_trunc('hour', now()) - interval '2 hours',
               'confirmed', 'teacher', now()
          from (select id from public.subjects limit 1) s, (select id from public.locations limit 1) l;
      `)

      await openTeachers(page)
      await confirmErase(page, email, `E2E Evidencija${run}`)
      await expect(page.getByRole('status')).toHaveText(
        'Nalog je obrisan. Održani časovi ostaju u evidenciji.',
      )

      // out of the working list, in the record of erased accounts, without an email and without buttons
      await expect(row(page, email)).toHaveCount(0)
      const records = page.getByRole('region', { name: 'Obrisani nalozi' })
      await expect(records.getByText(`E2E Evidencija${run}`)).toBeVisible()
      await expect(records.getByRole('button')).toHaveCount(0)
      await expect(page.getByText(email)).toHaveCount(0)

      // the database agrees: the profile is a record, the lesson is still there for the admin, the address is free
      const [profile] = await select<{ erased_at: string | null; user_id: string | null }>(
        request,
        admin,
        `profiles?id=eq.${teacherId}&select=erased_at,user_id`,
      )
      expect(profile.erased_at).not.toBeNull()
      expect(profile.user_id).toBeNull()
      expect(
        await select(request, admin, `lessons?teacher_id=eq.${teacherId}&select=id`),
      ).toHaveLength(1)
      expect(await select(request, admin, `profiles?email=eq.${email}&select=id`)).toEqual([])

      // a record can be neither reactivated nor erased again
      const { url, key } = localEnv()
      const refused = await request.post(`${url}/rest/v1/rpc/reactivate_teacher`, {
        headers: { apikey: key, Authorization: `Bearer ${admin}` },
        data: { p_teacher_id: teacherId },
      })
      expect(refused.status()).toBe(409)
    } finally {
      // a lesson that took place cannot be deleted through the app either
      sql(`
        set session_replication_role = replica;
        delete from public.lessons where teacher_id = '${teacherId}';
        delete from public.teacher_subjects where teacher_id = '${teacherId}';
        delete from public.teachers where profile_id = '${teacherId}';
        delete from public.profiles where id = '${teacherId}';
      `)
    }
  })
})
