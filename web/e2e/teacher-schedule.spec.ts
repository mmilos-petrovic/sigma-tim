import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { localEnv, signInAs } from './helpers.ts'

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const pad = (n: number) => String(n).padStart(2, '0')

/** The Belgrade calendar date `offset` days from today, as the date field wants it. */
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
/** "HH:MM" on the Belgrade clock. */
const clock = (at: Date | string | number) => clockFormat.format(new Date(at))

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
const plus = (time: string, minutes: number) => {
  const total = minutesOf(time) + minutes
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
const quarterAt = (slot: number) => `${pad(Math.floor(slot / 4))}:${pad((slot % 4) * 15)}`

const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' })

/**
 * A start time between 08:00 and 10:45 on `day` whose following two hours are free in the teacher's calendar, so the
 * blocks of this run cannot be mistaken for older ones (the lessons of a past day cannot be deleted).
 */
async function freeStart(request: APIRequestContext, token: string, day: string): Promise<string> {
  const lessons = await select<{ start_at: string; end_at: string }>(
    request,
    token,
    `lessons?select=start_at,end_at&end_at=gt.${new Date().toISOString()}`,
  )
  const taken = lessons
    .filter((lesson) => dateFormat.format(new Date(lesson.start_at)) === day)
    .map((lesson) => [minutesOf(clock(lesson.start_at)), minutesOf(clock(lesson.end_at))])
  const offset = Date.now() % 12
  for (let i = 0; i < 12; i++) {
    const slot = 32 + ((offset + i) % 12)
    const from = slot * 15
    if (taken.every(([a, b]) => from + 120 <= a || from >= b)) return quarterAt(slot)
  }
  return quarterAt(32 + offset) // everything is taken: use the leftovers' problem as it is
}

/** A block of the teacher's own, found by when it is and who is in it (its text reads "10:00–11:00 …"). */
const lessonBlock = (page: Page, from: string, to: string, who: string) =>
  page
    .locator('.cal-item--own')
    .filter({ hasText: `${from}–${to}` })
    .filter({ hasText: who })

/** Shows the next week if that is where the block is (tomorrow can be Monday); this week gets a moment to load first. */
async function shown(page: Page, block: Locator): Promise<Locator> {
  const here = await block
    .first()
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(() => true)
    .catch(() => false)
  if (!here) await page.getByRole('button', { name: 'Sledeća nedelja' }).click()
  await expect(block.first()).toBeVisible()
  return block.first()
}

/** Presses the submit button; if an overlap is announced, confirms it (it is only a warning). */
async function submitThroughWarning(form: Locator, label: string) {
  await form.getByRole('button', { name: label }).click()
  const anyway = form.getByRole('button', { name: 'Sačuvaj i pored upozorenja' })
  if (await anyway.isVisible({ timeout: 1500 }).catch(() => false)) await anyway.click()
}

test.describe("the teacher's schedule", () => {
  // a stuck action should fail in seconds with its own message, not use up the whole test
  test.use({ actionTimeout: 15_000 })

  test('a teacher runs their schedule: lessons, clashes, drag, notes, slots, bookings and outcomes', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)
    const started = new Date().toISOString()
    const ana = await tokenFor(request, 'ana.nikolic@example.test')
    const luka = await tokenFor(request, 'ucenik1@example.test')
    const day = belgradeDate(1)
    const start = await freeStart(request, ana, day)
    const end = plus(start, 60)
    const lessons = () =>
      select<{
        id: string
        start_at: string
        end_at: string
        status: string
        origin: string
        outcome: string | null
        participants: { student_id: string; note: string | null }[]
      }>(
        request,
        ana,
        `lessons?select=id,start_at,end_at,status,origin,outcome,participants:lesson_students(student_id,note)&created_at=gte.${started}&order=created_at`,
      )

    try {
      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      await expect(page.locator('.week-calendar')).toContainText('Danas') // the Serbian toolbar

      await test.step('schedules a lesson for a student', async () => {
        await page.getByRole('button', { name: 'Novi čas' }).click()
        const form = dialog(page, 'Novi čas')
        await form.getByLabel('Predmet').selectOption({ label: 'Matematika' })
        await form.getByLabel('Lokacija').selectOption({ label: 'Glavna lokacija' })
        await form.getByLabel('Učionica').selectOption({ label: 'Učionica 3' })
        await form.getByLabel('Datum').fill(day)
        await form.getByLabel('Početak').fill(start)
        await form.getByLabel('Kraj').fill(end)
        await form.getByRole('checkbox', { name: 'Luka Ilić' }).check()
        await submitThroughWarning(form, 'Zakaži')
        await expect(page.getByRole('status')).toHaveText('Čas je zakazan.')

        const block = await shown(page, lessonBlock(page, start, end, 'Luka Ilić'))
        await expect(block).toContainText('Matematika')
        expect(await lessons()).toHaveLength(1)
      })

      await test.step('an overlap in the same room is a warning, and the lesson is saved after it', async () => {
        await page.getByRole('button', { name: 'Novi čas' }).click()
        const form = dialog(page, 'Novi čas')
        await form.getByLabel('Predmet').selectOption({ label: 'Matematika' })
        await form.getByLabel('Lokacija').selectOption({ label: 'Glavna lokacija' })
        await form.getByLabel('Učionica').selectOption({ label: 'Učionica 3' })
        await form.getByLabel('Datum').fill(day)
        await form.getByLabel('Početak').fill(start)
        await form.getByLabel('Kraj').fill(end)
        await form.getByRole('checkbox', { name: 'Mina Ilić' }).check()
        await form.getByRole('button', { name: 'Zakaži' }).click()

        const warning = form.getByRole('group', { name: 'Upozorenje o preklapanju' })
        await expect(warning).toContainText('Već imate čas u to vreme')
        await expect(warning).toContainText('u istoj učionici (Učionica 3)')
        expect(await lessons()).toHaveLength(1) // nothing saved yet

        await form.getByRole('button', { name: 'Sačuvaj i pored upozorenja' }).click()
        await expect(page.getByRole('status')).toHaveText('Čas je zakazan.')
        expect(await lessons()).toHaveLength(2)
      })

      // an hour later (a longer drag would reach the edge of the grid, which scrolls); Luka's lesson is the first one made
      const dragged = plus(start, 60)
      await test.step('drags a lesson to another time, in steps of 15 minutes', async () => {
        const block = lessonBlock(page, start, end, 'Luka Ilić').first()
        const box = (await block.boundingBox())!
        const pxPerMinute = box.height / 60
        const x = box.x + box.width / 2
        const y = box.y + 2
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x, y + 30, { steps: 4 })
        await page.mouse.move(x, y + 60 * pxPerMinute, { steps: 8 })
        await page.mouse.up()
        // the new place is free, so no warning; if a leftover clashes, accept it
        const anyway = page.getByRole('button', { name: 'Sačuvaj i pored upozorenja' })
        if (await anyway.isVisible({ timeout: 1500 }).catch(() => false)) await anyway.click()
        await expect(page.getByRole('status')).toHaveText('Čas je pomeren.')

        const [first] = await lessons()
        expect(clock(first.start_at)).toBe(dragged)
        expect(new Date(first.start_at).getUTCMinutes() % 15).toBe(0)
        expect(new Date(first.end_at).getTime() - new Date(first.start_at).getTime()).toBe(
          3_600_000,
        )
      })

      await test.step('writes a note for a student', async () => {
        await lessonBlock(page, dragged, plus(dragged, 60), 'Luka Ilić').first().click()
        const lesson = dialog(page, 'Matematika')
        await lesson.getByLabel('Napomena za Luka Ilić').fill('Ponoviti razlomke')
        await lesson.getByRole('button', { name: 'Sačuvaj napomenu za Luka Ilić' }).click()
        await expect(lesson.getByText('Napomena je sačuvana.')).toBeVisible()
        const [first] = await lessons()
        expect(first.participants.map((p) => p.note)).toEqual(['Ponoviti razlomke'])
      })

      await test.step('changes who attends', async () => {
        const lesson = dialog(page, 'Matematika')
        await lesson.getByRole('button', { name: 'Izmeni čas' }).click()
        const form = dialog(page, 'Izmena časa')
        await form.getByRole('checkbox', { name: 'Mina Ilić' }).check()
        await form.getByRole('button', { name: 'Sačuvaj' }).click()
        await expect(page.getByRole('status')).toHaveText('Čas je izmenjen.')
        const [first] = await lessons()
        expect(first.participants).toHaveLength(2)
        expect(first.participants.find((p) => p.note)?.note).toBe('Ponoviti razlomke') // kept
      })

      await test.step('deletes a lesson', async () => {
        await lessonBlock(page, start, end, 'Mina Ilić').first().click()
        await dialog(page, 'Matematika').getByRole('button', { name: 'Obriši čas' }).click()
        await dialog(page, 'Brisanje časa').getByRole('button', { name: 'Obriši' }).click()
        await expect(page.getByRole('status')).toHaveText('Čas je obrisan.')
        expect(await lessons()).toHaveLength(1)
      })

      await test.step('publishes a free slot and removes it', async () => {
        await page.getByRole('button', { name: 'Objavi slobodan termin' }).click()
        const form = dialog(page, 'Novi slobodan termin')
        await form.getByLabel('Datum').fill(day)
        await form.getByLabel('Početak').fill('19:00')
        await form.getByRole('radio', { name: '45 minuta' }).check()
        await form.getByRole('button', { name: 'Objavi' }).click()
        await expect(page.getByRole('status')).toHaveText('Slobodan termin je objavljen.')

        const slot = await shown(
          page,
          page.locator('.cal-item--slot').filter({ hasText: '19:00–19:45' }),
        )
        const [, published] = await lessons()
        expect(published).toMatchObject({ status: 'open', origin: 'slot' })
        expect(
          (new Date(published.end_at).getTime() - new Date(published.start_at).getTime()) / 60_000,
        ).toBe(45)

        await slot.click()
        await dialog(page, 'Slobodan termin').getByRole('button', { name: 'Ukloni termin' }).click()
        await dialog(page, 'Uklanjanje termina').getByRole('button', { name: 'Ukloni' }).click()
        await expect(page.getByRole('status')).toHaveText('Termin je uklonjen.')
        expect(await lessons()).toHaveLength(1)
      })

      await test.step('answers a late booking made by a student', async () => {
        const [profile] = await select<{ id: string }>(
          request,
          ana,
          'profiles?select=id&email=eq.ana.nikolic@example.test',
        )
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
        // a free slot starting in 3 hours: less than 12 hours ahead, so the booking waits for the teacher
        const slotStart = new Date(Math.ceil((Date.now() + 3 * 3_600_000) / 900_000) * 900_000)
        const { url, key } = localEnv()
        const created = await request.post(`${url}/rest/v1/lessons`, {
          headers: { apikey: key, Authorization: `Bearer ${ana}`, Prefer: 'return=representation' },
          data: {
            teacher_id: profile.id,
            subject_id: subject.id,
            location_id: location.id,
            start_at: slotStart.toISOString(),
            end_at: new Date(slotStart.getTime() + 3_600_000).toISOString(),
            status: 'open',
            origin: 'slot',
          },
        })
        expect(created.ok(), await created.text()).toBe(true)
        const [slot] = (await created.json()) as { id: string }[]
        const status = await rpc<string>(request, luka, 'claim_slot', {
          p_lesson_id: slot.id,
          p_student_ids: [student.id],
        })
        expect(status).toBe('pending')

        await page.reload()
        await expect(
          page.getByRole('heading', { name: 'Zahtevi na čekanju', level: 2 }),
        ).toBeVisible()
        await page
          .getByRole('listitem', { name: /Luka Ilić/ })
          .getByRole('button', { name: 'Potvrdi' })
          .click()
        await expect(page.getByRole('status')).toHaveText('Zahtev je potvrđen.')
        await expect(page.getByRole('heading', { name: 'Zahtevi na čekanju' })).toHaveCount(0)

        const booked = (await lessons()).find((l) => l.id === slot.id)
        expect(booked).toMatchObject({ status: 'confirmed', origin: 'slot' })
      })

      await test.step('records what happened after a lesson, and the lesson is then frozen', async () => {
        // a quarter hour earlier today that has surely ended, different from run to run
        const nowSlot = Math.floor(minutesOf(clock(Date.now())) / 15)
        test.skip(nowSlot < 8, 'too early in the day for a quarter hour that has surely ended')
        const from = quarterAt(Date.now() % (nowSlot - 5))
        const to = plus(from, 15)

        await page.getByRole('button', { name: 'Novi čas' }).click()
        const form = dialog(page, 'Novi čas')
        await form.getByLabel('Predmet').selectOption({ label: 'Matematika' })
        await form.getByLabel('Datum').fill(belgradeDate(0))
        await form.getByLabel('Početak').fill(from)
        await form.getByLabel('Kraj').fill(to)
        await form.getByLabel('Učionica').selectOption({ label: 'Bez učionice' })
        await form.getByRole('checkbox', { name: 'Luka Ilić' }).check()
        await submitThroughWarning(form, 'Zakaži')
        await expect(page.getByRole('status')).toHaveText('Čas je zakazan.')

        // back to this week, in case an earlier step looked at the next one
        const today = page.getByRole('button', { name: 'Idi na današnji dan' })
        if (await today.isEnabled()) await today.click()
        const block = lessonBlock(page, from, to, 'Luka Ilić').first()
        await block.scrollIntoViewIfNeeded()
        await block.click()
        const lesson = dialog(page, 'Matematika')
        await lesson.getByRole('button', { name: 'Održan', exact: true }).click()
        await expect(lesson.getByText('Ishod je upisan.')).toBeVisible()
        const mine = (await lessons()).find(
          (l) => clock(l.start_at) === from && l.status === 'confirmed',
        )!
        const held = await select<{ id: string }>(
          request,
          ana,
          `lessons?select=id&outcome=eq.held&start_at=eq.${encodeURIComponent(mine.start_at)}`,
        )
        expect(held.length).toBeGreaterThanOrEqual(1)

        // an outcome freezes the lesson: the form says so, and the database would refuse anyway
        await lesson.getByRole('button', { name: 'Izmeni čas' }).click()
        const edit = dialog(page, 'Izmena časa')
        await expect(edit.getByText(/Dan ovog časa je prošao ili je upisan ishod/)).toBeVisible()
        await expect(edit.getByLabel('Početak')).toBeDisabled()
        await edit.getByRole('button', { name: 'Odustani' }).click()

        // clearing the outcome is allowed (it stays editable), and leaves the lesson usable for the next run, since a
        // lesson of a day that has begun cannot be deleted
        await block.click()
        await dialog(page, 'Matematika').getByRole('button', { name: 'Obriši ishod' }).click()
        await expect(dialog(page, 'Matematika').getByText('Ishod je obrisan.')).toBeVisible()
        const cleared = await select<{ id: string }>(
          request,
          ana,
          `lessons?select=id&outcome=is.null&start_at=eq.${encodeURIComponent(mine.start_at)}`,
        )
        expect(cleared.length).toBeGreaterThanOrEqual(1)
      })
    } finally {
      // leave the database as it was found: every future lesson this run created goes (a booked slot frees first)
      const open = await select<{ id: string }>(
        request,
        ana,
        `lessons?select=id&created_at=gte.${started}&start_at=gt.${new Date().toISOString()}`,
      )
      for (const lesson of open) {
        for (let attempt = 0; attempt < 2; attempt++) {
          await rpc(request, ana, 'cancel_lesson', { p_lesson_id: lesson.id }).catch(
            () => undefined,
          )
        }
      }
    }
  })
})

