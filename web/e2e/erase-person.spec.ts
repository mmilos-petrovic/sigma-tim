import { expect, test, type Page } from '@playwright/test'
import { rpc, select, sql, tokenFor } from './api.ts'
import { at, belgradeDate, pastLesson } from './belgrade.ts'
import { signInAs } from './helpers.ts'

// Erasing a student on request, by the administrator, against the local stack: everything about the person goes, the
// lesson that took place stays without them, and a parent is refused until the child is gone.

const ANA = 'ana.nikolic@example.test'

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const menu = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Glavna navigacija' })
    .getByRole('link', { name, exact: true })
    .click()

/** Everything these runs created: nobody else's emails start like this. */
const purge = () =>
  sql(`
    set session_replication_role = replica;
    delete from public.lesson_students where student_id in (
      select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email like 'e2e-erase-%');
    delete from public.lessons l where l.teacher_id = (select id from public.profiles where email = '${ANA}')
      and not exists (select 1 from public.lesson_students ls where ls.lesson_id = l.id)
      and l.created_at > now() - interval '1 hour' and l.start_at < now();
    delete from public.parent_students where student_id in (
      select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email like 'e2e-erase-%');
    delete from public.enrolment_requests where applicant_id in (select id from public.profiles where email like 'e2e-erase-%');
    delete from public.students where profile_id in (select id from public.profiles where email like 'e2e-erase-%');
    delete from public.parents where profile_id in (select id from public.profiles where email like 'e2e-erase-%');
    delete from public.person_phones where profile_id in (select id from public.profiles where email like 'e2e-erase-%');
    delete from public.profiles where email like 'e2e-erase-%';
    delete from auth.users where email like 'e2e-erase-%';`)

const count = (query: string) => Number(sql(query))

