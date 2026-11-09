import { expect, test, type Page } from '@playwright/test'
import { rpc, select, sql, tokenFor } from './api.ts'
import { at, belgradeDate, pastLesson } from './belgrade.ts'
import { localEnv, signInAs } from './helpers.ts'

// Deleting students, by the teacher and by the administrator, against the local stack: a student with a lesson that was
// held stays for good, the others can go, with what is only about them.

const ANA = 'ana.nikolic@example.test'
const ADMIN = 'admin@example.test'

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const menu = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Glavna navigacija' }).getByRole('link', { name }).click()

/** Everything these runs created: nobody else's emails start like this. */
const purge = () =>
  sql(`
    set session_replication_role = replica;
    delete from public.lesson_students where student_id in (
      select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email like 'e2e-del-%');
    delete from public.lessons l where l.teacher_id = (select id from public.profiles where email = '${ANA}')
      and not exists (select 1 from public.lesson_students ls where ls.lesson_id = l.id)
      and l.created_at > now() - interval '1 hour' and l.start_at < now();
    delete from public.parent_students where student_id in (
      select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email like 'e2e-del-%');
    delete from public.takeover_requests where student_id in (
      select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email like 'e2e-del-%');
    delete from public.students where profile_id in (select id from public.profiles where email like 'e2e-del-%');
    delete from public.parents where profile_id in (select id from public.profiles where email like 'e2e-del-%');
    delete from public.profiles where email like 'e2e-del-%';`)

const count = (query: string) => Number(sql(query))

