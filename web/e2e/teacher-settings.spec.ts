import { expect, test } from '@playwright/test'
import { rpc, select, tokenFor } from './api.ts'
import { block, fullHourAhead, shown } from './calendar.ts'
import { localEnv, signInAs, signOut } from './helpers.ts'

const TEAL = 'rgb(0, 106, 106)' // #006a6a
const OWN_BLUE = 'rgb(31, 79, 216)' // #1f4fd8, the colour of a teacher who never chose

test.describe("a teacher's colour", () => {
  test('is chosen on the settings page, recolours the lessons, and colleagues see it', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    const admin = await tokenFor(request, 'admin@example.test')
    const ana = await tokenFor(request, 'ana.nikolic@example.test')
    const [{ id: teacherId }] = await select<{ id: string }>(
      request,
      admin,
      'profiles?email=eq.ana.nikolic@example.test&select=id',
    )
    const [{ id: subjectId }] = await select<{ id: string }>(
      request,
      admin,
      'subjects?name=eq.Matematika&select=id',
    )
    const [{ id: locationId }] = await select<{ id: string }>(
      request,
      admin,
      'locations?name=eq.Glavna lokacija&select=id',
    )
    const [{ id: studentId }] = await select<{ id: string }>(
      request,
      ana,
      'students?select=id,profile:profiles!inner(email)&profile.email=eq.ucenik1@example.test',
    )
    const colorOf = async () =>
      (
        await select<{ color: string | null }>(
          request,
          admin,
          `teachers?profile_id=eq.${teacherId}&select=color`,
        )
      )[0].color

    // a lesson of Ana's a day and a half ahead, on an hour no other run is likely to use
    const start = fullHourAhead(36)
    const lessonId = await rpc<string>(request, ana, 'schedule_lesson', {
      p_subject_id: subjectId,
      p_location_id: locationId,
      p_room_id: null,
      p_start_at: start.toISOString(),
      p_end_at: new Date(start.getTime() + 3_600_000).toISOString(),
      p_student_ids: [studentId],
    })

    try {
      expect(await colorOf()).toBeNull()

      await signInAs(page, 'Nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      const own = block(page, 'own', start)
      await shown(page, own)
      await expect(own.first()).toHaveCSS('background-color', OWN_BLUE) // nobody chose: the blue it always was

      // choose on the settings page
      await page
        .getByRole('navigation', { name: 'Glavna navigacija' })
        .getByRole('link', { name: 'Podešavanja' })
        .click()
      await expect(page.getByRole('heading', { name: 'Podešavanja', level: 1 })).toBeVisible()
      await expect(
        page.getByRole('radio', { name: 'Bez izbora (podrazumevana boja)' }),
      ).toBeChecked()
      await expect(page.getByRole('button', { name: 'Sačuvaj' })).toBeDisabled()
      await page.getByRole('radio', { name: 'Tirkizna' }).check()
      await page.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Boja je sačuvana.')
      expect(await colorOf()).toBe('teal')

      // it is kept, and the lesson is drawn in it
      await page.reload()
      await expect(page.getByRole('radio', { name: 'Tirkizna' })).toBeChecked()
      await page
        .getByRole('navigation', { name: 'Glavna navigacija' })
        .getByRole('link', { name: 'Raspored' })
        .click()
      await shown(page, block(page, 'own', start))
      await expect(block(page, 'own', start).first()).toHaveCSS('background-color', TEAL)

      // a colleague sees Ana's time in her colour
      await signOut(page)
      await signInAs(page, 'Admin i nastavnik')
      await expect(page.getByRole('heading', { name: 'Moj raspored', level: 1 })).toBeVisible()
      const busy = block(page, 'busy', start).filter({ hasText: 'Ana Nikolić' })
      await shown(page, busy)
      await expect(busy.first()).toHaveCSS('background-color', TEAL)

      // and she can go back to having no choice
      await signOut(page)
      await signInAs(page, 'Nastavnik')
      await page
        .getByRole('navigation', { name: 'Glavna navigacija' })
        .getByRole('link', { name: 'Podešavanja' })
        .click()
      await page.getByRole('radio', { name: 'Bez izbora (podrazumevana boja)' }).check()
      await page.getByRole('button', { name: 'Sačuvaj' }).click()
      await expect(page.getByRole('status')).toHaveText('Boja je sačuvana.')
      expect(await colorOf()).toBeNull()
    } finally {
      await rpc(request, ana, 'cancel_lesson', { p_lesson_id: lessonId })
      const { url, key } = localEnv()
      await request.patch(`${url}/rest/v1/teachers?profile_id=eq.${teacherId}`, {
        headers: { apikey: key, Authorization: `Bearer ${ana}` },
        data: { color: null },
      })
    }
  })

  test('only the teacher chooses it, and only from the palette', async ({ request }) => {
    const admin = await tokenFor(request, 'admin@example.test')
    const ana = await tokenFor(request, 'ana.nikolic@example.test')
    const { url, key } = localEnv()
    const [{ id: anaId }] = await select<{ id: string }>(
      request,
      admin,
      'profiles?email=eq.ana.nikolic@example.test&select=id',
    )
    const patch = (token: string, color: string, who = anaId) =>
      request.patch(`${url}/rest/v1/teachers?profile_id=eq.${who}`, {
        headers: { apikey: key, Authorization: `Bearer ${token}`, Prefer: 'return=representation' },
        data: { color },
      })

    // a colour that is not on the palette
    expect((await patch(ana, '#b3261e')).status()).toBe(400)
    // somebody else's colour: no row is touched
    const colleague = await tokenFor(request, 'admin.nastavnik@example.test')
    expect(await (await patch(colleague, 'red')).json()).toEqual([])
    expect(await (await patch(admin, 'red')).json()).toEqual([])
    expect(
      (
        await select<{ color: string | null }>(
          request,
          admin,
          `teachers?profile_id=eq.${anaId}&select=color`,
        )
      )[0].color,
    ).toBeNull()
  })
})