test.describe('erasing a student on request', () => {
  test.use({ actionTimeout: 15_000 })

  test('everything about the person goes, the lesson that took place stays, and the parent is refused until the child is gone', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)
    const run = Date.now().toString(36)
    const ana = await tokenFor(request, ANA)
    const [subject] = await select<{ id: string }>(
      request,
      ana,
      'subjects?select=id&name=eq.Matematika',
    )
    const [location] = await select<{ id: string }>(
      request,
      ana,
      'locations?select=id&name=eq.Glavna lokacija',
    )
    const email = (key: string) => `e2e-erase-${key}-${run}@example.test`
    const surname = (key: string) => `Zahtev${key}${run.replace(/\d/g, 'x')}`
    const fullName = (key: string) => `Ucenik ${surname(key)}`

    // a: a lesson still to come and a parent; b: a lesson that took place, with a sign-in
    const a = await rpc<string>(request, ana, 'add_student', {
      p_email: email('a'),
      p_first_name: 'Ucenik',
      p_last_name: surname('a'),
      p_phone: '+381600000321',
    })
    const b = await rpc<string>(request, ana, 'add_student', {
      p_email: email('b'),
      p_first_name: 'Ucenik',
      p_last_name: surname('b'),
    })
    await rpc(request, ana, 'add_parent_to_student', {
      p_student_id: a,
      p_email: email('pa'),
      p_first_name: 'Roditelj',
      p_last_name: surname('a'),
      p_phone: '+381600000322',
    })
    const day = belgradeDate(2)
    await rpc(request, ana, 'schedule_lesson', {
      p_subject_id: subject.id,
      p_location_id: location.id,
      p_room_id: null,
      p_start_at: at(day, '17:15'),
      p_end_at: at(day, '18:15'),
      p_student_ids: [a],
    })
    const held = pastLesson({
      teacherEmail: ANA,
      studentId: b,
      start: at(belgradeDate(-2), '12:15'),
      held: true,
      paid: true,
    })
    // signing in links a Google account to the profile of the same email
    sql(`
      insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (gen_random_uuid(), 'authenticated', 'authenticated', '${email('b')}', now(),
              '{"provider":"google","providers":["google"]}', '{}', now(), now());`)
    expect(
      count(
        `select count(*) from public.profiles where email = '${email('b')}' and user_id is not null`,
      ),
    ).toBe(1)

    try {
      await signInAs(page, 'Admin')
      await expect(page.getByRole('heading', { name: 'Administracija', level: 1 })).toBeVisible()

      await test.step('a parent with a child cannot be erased, and the page says what to do first', async () => {
        await menu(page, 'Roditelji')
        await expect(page.getByRole('heading', { name: 'Roditelji', level: 1 })).toBeVisible()
        await page.getByLabel('Pretraga po imenu ili emailu').fill(`e2e-erase-pa-${run}`)
        const parentRow = page.getByRole('row', { name: new RegExp(`Roditelj ${surname('a')}`) })
        await expect(parentRow).toContainText(fullName('a'))
        await expect(parentRow).toContainText('Prvo obrišite učenika ili uklonite roditelja')
        await expect(parentRow.getByRole('button')).toHaveCount(0)
      })

      await menu(page, 'Učenici')
      await expect(page.getByRole('heading', { name: 'Učenici', level: 1 })).toBeVisible()
      await page.getByLabel('Pretraga po imenu ili emailu').fill('e2e-erase')
      const rowOf = (key: string) => page.getByRole('row', { name: new RegExp(surname(key)) })
      const eraseButton = (key: string) =>
        rowOf(key).getByRole('button', { name: `Obriši na zahtev učenika ${fullName(key)}` })

      await test.step('the student with a lesson that took place is erased, and the lesson stays', async () => {
        await expect(rowOf('b')).toBeVisible()
        // the plain delete is refused for this student, the erase is not
        await expect(rowOf('b').getByRole('button', { name: /^Obriši učenika/ })).toHaveCount(0)
        await eraseButton('b').click()
        const confirm = dialog(page, 'Brisanje na zahtev')
        await expect(confirm.getByText(/Održani časovi ostaju/)).toContainText('časova: 1')
        await confirm.getByRole('button', { name: 'Obriši sve podatke' }).click()
        await expect(confirm.getByRole('alert')).toHaveText('Upišite ime i prezime radi potvrde.')
        await confirm.getByLabel(/Za potvrdu upišite/).fill(fullName('b'))
        await confirm.getByRole('button', { name: 'Obriši sve podatke' }).click()
        await expect(page.getByRole('status')).toHaveText('Podaci osobe su obrisani.')
        await expect(rowOf('b')).toHaveCount(0)

        expect(count(`select count(*) from public.profiles where email = '${email('b')}'`)).toBe(0)
        expect(count(`select count(*) from public.students where id = '${b}'`)).toBe(0)
        expect(count(`select count(*) from auth.users where email = '${email('b')}'`)).toBe(0)
        expect(
          count(`select count(*) from public.lessons where id = '${held}' and outcome = 'held'`),
        ).toBe(1)
        expect(
          count(`select count(*) from public.lesson_students where lesson_id = '${held}'`),
        ).toBe(0)
      })

      await test.step('the student with a lesson to come is erased, the parent and the notices go with them', async () => {
        const teacherId = sql(`select id from public.profiles where email = '${ANA}'`)
        await eraseButton('a').click()
        const confirm = dialog(page, 'Brisanje na zahtev')
        await expect(confirm.getByText(/Časovi koji nisu počeli/)).toContainText('časova: 1')
        await confirm.getByLabel(/Za potvrdu upišite/).fill(fullName('a'))
        await confirm.getByRole('button', { name: 'Obriši sve podatke' }).click()
        await expect(page.getByRole('status')).toHaveText('Podaci osobe su obrisani.')
        await expect(rowOf('a')).toHaveCount(0)

        expect(
          count(
            `select count(*) from public.profiles where email in ('${email('a')}', '${email('pa')}')`,
          ),
        ).toBe(0)
        expect(
          count(
            `select count(*) from public.person_phones where phone in ('+381600000321', '+381600000322')`,
          ),
        ).toBe(0)
        expect(
          count(
            `select count(*) from public.lessons where teacher_id = '${teacherId}' and start_at = '${at(day, '17:15')}'`,
          ),
        ).toBe(0)
        // the teacher was told that the lesson is cancelled, and no notice names the erased student
        expect(
          count(
            `select count(*) from public.notifications where recipient_id = '${teacherId}' and payload::text like '%${surname('a')}%'`,
          ),
        ).toBe(0)
        expect(
          count(
            `select count(*) from public.notifications where recipient_id = '${teacherId}' and kind = 'lesson_cancelled' and created_at > now() - interval '10 minutes' and payload->>'start_at' = to_char('${at(day, '17:15')}'::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`,
          ),
        ).toBeGreaterThan(0)
      })

      await test.step('the address can be added again', async () => {
        await rpc(request, ana, 'add_student', {
          p_email: email('a'),
          p_first_name: 'Ucenik',
          p_last_name: surname('a'),
        })
        expect(count(`select count(*) from public.profiles where email = '${email('a')}'`)).toBe(1)
      })

      await test.step('the parent page forgets the erased parent', async () => {
        await menu(page, 'Roditelji')
        await expect(page.getByRole('heading', { name: 'Roditelji', level: 1 })).toBeVisible()
        await page.getByLabel('Pretraga po imenu ili emailu').fill('e2e-erase')
        await expect(
          page.getByRole('row', { name: new RegExp(`Roditelj ${surname('a')}`) }),
        ).toHaveCount(0)
      })
    } finally {
      sql(`
        set session_replication_role = replica;
        delete from public.lesson_students where lesson_id = '${held}';
        delete from public.lessons where id = '${held}';`)
      purge()
    }
  })
})
