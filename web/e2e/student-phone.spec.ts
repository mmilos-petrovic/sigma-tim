import { devices, expect, test, type Page } from '@playwright/test'
import { select, sql, tokenFor } from './api.ts'
import { clock, deleteLesson, fullHourAhead, publishSlot } from './calendar.ts'
import { signInAs } from './helpers.ts'

// The student and parent screens on a phone-sized screen (see the projects in playwright.config.ts), against the
// local stack. One person books and cancels as a student, another as a parent, and the teacher answers on a desktop.

const ANA = 'ana.nikolic@example.test'
const LUKA = 'ucenik1@example.test'
const JELENA = 'roditelj1@example.test'
const ANA_PHONE = '+381600000003'
const ANA_PHONE_SHOWN = '060 0000 003'

/** The page does not scroll sideways: nothing is wider than the screen. */
async function fitsTheScreen(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, 'horizontal overflow in pixels').toBeLessThanOrEqual(0)
}

/** A button or link a thumb can hit: at least 44 pixels tall. */
async function bigEnough(locator: ReturnType<Page['locator']>) {
  const box = await locator.first().boundingBox()
  expect(box, 'the control is on screen').not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(44)
}

const range = (start: Date, minutes = 60) =>
  `${clock(start)}–${clock(new Date(start.getTime() + minutes * 60_000))}`

/** A start that is not on the same quarter as an earlier run's, so leftovers cannot be mistaken for this run's slot. */
const startedAt = (hoursAhead: number) =>
  new Date(fullHourAhead(hoursAhead).getTime() + (Math.floor(Date.now() / 60_000) % 4) * 900_000)

test.describe.configure({ mode: 'serial' })