test.describe('a teacher abroad, on a touch screen', () => {
  // the school runs on Belgrade time whatever the browser's own zone is
  test.use({ timezoneId: 'America/New_York', hasTouch: true, actionTimeout: 15_000 })

  test('sees Belgrade times, and moves a lesson with a press and a drag', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const started = new Date().toISOString()
    const ana = await tokenFor(request, 'ana.nikolic@example.test')
    const day = belgradeDate(1)
    const start = await freeStart(request, ana, day)
    const end = plus(start, 60)

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
    // Luka's own record, which he is allowed to read
    const luka = await tokenFor(request, 'ucenik1@example.test')
    const [student] = await select<{ id: string }>(request, luka, 'students?select=id')
    // 10:00 on the Belgrade clock, written as an instant: Belgrade is one or two hours ahead of UTC
    const at = (time: string) => {
      for (const offset of [1, 2]) {
        const candidate = new Date(`${day}T${time}:00.000Z`)
        candidate.setUTCHours(candidate.getUTCHours() - offset)
        if (clock(candidate) === time) return candidate.toISOString()
      }
      throw new Error(`cannot place ${time} on ${day}`)
    }
    await rpc(request, ana, 'schedule_lesson', {
      p_subject_id: subject.id,
      p_location_id: location.id,
      p_room_id: null,
      p_start_at: at(start),
      p_end_at: at(end),
      p_student_ids: [student.id],
    })

    try {
      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      const block = await shown(page, lessonBlock(page, start, end, 'Luka Ilić'))
      // the time on the block is the Belgrade time, not New York's
      await expect(block).toContainText(`${start}–${end}`)

      // press, hold and drag by touch (a quick swipe scrolls instead)
      const box = (await block.boundingBox())!
      const pxPerMinute = box.height / 60
      const x = box.x + box.width / 2
      const y = box.y + 4
      const cdp = await page.context().newCDPSession(page)
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', py: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x, y: py }],
        })
      await touch('touchStart', y)
      await page.waitForTimeout(700) // longer than the long-press delay
      for (let step = 1; step <= 10; step++)
        await touch('touchMove', y + (step * 60 * pxPerMinute) / 10)
      await touch('touchEnd', y + 60 * pxPerMinute)

      await expect(page.getByRole('status')).toHaveText('Čas je pomeren.')
      const [moved] = await select<{ start_at: string }>(
        request,
        ana,
        `lessons?select=start_at&created_at=gte.${started}`,
      )
      expect(clock(moved.start_at)).toBe(plus(start, 60))
    } finally {
      const open = await select<{ id: string }>(
        request,
        ana,
        `lessons?select=id&created_at=gte.${started}&start_at=gt.${new Date().toISOString()}`,
      )
      for (const lesson of open) {
        await rpc(request, ana, 'cancel_lesson', { p_lesson_id: lesson.id }).catch(() => undefined)
      }
    }
  })
})
