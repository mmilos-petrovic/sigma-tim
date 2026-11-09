import { expect, test, type Page } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { at, belgradeDate, notedReasons, pastLesson, removeLessons } from './belgrade.ts'
import { clock } from './calendar.ts'
import { signInAs } from './helpers.ts'

// The teacher's list of lessons, payment marks and a reason for cancelling, against the local stack.

const ANA = 'ana.nikolic@example.test'
const LUKA = 'ucenik1@example.test'

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const range = (start: string, minutes = 60) =>
  `${clock(start)}–${clock(new Date(new Date(start).getTime() + minutes * 60_000))}`

test.describe("the teacher's list of lessons", () => {
  test.use({ actionTimeout: 15_000 })

  test('lists lessons, marks payments, filters the unpaid and cancels with a reason', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const ana = await tokenFor(request, ANA)
    const luka = await tokenFor(request, LUKA)
    const [student] = await select<{ id: string }>(request, luka, 'students?select=id')
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

    // minutes that are not the same in every run, so leftovers of other runs are not mistaken for these lessons
    const quarter = String((Date.now() % 4) * 15).padStart(2, '0')
    const tomorrow = at(belgradeDate(1), `12:${quarter}`)
    const unpaid = at(belgradeDate(-1), `10:${quarter}`)
    const paid = at(belgradeDate(-1), `15:${quarter}`)

    const lessonId = await rpc<string>(request, ana, 'schedule_lesson', {
      p_subject_id: subject.id,
      p_location_id: location.id,
      p_room_id: null,
      p_start_at: tomorrow,
      p_end_at: new Date(new Date(tomorrow).getTime() + 3_600_000).toISOString(),
      p_student_ids: [student.id],
    })
    const past = [
      pastLesson({
        teacherEmail: ANA,
        studentId: student.id,
        start: unpaid,
        held: true,
        paid: false,
      }),
      pastLesson({ teacherEmail: ANA, studentId: student.id, start: paid, held: true, paid: true }),
    ]

    try {
      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()

      // the link is right under the students
      const links = await page
        .getByRole('navigation', { name: 'Glavna navigacija' })
        .getByRole('link')
        .allTextContents()
      expect(links.indexOf('Časovi')).toBe(links.indexOf('Učenici') + 1)
      await page
        .getByRole('navigation', { name: 'Glavna navigacija' })
        .getByRole('link', { name: 'Časovi' })
        .click()
      await expect(page.getByRole('heading', { name: 'Časovi', level: 1 })).toBeVisible()

      const upcomingRow = page
        .getByRole('list', { name: 'Predstojeći časovi' })
        .getByRole('listitem')
        .filter({ hasText: range(tomorrow) })
        .filter({ hasText: 'Luka Ilić' })
      const unpaidRow = page
        .getByRole('list', { name: 'Prošli časovi' })
        .getByRole('listitem')
        .filter({ hasText: range(unpaid) })
        .filter({ hasText: 'Luka Ilić' })
      const paidRow = page
        .getByRole('list', { name: 'Prošli časovi' })
        .getByRole('listitem')
        .filter({ hasText: range(paid) })
        .filter({ hasText: 'Luka Ilić' })

      await test.step('shows what is to come and what is behind, with payment where it is due', async () => {
        await expect(upcomingRow.first()).toBeVisible()
        await expect(upcomingRow.first()).not.toContainText(/plać/i)
        await expect(unpaidRow.first()).toContainText('Održan')
        await expect(unpaidRow.first()).toContainText('Nije plaćeno')
        await expect(paidRow.first()).toContainText('Plaćeno')
        await expect(paidRow.first()).not.toContainText('Nije plaćeno')
      })

      await test.step('"Samo nenaplaćeni" keeps what is not paid, and the coming lessons go', async () => {
        await page.getByLabel('Samo nenaplaćeni').check()
        await expect(page.getByRole('list', { name: 'Predstojeći časovi' })).toHaveCount(0)
        await expect(unpaidRow.first()).toBeVisible()
        await expect(paidRow).toHaveCount(0)
      })

      await test.step('marking the payment in the dialog takes the lesson off that list', async () => {
        await unpaidRow.first().getByRole('button').click()
        const open = dialog(page, 'Matematika')
        // a controlled box: it is only checked once the mark is saved and the lesson is read again
        const box = open.getByRole('checkbox', { name: 'Plaćeno za Luka Ilić' })
        await box.click()
        await expect(box).toBeChecked()
        await expect(open.getByText('Označeno je da je čas plaćen.')).toBeVisible()
        const [mark] = await select<{ paid_at: string | null }>(
          request,
          ana,
          `lesson_students?select=paid_at&lesson_id=eq.${past[0]}`,
        )
        expect(mark.paid_at).not.toBeNull()
        await open.getByRole('button', { name: 'Zatvori' }).click()
        await expect(unpaidRow).toHaveCount(0)
        await page.getByLabel('Samo nenaplaćeni').uncheck()
        await expect(unpaidRow.first()).toContainText('Plaćeno')
      })

      await test.step('a student is found by name', async () => {
        await page.getByLabel('Pretraga po učeniku').fill('ILIC')
        await expect(upcomingRow.first()).toBeVisible()
        await page.getByLabel('Pretraga po učeniku').fill('nepostojeci')
        await expect(page.getByText('Nema časova koji odgovaraju.')).toBeVisible()
        await page.getByLabel('Pretraga po učeniku').fill('')
      })

      await test.step('the calendar knows nothing of payment', async () => {
        await page
          .getByRole('navigation', { name: 'Glavna navigacija' })
          .getByRole('link', { name: 'Raspored' })
          .click()
        await expect(page.locator('.week-calendar')).toBeVisible()
        await expect(page.locator('.week-calendar')).not.toContainText(/plać/i)
      })

      await test.step('cancelling with a reason queues it for the others, and a lesson goes', async () => {
        await page
          .getByRole('navigation', { name: 'Glavna navigacija' })
          .getByRole('link', { name: 'Časovi' })
          .click()
        await upcomingRow.first().getByRole('button').click()
        await dialog(page, 'Matematika').getByRole('button', { name: 'Obriši čas' }).click()
        const confirm = dialog(page, 'Brisanje časa')
        await confirm.getByLabel('Razlog (nije obavezan)').fill('  Razboleo sam se (e2e)  ')
        await confirm.getByRole('button', { name: 'Obriši' }).click()
        await expect(page.getByRole('status')).toHaveText('Čas je obrisan.')
        await expect(upcomingRow).toHaveCount(0)
        const lessons = await select<{ id: string }>(
          request,
          ana,
          `lessons?select=id&id=eq.${lessonId}`,
        )
        expect(lessons).toHaveLength(0)
        // the student and the parent are told, with the reason the teacher gave (trimmed)
        const reasons = notedReasons(lessonId)
        expect(reasons.length).toBeGreaterThan(0)
        expect(new Set(reasons)).toEqual(new Set(['Razboleo sam se (e2e)']))
      })
    } finally {
      removeLessons(past)
      await rpc(request, ana, 'cancel_lesson', { p_lesson_id: lessonId }).catch(() => undefined)
    }
  })
})