test.describe('student and parent on a phone', () => {
  test('the whole path: publish, book, confirm, cancel', async ({ page, browser, request }) => {
    const ana = await tokenFor(request, ANA)
    const luka = await tokenFor(request, LUKA)

    const [teacher] = await select<{ id: string }>(
      request,
      ana,
      `profiles?select=id&email=eq.${ANA}`,
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

    // three free slots the teacher publishes: one far ahead, one in a few hours (a late booking), one to race for
    const far = startedAt(72)
    const near = new Date(Math.ceil((Date.now() + 3 * 3_600_000) / 900_000) * 900_000)
    const race = startedAt(77)
    const made: string[] = []
    for (const start of [far, near, race]) {
      const created = await publishSlot(request, ana, {
        teacherId: teacher.id,
        subjectId: subject.id,
        locationId: location.id,
        start,
      })
      expect(created.ok(), await created.text()).toBe(true)
      made.push(((await created.json()) as { id: string }[])[0].id)
    }

    const teacherContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const parentContext = await browser.newContext({ ...devices['Pixel 7'] })
    try {
      // 1. the student signs in and sees the three slots
      await signInAs(page, 'Učenik')
      await expect(page.getByRole('heading', { name: 'Moji časovi', level: 1 })).toBeVisible()
      await expect(page.locator('.fc')).toHaveCount(0) // no calendar
      await fitsTheScreen(page)
      const slotsTab = page.getByRole('link', { name: /^Slobodni termini/ })
      await bigEnough(slotsTab)
      await slotsTab.click()
      await expect(
        page.getByRole('button', { name: new RegExp(`Zauzmi termin.*${range(far)}`) }),
      ).toBeVisible()
      await fitsTheScreen(page)

      // 2. a slot far ahead is booked at once
      const bookFar = page.getByRole('button', { name: new RegExp(`Zauzmi termin.*${range(far)}`) })
      await bigEnough(bookFar)
      await bookFar.click()
      const farDialog = page.getByRole('dialog', { name: 'Zauzmi termin' })
      await expect(farDialog.getByText(/manje od 12 sati/)).toHaveCount(0)
      await farDialog.getByRole('button', { name: 'Zauzmi termin' }).click()
      await expect(page.locator('.notice')).toContainText('Termin je zauzet.')

      // 3. a slot in a few hours is a late booking: the dialog and the notice tell the student to call the teacher
      await page.getByRole('button', { name: new RegExp(`Zauzmi termin.*${range(near)}`) }).click()
      const nearDialog = page.getByRole('dialog', { name: 'Zauzmi termin' })
      await expect(nearDialog.getByText(/Nastavnik mora da ga potvrdi/)).toBeVisible()
      await expect(nearDialog.getByRole('link', { name: ANA_PHONE_SHOWN })).toHaveAttribute(
        'href',
        `tel:${ANA_PHONE}`,
      )
      await nearDialog.getByRole('button', { name: 'Zauzmi termin' }).click()
      await expect(page.locator('.notice')).toContainText('Zahtev je poslat.')
      await expect(
        page.locator('.notice').getByRole('link', { name: ANA_PHONE_SHOWN }),
      ).toBeVisible()

      // 4. both are among the lessons, the late one waiting for the teacher
      await page.getByRole('link', { name: 'Časovi', exact: true }).click()
      const farRow = page.getByRole('button', { name: new RegExp(range(far)) })
      const nearRow = page.getByRole('button', { name: new RegExp(range(near)) })
      await expect(farRow).toContainText('Potvrđen')
      await expect(nearRow).toContainText('Čeka potvrdu')
      await bigEnough(farRow)
      await fitsTheScreen(page)

      // 5. an open row shows the teacher, the number and the address
      await nearRow.click()
      const body = page.getByRole('region', { name: 'Podaci o času' })
      await expect(body.getByText('Ana Nikolić')).toBeVisible()
      await expect(body.getByRole('link', { name: ANA_PHONE_SHOWN })).toBeVisible()
      await expect(body.locator('a[href*="google.com/maps"]')).toBeVisible()
      await fitsTheScreen(page)

      // 6. the teacher confirms the late booking on a desktop
      const teacherPage = await teacherContext.newPage()
      await signInAs(teacherPage, 'Nastavnik')
      await expect(
        teacherPage.getByRole('heading', { name: 'Zahtevi na čekanju', level: 2 }),
      ).toBeVisible()
      await teacherPage
        .getByRole('listitem', { name: /Luka Ilić/ })
        .getByRole('button', { name: 'Potvrdi' })
        .click()
      // answered: the request is no longer in the list of requests
      await expect(
        teacherPage.getByRole('heading', { name: 'Zahtevi na čekanju', level: 2 }),
      ).toHaveCount(0)

      // 7. the student sees it confirmed
      await page.reload()
      await expect(page.getByRole('button', { name: new RegExp(range(near)) })).toContainText(
        'Potvrđen',
      )

      // 8. two people reach for the same slot: the parent books it for Mina, the student is too late
      await page.getByRole('link', { name: /^Slobodni termini/ }).click()
      const raceButton = page.getByRole('button', {
        name: new RegExp(`Zauzmi termin.*${range(race)}`),
      })
      await expect(raceButton).toBeVisible()

      const parent = await parentContext.newPage()
      await signInAs(parent, 'Roditelj')
      await expect(parent.getByRole('heading', { name: 'Časovi dece', level: 1 })).toBeVisible()
      await parent.getByLabel('Dete').selectOption({ label: 'Mina Ilić' })
      await parent.getByRole('link', { name: /^Slobodni termini/ }).click()
      await parent
        .getByRole('button', { name: new RegExp(`Zauzmi termin.*${range(race)}`) })
        .click()
      const forMina = parent.getByRole('dialog', { name: 'Zauzmi termin' })
      await expect(forMina.getByText('Zauzimate termin za Mina Ilić.')).toBeVisible()
      await forMina.getByRole('button', { name: 'Zauzmi termin' }).click()
      await expect(parent.locator('.notice')).toContainText('Termin je zauzet.')
      await fitsTheScreen(parent)

      await raceButton.click()
      await page
        .getByRole('dialog', { name: 'Zauzmi termin' })
        .getByRole('button', { name: 'Zauzmi termin' })
        .click()
      await expect(page.getByText('Termin je upravo zauzet. Izaberite drugi.')).toBeVisible()
      await page.getByRole('button', { name: 'Odustani' }).click()
      await expect(raceButton).toHaveCount(0)

      // 9. the student cancels the late booking: the dialog asks to call the teacher, and the slot is free again
      await page.getByRole('link', { name: 'Časovi', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(range(near)) }).click()
      await page.getByRole('button', { name: 'Otkaži rezervaciju' }).click()
      const cancelNear = page.getByRole('dialog', { name: 'Otkaži rezervaciju' })
      await expect(cancelNear.getByText(/manje od 12 sati/)).toBeVisible()
      await expect(cancelNear.getByRole('link', { name: ANA_PHONE_SHOWN })).toBeVisible()
      await cancelNear.getByRole('button', { name: 'Otkaži rezervaciju' }).click()
      await expect(page.locator('.notice')).toHaveText('Rezervacija je otkazana.')
      await expect(page.getByRole('button', { name: new RegExp(range(near)) })).toHaveCount(0)

      // 10. and the one far ahead
      await page.getByRole('button', { name: new RegExp(range(far)) }).click()
      await page.getByRole('button', { name: 'Otkaži rezervaciju' }).click()
      const cancelFar = page.getByRole('dialog', { name: 'Otkaži rezervaciju' })
      await expect(cancelFar.getByText(/manje od 12 sati/)).toHaveCount(0)
      await cancelFar.getByRole('button', { name: 'Otkaži rezervaciju' }).click()
      await expect(page.locator('.notice')).toHaveText('Rezervacija je otkazana.')

      // both slots are free for other students again
      await page.getByRole('link', { name: /^Slobodni termini/ }).click()
      await expect(
        page.getByRole('button', { name: new RegExp(`Zauzmi termin.*${range(far)}`) }),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: new RegExp(`Zauzmi termin.*${range(near)}`) }),
      ).toBeVisible()
      await fitsTheScreen(page)

      // the parent cancels Mina's booking too (a cancelled slot goes back to the teacher's list)
      await parent.getByRole('link', { name: 'Časovi', exact: true }).click()
      await parent.getByRole('button', { name: new RegExp(range(race)) }).click()
      await parent.getByRole('button', { name: 'Otkaži rezervaciju' }).click()
      await parent
        .getByRole('dialog', { name: 'Otkaži rezervaciju' })
        .getByRole('button', { name: 'Otkaži rezervaciju' })
        .click()
      await expect(parent.locator('.notice')).toHaveText('Rezervacija je otkazana.')

      const open = await select<{ id: string }>(
        request,
        ana,
        `lessons?select=id&status=eq.open&id=in.(${made.join(',')})`,
      )
      expect(open.map((slot) => slot.id).sort()).toEqual([...made].sort())
      expect(
        await select(
          request,
          luka,
          `lesson_students?select=lesson_id&lesson_id=in.(${made.join(',')})`,
        ),
      ).toHaveLength(0)
    } finally {
      await teacherContext.close()
      await parentContext.close()
      for (const id of made) await deleteLesson(request, ana, id).catch(() => undefined)
    }
  })

  test('a parent chooses a child, and an old teacher keeps his name but not his number', async ({
    page,
    request,
  }) => {
    const jelena = await tokenFor(request, JELENA)
    const [mina] = await select<{ id: string }>(
      request,
      jelena,
      'students?select=id,profile:profiles!inner(first_name)&profile.first_name=eq.Mina',
    )

    // Mina had a lesson with Marko and is Ana's student now, as after a takeover: Marko is her old teacher, and no
    // child of her parent is his student, so his name stays readable and his number does not.
    const marko = `(select id from public.profiles where email = 'marko.jovanovic@example.test')`
    const lessonId = sql(`
      begin;
      update public.students set teacher_id = ${marko} where id = '${mina.id}';
      with l as (
        insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin, outcome)
        select t.id, s.id, loc.id, date_trunc('hour', now()) - interval '5 days', date_trunc('hour', now()) - interval '5 days' + interval '1 hour', 'confirmed', 'teacher', 'held'
          from public.profiles t, public.subjects s, public.locations loc
         where t.email = 'marko.jovanovic@example.test' and s.name = 'Hemija' and loc.name = 'Glavna lokacija'
        returning id
      ), p as (
        insert into public.lesson_students (lesson_id, student_id, note)
        select l.id, '${mina.id}', 'Stara napomena (e2e)' from l
        returning lesson_id
      )
      select lesson_id from p;
      update public.students
         set teacher_id = (select id from public.profiles where email = '${ANA}')
       where id = '${mina.id}';
      commit;
    `)
    expect(lessonId).toMatch(/^[0-9a-f-]{36}$/)

    try {
      await signInAs(page, 'Roditelj')
      await expect(page.getByRole('heading', { name: 'Časovi dece', level: 1 })).toBeVisible()

      // two children: the choice is on top, by name, and remembered
      const choice = page.getByLabel('Dete')
      await expect(choice.locator('option')).toHaveText(['Luka Ilić', 'Mina Ilić'])
      await bigEnough(choice)
      await choice.selectOption({ label: 'Mina Ilić' })
      await page.reload()
      await expect(page.getByLabel('Dete')).toHaveValue(mina.id)

      // the old lesson: the teacher's name is there, his number is not, the note is
      const past = page.getByRole('list', { name: 'Prošli časovi' })
      const row = past.getByRole('button', { name: /Hemija/ }).first()
      await row.click()
      const body = page.getByRole('region', { name: 'Podaci o času' }).first()
      await expect(body.getByText('Marko Jovanović')).toBeVisible()
      await expect(body.getByText('Stara napomena (e2e)')).toBeVisible()
      await expect(body.getByRole('link', { name: /^\+/ })).toHaveCount(0)
      await expect(body.getByRole('button', { name: /^Otkaži/ })).toHaveCount(0)
      await fitsTheScreen(page)
    } finally {
      sql(`
        set session_replication_role = replica;
        delete from public.lessons where id = '${lessonId}';
      `)
    }
  })
})