test.describe('deleting a student', () => {
  test.use({ actionTimeout: 15_000 })

  test('the teacher and the administrator delete students who never had a held lesson, and nobody deletes one who had', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(240_000)
    const run = Date.now().toString(36)
    const ana = await tokenFor(request, ANA)
    const admin = await tokenFor(request, ADMIN)
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
    const email = (key: string) => `e2e-del-${key}-${run}@example.test`
    const name = (key: string) => `Brisanje${key}${run.replace(/\d/g, 'x')}`
    const addStudent = (key: string, token = ana, teacherId?: string) =>
      rpc<string>(request, token, 'add_student', {
        p_email: email(key),
        p_first_name: 'Ucenik',
        p_last_name: name(key),
        p_teacher_id: teacherId,
      })

    const [teacher] = await select<{ id: string }>(
      request,
      ana,
      `profiles?select=id&email=eq.${ANA}`,
    )
    // a: has a lesson still to come and a parent; b: has a lesson that was held; c: has nothing
    const a = await addStudent('a')
    const b = await addStudent('b')
    const c = await addStudent('c')
    await rpc(request, ana, 'add_parent_to_student', {
      p_student_id: a,
      p_email: email('pa'),
      p_first_name: 'Roditelj',
      p_last_name: name('a'),
      p_phone: '+381600000777',
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
    pastLesson({
      teacherEmail: ANA,
      studentId: b,
      start: at(belgradeDate(-2), '12:15'),
      held: true,
      paid: false,
    })

    try {
      // ---- the teacher
      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      await menu(page, 'Učenici')
      await expect(page.getByRole('heading', { name: 'Učenici', level: 1 })).toBeVisible()

      const rowOf = (key: string) => page.getByRole('row', { name: new RegExp(name(key)) })
      await expect(rowOf('a')).toBeVisible()
      await expect(rowOf('a').getByRole('button', { name: /^Obriši učenika/ })).toBeVisible()
      // b has had a lesson that took place: no button, and the database says no however it is asked
      await expect(rowOf('b')).toBeVisible()
      await expect(rowOf('b').getByRole('button', { name: /^Obriši učenika/ })).toHaveCount(0)
      const { url, key } = localEnv()
      const refused = await request.post(`${url}/rest/v1/rpc/delete_student`, {
        headers: { apikey: key, Authorization: `Bearer ${ana}` },
        data: { p_student_id: b },
      })
      expect(refused.status()).toBe(409)
      expect(count(`select count(*) from public.students where id = '${b}'`)).toBe(1)

      await rowOf('a')
        .getByRole('button', { name: /^Obriši učenika/ })
        .click()
      const confirm = dialog(page, 'Brisanje učenika')
      await expect(confirm).toContainText(name('a'))
      await expect(confirm.getByText(/Zakazani časovi koji će biti otkazani/)).toContainText('1')
      await confirm.getByRole('button', { name: 'Obriši' }).click()
      await expect(page.getByRole('status')).toHaveText('Učenik je obrisan.')
      await expect(rowOf('a')).toHaveCount(0)

      expect(count(`select count(*) from public.students where id = '${a}'`)).toBe(0)
      // the person and the parent, who had no other role or child, are gone, and the lesson with them
      expect(
        count(
          `select count(*) from public.profiles where email in ('${email('a')}', '${email('pa')}')`,
        ),
      ).toBe(0)
      expect(
        count(
          `select count(*) from public.lessons where teacher_id = '${teacher.id}' and start_at = '${at(day, '17:15')}'`,
        ),
      ).toBe(0)
      // ... so the address can be used again
      await rpc(request, ana, 'add_student', {
        p_email: email('a'),
        p_first_name: 'Ucenik',
        p_last_name: name('a'),
      })

      // ---- the administrator, in a window of their own
      const adminPage = await (await browser.newContext()).newPage()
      await signInAs(adminPage, 'Admin')
      await expect(
        adminPage.getByRole('heading', { name: 'Administracija', level: 1 }),
      ).toBeVisible()
      const links = await adminPage
        .getByRole('navigation', { name: 'Glavna navigacija' })
        .getByRole('link')
        .allTextContents()
      expect(links.indexOf('Učenici')).toBe(links.indexOf('Nastavnici') + 1)
      await menu(adminPage, 'Učenici')
      await expect(adminPage.getByRole('heading', { name: 'Učenici', level: 1 })).toBeVisible()
      await adminPage.getByLabel('Pretraga po imenu ili emailu').fill(`e2e-del`)

      const adminRow = (k: string) => adminPage.getByRole('row', { name: new RegExp(name(k)) })
      await expect(adminRow('b')).toBeVisible()
      await expect(adminRow('b')).toContainText('Ana Nikolić')
      await expect(adminRow('b').getByRole('button', { name: /^Obriši učenika/ })).toHaveCount(0)
      await expect(adminRow('c')).toBeVisible()
      await expect(adminRow('c')).toContainText('Nema časova')
      // the newest one is on top
      const first = await adminPage.getByRole('row').nth(1).textContent()
      expect(first).toContain(name('a')) // added again a moment ago

      await adminRow('c')
        .getByRole('button', { name: /^Obriši učenika/ })
        .click()
      await dialog(adminPage, 'Brisanje učenika').getByRole('button', { name: 'Obriši' }).click()
      await expect(adminPage.getByRole('status')).toHaveText('Učenik je obrisan.')
      await expect(adminRow('c')).toHaveCount(0)
      expect(count(`select count(*) from public.students where id = '${c}'`)).toBe(0)

      // a student nobody teaches is only the administrator's
      const unassigned = await addStudent('u', admin)
      expect(
        (await select<{ id: string }>(request, ana, `students?select=id&id=eq.${unassigned}`))
          .length,
      ).toBeGreaterThan(0) // a teacher can read it, as they could before
      const byTeacher = await request.post(`${url}/rest/v1/rpc/delete_student`, {
        headers: { apikey: key, Authorization: `Bearer ${ana}` },
        data: { p_student_id: unassigned },
      })
      expect(byTeacher.status()).toBe(403)
      await adminPage.reload()
      await adminPage.getByLabel('Pretraga po imenu ili emailu').fill('e2e-del')
      await expect(adminRow('u')).toContainText('Bez nastavnika')
      await adminRow('u')
        .getByRole('button', { name: /^Obriši učenika/ })
        .click()
      await dialog(adminPage, 'Brisanje učenika').getByRole('button', { name: 'Obriši' }).click()
      await expect(adminRow('u')).toHaveCount(0)
    } finally {
      purge()
    }
  })
})
