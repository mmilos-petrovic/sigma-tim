import { expect, test } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { at, belgradeDate, notedReasons, pastLesson, removeLessons } from './belgrade.ts'
import { clock } from './calendar.ts'
import { signInAs } from './helpers.ts'

// What a student sees of payment, and a reason for cancelling, on a phone-sized screen against the local stack.

const ANA = 'ana.nikolic@example.test'
const LUKA = 'ucenik1@example.test'

const range = (start: string) =>
  `${clock(start)}–${clock(new Date(new Date(start).getTime() + 3_600_000))}`

test.describe('student on a phone: payment and a reason for cancelling', () => {
  test('sees "Plaćen" on a lesson that is over and was paid, never "Neplaćen", and cancels with a reason', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
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

    // minutes that differ from run to run, so leftovers of other runs are not mistaken for these lessons
    const quarter = String((Date.now() % 4) * 15).padStart(2, '0')
    const paidPast = at(belgradeDate(-1), `11:${quarter}`)
    const unpaidPast = at(belgradeDate(-1), `13:${quarter}`)
    const paidAhead = at(belgradeDate(2), `14:${quarter}`)
    const toCancel = at(belgradeDate(3), `16:${quarter}`)

    const schedule = (start: string) =>
      rpc<string>(request, ana, 'schedule_lesson', {
        p_subject_id: subject.id,
        p_location_id: location.id,
        p_room_id: null,
        p_start_at: start,
        p_end_at: new Date(new Date(start).getTime() + 3_600_000).toISOString(),
        p_student_ids: [student.id],
      })

    const past = [
      pastLesson({
        teacherEmail: ANA,
        studentId: student.id,
        start: paidPast,
        held: true,
        paid: true,
      }),
      pastLesson({
        teacherEmail: ANA,
        studentId: student.id,
        start: unpaidPast,
        held: true,
        paid: false,
      }),
    ]
    const ahead = await schedule(paidAhead)
    const cancelled = await schedule(toCancel)
    await rpc(request, ana, 'set_lesson_paid', {
      p_lesson_id: ahead,
      p_student_id: student.id,
      p_paid: true,
    })

    try {
      await signInAs(page, 'Učenik')
      await expect(page.getByRole('heading', { name: 'Moji časovi', level: 1 })).toBeVisible()
      const row = (start: string) => page.locator('li.lesson').filter({ hasText: range(start) })

      await expect(row(paidPast).first()).toContainText('Održan')
      await expect(row(paidPast).first()).toContainText('Plaćen')
      await expect(row(unpaidPast).first()).toContainText('Održan')
      await expect(row(unpaidPast).first()).not.toContainText(/Plaćen|Neplaćen/)
      // paid in advance, but not over yet: nothing is said
      await expect(row(paidAhead).first()).toBeVisible()
      await expect(row(paidAhead).first()).not.toContainText(/Plaćen|Neplaćen/)
      await expect(page.locator('body')).not.toContainText(/Neplaćen|Nije plaćen/)

      // cancelling with a reason: the teacher and the parent get it in their notice
      await row(toCancel).first().getByRole('button').first().click()
      await page.getByRole('button', { name: 'Otkaži čas' }).click()
      const dialog = page.getByRole('dialog', { name: 'Otkaži čas' })
      await expect(dialog.getByText('Razlog dobija nastavnik u obaveštenju.')).toBeVisible()
      await dialog.getByLabel('Razlog (nije obavezan)').fill(' Bolestan sam (e2e) ')
      await dialog.getByRole('button', { name: 'Otkaži čas' }).click()
      await expect(page.locator('.notice')).toContainText('Čas je otkazan.')
      await expect(row(toCancel)).toHaveCount(0)

      const reasons = notedReasons(cancelled)
      expect(reasons.length).toBeGreaterThan(0)
      expect(new Set(reasons)).toEqual(new Set(['Bolestan sam (e2e)']))
    } finally {
      removeLessons(past)
      await rpc(request, ana, 'cancel_lesson', { p_lesson_id: ahead }).catch(() => undefined)
      await rpc(request, ana, 'cancel_lesson', { p_lesson_id: cancelled }).catch(() => undefined)
    }
  })
})
