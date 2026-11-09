import { expect, test, type Locator, type Page } from '@playwright/test'
import { rpc, select, sql, tokenFor } from './api.ts'
import { signInAs } from './helpers.ts'

const ANA = 'ana.nikolic@example.test'
const LUKA = 'ucenik1@example.test'

const belgradeDate = (offset: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(
    new Date(Date.now() + offset * 86_400_000),
  )

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Belgrade',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const clock = (at: Date) => clockFormat.format(at)

/** The instant at which the Belgrade clock shows `time` on `day`: Belgrade is one or two hours ahead of UTC. */
function at(day: string, time: string): string {
  for (const offset of [1, 2]) {
    const candidate = new Date(`${day}T${time}:00.000Z`)
    candidate.setUTCHours(candidate.getUTCHours() - offset)
    if (clock(candidate) === time) return candidate.toISOString()
  }
  throw new Error(`cannot place ${time} on ${day}`)
}

/** Shows the next week if that is where the block is (tomorrow can be a Monday); the week at hand gets a moment first. */
async function shown(page: Page, target: Locator) {
  const here = await target
    .first()
    .waitFor({ state: 'attached', timeout: 4000 })
    .then(() => true)
    .catch(() => false)
  if (!here) await page.getByRole('button', { name: 'Sledeća nedelja' }).click()
  await expect(target.first()).toBeAttached()
}

/** The block of one of the teacher's own lessons by when it is (its text reads "10:00–11:00 ..."). */
const own = (page: Page, from: string, to: string) =>
  page.locator('.cal-item--own').filter({ hasText: `${from}–${to}` })

test.describe("the teacher's calendar: hours and the past", () => {
  test.use({ actionTimeout: 15_000 })

  test('shows 06:00 to 23:00, and a lesson outside that is scheduled but not drawn', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const started = new Date().toISOString()
    const ana = await tokenFor(request, ANA)
    const luka = await tokenFor(request, LUKA)
    const day = belgradeDate(1)
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
    const [student] = await select<{ id: string }>(request, luka, 'students?select=id')
    const schedule = (from: string, to: string) =>
      rpc(request, ana, 'schedule_lesson', {
        p_subject_id: subject.id,
        p_location_id: location.id,
        p_room_id: null,
        p_start_at: at(day, from),
        p_end_at: at(day, to),
        p_student_ids: [student.id],
      })

    try {
      await schedule('05:15', '05:45') // before the first hour
      await schedule('21:00', '22:00') // inside
      await schedule('23:15', '23:45') // after the last hour

      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      await shown(page, own(page, '21:00', '22:00'))

      const week = page.locator('.week-calendar')
      for (const hour of ['06', '12', '22']) {
        await expect(week.getByText(hour, { exact: true }).first()).toBeAttached()
      }
      for (const hour of ['00', '05', '23']) {
        await expect(week.getByText(hour, { exact: true })).toHaveCount(0)
      }
      await expect(own(page, '05:15', '05:45')).toHaveCount(0)
      await expect(own(page, '23:15', '23:45')).toHaveCount(0)

      // they exist all the same: nothing was refused
      const lessons = await select<{ start_at: string }>(
        request,
        ana,
        `lessons?select=start_at&created_at=gte.${started}`,
      )
      expect(lessons).toHaveLength(3)
    } finally {
      const mine = await select<{ id: string }>(
        request,
        ana,
        `lessons?select=id&created_at=gte.${started}`,
      )
      for (const lesson of mine) {
        await rpc(request, ana, 'cancel_lesson', { p_lesson_id: lesson.id }).catch(() => undefined)
      }
    }
  })

  test('draws a lesson that is over lighter, and crosses out one that was not held', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const luka = await tokenFor(request, LUKA)
    const [student] = await select<{ id: string }>(request, luka, 'students?select=id')
    // yesterday at 12:00 and 14:00 Belgrade time (a past day, so it also cannot be moved)
    const yesterday = belgradeDate(-1)
    const lessonIds = sql(`
      with l as (
        insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin, outcome, confirmed_at)
        select t.id, s.id, loc.id, v.start_at::timestamptz, v.start_at::timestamptz + interval '1 hour', 'confirmed', 'teacher', v.outcome::public.lesson_outcome, now()
          from public.profiles t, public.subjects s, public.locations loc,
               (values ('${at(yesterday, '12:00')}', 'held'), ('${at(yesterday, '14:00')}', 'not_held')) as v(start_at, outcome)
         where t.email = '${ANA}' and s.name = 'Matematika' and loc.name = 'Glavna lokacija'
        returning id
      ), p as (
        insert into public.lesson_students (lesson_id, student_id) select l.id, '${student.id}' from l returning lesson_id
      )
      select string_agg(lesson_id::text, ',') from p;`).split(',')

    try {
      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      const held = own(page, '12:00', '13:00')
      const notHeld = own(page, '14:00', '15:00')
      // yesterday can be a Sunday, which belongs to the week before
      const here = await held
        .first()
        .waitFor({ state: 'attached', timeout: 4000 })
        .then(() => true)
        .catch(() => false)
      if (!here) await page.getByRole('button', { name: 'Prethodna nedelja' }).click()
      await expect(held.first()).toBeAttached()

      for (const block of [held, notHeld]) {
        await expect(block.first()).toHaveClass(/cal-item--past/)
        // lighter than any colour a teacher can have, which all carry white text
        const lightness = await block.first().evaluate((element) => {
          const canvas = document.createElement('canvas').getContext('2d')!
          canvas.fillStyle = '#000'
          canvas.fillStyle = getComputedStyle(element).backgroundColor
          canvas.fillRect(0, 0, 1, 1)
          const [r, g, b] = [0, 1, 2].map((i) => canvas.getImageData(0, 0, 1, 1).data[i])
          return (r + g + b) / 3
        })
        expect(lightness).toBeGreaterThan(150)
      }
      await expect(notHeld.first().locator('.cal-item__title')).toHaveCSS(
        'text-decoration-line',
        'line-through',
      )
      await expect(held.first().locator('.cal-item__title')).toHaveCSS(
        'text-decoration-line',
        'none',
      )
    } finally {
      // a lesson that took place cannot be deleted through the app either
      sql(`
        set session_replication_role = replica;
        delete from public.lesson_students where lesson_id in (${lessonIds.map((id) => `'${id}'`).join(',')});
        delete from public.lessons where id in (${lessonIds.map((id) => `'${id}'`).join(',')});`)
    }
  })
})
